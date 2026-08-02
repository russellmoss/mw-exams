import { describe, it, expect } from "vitest";
import {
  classifyWineStyle,
  classifyP3Category,
  computeP3Weights,
  orderCategoriesByWeight,
  chooseP3Category,
  P3_TARGET_MIX,
  P3_CATEGORIES,
} from "../src/lib/p3-category.mjs";

const wine = (fullText) => ({ slot: 1, fullText });

describe("classifyWineStyle", () => {
  it("detects the core P3 styles", () => {
    expect(classifyWineStyle("NV Champagne Brut, Reims").style).toBe("sparkling");
    expect(classifyWineStyle("10 Year Old Tawny Port, Douro").style).toBe("fortified");
    expect(classifyWineStyle("Château d'Yquem, Sauternes 2010").style).toBe("sweet");
    expect(classifyWineStyle("Vin Jaune, Château-Chalon (Savagnin)").style).toBe("oxidative");
    expect(classifyWineStyle("Chablis 1er Cru").style).toBe("other");
  });

  it("prefers fortified over sweet/oxidative when both present (PX Sherry)", () => {
    const c = classifyWineStyle("Pedro Ximénez Sherry, sweet oxidative, Jerez");
    expect(c.style).toBe("fortified");
  });

  it("flags rosé independently of the base style", () => {
    expect(classifyWineStyle("Provence Rosé, Côtes de Provence").isRose).toBe(true);
    expect(classifyWineStyle("Rosé Champagne Brut").isRose).toBe(true);
    expect(classifyWineStyle("Rosé Champagne Brut").style).toBe("sparkling");
    expect(classifyWineStyle("Chablis 1er Cru").isRose).toBe(false);
  });
});

describe("classifyP3Category", () => {
  it("is 'rose' ONLY when every wine is a rosé", () => {
    expect(classifyP3Category([wine("Tavel Rosé"), wine("Provence Rosé")])).toBe("rose");
    // a single rosé in a mixed flight does NOT make it 'rose'
    expect(classifyP3Category([wine("Tavel Rosé"), wine("Vintage Port")])).toBe("fortified");
  });

  it("takes the dominant style, tie-broken by priority fortified>sweet>sparkling>oxidative>other", () => {
    expect(
      classifyP3Category([wine("Champagne Brut"), wine("Cava Brut"), wine("Vintage Port")])
    ).toBe("sparkling"); // 2 sparkling vs 1 fortified → dominant sparkling
    // tie 1-1: priority fortified beats sparkling
    expect(classifyP3Category([wine("Champagne Brut"), wine("Oloroso Sherry")])).toBe("fortified");
  });

  it("falls back to 'other' for an empty/degenerate flight", () => {
    expect(classifyP3Category([])).toBe("other");
  });
});

describe("computeP3Weights", () => {
  it("suppresses an over-served category and lifts a starved one", () => {
    // sparkling served 4x in the window (target*8 = 1.92) → heavily over-served → suppressed
    const recent = ["sparkling", "sparkling", "sparkling", "sparkling"];
    const w = computeP3Weights(recent, "balanced");
    expect(w.sparkling).toBeLessThan(P3_TARGET_MIX.sparkling);
    expect(w.fortified).toBeGreaterThan(P3_TARGET_MIX.fortified); // starved → lifted
  });

  it("clamps every weight to >= 0.02", () => {
    const recent = Array(8).fill("sparkling");
    const w = computeP3Weights(recent, "balanced");
    for (const c of P3_CATEGORIES) expect(w[c]).toBeGreaterThanOrEqual(0.02);
  });

  it("focus override pins the chosen category well above the rest", () => {
    const w = computeP3Weights([], "fortified");
    for (const c of P3_CATEGORIES) {
      if (c !== "fortified") expect(w.fortified).toBeGreaterThan(w[c]);
    }
  });
});

describe("orderCategoriesByWeight", () => {
  it("returns all categories, remainder sorted by descending weight", () => {
    const w = computeP3Weights([], "balanced");
    const order = orderCategoriesByWeight(w, () => 0); // deterministic first pick
    expect(new Set(order)).toEqual(new Set(P3_CATEGORIES));
    const restWeights = order.slice(1).map((c) => w[c]);
    for (let i = 1; i < restWeights.length; i++) {
      expect(restWeights[i - 1]).toBeGreaterThanOrEqual(restWeights[i]);
    }
  });
});

describe("chooseP3Category", () => {
  it("only ever returns a category that is actually available", () => {
    // 200 draws with real randomness — the chosen category must always be servable.
    for (let i = 0; i < 200; i++) {
      const chosen = chooseP3Category(["sweet", "rose"], [], "balanced");
      expect(["sweet", "rose"]).toContain(chosen);
    }
  });

  it("falls back down the weight chain when the focused category has nothing banked", () => {
    // Focused on fortified, but the pool holds no fortified question at all.
    const chosen = chooseP3Category(["sparkling", "oxidative"], [], "fortified");
    expect(["sparkling", "oxidative"]).toContain(chosen);
  });

  it("honours the focus when that category IS available", () => {
    // The draw is weighted, not deterministic: a focus pins its category to 0.65 of the target mix,
    // which after deficit-weighting is ~0.73 of the draw. It should dominate but NOT be the only
    // thing served — a focused session still has to feel like Paper 3.
    for (const focus of ["sweet", "rose"]) {
      let picked = 0;
      for (let i = 0; i < 400; i++) {
        if (chooseP3Category(P3_CATEGORIES, [], focus) === focus) picked++;
      }
      expect(picked).toBeGreaterThan(240);
      expect(picked).toBeLessThan(400);
    }
  });

  it("returns null for an empty pool so the caller leaves the pool alone", () => {
    expect(chooseP3Category([], [], "balanced")).toBeNull();
  });

  it("steers away from a style the user has just been served repeatedly", () => {
    // Four sparkling in the last window: over its target share, so with both available the
    // starved category should win the large majority of draws.
    const recent = ["sparkling", "sparkling", "sparkling", "sparkling"];
    let fortified = 0;
    for (let i = 0; i < 400; i++) {
      if (chooseP3Category(["sparkling", "fortified"], recent, "balanced") === "fortified") fortified++;
    }
    expect(fortified).toBeGreaterThan(280); // ≫ 50/50
  });
});
