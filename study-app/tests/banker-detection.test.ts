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
import { isBanker, flightCompositionViolations, type AuditWine } from "@/lib/question-validator";
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
