// banker-detection.test.ts — isBanker, and the two indicator bugs that were silently disarming it.
//
// The BANKER_SIGNALS table is carefully calibrated and its comments state its intent plainly: "bare
// Burgundy counts for Pinot Noir and Chardonnay, not for Aligoté", and "Oregon Pinot Gris" is listed
// among the things deliberately NOT bankers. The table was right; it was being bypassed.
//
// isBanker skips its variety gate when the variety is unknown — deliberate, so that a wine whose key
// resolved no grape is not counted against its flight for a classic origin. But the variety was read
// ONLY from the answer key, so on any unkeyed row every gate in the table was skipped and the region
// alone promoted the wine. Two grape indicators then made it worse by never matching at all.
import { describe, it, expect } from "vitest";
import { isBanker, flightCompositionViolations, matchesAnchorPair, type AuditWine } from "@/lib/question-validator";
import { detectPrimaryVariety, canonVariety } from "@/lib/question-rules.mjs";
import "@/lib/appellation-resolver";

const label = (fullText: string): AuditWine => ({ slot: 1, varieties: [], region: "", fullText });

describe("grape indicators that could never match", () => {
  // The alternation sits inside \b(…)\b, so a prefix alternative can never fire. Both of these are
  // staple Paper 1 whites, and an undetected variety is invisible to R-COLOUR, to the diversity rules
  // and to isBanker's variety gate.
  it.each([
    ["Gewurztraminer", "gewurztraminer"],
    ["Gewürztraminer", "gewurztraminer"],
    ["Pinot Grigio", "pinot gris"],
    ["Pinot Gris", "pinot gris"],
  ])("detects %s", (name, expected) => {
    expect(canonVariety(detectPrimaryVariety(`Producer, ${name}. Region, Country.`))).toBe(expected);
  });
});

describe("isBanker reads the label when the key resolved no variety", () => {
  it("honours the table's own stated exclusions", () => {
    // Both of these came back BANKER before, contradicting the comments beside the signals.
    expect(isBanker(label("Domaine de Villaine, Bouzeron Aligoté. Burgundy, France."))).toBe(false);
    expect(isBanker(label("Montinore Estate, Reserve Pinot Gris. Willamette Valley, United States."))).toBe(false);
  });

  it("demotes a wine whose grape does not match its region's signal", () => {
    // Reviewer attempt #459: "the Gewurztraminer and the Grüner Veltliner are pretty big curve balls
    // for New Zealand". Marlborough is a banker signal for Sauvignon only.
    expect(isBanker(label("Villa Maria, Private Bin Sauvignon Blanc. Marlborough, New Zealand."))).toBe(true);
    expect(isBanker(label("Huia Vineyards, Gewurztraminer. Marlborough, New Zealand."))).toBe(false);
    expect(isBanker(label("Seresin, Reserve Chardonnay. Marlborough, New Zealand."))).toBe(false);
  });

  it("still promotes a genuine benchmark", () => {
    expect(isBanker(label("Domaine Leflaive, Puligny-Montrachet. Burgundy, France."))).toBe(true);
    expect(isBanker(label("Dr Loosen, Riesling Kabinett. Mosel, Germany."))).toBe(true);
  });

  it("keeps the free pass for a genuinely unresolvable label", () => {
    // The deliberate behaviour this fix had to preserve: requiring the gate to pass on an unknown
    // grape made "Stellenbosch | ?" and "Alsace | ?" curveballs, which is the wrong verdict on a
    // classic origin and was the single largest source of false curveballs over the real corpus.
    expect(detectPrimaryVariety("Some Estate, Reserve Cuvée. Alsace, France.")).toBe("unknown");
    expect(isBanker(label("Some Estate, Reserve Cuvée. Alsace, France."))).toBe(true);
  });

  it("prefers the resolved key over the label when both exist", () => {
    const keyed: AuditWine = {
      slot: 1,
      varieties: ["Sauvignon Blanc"],
      region: "Marlborough",
      fullText: "Villa Maria, Private Bin. Marlborough, New Zealand.",
    };
    expect(isBanker(keyed)).toBe(true);
  });
});

describe("a banker region is a banker for its canonical STYLE", () => {
  // The region and the grape can both match while the wine is something else entirely. These three
  // are style modifiers printed on the label, and each is excluded in data/banker_signals.json rather
  // than in code, so an expert can overrule them in one small JSON edit.
  it("demotes an Alsace Vendanges Tardives (reviewer attempt #474)", () => {
    // Alsace + Pinot Gris clears the signal on region and grape; a late-harvest sweet wine is not the
    // dry varietal Alsace the signal stands for.
    expect(isBanker(label("Josmeyer, Le Fromenteau Pinot Gris, 2022. Alsace, France. (14%)"))).toBe(true);
    expect(
      isBanker(
        label(
          "Domaine Schoffit, Rangen de Thann Clos Saint-Théobald Pinot Gris Vendanges Tardives, 2019. Alsace, France."
        )
      )
    ).toBe(false);
  });

  it("demotes a dry wine labelled as Sauternes (reviewer attempt #457)", () => {
    // Sauternes AOC is sweet by law, so the dry wine of a Sauternes château is Bordeaux Blanc — which
    // is how the corpus labels the one it pours (2024 P3, "R de Rieussec … Bordeaux Blanc Sec").
    expect(isBanker(label("Château Guiraud, Sauternes, 2015. Sauternes, France."))).toBe(true);
    expect(isBanker(label("Château Gravas, Sauternes Blanc Sec. Sauternes, France."))).toBe(false);
  });

  it("demotes a Noble Late Harvest Chenin from Stellenbosch", () => {
    expect(isBanker(label("Ken Forrester, FMC Chenin Blanc. Stellenbosch, South Africa."))).toBe(true);
    expect(
      isBanker(label("Ken Forrester, T Noble Late Harvest Chenin Blanc, 2019. Stellenbosch, South Africa."))
    ).toBe(false);
  });

  it("leaves the real 2011 P1 Alsace flight intact", () => {
    // The counter-case that had to be checked before excluding VT at all: the single Vendanges
    // Tardives the Institute pours sits in an ALL-Alsace flight beside a dry Muscat and a dry
    // Riesling, so the region stays anchored twice over and the flight still passes.
    const flight = [
      "Muscat D'Alsace, Rolly Gassmann. 2007. Alsace, France (12.5%)",
      "Riesling, Kappelweg de Rorschwihr, Rolly Gassmann. 2002. Alsace, France (12.5%)",
      "Pinot Gris, Vendanges Tardives, Rotleibel de Rorschwihr, Rolly Gassmann. 1996. Alsace, France",
    ].map((t, i) => ({ ...label(t), slot: i + 1 }));
    expect(flight.filter(isBanker)).toHaveLength(2);
    expect(flightCompositionViolations(flight)).toEqual([]);
  });
});

