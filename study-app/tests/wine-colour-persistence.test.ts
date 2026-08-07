// wine-colour-persistence.test.ts — the contract between the colour classifier and the column it
// writes to.
//
// wine_bank.colour has a CHECK constraint (migration 052). classifyWine() validates its LLM output
// against WINE_COLOURS before writing, so a hallucinated value becomes "" (→ NULL) rather than a failed
// INSERT. If someone widens WINE_COLOURS without widening the constraint, every enrichment write for
// that value starts failing at runtime — inside a try/catch that only console.errors, so it would be
// silent. This test is the tripwire.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { WINE_COLOURS } from "../src/lib/wine-enrichment";

const MIGRATION = join(__dirname, "..", "migrations", "052_right_paper_check.sql");

describe("wine_bank.colour", () => {
  const sql = readFileSync(MIGRATION, "utf-8");
  const allowed = [...sql.matchAll(/colour IN \(([^)]*)\)/g)]
    .flatMap((m) => m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")))
    .filter(Boolean);

  it("the migration really does constrain the column", () => {
    expect(allowed.length).toBeGreaterThan(0);
  });

  it("every value classifyWine can emit is accepted by the CHECK constraint", () => {
    for (const c of WINE_COLOURS) expect(allowed).toContain(c);
  });

  it("WINE_COLOURS is the four PURE colours — style lives in style_category", () => {
    // Deliberately exact. The constraint is wider (it also permits the collapsed
    // sparkling/sweet/fortified tags for legacy rows), but the classifier must only ever write a
    // colour. Writing a style here is the axis-collapse bug that failed Riesling Spätlese on Paper 1.
    expect([...WINE_COLOURS].sort()).toEqual(["orange", "red", "rose", "white"]);
  });
});
