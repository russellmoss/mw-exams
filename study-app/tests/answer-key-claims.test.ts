// answer-key-claims.test.ts — the reveal/marking PROSE must not assert wine facts/roles the keyed
// record contradicts (recurring fault cluster, cross-paper: fb_188, fb_175, fb_135).
//
// validateAnswerKeyClaims validates the CLAIMS the feedback makes — distinct from the shipped
// served-question-integrity guard, which validates that surfaces render one stored payload.
//   • Rule 1 (fb_188) — a 'banker'/'curveball' label must equal the wine's keyed `role`.
//   • Rule 2 (fb_175) — an absolute method claim on a MIXED-method category (Prosecco) is rejected.
//   • Rule 3 (fb_135) — a hierarchy rationale that reduces every ladder to geography while a keyed
//     region carries a producer/ageing/hybrid model (Bordeaux, Rioja, Chianti) is rejected.
import { describe, it, expect } from "vitest";
import {
  validateAnswerKeyClaims,
  regenerateFeedbackOnce,
  regionClassificationModel,
  type AuditWine,
} from "../src/lib/question-validator";

describe("validateAnswerKeyClaims — Rule 1: role labels must match the keyed role (fb_188)", () => {
  // The Alsace Sylvaner: keyed a curveball (Sylvaner is not one of Alsace's four noble grapes), but
  // the reveal prose called it a banker.
  const alsaceSylvaner: AuditWine = {
    slot: 2,
    varieties: ["Sylvaner"],
    region: "Alsace",
    country: "France",
    role: "curveball",
  };
  const alsacePinotGris: AuditWine = {
    slot: 1,
    varieties: ["Pinot Gris"],
    region: "Alsace",
    country: "France",
    role: "banker",
  };

  it("rejects an Alsace Sylvaner called a banker when it is keyed a curveball", () => {
    const feedback =
      "The Alsace Sylvaner is a banker: a classic benchmark expression that anchors the flight.";
    const res = validateAnswerKeyClaims(feedback, [alsacePinotGris, alsaceSylvaner]);
    expect(res.ok).toBe(false);
    expect(res.violations.some((x) => x.rule === "answer-key-claim-role")).toBe(true);
    expect(res.failureReason).toMatch(/banker|curveball/i);
  });

  it("passes when the prose labels each wine with its keyed role", () => {
    const feedback =
      "Wine 1 is the banker (Alsace Pinot Gris), while wine 2 is the curveball.";
    const res = validateAnswerKeyClaims(feedback, [alsacePinotGris, alsaceSylvaner]);
    expect(res.ok).toBe(true);
  });
});

describe("validateAnswerKeyClaims — Rule 2: no absolute method claim on a mixed category (fb_175)", () => {
  const prosecco: AuditWine = { slot: 1, varieties: ["Glera"], region: "Prosecco", country: "Italy" };

  it("rejects 'Prosecco is not traditional method' — Prosecco is a mixed-method category", () => {
    const feedback =
      "Your comparison is weak because Prosecco is not traditional method, so the analogy fails.";
    const res = validateAnswerKeyClaims(feedback, [prosecco]);
    expect(res.ok).toBe(false);
    expect(res.violations.some((x) => x.rule === "answer-key-claim-method")).toBe(true);
  });

  it("rejects 'X is always tank method' when X (Prosecco) is mixed", () => {
    const feedback = "Note that Prosecco is always tank method, never anything else.";
    const res = validateAnswerKeyClaims(feedback, [prosecco]);
    expect(res.ok).toBe(false);
  });

  it("does not reject an absolute claim about a single-method category (Champagne)", () => {
    const champagne: AuditWine = { slot: 1, varieties: ["Pinot Noir"], region: "Champagne", country: "France" };
    const feedback = "Champagne is always made by the traditional method.";
    const res = validateAnswerKeyClaims(feedback, [champagne]);
    expect(res.ok).toBe(true);
  });
});

