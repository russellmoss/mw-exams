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

// ── Labelled regression corpus ───────────────────────────────────────────────────────────────
// Every entry is a REAL label from data/wines.json, data/mock_wine_bank.json or the wine_bank
// table, with the style it must resolve to. This is the CI gate for scripts/audit-p3-category.mjs:
// when that script surfaces a disagreement and we agree with it, the wine lands here so the fix
// can never silently regress. Add rows freely — the point is breadth of real labels, not brevity.
const CORPUS = [
  // fortified — including the ones that name neither style nor giveaway region (ABV backstop)
  ["10 Year Old Tawny Port, Douro", "fortified"],
  ["Taylor’s Vintage, 1985. Douro, Portugal. (20.5%)", "fortified"],
  ["Taylor’s Vintage, 2009. Douro, Portugal. (20.5%)", "fortified"],
  ["JMK Shiraz VP, 2012. Kalleske, Australia. (18.5%)", "fortified"],
  ["Muscat, Campbells, NV. Rutherglen, Australia. (17%)", "fortified"],
  ["Pedro Ximénez Sherry, sweet oxidative, Jerez", "fortified"],
  ["Bodegas Lustau, Don Nuño Oloroso Solera Reserva, Jerez, Spain", "fortified"],
  ["González Byass, Tío Pepe Fino, Jerez, Spain", "fortified"],
  // ...but a merely-ripe dry red is not fortified: the 16–16.5% band must stay out.
  ["Amarone della Valpolicella, Torre del Falasco, 2015. Italy. (16%)", "other"],
  ["The Boxer, Mollydooker. 2010. South Australia, Australia (16%)", "other"],

  // sweet
  ["Château d'Yquem, Sauternes 2010", "sweet"],
  ["Disznókő Tokaji Aszú 5 Puttonyos 2017. Tokaj, Hungary. (11.0%)", "sweet"],
  ["Chateau d'Arlay Vin de Paille 2018. Jura, France. (14.5%)", "sweet"],
  ["Klein Constantia Vin de Constance 2019. Constantia, South Africa. (14.0%)", "sweet"],
  ["Fattoria dei Barbi, Moscadello di Montalcino Vendemmia Tardiva, 2020. Tuscany, Italy.", "sweet"],
  ["Isole e Olena Vin Santo del Chianti Classico 2015. Tuscany, Italy. (15.5%)", "sweet"],
  // Tokaj makes dry Furmint too — the region alone must NOT imply sweetness.
  ["Furmint Tokaji, Dubogó, 2019. Úrágya, Tokaj, Hungary. (13.5%)", "other"],
  ["Furmint Tokaj, Château Pajzos, 2022. Tokaj, Hungary. (13.5%)", "other"],
  ["Château Rieussec R de Rieussec, 2021. Bordeaux Blanc Sec, France. (12.5%)", "other"],

  // sparkling
  ["NV Champagne Brut, Reims", "sparkling"],
  ["Riesling, Sektmanufaktur Graf. 2010. Pfalz, Germany (12.5%)", "sparkling"],
  ["Bisol, Cartizze Valdobbiadene Superiore di Cartizze DOCG NV. Veneto, Italy. (11.5%)", "sparkling"],
  ["Ferrari, Perlé Blanc de Blancs Brut, 2018. Trentodoc, Trentino, Italy. (12.5%)", "sparkling"],

  // oxidative — stated
  ["Vin Jaune, Château-Chalon (Savagnin)", "oxidative"],
  ["Vin Jaune, Domaine Daniel Dugois, 2013. Arbois, France. (14.5%)", "oxidative"],
  ["Arbois, Savagnin, Domaine de la Pinte, 2006. Jura, France. (13.5%)", "oxidative"],
  // oxidative — implied by house, cuvée or region
  ["R. López de Heredia, Viña Tondonia Blanco Reserva, 2012. Rioja, Spain. (12.5%)", "oxidative"],
  ["Viña Gravonia, Lopez de Heredia Viña Tondonia, 2007. Rioja, Spain. (12.5%)", "oxidative"],
  ["Marqués de Murrieta, Castillo Ygay Blanco Gran Reserva Especial, 1986. Rioja, Spain.", "oxidative"],
  ["Domaine Jean Macle, Côtes du Jura Blanc, 2018. Jura, France. (13.5%)", "oxidative"],
  ["Cuvée Speciale, Domaine de Montbourgeau, 2012. L’Etoile, Jura, France. (13%)", "oxidative"],
  ["Pheasant's Tears, Rkatsiteli. 2011. Kakheti, Georgia (12.5%)", "oxidative"],
  ["‘Amber’, Cullen, 2014. Margaret River, WA, Australia. (15%)", "oxidative"],
  // NOT oxidative — the colour/style vetoes that keep the house and grape cues honest
  ["Domaine Rolet, Arbois Savagnin Ouillé, 2020. Jura, France. (13.5%)", "other"],
  ["Domaine Berthet-Bondet, Trousseau Tradition, Jura, France", "other"],
  ["Castillo Ygay Gran Reserva, Marques de Murrieta, 2010. Rioja, Spain. (14%)", "other"],
  ["Chardonnay En Flandre, Domaine de la Touraize, 2021. Arbois, Jura, France. (12.5%)", "other"],

  // dry stills genuinely do appear in Paper 3 — they must stay in the residual bucket
  ["Puligny Montrachet Vieilles Vignes, Vincent Girardin, 2013. Burgundy, France. (13%)", "other"],
  ["Bandol, Château de Pibarnon, 2013. Provence, France. (14%)", "other"],
];

