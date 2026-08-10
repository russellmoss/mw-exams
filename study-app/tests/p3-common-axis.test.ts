// p3-common-axis.test.ts — a Paper 3 flight must hang on ONE testable axis (fb_591 / fb_592 / fb_602).
//
// Three accepted/partial reviews rejected P3 flights as "unclear what it's actually trying to test":
//   fb_602: a sweet fortified Muscat vs a rosé vs a sweet Monastrell;
//   fb_592: a sherry vs a rosé vs a sparkling;
//   fb_591: a vin jaune vs a Tokaji vs a manzanilla vs a Rutherglen.
// Real P3 flights hang on a single axis (all sparkling / rosé / fortified / sweet / oxidative, or one
// variety across origins). p3CommonAxisViolations maps every keyed wine to a top-level P3 category and
// rejects (NO_COMMON_AXIS) any 3+ axis flight, or a 2-axis flight whose text never names the axis.
import { describe, it, expect } from "vitest";
import {
  p3CommonAxisViolations,
  validateQuestion,
  type AuditWine,
  type QuestionForAudit,
} from "../src/lib/question-validator";

const wine = (slot: number, fullText: string): AuditWine => ({
  slot,
  varieties: [],
  region: "",
  fullText,
});

// A fortified, a (dry, still) rosé, and a sweet unfortified still wine — the fb_602 grab-bag.
const TAWNY = wine(1, "Taylor's 20 Year Old Tawny Port NV. Douro, Portugal. (20%)");
const ROSE = wine(2, "Domaine Tempier, Bandol Rosé 2022. Provence, France. (13.5%)");
const SWEET_STILL = wine(3, "Casa Castillo, Monastrell late harvest 2019. Jumilla, Spain. (15%)");

// An all-fortified trio.
const FINO = wine(2, "Emilio Lustau, Puerto Fino Sherry NV. Jerez, Spain. (15%)");
const RUTHERGLEN = wine(3, "Chambers, Rutherglen Muscat NV. Victoria, Australia. (18%)");

const SAUTERNES = wine(2, "Château Guiraud, Sauternes 2015. Bordeaux, France. (13.5%)");

const q = (paper: number, questionText: string, wines: AuditWine[]): QuestionForAudit => ({
  questionId: "test",
  paper,
  family: "F1",
  questionText,
  wines,
});

const PLAIN_STEM =
  "Wines 1-3 are from different countries. For each wine:\na) Identify the origin as closely as possible.\nb) Comment on the key winemaking techniques.";

describe("p3CommonAxisViolations — NO_COMMON_AXIS", () => {
  it("rejects a fortified + rosé + sweet-still trio (fb_602)", () => {
    const v = p3CommonAxisViolations(q(3, PLAIN_STEM, [TAWNY, ROSE, SWEET_STILL]));
    expect(v.some((x) => x.rule === "NO_COMMON_AXIS" && x.severity === "hard")).toBe(true);
    expect(v[0].detail).toMatch(/3 distinct style axes|three/i);
  });

  it("passes an all-fortified trio (one axis)", () => {
    expect(p3CommonAxisViolations(q(3, PLAIN_STEM, [TAWNY, FINO, RUTHERGLEN]))).toEqual([]);
  });

  it("a two-axis pair (fortified + sweet-still) passes ONLY when the stem names the shared axis", () => {
    const bare =
      "Wines 1-2 are from two different countries.\na) Identify the origin as closely as possible.\nb) Comment on the winemaking.";
    const unnamed = p3CommonAxisViolations(q(3, bare, [TAWNY, SAUTERNES]));
    expect(unnamed.some((x) => x.rule === "NO_COMMON_AXIS")).toBe(true);

    const named =
      "Wines 1-2 are both sweet wines from two different countries.\na) State the residual sugar in g/L.\nb) Comment on how the sweetness was achieved.";
    expect(p3CommonAxisViolations(q(3, named, [TAWNY, SAUTERNES]))).toEqual([]);

    // Naming the OTHER present axis licenses the contrast just as well.
    const namedFort =
      "Wines 1-2 are from two different countries.\na) Compare the methods of fortification.";
    expect(p3CommonAxisViolations(q(3, namedFort, [TAWNY, SAUTERNES]))).toEqual([]);
  });

  it("does not fire on Papers 1 and 2, or on single-wine flights", () => {
    expect(p3CommonAxisViolations(q(1, PLAIN_STEM, [TAWNY, ROSE, SWEET_STILL]))).toEqual([]);
    expect(p3CommonAxisViolations(q(2, PLAIN_STEM, [TAWNY, ROSE, SWEET_STILL]))).toEqual([]);
    expect(p3CommonAxisViolations(q(3, PLAIN_STEM, [TAWNY]))).toEqual([]);
  });

  it("is wired HARD into validateQuestion (the audit verdict)", () => {
    // Paper 3 has no R-COLOUR restriction, so this needs no paperScope opt-out.
    const res = validateQuestion(q(3, PLAIN_STEM, [TAWNY, ROSE, SWEET_STILL]));
    const hit = res.violations.filter((x) => x.rule === "NO_COMMON_AXIS");
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.every((x) => x.severity === "hard")).toBe(true);
  });
});
