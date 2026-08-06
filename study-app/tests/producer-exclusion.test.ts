import { describe, it, expect } from "vitest";
import { validateProducerExclusion } from "../src/lib/question-engine";
import { buildProducerExclusionBlock } from "../src/lib/prompts/question-generation-prompt";
import {
  selectExcludedProducers,
  buildExclusionList,
  producerKeyIsExcluded,
  normaliseProducer,
  PRODUCER_EXCLUDE_TOP,
  REVIEWER_EXCLUDED_PRODUCERS,
} from "../src/lib/bank-health/producer";

/**
 * The generation-time producer ban. The reviewer binned Weinbach flights three separate times
 * ("I have told you this at least three times" — bank_bin_reasons, feedback analysis 2026-08-05)
 * while producer over-use was only a review-pane flag; generation never read the tally. These tests
 * pin the whole chain: tally rows → capped exclusion list → hard prompt block → validator that
 * rejects a draft naming an excluded producer through the same normalisation the tally uses.
 */

const w = (slot: number, fullText: string) => ({ slot, fullText });

const row = (display: string, status: "over-used" | "watch" | "ok") => ({
  producer_key: normaliseProducer(display),
  producer_display: display,
  status,
});

describe("selectExcludedProducers", () => {
  it("keeps only over-used rows — watch and ok never reach the ban list", () => {
    const out = selectExcludedProducers(
      [row("Domaine Weinbach", "over-used"), row("Trimbach", "watch"), row("Hugel", "ok")],
      PRODUCER_EXCLUDE_TOP
    );
    expect(out).toEqual([{ key: "weinbach", display: "Domaine Weinbach" }]);
  });

  it("caps at the limit, keeping the head of the (count-sorted) tally", () => {
    const rows = Array.from({ length: 15 }, (_, i) => row(`Producer${i}`, "over-used"));
    const out = selectExcludedProducers(rows, PRODUCER_EXCLUDE_TOP);
    expect(out).toHaveLength(PRODUCER_EXCLUDE_TOP);
    expect(out[0].display).toBe("Producer0");
  });

  it("returns [] for an empty or all-ok tally", () => {
    expect(selectExcludedProducers([], PRODUCER_EXCLUDE_TOP)).toEqual([]);
    expect(selectExcludedProducers([row("Hugel", "ok")], PRODUCER_EXCLUDE_TOP)).toEqual([]);
  });
});

describe("buildExclusionList", () => {
  it("always carries the reviewer's standing bans, even against an empty tally", () => {
    // The 2026-08-05 sweep retired every kept Weinbach/Seppeltsfield question, zeroing the servable
    // tally — a purely tally-derived ban would have disarmed itself right there.
    const out = buildExclusionList([], PRODUCER_EXCLUDE_TOP);
    expect(out.map((p) => p.key)).toEqual(
      REVIEWER_EXCLUDED_PRODUCERS.map((d) => normaliseProducer(d))
    );
    expect(out.map((p) => p.key)).toContain("weinbach");
    expect(out.map((p) => p.key)).toContain("seppeltsfield");
  });

  it("appends tally-derived over-used producers after the reviewer bans, deduped", () => {
    const out = buildExclusionList(
      [row("Domaine Weinbach", "over-used"), row("Torbreck", "over-used"), row("Hugel", "ok")],
      PRODUCER_EXCLUDE_TOP
    );
    // Weinbach appears once (reviewer entry wins), Torbreck follows from the tally.
    expect(out.filter((p) => p.key === "weinbach")).toHaveLength(1);
    expect(out.map((p) => p.key)).toContain("torbreck");
    expect(out.map((p) => p.key)).not.toContain("hugel");
  });

  it("never lets the cap cut a reviewer ban — the cap applies to the tally half only", () => {
    const rows = Array.from({ length: 15 }, (_, i) => row(`Producer${i}`, "over-used"));
    const out = buildExclusionList(rows, PRODUCER_EXCLUDE_TOP);
    for (const d of REVIEWER_EXCLUDED_PRODUCERS) {
      expect(out.map((p) => p.key)).toContain(normaliseProducer(d));
    }
  });
});

