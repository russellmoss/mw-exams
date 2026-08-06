import { describe, it, expect } from "vitest";
import { parseMinedClusters, codifiedFeedbackIds } from "@/lib/bin-fix-miner";
import { buildBinFixMinerPrompt } from "@/lib/prompts/bin-fix-miner-prompt";

/**
 * Bin root-cause miner (migration 042): recurring bin reasons are clustered into one mechanical fix
 * per cluster, dispatched PR-gated, and retired from the prompt feeds when the fix ships. These
 * tests pin the pure pieces — the strict JSON parse (hallucinated item ids dropped, under-sized
 * clusters killed, malformed output degrades to mine-nothing) and the prompt carrying the ledger
 * evidence + existing-proposal dedupe context.
 */

const KNOWN = new Set(["a1", "a2", "a3", "a4"]);

describe("parseMinedClusters", () => {
  const good = {
    clusters: [
      {
        theme: "Stem states the contrast the candidate should infer",
        kind: "generation",
        paper: 1,
        itemIds: ["a1", "a2", "a3"],
        proposal: "Add a constraint to question-generation-prompt.ts …",
      },
    ],
  };

  it("parses raw JSON and fenced JSON alike", () => {
    expect(parseMinedClusters(JSON.stringify(good), KNOWN)).toHaveLength(1);
    expect(parseMinedClusters("```json\n" + JSON.stringify(good) + "\n```", KNOWN)).toHaveLength(1);
  });

  it("drops hallucinated item ids and kills clusters that fall under 3 evidence rows", () => {
    const withFake = {
      clusters: [
        { ...good.clusters[0], itemIds: ["a1", "a2", "NOT-REAL"] }, // → 2 real ids → killed
        { ...good.clusters[0], theme: "Other", itemIds: ["a1", "a2", "a3", "GHOST"] }, // → 3 real → kept
      ],
    };
    const out = parseMinedClusters(JSON.stringify(withFake), KNOWN);
    expect(out).toHaveLength(1);
    expect(out[0].theme).toBe("Other");
    expect(out[0].itemIds).toEqual(["a1", "a2", "a3"]);
  });

  it("rejects bad kinds and non-paper papers, and degrades malformed output to []", () => {
    const badKind = { clusters: [{ ...good.clusters[0], kind: "rewrite-everything" }] };
    expect(parseMinedClusters(JSON.stringify(badKind), KNOWN)).toHaveLength(0);

    const badPaper = { clusters: [{ ...good.clusters[0], paper: 9 }] };
    expect(parseMinedClusters(JSON.stringify(badPaper), KNOWN)[0].paper).toBeNull();

    expect(parseMinedClusters("I found some interesting patterns…", KNOWN)).toEqual([]);
    expect(parseMinedClusters("", KNOWN)).toEqual([]);
  });
});

describe("buildBinFixMinerPrompt", () => {
  const prompt = buildBinFixMinerPrompt({
    rows: [
      {
        itemId: "gen_p1_F2_123",
        paper: 1,
        tags: ["too_obscure"],
        note: "please stop using domaine weinbach",
        stem: "Wines 1-4 are from the same country.",
        binnedAt: "2026-08-05T12:00:00Z",
      },
    ],
    existingProposals: [{ theme: "Producer repetition cap", status: "rejected" }],
  });

  it("carries the ledger rows with labels, stems and notes", () => {
    expect(prompt.user).toContain("gen_p1_F2_123");
    expect(prompt.user).toContain("Too obscure");
    expect(prompt.user).toContain("domaine weinbach");
    expect(prompt.user).toContain("Wines 1-4 are from the same country.");
  });

  it("lists existing proposals so rejected themes are not re-proposed", () => {
    expect(prompt.user).toContain("[rejected] Producer repetition cap");
  });

  it("demands strict JSON with the cluster contract", () => {
    expect(prompt.system).toContain('{"clusters":');
    expect(prompt.system).toContain("At least 3 ledger rows");
  });
});

