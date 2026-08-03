import { describe, it, expect } from "vitest";
import { validateTastingNotes } from "@/lib/tasting-validators";

/**
 * Completeness gate: examiners rate hard structural evidence (alcohol, sugar) above the flavour
 * profile, so a generated note that omits any perceived-alcohol/warmth reading strips out the axis
 * a candidate is meant to lead with when deducing climate/origin. These pin that a note without a
 * warmth/alcohol signal fails (and self-corrects), while a note carrying it passes.
 */

const RED = { slot: 1, fullText: "Wine 1 — Barolo 2018" };

const noteWith = (extra: string) =>
  `**Wine 1**\n\n**Appearance:** medium garnet, clear.\n${extra}\n**Nose:** cherry, rose, tar, leather.\n\n**Palate:** dry, high acidity, firm tannin, red cherry, long finish.\n\n**Initial impression:** structured and age-worthy.`;

describe("validateTastingNotes — perceived-alcohol completeness", () => {
  it("flags a note with no alcohol/warmth signal anywhere", () => {
    const note =
      "**Wine 1**\n\n**Appearance:** medium garnet, clear.\n\n**Nose:** cherry, rose, tar, leather.\n\n**Palate:** dry, high acidity, firm tannin, red cherry, long finish.\n\n**Initial impression:** structured and age-worthy.";
    const v = validateTastingNotes([note], [RED], 2);
    expect(v.valid).toBe(false);
    expect(v.violations.join(" ")).toMatch(/perceived-alcohol|warmth/i);
  });

  it("passes a note with a Structure block giving warmth + estimated band", () => {
    const note = noteWith(
      "\n**Structure:** warm, medium-plus body, ~14%; high acidity; firm grippy tannin; dry.\n"
    );
    const v = validateTastingNotes([note], [RED], 2);
    expect(v.valid).toBe(true);
  });

  it("passes when the warmth cue appears only on the palate line", () => {
    const note =
      "**Wine 1**\n\n**Appearance:** medium garnet, clear.\n\n**Nose:** cherry, rose, tar.\n\n**Palate:** dry, high acidity, firm tannin, noticeable alcoholic warmth, full body, long finish.\n\n**Initial impression:** structured.";
    const v = validateTastingNotes([note], [RED], 2);
    expect(v.valid).toBe(true);
  });
});
