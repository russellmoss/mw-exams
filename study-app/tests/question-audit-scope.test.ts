// question-audit-scope.test.ts — one scope filter, applied by BOTH audit callers.
//
// The per-question audit (question-audit.ts) exempts bank-COMPOSITION rules for scope='live-tasting':
// a Live Tasting flight is pinned to wines a candidate can actually buy, so "no banker", "too many
// curveballs", "producer over-used" and the id-mark-split caps judge it against a standard it was never
// built to meet. The corpus sweep (scripts/audit-questions.mjs) re-ran the same validator with a plain
// `severity === "hard"` filter and therefore did NOT exempt anything — so the 2026-08-07 20:40 UTC run
// quarantined ten valid Live Tasting flights on `id-mark-allocation` alone, four of them a
// candidate's whole in-progress Paper 2 paper.
//
// The filter now lives in one exported function. These tests pin its behaviour AND that the sweep still
// calls it, because the failure mode is two callers judging the same rows by different rules.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BANK_COMPOSITION_RULES, hardViolationsForScope } from "@/lib/question-audit";
import type { Violation } from "@/lib/question-validator";

const v = (rule: string, severity: "hard" | "soft" = "hard"): Violation => ({ rule, severity, detail: `${rule} fired` });

describe("hardViolationsForScope", () => {
  it("drops soft violations for every scope", () => {
    expect(hardViolationsForScope([v("marks", "soft")], "pool")).toEqual([]);
    expect(hardViolationsForScope([v("marks", "soft")], "live-tasting")).toEqual([]);
  });

  it("exempts bank-composition rules for live-tasting, keeps them for the pool", () => {
    for (const rule of BANK_COMPOSITION_RULES) {
      expect(hardViolationsForScope([v(rule)], "live-tasting"), rule).toEqual([]);
      expect(hardViolationsForScope([v(rule)], "pool").map((x) => x.rule), rule).toEqual([rule]);
    }
  });

  it("keeps the rules a home flight must still obey", () => {
    // Key-consistency, colour/paper scope and answer content are about whether the question is
    // ANSWERABLE and correctly keyed — true of a home flight as much as a banked one. wrong_colour is
    // the one that caught a white Kerner in a Paper 2 Live Tasting flight on 2026-08-07.
    for (const rule of ["wrong_colour_for_paper", "stem-fact-same-variety", "sweetness-out-of-paper", "answer-missing-wine"]) {
      expect(hardViolationsForScope([v(rule)], "live-tasting").map((x) => x.rule), rule).toEqual([rule]);
    }
  });

  it("filters a mixed set down to the non-exempt hard rules", () => {
    const mixed = [v("id-mark-allocation"), v("wrong_colour_for_paper"), v("flight-composition"), v("marks", "soft")];
    expect(hardViolationsForScope(mixed, "live-tasting").map((x) => x.rule)).toEqual(["wrong_colour_for_paper"]);
    expect(hardViolationsForScope(mixed, "pool").map((x) => x.rule)).toEqual([
      "id-mark-allocation",
      "wrong_colour_for_paper",
      "flight-composition",
    ]);
  });

  it("treats an unknown or missing scope as poolable (nothing exempted)", () => {
    expect(hardViolationsForScope([v("id-mark-allocation")], null).map((x) => x.rule)).toEqual(["id-mark-allocation"]);
    expect(hardViolationsForScope([v("id-mark-allocation")], undefined).map((x) => x.rule)).toEqual(["id-mark-allocation"]);
  });
});

describe("the corpus sweep uses the shared filter", () => {
  const script = readFileSync(join(import.meta.dirname, "..", "scripts", "audit-questions.mjs"), "utf8");

  it("imports hardViolationsForScope and selects the scope it needs", () => {
    expect(script).toMatch(/import \{ hardViolationsForScope \} from "\.\.\/src\/lib\/question-audit\.ts"/);
    expect(script).toMatch(/hardViolationsForScope\(res\.violations, r\.scope\)/);
    // Without g.scope in the SELECT the filter silently degrades to "nothing is live-tasting".
    expect(script).toMatch(/g\.scope,/);
  });

  it("no longer derives its own severity-only filter", () => {
    expect(script).not.toMatch(/res\.violations\.filter\(\s*\(x\)\s*=>\s*x\.severity === "hard"\s*\)/);
  });
});