// ── Cross-source mining (bins + accepted user feedback) ──────────────────────────────────────────
//
// Accepted feedback gets a one-off point fix when it is accepted; the miner's job across sources is
// noticing when the same class of complaint KEEPS being accepted — proof the point fixes did not
// generalize. Feedback rows are namespaced fb_<attemptId> and labeled per row so the model can
// weight cross-source recurrence.

describe("buildBinFixMinerPrompt — mixed signal sources", () => {
  const prompt = buildBinFixMinerPrompt({
    rows: [
      {
        itemId: "gen_p1_F2_123",
        paper: 1,
        tags: ["too_obscure"],
        note: "no banker in this flight",
        stem: "Wines 1-3 share a variety.",
        binnedAt: "2026-08-05T12:00:00Z",
        source: "bin",
      },
      {
        itemId: "fb_42",
        paper: 2,
        tags: [],
        note: "the stem told me the wines contrast before I tasted anything",
        stem: "Wines 1 and 2 are made using contrasting approaches.",
        binnedAt: "2026-08-06T09:00:00Z",
        source: "feedback",
        feedbackStatus: "accepted",
      },
      {
        itemId: "fb_57",
        paper: null,
        tags: ["drill: stem-sniper"],
        note: "answer key rejected my correct synonym",
        stem: null,
        binnedAt: "2026-08-06T10:00:00Z",
        source: "feedback",
        feedbackStatus: "partial",
      },
    ],
    existingProposals: [],
  });

  it("labels each row with its source, including the accepted/partial distinction", () => {
    expect(prompt.user).toContain("source: admin bin");
    expect(prompt.user).toContain("source: user feedback (accepted)");
    expect(prompt.user).toContain("source: user feedback (partial)");
  });

  it("renders a null paper as unknown rather than crashing or lying", () => {
    expect(prompt.user).toContain("fb_57 | paper ?");
  });

  it("tells the model clusters may mix sources and to weight repeat-accepted feedback", () => {
    expect(prompt.system).toMatch(/MAY mix sources/i);
    expect(prompt.system).toMatch(/did not generalize/i);
  });

  it("defaults a source-less row to admin bin so existing callers are unchanged", () => {
    const legacy = buildBinFixMinerPrompt({
      rows: [
        {
          itemId: "gen_p3_F5_9",
          paper: 3,
          tags: [],
          note: "n",
          stem: null,
          binnedAt: "2026-08-01T00:00:00Z",
        },
      ],
      existingProposals: [],
    });
    expect(legacy.user).toContain("source: admin bin");
  });
});

describe("parseMinedClusters — feedback ids join clusters like any other known id", () => {
  it("keeps fb_ ids the model was shown and drops hallucinated ones", () => {
    const known = new Set(["gen_p1_F2_123", "fb_42", "fb_57"]);
    const out = parseMinedClusters(
      JSON.stringify({
        clusters: [
          {
            theme: "Stem telegraphs the contrast",
            kind: "generation",
            paper: null,
            itemIds: ["gen_p1_F2_123", "fb_42", "fb_57", "fb_9999"],
            proposal: "Add a constraint …",
          },
        ],
      }),
      known
    );
    expect(out).toHaveLength(1);
    expect(out[0].itemIds).toEqual(["gen_p1_F2_123", "fb_42", "fb_57"]);
  });
});

describe("codifiedFeedbackIds", () => {
  it("collects fb_ ids only from SHIPPED proposals", () => {
    const out = codifiedFeedbackIds([
      { status: "shipped", evidenceItemIds: ["gen_p1_F2_123", "fb_42"] },
      { status: "pr_opened", evidenceItemIds: ["fb_57"] },
      { status: "rejected", evidenceItemIds: ["fb_58"] },
      { status: "shipped", evidenceItemIds: ["fb_60"] },
    ]);
    expect(out).toEqual(new Set(["fb_42", "fb_60"]));
  });

  it("returns an empty set when nothing shipped", () => {
    expect(codifiedFeedbackIds([{ status: "proposed", evidenceItemIds: ["fb_1"] }])).toEqual(new Set());
  });
});