describe("flight composition, end to end", () => {
  it("rejects the reviewer's New Zealand flight (attempt #459)", () => {
    // One anchor, three curveballs: "I think this would be a better flight if there were only three
    // wines in it and you had the Sauvignon Blanc, the Chardonnay, and then one of the other two."
    const flight = [
      "Villa Maria, Private Bin Sauvignon Blanc. Marlborough, New Zealand.",
      "Huia Vineyards, Gewurztraminer. Marlborough, New Zealand.",
      "Pyramid Valley, Earth Smoke Grüner Veltliner. North Canterbury, New Zealand.",
      "Seresin, Reserve Chardonnay. Marlborough, New Zealand.",
    ].map((t, i) => ({ ...label(t), slot: i + 1 }));
    const v = flightCompositionViolations(flight);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].rule).toBe("flight-composition");
  });

  it("accepts a flight with a real anchor and one curveball", () => {
    const flight = [
      "Domaine Leflaive, Puligny-Montrachet. Burgundy, France.",
      "Domaine Rolet, Savagnin Ouillé. Côtes du Jura, France.",
    ].map((t, i) => ({ ...label(t), slot: i + 1 }));
    expect(flightCompositionViolations(flight)).toEqual([]);
  });
});

// ── The anchor-pairing matcher must abstain on an unresolved variety ──────────────────────────────
//
// matchingAnchorPair shipped as `!!variety && p.variety.test(variety)`, so a wine whose grape the
// label does not state was refused its pairing however classic its origin. A Bordeaux label names no
// grape, and the Bordeaux pair gates on cabernet|merlot — so Château Lynch Bages (Pauillac), Nenin
// (Pomerol), Léoville Barton (St Julien) and Berliquet (St Émilion) all read as "no anchor".
//
// It is the same bug isBanker's own comment records having already fixed, where an unresolved variety
// vetoing a region match was "the single largest contributor to the 47% of real exam wines this
// detector was calling curveballs". Measured against the real corpus, restoring the abstain took the
// anchor rule's false-positive rate from 20.6% to 13.1% — and the residue is flights the exam really
// does set bankerless (four Muscats in 2012 P3 Q4, Chinon + Pinotage + Lagrein in 2017 P2 Q3).
describe("matchesAnchorPair — the unknown abstains", () => {
  const wine = (fullText: string, region: string, varieties: string[] = []) =>
    ({ slot: 1, fullText, region, country: "", varieties }) as Parameters<typeof matchesAnchorPair>[0];

  it("anchors a Bordeaux classed growth whose label names no grape", () => {
    expect(matchesAnchorPair(wine("Château Lynch Bages. 2006. Pauillac, Bordeaux, France.", "Pauillac"))).toBe(true);
    expect(matchesAnchorPair(wine("Château Nenin. 2008. Pomerol, Bordeaux, France.", "Pomerol"))).toBe(true);
  });

  it("still vetoes a RESOLVED variety that does not belong to the region", () => {
    // The rule's whole purpose — a banker grape in an atypical origin is not an anchor. Only the
    // unknown abstains; a grape we can actually read still has to fit.
    expect(matchesAnchorPair(wine("Chardonnay, Coonawarra, Australia.", "Coonawarra", ["chardonnay"]))).toBe(false);
  });

  it("recognises non-Champagne traditional method as an anchor", () => {
    // 2023 P3 Q1 is "traditional method sparkling wines from four different countries. None is from
    // Champagne" — Cava, Crémant d'Alsace, Nyetimber, Rheingau Sekt. With Champagne as the only
    // sparkling anchor the stem forbade the one thing that could satisfy the rule, and the re-import
    // of that question failed three times on "flight has NO anchor".
    expect(matchesAnchorPair(wine("Recaredo, Terrers Brut Nature. Corpinnat, Penedès, Spain.", "Penedès"))).toBe(true);
    expect(matchesAnchorPair(wine("Clément Klur, Brut NV. Crémant d'Alsace, France.", "Crémant d'Alsace"))).toBe(true);
    expect(matchesAnchorPair(wine("Schloss Reinhartshausen, Riesling Extra Brut Sekt. Rheingau, Germany.", "Rheingau", ["riesling"]))).toBe(true);
  });
});
