import { describe, it, expect } from "vitest";
import {
  buildGenerationProducerExclusion,
  detectNicheStyles,
  selectExcludedNicheStyles,
  PRODUCER_SHARE_CAP,
  PRODUCER_RECENT_WINDOW,
} from "../src/lib/question-engine";
import { buildStyleExclusionBlock } from "../src/lib/prompts/question-generation-prompt";
import { normaliseProducer } from "../src/lib/bank-health/producer";

/**
 * The hard, unconditional generation-time caps. The reviewer binned the same producers AND the same
 * niche categories again and again (Weinbach Gewurztraminer, Seppeltsfield tawny, Jura vin jaune —
 * "I keep telling you this"). The soft nudge and the 'over-used' STATUS (which needs a floor count)
 * both let a signature slip through on a small or freshly-swept bank. These tests pin the two caps:
 *   • a producer/style over PRODUCER_SHARE_CAP of the paper's live bank, with NO floor count;
 *   • any producer/style used in the last PRODUCER_RECENT_WINDOW questions, regardless of share.
 */

type Status = "over-used" | "watch" | "ok";
const trow = (display: string, share: number, status: Status = "ok") => ({
  producer_key: normaliseProducer(display),
  producer_display: display,
  share,
  status,
});
const rec = (display: string) => ({ key: normaliseProducer(display), display });

const reasonsFor = (
  out: { key: string; reasons: string[] }[],
  display: string
): string[] | undefined => out.find((e) => e.key === normaliseProducer(display))?.reasons;

describe("buildGenerationProducerExclusion — hard frequency cap", () => {
  it("excludes Domaine Weinbach when it is 8% of paper 1 (over the 5% cap)", () => {
    // Seed a paper-1 bank where Weinbach dominates at 8% but with too few appearances to trip the
    // count-gated 'over-used' status — the cap must catch it on share alone.
    const rows = [
      trow("Domaine Weinbach", 0.08, "ok"),
      trow("Trimbach", 0.01, "ok"),
      trow("Hugel", 0.01, "ok"),
    ];
    const out = buildGenerationProducerExclusion(rows, []);
    const reasons = reasonsFor(out, "Domaine Weinbach");
    expect(reasons).toBeDefined();
    expect(reasons).toContain("share-cap");
  });

  it("excludes a NON-reviewer producer purely on the share cap, with no floor count", () => {
    // Zind-Humbrecht is not a standing reviewer ban, so its exclusion here proves the cap fires on
    // share alone (status 'ok', not 'over-used').
    const rows = [trow("Zind-Humbrecht", 0.08, "ok"), trow("Trimbach", 0.01, "ok")];
    const out = buildGenerationProducerExclusion(rows, []);
    const reasons = reasonsFor(out, "Zind-Humbrecht");
    expect(reasons).toEqual(["share-cap"]);
    // A normal producer at 1% is left selectable.
    expect(reasonsFor(out, "Trimbach")).toBeUndefined();
  });

  it("leaves a normal producer at 1% selectable", () => {
    const rows = [trow("Trimbach", 0.01, "ok"), trow("Hugel", 0.01, "ok")];
    const out = buildGenerationProducerExclusion(rows, []);
    expect(reasonsFor(out, "Trimbach")).toBeUndefined();
    expect(reasonsFor(out, "Hugel")).toBeUndefined();
  });
});

describe("buildGenerationProducerExclusion — last-N window", () => {
  it("excludes Domaine Weinbach at only 2% share when it is in the last 10 questions", () => {
    const rows = [trow("Domaine Weinbach", 0.02, "ok"), trow("Trimbach", 0.01, "ok")];
    const out = buildGenerationProducerExclusion(rows, [rec("Domaine Weinbach")]);
    const reasons = reasonsFor(out, "Domaine Weinbach");
    expect(reasons).toBeDefined();
    expect(reasons).toContain("recent-window");
  });

  it("excludes a NON-reviewer producer used in the last 10 regardless of a tiny share", () => {
    // Under the cap and status 'ok', so only the last-N window can catch it — proving the rule is
    // independent of share and of the reviewer standing bans.
    const rows = [trow("Trimbach", 0.01, "ok")];
    const out = buildGenerationProducerExclusion(rows, [rec("Trimbach")]);
    expect(reasonsFor(out, "Trimbach")).toEqual(["recent-window"]);
  });

  it("still excludes a last-10 producer that has no tally row at all (never relaxed)", () => {
    const out = buildGenerationProducerExclusion([], [rec("Domaine Ostertag")]);
    expect(reasonsFor(out, "Domaine Ostertag")).toEqual(["recent-window"]);
  });
});

