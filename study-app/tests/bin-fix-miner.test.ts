import { describe, it, expect } from "vitest";
import {
  parseMinedClusters,
  claimedEvidenceIds,
  themeSimilarity,
  themeTokens,
  isDuplicateTheme,
  THEME_DUPLICATE_THRESHOLD,
} from "@/lib/bin-fix-miner";
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

// ── Near-duplicate theme suppression ─────────────────────────────────────────────────────────────
//
// On 2026-08-06 the nightly cron and a manual "Mine now" ran 48s apart; each read the existing
// proposals before the other inserted, so both mined the same ledger into REWORDED versions of the
// same clusters (real rows: 12≈14, 17≈11). Both duplicates were dispatched, opened PRs and were
// closed unmerged. The mining lock stops the concurrent case; this is the second layer for the
// sequential one — the model rewording a theme it was told not to re-propose.

describe("isDuplicateTheme", () => {
  it("flags the real duplicate pairs that shipped wasted PRs", () => {
    // proposals 12 vs 14
    expect(
      isDuplicateTheme(
        "Flight mark total must equal exactly 25 marks per wine",
        "Mark budget not enforced: total ≠ 25 × wines; sub-part marks below floors"
      )
    ).toBe(true);
    // proposals 11 vs 17
    expect(
      isDuplicateTheme(
        "Tasting notes omit appearance and alcohol; negative bubble descriptors",
        "Tasting notes missing alcohol/acid/appearance; absence-of-bubbles phrasing"
      )
    ).toBe(true);
  });

  it("still catches an exact restatement regardless of case and spacing", () => {
    expect(isDuplicateTheme("Flight has no banker", "  flight HAS no BANKER  ")).toBe(true);
  });

  it("does not let a very short theme match everything (shared-token floor)", () => {
    // 2 significant tokens, both present in the longer theme — overlap would be 1.0 without the floor.
    expect(
      isDuplicateTheme(
        "Mark budget",
        "Mark budget not enforced: total ≠ 25 × wines; sub-part marks below floors"
      )
    ).toBe(false);
  });

  it("does NOT flag genuinely distinct clusters that coexisted as real proposals", () => {
    const distinct: [string, string][] = [
      [
        "Stem telegraphs the inference (contrast/quality/aging stated outright)",
        "Stem asserts variety/blend facts that contradict the actual flight",
      ],
      [
        "Flight has no banker and/or too many curveballs",
        "Same signature producers/wines recur (Weinbach, Seppeltsfield, vin jaune)",
      ],
      [
        "Identification sub-parts over-marked / attributes bundled into one part",
        "Sub-question tasks outside the real D3 exam repertoire",
      ],
      [
        "Flight wine-style mix wrong for the paper (still wines on P3, sparkling on P1)",
        "Single-wine flights: must be curveball-led and must not ask variety+origin ID",
      ],
    ];
    for (const [a, b] of distinct) {
      expect(isDuplicateTheme(a, b), `"${a}" vs "${b}" wrongly reads as duplicate`).toBe(false);
      expect(themeSimilarity(a, b), `"${a}" vs "${b}" scores too close to the cut`).toBeLessThan(
        THEME_DUPLICATE_THRESHOLD
      );
    }
  });

  it("is symmetric, self-identical, and safe on empty/stopword-only input", () => {
    const a = "Flight has no banker and/or too many curveballs";
    const b = "Mark budget not enforced";
    expect(themeSimilarity(a, b)).toBeCloseTo(themeSimilarity(b, a));
    expect(themeSimilarity(a, a)).toBe(1);
    expect(themeSimilarity("", "")).toBe(0);
    expect(themeSimilarity("the and of", "a to in")).toBe(0);
  });

  it("strips punctuation, case and accents so wording noise cannot dodge the check", () => {
    expect(themeTokens("Marks: 25 × wines!")).toEqual(themeTokens("marks 25 wines"));
    expect(themeSimilarity("Rosé colour depth", "rose colour depth")).toBe(1);
  });
});

describe("claimedEvidenceIds", () => {
  it("claims evidence from every non-terminal proposal, in BOTH streams", () => {
    const out = claimedEvidenceIds([
      { status: "shipped", evidenceItemIds: ["gen_p1_F2_123", "fb_42"] },
      { status: "pr_opened", evidenceItemIds: ["fb_57"] },
      { status: "dispatched", evidenceItemIds: ["gen_p3_F7_456"] },
      { status: "proposed", evidenceItemIds: ["fb_59"] },
      { status: "merged", evidenceItemIds: ["fb_60"] },
    ]);
    expect(out).toEqual(new Set(["gen_p1_F2_123", "fb_42", "fb_57", "gen_p3_F7_456", "fb_59", "fb_60"]));
  });

  // The whole point of the change: 'shipped' arrives only after merge AND reconcile, so keying on it
  // let every mine in between re-cluster evidence that was already in flight. Proposals 12 and 17 were
  // both born that way.
  it("claims evidence the moment a proposal exists, not when it ships", () => {
    expect(claimedEvidenceIds([{ status: "proposed", evidenceItemIds: ["fb_1"] }])).toEqual(
      new Set(["fb_1"])
    );
  });

  // Terminal-but-unshipped states RELEASE their evidence — in none of them was the fault ever fixed.
  it("releases evidence from rejected, failed and pr_closed proposals", () => {
    expect(
      claimedEvidenceIds([
        { status: "rejected", evidenceItemIds: ["fb_58"] },
        { status: "failed", evidenceItemIds: ["fb_61"] },
        { status: "pr_closed", evidenceItemIds: ["fb_62"] },
      ])
    ).toEqual(new Set());
  });
});

// The miner used to be told "prefer validator when both apply — checks are testable". Measurement
// contradicted both halves on 2026-08-10: selection rules ship with tests just as readily, and a
// validator rule costs a redraft (first-pass is 25%) PLUS a retroactive quarantine of the banked
// corpus (MISSING_RS_ALCOHOL_ASK measured 181 -> 319 hard violations of 886). These pin the reversal,
// because it is one sentence and a future edit could silently flip it back.
describe("buildBinFixMinerPrompt — layer doctrine prefers prevention over rejection", () => {
  const prompt = buildBinFixMinerPrompt({
    rows: [
      {
        itemId: "gen_p1_F2_1",
        paper: 1,
        tags: ["not_realistic"],
        note: "same flight shape again",
        stem: "Wines 1-3 are from the same country.",
        binnedAt: "2026-08-09T12:00:00Z",
      },
    ],
    existingProposals: [{ theme: "Some shipped fix", status: "shipped" }],
  });

  it("prefers generation over validator when both layers could carry the fix", () => {
    expect(prompt.system).toMatch(/PREFER 'generation' WHEN BOTH APPLY/);
  });

  it("no longer tells the miner to prefer the validator", () => {
    // The exact sentence that produced the validator-heavy backlog.
    expect(prompt.system).not.toMatch(/Prefer validator when both apply/);
  });

  it("makes a validator proposal state its blast radius on the banked corpus", () => {
    expect(prompt.system).toMatch(/how many currently-banked questions the\s*\n?\s*rule would newly fail/);
  });

  it("warns that a shipped proposal is not evidence the fault went away", () => {
    // Without this the 21 shipped rows read as a track record, when the measured record is 34% -> 42%.
    expect(prompt.user).toMatch(/SHIPPED DOES NOT MEAN IT WORKED/);
    expect(prompt.user).toMatch(/34% to 42%/);
  });
});
