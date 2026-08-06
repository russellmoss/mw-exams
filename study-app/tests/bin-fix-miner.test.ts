import { describe, it, expect } from "vitest";
import { parseMinedClusters } from "@/lib/bin-fix-miner";
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