describe("detectNicheStyles — region+style keying", () => {
  it("flags Jura vin jaune / sous voile Savagnin", () => {
    expect(detectNicheStyles("Domaine Macle, Château-Chalon Vin Jaune, 2014. Jura, France. (14%)")).toContain(
      "jura-sous-voile"
    );
    expect(detectNicheStyles("Tissot, Savagnin Sous Voile, 2016. Jura, France. (13.5%)")).toContain(
      "jura-sous-voile"
    );
  });

  it("flags a Seppeltsfield-style aged tawny", () => {
    expect(detectNicheStyles("Seppeltsfield, Para Grand Tawny, NV. Barossa Valley, Australia. (19%)")).toContain(
      "aged-tawny"
    );
    expect(detectNicheStyles("Penfolds, Grandfather Rare Tawny, NV. Barossa, Australia. (19%)")).toContain(
      "aged-tawny"
    );
  });

  it("flags Alsace Gewurztraminer only when the region is Alsace (region+style)", () => {
    expect(detectNicheStyles("Trimbach, Gewurztraminer, 2019. Alsace, France. (13.5%)")).toContain(
      "alsace-gewurz"
    );
    // Gewurztraminer from elsewhere is not the flagged Alsace category.
    expect(
      detectNicheStyles("Cono Sur, Gewürztraminer, 2021. Bío Bío Valley, Chile. (13%)")
    ).not.toContain("alsace-gewurz");
  });

  it("returns nothing for an ordinary wine", () => {
    expect(detectNicheStyles("Trimbach, Riesling, 2018. Alsace, France. (12.5%)")).toEqual([]);
  });
});

describe("selectExcludedNicheStyles", () => {
  const jura = "Domaine Macle, Château-Chalon Vin Jaune, 2014. Jura, France. (14%)";
  const riesling = "Trimbach, Riesling, 2018. Alsace, France. (12.5%)";
  const filler = () => [riesling, riesling, riesling, riesling];

  it("caps a style over the share cap", () => {
    // Two vin-jaune wines out of ~12 (> 5%) across older questions — share cap, not last-N.
    const older = Array.from({ length: 10 }, () => [riesling, riesling]);
    const withJura = [
      ...older,
      [jura, riesling],
      [jura, riesling],
    ];
    const out = selectExcludedNicheStyles(withJura);
    const style = out.find((s) => s.id === "jura-sous-voile");
    expect(style).toBeDefined();
    expect(style!.reasons).toContain("share-cap");
  });

  it("caps a style present in the last-N window even at a tiny overall share", () => {
    // One vin-jaune wine in the newest question, buried in a large bank (< 5% overall).
    const bank = [[jura, riesling], ...Array.from({ length: 200 }, filler)];
    const out = selectExcludedNicheStyles(bank);
    const style = out.find((s) => s.id === "jura-sous-voile");
    expect(style).toBeDefined();
    expect(style!.reasons).toContain("recent-window");
  });

  it("returns nothing for a bank clear of the niche styles", () => {
    expect(selectExcludedNicheStyles(Array.from({ length: 20 }, filler))).toEqual([]);
  });
});

describe("buildStyleExclusionBlock", () => {
  it("returns empty string when nothing is excluded", () => {
    expect(buildStyleExclusionBlock([])).toBe("");
  });

  it("names every excluded style and reads as a hard, category-level ban", () => {
    const block = buildStyleExclusionBlock([
      "Jura vin jaune / sous voile Savagnin",
      "Seppeltsfield-style aged tawny",
    ]);
    expect(block).toContain("Jura vin jaune");
    expect(block).toContain("Seppeltsfield-style aged tawny");
    expect(block).toContain("HARD RULE");
    expect(block).toContain("CATEGORY");
    // Swapping producers within the same style must not satisfy the rule.
    expect(block).toContain("does NOT satisfy");
    expect(block).toContain("silently");
  });
});

describe("cap constants", () => {
  it("pins the 5% frequency cap and 10-question window from the change request", () => {
    expect(PRODUCER_SHARE_CAP).toBe(0.05);
    expect(PRODUCER_RECENT_WINDOW).toBe(10);
  });
});
