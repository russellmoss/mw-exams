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
  answerKeyFlight,
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

  // Nothing writes `role` yet, so in production this rule lands on the isBanker() heuristic — a
  // region×variety table built for counting curveballs in flight composition, not for adjudicating
  // prose. Measured over the 95 stored debriefs its one surviving disagreement was the TABLE being
  // wrong. So a derived role flags for review and must NOT trigger a rewrite.
  it("downgrades to SOFT when the role is derived rather than keyed", () => {
    const derived = [
      { slot: 1, varieties: ["Pinot Gris"], region: "Alsace", country: "France" },
      { slot: 2, varieties: ["Sylvaner"], region: "Alsace", country: "France" },
    ];
    const res = validateAnswerKeyClaims("The Alsace Sylvaner is a banker.", derived);
    const roleViolations = res.violations.filter((x) => x.rule === "answer-key-claim-role");
    expect(roleViolations).toHaveLength(1);
    expect(roleViolations[0].severity).toBe("soft");
    expect(roleViolations[0].detail).toMatch(/flag for review, not a correction/);
    // Soft means no correction pass: ok stays true and there is nothing to store as a failure.
    expect(res.ok).toBe(true);
    expect(res.failureReason).toBeNull();
  });

  // Each of these is a real false-positive class from the 95-debrief measurement, where the unguarded
  // rule fired on 23 of them (24%) and every fire was wrong. A fire here would rewrite correct prose.
  describe("does not fire on prose that merely mentions a role", () => {
    const flight: AuditWine[] = [
      { slot: 1, varieties: ["Chardonnay"], region: "Chablis", country: "France", role: "banker" },
      { slot: 3, varieties: ["Clairette", "Bourboulenc"], region: "Southern Rhône", country: "France", role: "banker" },
    ];
    const cases: [string, string][] = [
      ["a Mermaid diagram node (attempts 234, 268)", 'F --> C["CURVEBALL: minor grape such as Clairette or Bourboulenc"]'],
      ["a hypothetical (attempt 80)", "**Plausible curveball**: Mâconnais or cool New World Chardonnay (Chablis requires the chalk to be confirmed)"],
      ["a hypothetical naming an explicit slot (attempt 156)", "**Plausible curveballs:** Wine 1 could be a structured Chablis"],
      ["an instruction about what to expect (attempt 129)", "That constraint should actively surface Chardonnay and an indigenous curveball"],
      ["praise for the CANDIDATE's own call (attempt 245)", "Identified Clairette as a plausible curveball — good instinct"],
      ["a bare noun-phrase mention (attempt 41)", "Ruling out Chablis entirely misses the examiner's deliberate curveball here"],
      ["a trap category, not a wine (attempt 178)", "CURVEBALL = the repeated-Chardonnay trap, which you walked past"],
    ];
    for (const [label, feedback] of cases) {
      it(`ignores ${label}`, () => {
        const res = validateAnswerKeyClaims(feedback, flight);
        expect(res.violations.filter((x) => x.rule === "answer-key-claim-role")).toEqual([]);
      });
    }
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

  it("serves a passing feedback untouched, and spends nothing", async () => {
    const good = "Prosecco spans both tank and traditional method.";
    let calls = 0;
    const out = await regenerateFeedbackOnce(good, flight, async () => {
      calls += 1;
      return "should not be called";
    });
    expect(calls).toBe(0);
    expect(out.regenerated).toBe(false);
    expect(out.feedback).toBe(good);
  });

  it("regenerates exactly once with the failure reason and serves the redraft", async () => {
    const bad = "Prosecco is not traditional method.";
    let seenReason: string | null = null;
    let seenRules: string[] = [];
    let calls = 0;
    const out = await regenerateFeedbackOnce(bad, flight, async (reason, violations) => {
      calls += 1;
      seenReason = reason;
      seenRules = violations.map((v) => v.rule);
      return "Prosecco is largely tank method, though a quality slice is traditional method.";
    });
    expect(calls).toBe(1);
    expect(seenReason).toMatch(/prosecco/i);
    // The corrector is handed the violations, not just the prose reason — it has to know which rule fired.
    expect(seenRules).toEqual(["answer-key-claim-method"]);
    expect(out.regenerated).toBe(true);
    expect(out.failureReason).toBeNull();
    expect(out.originalFailureReason).toMatch(/prosecco/i);
  });

  // A wrong banker label is not worth losing the debrief the candidate is waiting on.
  it("serves the ORIGINAL prose when the corrector throws, and says the correction failed", async () => {
    const bad = "Prosecco is not traditional method.";
    const out = await regenerateFeedbackOnce(bad, flight, async () => {
      throw new Error("model overloaded");
    });
    expect(out.feedback).toBe(bad);
    expect(out.regenerated).toBe(false);
    expect(out.correctionFailed).toBe(true);
    // The defect stays visible in the stored reason rather than being silently dropped.
    expect(out.failureReason).toMatch(/prosecco/i);
  });

  it("treats an empty redraft as a failed correction rather than an empty debrief", async () => {
    const bad = "Prosecco is not traditional method.";
    const out = await regenerateFeedbackOnce(bad, flight, async () => "   ");
    expect(out.feedback).toBe(bad);
    expect(out.correctionFailed).toBe(true);
  });

  it("does not loop: a redraft that still violates is served once, with the surviving reason", async () => {
    const bad = "Prosecco is not traditional method.";
    let calls = 0;
    const out = await regenerateFeedbackOnce(bad, flight, async () => {
      calls += 1;
      return "Prosecco is never traditional method."; // still wrong
    });
    expect(calls).toBe(1);
    expect(out.regenerated).toBe(true);
    expect(out.failureReason).toMatch(/prosecco/i);
    expect(out.correctionFailed).toBe(false);
  });
});

// The builder that feeds the rule at the debrief seam: StemKey["ground"] zipped with the wine labels.
describe("answerKeyFlight", () => {
  it("zips the keyed ground truth onto the revealed labels by slot", () => {
    const flight = answerKeyFlight(
      [
        { slot: 1, varieties: ["Pinot Gris"], region: "Alsace", country: "France", is_blend: false },
        { slot: 2, varieties: ["Sylvaner"], region: "Alsace", country: "France", is_blend: false },
      ],
      [
        { slot: 1, fullText: "Alsace Pinot Gris 2019" },
        { slot: 2, fullText: "Alsace Sylvaner 2020" },
      ]
    );
    expect(flight).toHaveLength(2);
    expect(flight[0]).toMatchObject({ slot: 1, region: "Alsace", fullText: "Alsace Pinot Gris 2019" });
    expect(flight[1].varieties).toEqual(["Sylvaner"]);
  });

  it("degrades to label-only wines when the key resolved nothing", () => {
    const flight = answerKeyFlight(null, [{ slot: 1, fullText: "Prosecco Superiore DOCG" }]);
    expect(flight).toEqual([
      { slot: 1, varieties: [], region: "", fullText: "Prosecco Superiore DOCG" },
    ]);
  });

  it("keeps a slot the key missed, and sorts by slot", () => {
    const flight = answerKeyFlight(
      [{ slot: 2, varieties: ["Riesling"], region: "Mosel", country: "Germany" }],
      [{ slot: 1, fullText: "unresolved bottle" }, { slot: 2, fullText: "Mosel Riesling" }]
    );
    expect(flight.map((w) => w.slot)).toEqual([1, 2]);
    expect(flight[0].varieties).toEqual([]);
    expect(flight[1].region).toBe("Mosel");
  });

  it("returns an empty flight for no inputs rather than throwing", () => {
    expect(answerKeyFlight(null, null)).toEqual([]);
  });
});
