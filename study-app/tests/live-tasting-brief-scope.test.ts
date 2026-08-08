import { describe, it, expect } from "vitest";
import { validateBriefPaperScope } from "@/lib/live-tasting-validators";
import { byoFamilyFor, BYO_FAMILIES } from "@/lib/live-tasting-engine";
import { paperScopeProse } from "@/lib/paper-scope";

/**
 * The BYO shopping brief is the only artefact in the app that costs the candidate money, and it is
 * written before any wine exists — so no wine-level validator can catch a brief that names the wrong
 * paper's styles. Reported from the Coach (attempt 413): a Paper 1 brief headed "F5 Production Method
 * (Sweet-Wine Mechanisms)" whose three slots were botrytis, passerillage and late-harvest wines.
 *
 * Two failure directions are pinned here, and the second is the one that would do more damage:
 *  - UNDER-firing: the reported brief must be rejected on Paper 1.
 *  - OVER-firing: a correct Paper 1 brief mentions sweetness in its "Avoid" line and includes off-dry
 *    Riesling as a legitimate slot. Rejecting those would break brief generation for the whole paper
 *    while leaving the malformed briefs (which state sweetness positively) as the only ones passing.
 */

// The brief as generated, verbatim from the bug report.
const BUG_413_BRIEF = `Shopping Brief: Paper 1 White Still — F5 Production Method (Sweet-Wine Mechanisms), 3-Bottle Flight

Exercise: Paper 1 tasting, F5 Method/Production question; 3 white still wines where the mechanism producing sweetness or concentration is the key analytical target — expect a question probing how each wine was made (botrytis, late harvest, passerillage/drying, or arrested fermentation).

Wine 1 — Botrytis-Affected Sweet Wine
Profile: Classic noble rot, golden, viscous, with marmalade/saffron/honeyed complexity and bright acidity. Regions (by availability): Sauternes/Barsac (France) → Tokaji Aszú (Hungary) → Beerenauslese/TBA (Germany/Austria)

Wine 2 — Dried-Grape / Passerillage Sweet Wine
Profile: Raisined concentration without botrytis. Regions: Vin de Paille (Jura) → Passito di Pantelleria (Italy)

Wine 3 — Late Harvest / Cryoextraction
Profile: Sweetness from late picking or freezing. Regions: Vendanges Tardives (Alsace) → Eiswein (Germany)`;

// A well-formed Paper 1 F5 brief: dry-wine production levers, one legitimately off-dry slot, and an
// Avoid line that names the styles the paper excludes.
const GOOD_P1_BRIEF = `Shopping Brief: Paper 1 White Still — F5 Method / Production, 3-Bottle Flight

Exercise: three white still wines whose winemaking differs sharply — oak regime, lees handling and malolactic are the analytical targets.

Wine 1 — Barrel-Fermented, Full-Malolactic Chardonnay
Profile: new-oak vanilla and toast, creamy texture, low-to-moderate acidity. Regions: Napa/Sonoma (USA) → Margaret River (Australia) → Meursault (France)

Wine 2 — Steel-Fermented, Reductive, No Malolactic Riesling
Profile: taut, unoaked, high acidity, citrus and stone. May be dry or off-dry (Kabinett or Spätlese Trocken is fine). Regions: Mosel (Germany) → Clare Valley (Australia)

Wine 3 — Lees-Aged, Concrete-Raised Chenin Blanc
Profile: bâtonnage texture, no new oak, savoury and saline. Regions: Savennières (France) → Swartland (South Africa)

Avoid: anything sparkling, fortified, or dessert-sweet — a Sauternes or a Champagne would break this flight. No reds, no rosé.

Price: expect $25-60 per bottle.`;

describe("validateBriefPaperScope — the reported bug", () => {
  it("rejects the Paper 1 sweet-wine-mechanism brief from attempt 413", () => {
    const v = validateBriefPaperScope(1, BUG_413_BRIEF);
    expect(v.valid).toBe(false);
    expect(v.violations.join(" ")).toMatch(/sweetness/i);
  });

  it("accepts that same brief on Paper 3, where sweet-wine mechanisms belong", () => {
    expect(validateBriefPaperScope(3, BUG_413_BRIEF).valid).toBe(true);
  });
});

describe("validateBriefPaperScope — must not over-fire", () => {
  it("accepts a correct Paper 1 brief whose Avoid line names sweet and sparkling wines", () => {
    const v = validateBriefPaperScope(1, GOOD_P1_BRIEF);
    expect(v.violations).toEqual([]);
    expect(v.valid).toBe(true);
  });

  it("accepts an off-dry Riesling slot — Spätlese and demi-sec are legitimate Paper 1 wines", () => {
    const brief =
      "Wine 1 — Off-Dry Riesling Spätlese\nProfile: residual sugar balanced by high acidity. Regions: Mosel (Germany)";
    expect(validateBriefPaperScope(1, brief).valid).toBe(true);
  });
});