describe("producerKeyIsExcluded", () => {
  const excluded = new Set(["weinbach", "seppeltsfield"]);

  it("matches the exact key and a word-boundary prefix (cuvée glued into the head)", () => {
    expect(producerKeyIsExcluded("weinbach", excluded)).toBe(true);
    expect(producerKeyIsExcluded("weinbach cuve theo riesling", excluded)).toBe(true);
  });

  it("does not match a different name sharing the prefix without a boundary", () => {
    expect(producerKeyIsExcluded("weinbacher", excluded)).toBe(false);
    expect(producerKeyIsExcluded("", excluded)).toBe(false);
    expect(producerKeyIsExcluded("trimbach", excluded)).toBe(false);
  });
});

describe("buildProducerExclusionBlock", () => {
  it("returns empty string when nothing is excluded, so the prompt is untouched", () => {
    expect(buildProducerExclusionBlock([])).toBe("");
  });

  it("names every excluded producer and reads as a hard ban, not a preference", () => {
    const block = buildProducerExclusionBlock(["Domaine Weinbach", "Seppeltsfield"]);
    expect(block).toContain("Domaine Weinbach");
    expect(block).toContain("Seppeltsfield");
    expect(block).toContain("HARD RULE");
    expect(block).toContain("Do NOT");
    // The ban admits no banker escape hatch (unlike the soft deduplication list).
    expect(block).toContain("even as the banker");
  });

  it("tells the model to apply the exclusion silently — no swap notes in candidate-facing output", () => {
    expect(buildProducerExclusionBlock(["Domaine Weinbach"])).toContain("silently");
  });
});

describe("validateProducerExclusion", () => {
  const excluded = new Set([
    normaliseProducer("Domaine Weinbach"),
    normaliseProducer("Seppeltsfield"),
  ]);

  it("passes everything when the exclusion set is empty", () => {
    const r = validateProducerExclusion(new Set(), [
      w(1, "Domaine Weinbach, Cuvée Théo Gewurztraminer, 2019. Alsace, France. (14%)"),
    ]);
    expect(r.valid).toBe(true);
  });

  it("rejects a wine from an excluded producer", () => {
    const r = validateProducerExclusion(excluded, [
      w(1, "Seppeltsfield, Para Grand Tawny, NV. Barossa Valley, Australia. (19%)"),
      w(2, "Blandy's, 10 Year Old Bual, NV. Madeira, Portugal. (19%)"),
    ]);
    expect(r.valid).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]).toContain("Wine 1");
    expect(r.violations[0]).toContain("Seppeltsfield");
  });

  it("matches through normalisation — article and accent variants cannot dodge the ban", () => {
    // The bank key is "weinbach" (leading "Domaine" stripped); a draft writing the house without
    // the article, or with accents elsewhere in the line, must still hit it.
    const r = validateProducerExclusion(excluded, [
      w(1, "Weinbach, Cuvée Laurence Gewurztraminer, 2018. Alsace, France. (13.5%)"),
    ]);
    expect(r.valid).toBe(false);
    expect(r.violations[0]).toContain("Wine 1");
  });

  it("catches a comma-less label that glues the cuvée into the producer head", () => {
    // Real banked example: no comma before the vintage, so the head (and therefore the key) carries
    // the whole cuvée. 20 kept Weinbach P1 wines were fragmented across such keys — exact matching
    // would have let every one of them through.
    const r = validateProducerExclusion(excluded, [
      w(1, "Domaine Weinbach Cuvée Theo Riesling 2023. Alsace, France. (13.5%)"),
    ]);
    expect(r.valid).toBe(false);
    expect(r.violations[0]).toContain("Wine 1");
  });

  it("accepts non-excluded producers from the same region", () => {
    const r = validateProducerExclusion(excluded, [
      w(1, "Trimbach, Cuvée Frédéric Émile Riesling, 2017. Alsace, France. (13%)"),
      w(2, "Zind-Humbrecht, Clos Windsbuhl Gewurztraminer, 2019. Alsace, France. (14%)"),
    ]);
    expect(r.valid).toBe(true);
  });

  it("skips a line whose descriptor yields no producer — malformed shape is another validator's job", () => {
    const r = validateProducerExclusion(excluded, [
      w(1, "A very long unparseable line of generator deliberation with no comma that just keeps going and going beyond sixty characters"),
    ]);
    expect(r.valid).toBe(true);
  });
});
