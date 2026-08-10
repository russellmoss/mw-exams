// flight-composition.test.ts — a flight needs a banker, and can't be all curveballs.
//
// A recurring admin bin cluster (14 reasoned bins across papers 1–3) was, in the reviewer's own
// words, "a flight like this would likely have a banker" and "three out of the four wines are
// curveballs, normally in a flight like this you would see one curveball, two at best". The banker —
// a classic benchmark expression of a mainstream variety in its home region — is the wine that gives
// the candidate a route to the country. The validator now derives a banker/curveball classification
// (unknown wines fail safe to curveball) and rejects a flight with no banker or with more curveballs
// than max(1, floor(n/2)) — bankers must hold at least half the flight.
import { describe, it, expect } from "vitest";
import {
  validateQuestion,
  isBanker,
  flightCompositionViolations,
  type AuditWine,
} from "../src/lib/question-validator";

const BANKERS: AuditWine[] = [
  { slot: 1, varieties: ["Sauvignon Blanc"], region: "Marlborough", country: "New Zealand" },
  { slot: 2, varieties: ["Cabernet Sauvignon"], region: "Napa Valley", country: "USA" },
  { slot: 3, varieties: ["Tempranillo"], region: "Rioja", country: "Spain" },
  { slot: 4, varieties: ["Riesling"], region: "Mosel", country: "Germany" },
];

// Obscure varieties/regions no reasonable examiner treats as a banker.
const CURVEBALLS: AuditWine[] = [
  { slot: 1, varieties: ["Savagnin"], region: "Jura", country: "France" },
  { slot: 2, varieties: ["Assyrtiko"], region: "Santorini", country: "Greece" },
  { slot: 3, varieties: ["Furmint"], region: "Somló", country: "Hungary" },
  { slot: 4, varieties: ["Blaufränkisch"], region: "Mittelburgenland", country: "Austria" },
  { slot: 5, varieties: ["Xinomavro"], region: "Naoussa", country: "Greece" },
  { slot: 6, varieties: ["Trousseau"], region: "Arbois", country: "France" },
];

const flight = (wines: AuditWine[]) => {
  const w = wines.map((x, i) => ({ ...x, slot: i + 1 }));
  return validateQuestion(
    {
      questionId: "test",
      paper: 1,
      family: "F1",
      questionText: `Wines 1 to ${w.length} are from ${w.length} different countries. For each wine identify the grape variety and region of origin.`,
      wines: w,
    },
    // R-COLOUR opt-out. These fixtures deliberately mix colours to exercise the banker/curveball
    // COUNTING logic — BANKERS pairs Sauvignon Blanc with Cabernet Sauvignon and Tempranillo,
    // CURVEBALLS mixes Assyrtiko with Blaufränkisch and Trousseau — so no single paper number can make
    // them coherent. The paper is incidental here; colour compliance is covered by paper-colour.test.ts.
    { paperScope: false }
  );
};

describe("banker classification", () => {
  it("recognises classic benchmark expressions as bankers", () => {
    for (const b of BANKERS) expect(isBanker(b)).toBe(true);
  });
  it("treats obscure wines — and any wine it cannot place — as curveballs", () => {
    for (const c of CURVEBALLS) expect(isBanker(c)).toBe(false);
    expect(isBanker({ slot: 1, varieties: [], region: "", country: "" })).toBe(false);
  });
  it("does not treat a bare regional Mendoza Malbec as a banker (EK-0029)", () => {
    // gen_p2_F6_1779988985396 slipped through because this counted as the flight's banker; a
    // standard Mendoza Malbec is not the classified/benchmark anchor EK-0029 requires.
    expect(isBanker({ slot: 1, varieties: ["Malbec"], region: "Mendoza", country: "Argentina" })).toBe(false);
  });
});