describe("validateBriefPaperScope — sparkling and fortified slots", () => {
  it("rejects a sparkling slot on Paper 1", () => {
    const brief = "Wine 1 — Non-Vintage Brut Champagne\nProfile: autolytic, high acidity. Regions: Champagne (France)";
    const v = validateBriefPaperScope(1, brief);
    expect(v.valid).toBe(false);
    expect(v.violations.join(" ")).toMatch(/sparkling|colour/i);
  });

  it("rejects a fortified slot on Paper 2", () => {
    const brief = "Wine 1 — Tawny Port, 10 Year\nProfile: oxidative, nutty, fortified. Regions: Douro (Portugal)";
    const v = validateBriefPaperScope(2, brief);
    expect(v.valid).toBe(false);
    expect(v.violations.join(" ")).toMatch(/fortified|colour/i);
  });

  it("checks nothing on Paper 3, which admits every style", () => {
    const brief = "Wine 1 — Vintage Champagne\nWine 2 — Oloroso Sherry\nWine 3 — Sauternes";
    expect(validateBriefPaperScope(3, brief).valid).toBe(true);
  });
});

describe("byoFamilyFor — the family description cannot name another paper's styles", () => {
  it("strips sparkling/fortified/sweet from F5 on Papers 1 and 2", () => {
    for (const paper of [1, 2]) {
      const d = byoFamilyFor("F5", paper).description;
      // The words appear only in the negative clause ("NOT sparkling, fortified or dessert-sweet"),
      // so assert on the positive half — everything before that disclaimer.
      const positive = d.split(/\bNOT\b/)[0];
      expect(positive).not.toMatch(/sparkling|fortified|dessert-sweet/i);
      expect(d).toMatch(/oak|maceration|lees/i);
    }
  });

  it("keeps F5's sweet/sparkling/fortified mechanisms on Paper 3", () => {
    expect(byoFamilyFor("F5", 3).description).toBe(BYO_FAMILIES.F5.description);
  });

  it("strips the sweetness axis from F6 on Papers 1 and 2", () => {
    for (const paper of [1, 2]) {
      const positive = byoFamilyFor("F6", paper).description.split(/\bNOT\b/)[0];
      expect(positive).not.toMatch(/sweetness/i);
      expect(positive).toMatch(/maturity/i);
    }
  });

  it("leaves the paper-agnostic families untouched", () => {
    for (const f of ["F1", "F2", "F3", "F4", "F7"]) {
      for (const paper of [1, 2, 3]) {
        expect(byoFamilyFor(f, paper)).toEqual(BYO_FAMILIES[f]);
      }
    }
  });

  it("never suggests a lever that produces a wine R-COLOUR blocks", () => {
    // Found by a live model call: listing "skin contact" as a Paper 1 F5 lever made the model offer a
    // skin-contact white, which resolves to ORANGE and is rejected on Paper 1 as firmly as sparkling.
    // A description that invites the guard's own violation burns a repair round on every brief.
    for (const family of ["F5", "F6"]) {
      for (const paper of [1, 2]) {
        const positive = byoFamilyFor(family, paper).description.split(/\bNOT\b/)[0];
        expect(positive).not.toMatch(/skin[- ]contact|orange wine|ramato/i);
      }
    }
  });

  it("a scoped F5 description never survives into a brief the validator would reject", () => {
    // The description is prose the model is told to express; if the description itself tripped the
    // guard, generation could never converge.
    for (const paper of [1, 2]) {
      expect(validateBriefPaperScope(paper, byoFamilyFor("F5", paper).description).valid).toBe(true);
      expect(validateBriefPaperScope(paper, byoFamilyFor("F6", paper).description).valid).toBe(true);
    }
  });
});

describe("paperScopeProse — shared by the question generator and the shopping brief", () => {
  it("keeps Paper 1 to white still wines while still allowing residual sugar", () => {
    const p1 = paperScopeProse(1);
    expect(p1).toMatch(/WHITE STILL WINES ONLY/);
    expect(p1).toMatch(/Spätlese|demi-sec/);
  });

  it("does not exclude still dry wines from Paper 3", () => {
    expect(paperScopeProse(3)).toMatch(/still dry wines are NOT excluded/i);
  });

  it("is stated for the brief prompt too, not just generation", () => {
    // Guards the extraction: if paper-scope.ts is ever inlined back into one prompt, this fails.
    expect(paperScopeProse(2)).toMatch(/RED STILL WINES ONLY/);
  });
});
