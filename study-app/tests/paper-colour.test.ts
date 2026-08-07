// paper-colour.test.ts — R-COLOUR (Right Paper Check): Paper 1 still-white only, Paper 2 still-red
// only, Paper 3 unrestricted. Colour is derived from the wine record's existing style/label/variety
// fields; the rule is unconditional and fails safe on wines whose colour cannot be positively placed.
import { describe, it, expect } from "vitest";
import { classifyWineColour, validatePaperColour } from "../src/lib/question-validator";
import type { AuditWine } from "../src/lib/question-validator";

const wine = (over: Partial<AuditWine>): AuditWine => ({ slot: 1, varieties: [], region: "", ...over });

describe("classifyWineColour", () => {
  it.each([
    ["still white", { varieties: ["Chardonnay"], region: "Chablis", fullText: "Domaine X Chablis 2021. Burgundy, France." }, "white"],
    ["still red", { varieties: ["Nebbiolo"], region: "Barolo", fullText: "Producer Barolo 2018. Piedmont, Italy." }, "red"],
    ["sparkling", { fullText: "Grower Champagne Brut NV. Champagne, France.", style: "sparkling" }, "sparkling"],
    ["sweet", { fullText: "Château Y Sauternes 2016. Bordeaux, France.", style_category: "Botrytis sweet" }, "sweet"],
    ["fortified", { fullText: "Taylor's Vintage Port 1985. Douro, Portugal. (20.5%)" }, "fortified"],
    ["rosé", { fullText: "Domaine Z Rosé 2022. Provence, France.", varieties: ["Grenache"] }, "rose"],
    ["orange", { fullText: "Pheasant's Tears Rkatsiteli qvevri 2019. Kakheti, Georgia." }, "orange"],
  ])("classifies %s", (_label, w, expected) => {
    expect(classifyWineColour(wine(w as Partial<AuditWine>))).toBe(expected);
  });

  it("returns null when a still wine's colour cannot be placed (fail safe)", () => {
    expect(classifyWineColour(wine({ fullText: "Mystery Cuvée 2020." }))).toBeNull();
  });
});

describe("validatePaperColour", () => {
  const red = wine({ slot: 2, varieties: ["Syrah"], region: "Hermitage", fullText: "Producer Hermitage 2018. Rhône, France." });
  const white = wine({ slot: 1, varieties: ["Riesling"], region: "Mosel", fullText: "Producer Riesling 2021. Mosel, Germany." });

  it("rejects a red wine on Paper 1", () => {
    const v = validatePaperColour(1, [white, red]);
    expect(v.some((x) => x.rule === "wrong_colour_for_paper" && x.severity === "hard" && x.detail.includes("wine 2"))).toBe(true);
  });

  it("rejects a white wine on Paper 2", () => {
    const v = validatePaperColour(2, [white, red]);
    expect(v.some((x) => x.rule === "wrong_colour_for_paper" && x.detail.includes("wine 1"))).toBe(true);
  });

  it("passes an all-white Paper 1 flight", () => {
    expect(validatePaperColour(1, [white])).toHaveLength(0);
  });

  it("never restricts Paper 3", () => {
    expect(validatePaperColour(3, [white, red])).toHaveLength(0);
  });

  it("flags a stem that implies a forbidden colour (stem_colour_conflict), unconditional", () => {
    const v = validatePaperColour(1, [white], "These four red wines are from the same grape variety.");
    expect(v.some((x) => x.rule === "stem_colour_conflict" && x.severity === "hard")).toBe(true);
  });
});
