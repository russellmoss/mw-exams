// distinct-variety-generation.test.ts — the "different varieties" contradiction, at GENERATION time.
//
// This rule existed only at the key stage (the audit and the review pane), so a flight that promised
// distinct grapes and delivered duplicates passed generation every time and was caught only after it
// was banked. Three defects reached the bank that way: a Cannonau/Garnacha pair (both Grenache), a
// flight of Crozes-Hermitage + Amarone + McLaren Vale Shiraz + Chocolate Block (three Syrah), and a
// six-wine flight with Cabernet Sauvignon twice.
//
// The engine DID have a local duplicate check, but its gate required "different[,] single|predominant
// ... variety". The stems that slipped through read "made predominantly from a different grape
// variety" — "predominantly" before "different" rather than between it and "variety". The engine now
// also delegates to the shared rule, whose gate matches the natural phrasing.
import { describe, it, expect } from "vitest";
import { validateVarietyConsistency } from "../src/lib/question-engine";
import { detectPrimaryVariety } from "../src/lib/question-rules.mjs";

const wine = (slot: number, fullText: string) => ({ slot, fullText });

// The exact stem wording that defeated the old gate.
const PREDOMINANTLY_STEM =
  "Wines 1 to 4 are from four different countries. Each is made predominantly from a different grape variety.";

describe("the flight that was banked", () => {
  const flight = [
    wine(1, "Yann Chave, Crozes-Hermitage Rouge, 2022. Crozes-Hermitage AOC, Northern Rhône, France. (13.5%)"),
    wine(2, "Masi Costasera, Amarone della Valpolicella Classico DOCG, 2018. Valpolicella Classico, Veneto, Italy. (15.0%)"),
    wine(3, "d'Arenberg The Footbolt Shiraz, 2021. McLaren Vale, South Australia, Australia. (14.5%)"),
    wine(4, "Boekenhoutskloof Chocolate Block, 2022. Franschhoek, Western Cape, South Africa. (14.5%)"),
  ];

  it("is now rejected at generation", () => {
    const r = validateVarietyConsistency(PREDOMINANTLY_STEM, flight);
    expect(r.valid).toBe(false);
    expect(r.violations.join(" ")).toMatch(/duplicate|different varieties/i);
  });

  it("catches it via Crozes-Hermitage and Shiraz both resolving to Syrah", () => {
    expect(detectPrimaryVariety(flight[0].fullText)).toBe("syrah");
    expect(detectPrimaryVariety(flight[2].fullText)).toBe("syrah");
  });
});

describe("no false positives", () => {
  it("accepts a flight whose varieties really are all distinct", () => {
    const r = validateVarietyConsistency(PREDOMINANTLY_STEM, [
      wine(1, "Château Batailley, Pauillac, 2016. Bordeaux, France. (13.5%)"),
      wine(2, "Felton Road, Bannockburn Pinot Noir, 2021. Central Otago, New Zealand. (14.0%)"),
      wine(3, "Produttori del Barbaresco, Barbaresco, 2019. Piedmont, Italy. (14.0%)"),
      wine(4, "Catena Zapata, Adrianna Malbec, 2019. Mendoza, Argentina. (14.0%)"),
    ]);
    expect(r.valid).toBe(true);
  });

  it("stays silent when the stem makes no distinctness claim", () => {
    // Two Syrahs are perfectly legal if nothing promised different grapes.
    const r = validateVarietyConsistency("Comment on the quality of each wine.", [
      wine(1, "Yann Chave, Crozes-Hermitage Rouge, 2022. Northern Rhône, France. (13.5%)"),
      wine(2, "d'Arenberg The Footbolt Shiraz, 2021. McLaren Vale, Australia. (14.5%)"),
    ]);
    expect(r.valid).toBe(true);
  });
});