describe("classifyWineStyle against the labelled corpus", () => {
  it.each(CORPUS)("%s -> %s", (text, expected) => {
    expect(classifyWineStyle(text).style).toBe(expected);
  });

  it("flags the blush wines that never say 'rosé'", () => {
    expect(classifyWineStyle("White Zinfandel, Sutter Home, NV. California, USA. (9.5%)").isRose).toBe(true);
  });
});

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

  it("catches oxidatively-aged whites that never say 'oxidative'", () => {
    // The two production flights that used to fall through to 'other'.
    expect(
      classifyWineStyle("R. López de Heredia, Viña Tondonia Blanco Reserva, 2012. Rioja, Spain. (12.5%)").style
    ).toBe("oxidative");
    expect(
      classifyWineStyle("López de Heredia, Viña Tondonia Reserva Blanco, 2014. Rioja, Spain. (12.5%)").style
    ).toBe("oxidative");
    expect(
      classifyWineStyle(
        "Marqués de Murrieta, Castillo Ygay Blanco Gran Reserva Especial, 1986. Rioja, Spain. (13.0%)"
      ).style
    ).toBe("oxidative");
    // White-only cuvée: the corpus label carries no "Blanco" at all.
    expect(
      classifyWineStyle("Viña Gravonia, Lopez de Heredia Viña Tondonia, 2007. Rioja, Spain. (12.5%)").style
    ).toBe("oxidative");
    // Generic traditional white Rioja, no house name.
    expect(classifyWineStyle("Rioja Blanco Reserva, 2015. Rioja, Spain.").style).toBe("oxidative");
  });

  it("does NOT mistake the reds from those same houses for oxidative whites", () => {
    // Castillo Ygay Gran Reserva without 'Blanco' is the red — the cuvée name is shared.
    expect(
      classifyWineStyle("Castillo Ygay Gran Reserva, Marques de Murrieta, 2010. Rioja, Spain. (14%)").style
    ).toBe("other");
    expect(classifyWineStyle("Viña Tondonia Tinto Reserva, Rioja, Spain.").style).toBe("other");
    // A modern unoaked white Rioja carries no barrel-age designation.
    expect(classifyWineStyle("Viura Blanco, 2023. Rioja, Spain.").style).toBe("other");
  });

  it("treats 'ouillé' (topped up) as explicitly NOT oxidative", () => {
    // Savagnin in Arbois, but deliberately kept topped up: the opposite of a sous voile wine.
    expect(classifyWineStyle("Domaine Rolet, Arbois Savagnin Ouillé, 2020. Jura, France. (13.5%)").style).toBe(
      "other"
    );
    expect(
      classifyWineStyle(
        "Domaine André et Mireille Tissot, Arbois Savagnin Ouillé, 2021. Jura, France. (13.0%)"
      ).style
    ).toBe("other");
    // Unaccented spelling, as stored on one production row.
    expect(
      classifyWineStyle("Domaine de la Pinte Le Grand Buisson Savagnin Ouille 2020. Jura, France. (13.5% ABV)")
        .style
    ).toBe("other");
    expect(classifyWineStyle("Jura Savagnin, topped up, no flor").style).toBe("other");
    // ...while the flor-aged Jura wines stay oxidative.
    expect(classifyWineStyle("Arbois, Savagnin, Domaine de la Pinte, 2006. Jura, France.").style).toBe(
      "oxidative"
    );
    expect(classifyWineStyle("Vin Jaune, Domaine Daniel Dugois, 2013. Arbois, France.").style).toBe(
      "oxidative"
    );
    expect(classifyWineStyle("Domaine Berthet-Bondet, Côtes du Jura Tradition sous voile").style).toBe(
      "oxidative"
    );
  });

  it("does not read a bare Jura appellation as a style", () => {
    // Arbois covers ouillé Chardonnay and Trousseau reds too — the appellation alone proves nothing.
    expect(
      classifyWineStyle("Chardonnay En Flandre, Domaine de la Touraize, 2021. Arbois, Jura, France. (12.5%)")
        .style
    ).toBe("other");
    expect(classifyWineStyle("Arbois Trousseau, Jura, France.").style).toBe("other");
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

  it("tags the traditional-white flights as 'oxidative' (the two that used to be 'other')", () => {
    expect(
      classifyP3Category([
        wine("R. López de Heredia, Viña Tondonia Blanco Reserva, 2012. Rioja, Spain. (12.5%)"),
        wine("Marqués de Murrieta, Castillo Ygay Blanco Gran Reserva Especial, 1986. Rioja, Spain. (13.0%)"),
      ])
    ).toBe("oxidative");
    // One recognised oxidative white + one unrecognised Jura white: the tie goes to oxidative,
    // since 'other' is the residual bucket and loses every tie-break.
    expect(
      classifyP3Category([
        wine("López de Heredia, Viña Tondonia Reserva Blanco, 2014. Rioja, Spain. (12.5%)"),
        wine("Domaine Jean Macle, Côtes du Jura Blanc, 2018. Jura, France. (13.5%)"),
      ])
    ).toBe("oxidative");
  });

  it("leaves the Sherry-dominated ouillé flights on 'fortified'", () => {
    // The ouillé wine no longer counts as oxidative, but these flights were never oxidative anyway.
    expect(
      classifyP3Category([
        wine("Equipo Navazos, La Bota de Florpower Manzanilla Pasada No. 70, NV. Sanlúcar de Barrameda, Jerez, Spain."),
        wine("Domaine Rolet, Arbois Savagnin Ouillé, 2020. Jura, France. (13.5%)"),
        wine("Seppeltsfield, Fino, NV. Barossa Valley, South Australia, Australia. (15.5%)"),
      ])
    ).toBe("fortified");
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