describe("validateAnswerKeyClaims — Rule 3: hierarchy must cite each region's model (fb_135)", () => {
  const flight: AuditWine[] = [
    { slot: 1, varieties: ["Sauvignon Blanc"], region: "Bordeaux", country: "France" },
    { slot: 2, varieties: ["Merlot"], region: "Bordeaux", country: "France" },
    { slot: 3, varieties: ["Sangiovese"], region: "Chianti Classico", country: "Italy" },
    { slot: 4, varieties: ["Sangiovese"], region: "Chianti Classico Gran Selezione", country: "Italy" },
    { slot: 5, varieties: ["Tempranillo"], region: "Rioja", country: "Spain" },
    { slot: 6, varieties: ["Tempranillo"], region: "Rioja", country: "Spain" },
  ];

  it("resolves each keyed region's classification model", () => {
    expect(regionClassificationModel(flight[0])).toBe("producer"); // Bordeaux
    expect(regionClassificationModel(flight[3])).toBe("hybrid"); // Chianti Classico Gran Selezione
    expect(regionClassificationModel(flight[4])).toBe("ageing"); // Rioja
  });

  it("rejects a hierarchy reduced to bare geography while regions are producer/ageing/hybrid", () => {
    const feedback =
      "The quality hierarchy simply ascends by increasingly specific geographic delimitation: each tier is a smaller, more precisely defined geographical area than the last.";
    const res = validateAnswerKeyClaims(feedback, flight);
    expect(res.ok).toBe(false);
    expect(res.violations.some((x) => x.rule === "answer-key-claim-hierarchy")).toBe(true);
  });

  it("passes when the hierarchy cites the real models (producer, ageing, hybrid)", () => {
    const feedback =
      "The hierarchy is built differently in each country: Bordeaux ranks by producer classification (the classed growths), Rioja ascends by ageing tiers (Crianza, Reserva, Gran Reserva), and Chianti Classico climbs to a Gran Selezione tier — a hybrid of geography and structural rules.";
    const res = validateAnswerKeyClaims(feedback, flight);
    expect(res.ok).toBe(true);
  });
});

describe("validateAnswerKeyClaims — control feedback passes all three rules", () => {
  it("passes a feedback block that is role-correct, method-correct and cites the right models", () => {
    const flight: AuditWine[] = [
      { slot: 1, varieties: ["Pinot Gris"], region: "Alsace", country: "France", role: "banker" },
      { slot: 2, varieties: ["Sylvaner"], region: "Alsace", country: "France", role: "curveball" },
      { slot: 3, varieties: ["Tempranillo"], region: "Rioja", country: "Spain" },
    ];
    const feedback =
      "Wine 1 is the banker — a benchmark Alsace Pinot Gris — while wine 2 is the curveball. " +
      "Champagne is always traditional method, a useful anchor for the sparkling comparison. " +
      "Where a quality hierarchy appears, note Rioja ascends by ageing tiers (Crianza, Reserva, Gran Reserva), not geography.";
    const res = validateAnswerKeyClaims(feedback, flight);
    expect(res.ok).toBe(true);
    expect(res.failureReason).toBeNull();
  });
});

describe("regenerateFeedbackOnce — stores the reason and regenerates once before serving", () => {
  const flight: AuditWine[] = [
    { slot: 1, varieties: ["Glera"], region: "Prosecco", country: "Italy" },
  ];

  it("serves a passing feedback untouched", () => {
    const good = "Prosecco spans both tank and traditional method.";
    const out = regenerateFeedbackOnce(good, flight, () => "should not be called");
    expect(out.regenerated).toBe(false);
    expect(out.feedback).toBe(good);
  });

  it("regenerates exactly once with the failure reason and serves the redraft", () => {
    const bad = "Prosecco is not traditional method.";
    let seenReason: string | null = null;
    let calls = 0;
    const out = regenerateFeedbackOnce(bad, flight, (reason) => {
      calls += 1;
      seenReason = reason;
      return "Prosecco is largely tank method, though a quality slice is traditional method.";
    });
    expect(calls).toBe(1);
    expect(seenReason).toMatch(/prosecco/i);
    expect(out.regenerated).toBe(true);
    expect(out.failureReason).toBeNull();
  });
});
