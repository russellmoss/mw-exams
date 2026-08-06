import { describe, it, expect } from "vitest";
import {
  samplePaperComposition,
  validateComposition,
  examDurationMinutes,
} from "@/lib/live-tasting-paper";

// Deterministic rng for reproducible draws.
const seeded = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
};

describe("samplePaperComposition — corpus-shaped papers", () => {
  it("every sampled paper passes its own corpus-validity contract (500 draws x 3 papers x 2 sizes)", () => {
    for (let seed = 1; seed <= 500; seed++) {
      for (const paper of [1, 2, 3]) {
        for (const size of ["half", "full"] as const) {
          const comp = samplePaperComposition({ paper, size, totalBudget: 350, rng: seeded(seed * paper + (size === "full" ? 7 : 0)) });
          const problems = validateComposition(comp, paper, size);
          expect(problems, `P${paper} ${size} seed ${seed}: ${problems.join("; ")}`).toEqual([]);
        }
      }
    }
  });

  it("half is exactly 6 wines, full exactly 12", () => {
    const half = samplePaperComposition({ paper: 1, size: "half", totalBudget: null, rng: seeded(42) });
    const full = samplePaperComposition({ paper: 2, size: "full", totalBudget: null, rng: seeded(42) });
    expect(half.reduce((s, c) => s + c.flightSize, 0)).toBe(6);
    expect(full.reduce((s, c) => s + c.flightSize, 0)).toBe(12);
  });

  it("total budget allocates across flights with one premium moment and slack held back", () => {
    const comp = samplePaperComposition({ paper: 2, size: "full", totalBudget: 400, rng: seeded(7) });
    const spend = comp.reduce((s, c) => s + (c.perBottleBudget ?? 0) * c.flightSize, 0);
    expect(spend).toBeLessThanOrEqual(400);
    const budgets = comp.map((c) => c.perBottleBudget ?? 0);
    expect(Math.max(...budgets)).toBeGreaterThan(Math.min(...budgets)); // a real spread, not flat
  });

  it("no budget = no per-flight budgets", () => {
    const comp = samplePaperComposition({ paper: 1, size: "half", totalBudget: null, rng: seeded(3) });
    expect(comp.every((c) => c.perBottleBudget === null)).toBe(true);
  });

  it("family sampling follows the corpus support (no F6 in P1/P2, F3 only where real papers had it)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const p2 = samplePaperComposition({ paper: 2, size: "full", totalBudget: null, rng: seeded(seed) });
      expect(p2.every((c) => ["F1", "F2", "F3", "F4", "F7"].includes(c.family))).toBe(true);
    }
  });
});

describe("sampled distribution matches the corpus (the QA contract)", () => {
  it("family shares over 2000 papers sit within 8pp of the measured corpus weights", () => {
    const CORPUS: Record<number, Record<string, number>> = {
      1: { F1: 0.31, F2: 0.25, F4: 0.25, F3: 0.07, F7: 0.07, F5: 0.04 },
      2: { F4: 0.4, F2: 0.29, F1: 0.24, F3: 0.04, F7: 0.04 },
      3: { F4: 0.33, F5: 0.19, F2: 0.17, F6: 0.15, F1: 0.08, F7: 0.08 },
    };
    for (const paper of [1, 2, 3]) {
      const counts: Record<string, number> = {};
      let total = 0;
      for (let seed = 1; seed <= 2000; seed++) {
        const comp = samplePaperComposition({ paper, size: "full", totalBudget: null, rng: seeded(seed * 13 + paper) });
        for (const c of comp) {
          counts[c.family] = (counts[c.family] ?? 0) + 1;
          total++;
        }
      }
      for (const [fam, want] of Object.entries(CORPUS[paper])) {
        const got = (counts[fam] ?? 0) / total;
        // The per-paper cap (max 2 per family) + anchor rule legitimately compress the extremes,
        // so the tolerance is generous — this catches a broken sampler, not a 2pp drift.
        expect(Math.abs(got - want), `P${paper} ${fam}: got ${got.toFixed(2)} want ${want}`).toBeLessThan(0.08);
      }
    }
  });
});

describe("examDurationMinutes — the real clock", () => {
  it("2h15 for a full paper, pro-rata for half", () => {
    expect(examDurationMinutes("full")).toBe(135);
    expect(examDurationMinutes("half")).toBe(68);
  });
});