// The rule is emitted HARD and consumed that way by the generation loop (question-engine.ts), where
// rejecting a curveball-heavy flight costs one redraft. validateQuestion — which judges questions that
// ALREADY EXIST — demotes it to soft, because even with the detector repaired it still rejects ~5% of
// real IMW flights (2023 P1 Q3 is four South African whites with no classic anchor). See the
// pool-admission note in validateQuestion.
describe("flight-composition rule (raw — the generation verdict)", () => {
  it("rejects a four-wine flight with three curveballs and one banker", () => {
    const v = flightCompositionViolations([BANKERS[0], CURVEBALLS[0], CURVEBALLS[1], CURVEBALLS[2]]);
    expect(v.some((x) => x.severity === "hard")).toBe(true);
    expect(v.some((x) => /3 curveballs/.test(x.detail))).toBe(true);
  });

  it("passes the same-size flight with two curveballs and two bankers", () => {
    expect(flightCompositionViolations([BANKERS[0], BANKERS[1], CURVEBALLS[0], CURVEBALLS[1]])).toEqual([]);
  });

  it("rejects a six-wine all-obscure flight (no banker)", () => {
    const v = flightCompositionViolations(CURVEBALLS);
    expect(v.some((x) => /no banker/.test(x.detail))).toBe(true);
  });

  it("rejects a two-wine flight of two curveballs, but passes it with a banker", () => {
    expect(flightCompositionViolations([CURVEBALLS[0], CURVEBALLS[1]]).length).toBeGreaterThan(0);
    expect(flightCompositionViolations([BANKERS[0], CURVEBALLS[0]])).toEqual([]);
  });

  it("scales the curveball allowance with the flight, rather than capping it at two", () => {
    // min(2, …) held a six-wine flight to the same budget as a four-wine one, which rejected 27% of
    // real IMW flights. Three curveballs in six wines is now within budget; four is not.
    const six = [BANKERS[0], BANKERS[1], BANKERS[2], CURVEBALLS[0], CURVEBALLS[1], CURVEBALLS[2]];
    expect(flightCompositionViolations(six)).toEqual([]);
    const sixHeavy = [BANKERS[0], BANKERS[1], CURVEBALLS[0], CURVEBALLS[1], CURVEBALLS[2], CURVEBALLS[3]];
    expect(flightCompositionViolations(sixHeavy).some((x) => /4 curveballs/.test(x.detail))).toBe(true);
  });

  it("requires bankers to hold at least half the flight (2026-08 expert review)", () => {
    // 74 of Mike's 177 review down-votes were ratio complaints, dominated by small flights where
    // curveballs outnumbered bankers — 2-of-3 curveball flights passed the old max(2, ceil(n/2)) cap.
    const threeHeavy = [BANKERS[0], CURVEBALLS[0], CURVEBALLS[1]];
    expect(flightCompositionViolations(threeHeavy).some((x) => /2 curveballs/.test(x.detail))).toBe(true);
    const threeOk = [BANKERS[0], BANKERS[1], CURVEBALLS[0]];
    expect(flightCompositionViolations(threeOk)).toEqual([]);
    const fiveHeavy = [BANKERS[0], BANKERS[1], CURVEBALLS[0], CURVEBALLS[1], CURVEBALLS[2]];
    expect(flightCompositionViolations(fiveHeavy).some((x) => /3 curveballs/.test(x.detail))).toBe(true);
    const fiveOk = [BANKERS[0], BANKERS[1], BANKERS[2], CURVEBALLS[0], CURVEBALLS[1]];
    expect(flightCompositionViolations(fiveOk)).toEqual([]);
  });

  it("leaves single-wine questions untouched", () => {
    expect(flightCompositionViolations([CURVEBALLS[0]])).toEqual([]);
  });
});

describe("flight-composition through validateQuestion (the audit verdict)", () => {
  it("reports the same finding, but advisory — it must not retire a banked question", () => {
    const res = flight([BANKERS[0], CURVEBALLS[0], CURVEBALLS[1], CURVEBALLS[2]]);
    const v = res.violations.filter((x) => x.rule === "flight-composition");
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((x) => x.severity === "soft")).toBe(true);
    expect(v.some((x) => /3 curveballs/.test(x.detail))).toBe(true);
  });

  it("a bankerless flight is flagged, not failed", () => {
    const res = flight(CURVEBALLS);
    const v = res.violations.filter((x) => x.rule === "flight-composition");
    expect(v.some((x) => /no banker/.test(x.detail) && x.severity === "soft")).toBe(true);
  });
});
