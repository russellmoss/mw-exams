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