// Bank batch c3276590 (2026-08-06, Paper 2 F1 fill): ~65 failed attempts, most on the same-variety
// rule. Two failure shapes drove the loops, both fixed here:
//   1. Blend-appellation wines (Pauillac second wines, Châteauneuf, Bolgheri) reported as "variety
//      undetectable" — the repair model, never told the appellation was the problem, swapped one
//      Bordeaux for another for 8 straight attempts.
//   2. Genuinely 100%-varietal wines (Hill of Grace, The Struie) rejected because the label names no
//      grape and the region maps to none — the message now says how to comply.
describe("same-variety flight messaging (batch c3276590 repair loops)", () => {
  const SAME_VARIETY_STEM = "Wines 1 and 2 are made from the same single grape variety.";

  it("names the blend category for a Pauillac in a single-variety flight, not 'undetectable'", () => {
    const r = validateVarietyConsistency(SAME_VARIETY_STEM, [
      wine(1, "Château Pichon-Longueville Comtesse de Lalande, Réserve de la Comtesse, 2018. Pauillac, Bordeaux, France. (13.5%)"),
      wine(2, "Viña Cobos, Bramare Cabernet Sauvignon, 2019. Mendoza, Argentina. (14.5%)"),
    ]);
    expect(r.valid).toBe(false);
    const wine1Violations = r.violations.filter((v) => v.includes("Wine 1"));
    expect(wine1Violations.join(" ")).toMatch(/blend-normed/);
    expect(wine1Violations.join(" ")).not.toMatch(/undetectable/);
  });

  it("tells the model how to fix a varietal wine whose label names no grape", () => {
    const r = validateVarietyConsistency(SAME_VARIETY_STEM, [
      wine(1, "Henschke, Hill of Grace, 2018. Eden Valley, South Australia, Australia. (14.5%)"),
      wine(2, "Torbreck, RunRig Shiraz, 2019. Barossa Valley, South Australia, Australia. (15%)"),
    ]);
    expect(r.valid).toBe(false);
    expect(r.violations.join(" ")).toMatch(/write the variety into the wine name/);
  });

  it("accepts the compliant version of the same flight", () => {
    const r = validateVarietyConsistency(SAME_VARIETY_STEM, [
      wine(1, "Henschke, Hill of Grace Shiraz, 2018. Eden Valley, South Australia, Australia. (14.5%)"),
      wine(2, "Torbreck, RunRig Shiraz, 2019. Barossa Valley, South Australia, Australia. (15%)"),
    ]);
    expect(r.valid).toBe(true);
  });

  it("still accepts Rioja in a same-variety Tempranillo flight (detected, blend-normed by convention)", () => {
    // Real MW same-variety flights use Rioja for Tempranillo. The blend message must only replace
    // the undetectable message, never reject wines whose variety detection already succeeds.
    const r = validateVarietyConsistency(SAME_VARIETY_STEM, [
      wine(1, "La Rioja Alta, Viña Ardanza Reserva, 2016. Rioja, Spain. (14%)"),
      wine(2, "Vega Sicilia, Valbuena 5º, 2018. Ribera del Duero, Spain. (14.5%)"),
    ]);
    expect(r.valid).toBe(true);
  });
});

describe("Gigondas resolves to a variety (typo regression)", () => {
  // APPELLATION_TO_PRIMARY_VARIETY read "gigalondas" — Gigondas wines never matched, so every
  // Gigondas in a same-variety flight fired the undetectable rule (batch c3276590, id 2850).
  it("detects Gigondas as grenache blend", () => {
    expect(
      detectPrimaryVariety("Domaine Santa Duc, Les Hautes Garrigues, 2021. Gigondas, Rhône Valley, France. (14.5%)")
    ).toBe("grenache blend");
  });
});

describe("Montepulciano is two different things", () => {
  // The appellation table matched the bare town name, sending every Abruzzese red to Sangiovese.
  // Harmless while this rule only ran post-hoc; a false-positive generator once it gates generation.
  it("reads Montepulciano d'Abruzzo as the grape", () => {
    expect(detectPrimaryVariety("Valle Reale, Montepulciano d'Abruzzo, 2021. Abruzzo, Italy.")).toBe(
      "montepulciano"
    );
  });

  it("still reads Vino Nobile di Montepulciano as Sangiovese", () => {
    expect(
      detectPrimaryVariety("Avignonesi, Vino Nobile di Montepulciano, 2019. Tuscany, Italy.")
    ).toBe("sangiovese");
  });

  it("does not flag Chianti alongside Montepulciano d'Abruzzo", () => {
    const r = validateVarietyConsistency(
      "Wines 1 and 2 are each made from a different grape variety.",
      [
        wine(1, "Fontodi, Chianti Classico, 2019. Tuscany, Italy."),
        wine(2, "Valle Reale, Montepulciano d'Abruzzo, 2021. Abruzzo, Italy."),
      ]
    );
    expect(r.valid).toBe(true);
  });
});
