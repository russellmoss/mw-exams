// composition-balance.test.ts — R10 OW/NW balance guard.
//
// Origin: Mike Juergens rejected banked question gen_p1_F1_1786071954722, a three-wine Paper 1
// Chardonnay flight (Penfolds Yattarna / Cuvaison Carneros / Montes Alpha) spanning three
// countries but entirely New World, with no Burgundian anchor. Every cross-country same-variety
// Chardonnay flight in the 2011–2026 corpus carries an Old-World reference; a three-wine,
// three-country single-world flight has no precedent. The guard existed but relaxed at attempt 6,
// so a persistent generation run could ship exactly this shape — and it did.
import { describe, it, expect } from "vitest";
import { validateCompositionBalance } from "../src/lib/question-engine";

const wine = (slot: number, fullText: string) => ({ slot, fullText });

describe("validateCompositionBalance — OW/NW balance", () => {
  it("rejects the rejected flight: three New-World Chardonnays, no Old-World anchor", () => {
    const res = validateCompositionBalance("F1", 1, [
      wine(4, "Penfolds Yattarna Chardonnay, Australia"),
      wine(5, "Cuvaison Estate Chardonnay, Carneros, USA"),
      wine(6, "Montes Alpha Chardonnay, Casablanca Valley, Chile"),
    ]);
    expect(res.valid).toBe(false);
    expect(res.violations.join(" ")).toMatch(/entirely New-World/);
  });

  it("passes once a Burgundian (Old-World) anchor joins the flight", () => {
    const res = validateCompositionBalance("F1", 1, [
      wine(4, "Chablis 1er Cru Les Vaillons, France"),
      wine(5, "Cuvaison Estate Chardonnay, Carneros, USA"),
      wine(6, "Montes Alpha Chardonnay, Casablanca Valley, Chile"),
    ]);
    expect(res.valid).toBe(true);
    expect(res.violations).toEqual([]);
  });

  it("rejects an all-Old-World 3+ flight too — the rule is symmetric", () => {
    const res = validateCompositionBalance("F1", 1, [
      wine(4, "Chablis 1er Cru Les Vaillons, France"),
      wine(5, "Meursault Les Narvaux, France"),
      wine(6, "Rheingau Riesling, Germany"),
    ]);
    expect(res.valid).toBe(false);
    expect(res.violations.join(" ")).toMatch(/entirely Old-World/);
  });

  it("exempts same-origin families: F2 (same country) and F7 (same region)", () => {
    const wines = [
      wine(1, "Clos du Bois Chardonnay, California, USA"),
      wine(2, "Kistler Chardonnay, Sonoma, USA"),
      wine(3, "Ramey Chardonnay, Russian River, USA"),
    ];
    expect(validateCompositionBalance("F2", 1, wines).valid).toBe(true);
    expect(validateCompositionBalance("F7", 1, wines).valid).toBe(true);
  });

  it("does not fire on a two-wine pair (only 3+ flights are gated)", () => {
    const res = validateCompositionBalance("F1", 1, [
      wine(1, "Hunter Valley Semillon, Australia"),
      wine(2, "Maule Semillon, Chile"),
    ]);
    expect(res.valid).toBe(true);
  });

  it("stays quiet when fewer than three worlds are detectable (avoids false positives)", () => {
    const res = validateCompositionBalance("F1", 1, [
      wine(4, "Penfolds Yattarna Chardonnay, Australia"),
      wine(5, "An unlabelled cool-climate Chardonnay"),
      wine(6, "A mystery Chardonnay of no stated origin"),
    ]);
    expect(res.valid).toBe(true);
  });
});
