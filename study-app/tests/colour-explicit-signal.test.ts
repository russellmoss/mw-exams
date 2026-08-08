// colour-explicit-signal.test.ts — the label and the grape beat the region's reputation.
//
// THE BUG (2026-08-08, reproduced twice while importing hist_2023_p1_q3): the enrichment classifier
// read "Benanti, Etna Bianco Superiore Pietra Marina, 2020. Etna, Sicily, Italy. (12.5%)" as a RED
// wine. The label says Bianco and Carricante is a white grape; Etna is famous for Nerello Mascalese,
// and the model followed the region. The wrong colour persisted onto the question's wine slot, where
// it outranks inference, and R-COLOUR — unconditional and blocking at generation, at serve time and in
// the post-save audit — quarantined a perfectly legitimate Paper 1 question:
//
//   wrong_colour_for_paper: Paper 1 must serve STILL WHITE wine only, but wine 4 (Carricante, Etna,
//   Sicily, Italy) reads as still red (detected colour "red"). Rule R-COLOUR is unconditional.
//
// The rule is right to be unconditional; the INPUT was wrong. Since the block is total, any region
// whose fame runs the other way loses every wine of that colour from its paper — Etna Bianco, Etna
// Rosato, white Rioja, Blanc de Noirs, and the mirror case of reds from white-famous regions
// (Sancerre Rouge, Alsace Pinot Noir).
import { describe, it, expect } from "vitest";
import {
  explicitColourSignal,
  resolveWineScope,
  validatePaperColour,
  type AuditWine,
} from "../src/lib/question-validator";
import { reconcileColour } from "../src/lib/wine-enrichment";
// Registers the appellation → variety/colour resolvers, exactly as the server does at import.
import "../src/lib/appellation-resolver";

const wine = (over: Partial<AuditWine>): AuditWine => ({ slot: 1, varieties: [], region: "", ...over });

const ETNA_BIANCO = "Benanti, Etna Bianco Superiore Pietra Marina, 2020. Etna, Sicily, Italy. (12.5%)";
const ETNA_BIANCO_CARRICANTE =
  "Benanti, Carricante 'Pietra Marina' Etna Bianco Superiore, 2020. Etna, Sicily, Italy. (12.5%)";

// ---------------------------------------------------------------------------------------------------
// The classifier's own output, corrected before it is ever persisted.
// ---------------------------------------------------------------------------------------------------
describe("reconcileColour — the classifier's colour is the fallback, not the answer", () => {
  it.each([
    // The two labels that actually failed, with the colour the classifier actually returned.
    ["Etna Bianco (label only)", "red", ETNA_BIANCO, [], "white"],
    ["Etna Bianco (grape named)", "red", ETNA_BIANCO_CARRICANTE, ["Carricante"], "white"],
    // White-famous regions, red wines — the mirror failure.
    ["Sancerre Rouge", "white", "Domaine Vacheron, Sancerre Rouge, 2021. Loire, France.", ["Pinot Noir"], "red"],
    ["Alsace Pinot Noir", "white", "Domaine Weinbach, Pinot Noir 'S', 2021. Alsace, France.", ["Pinot Noir"], "red"],
    // Red-famous regions, white/rosé wines.
    ["white Rioja", "red", "CVNE, Monopole Rioja Blanco, 2022. Rioja, Spain.", ["Viura"], "white"],
    ["Etna Rosato", "red", "Graci, Etna Rosato, 2022. Etna, Sicily, Italy.", ["Nerello Mascalese"], "rose"],
    // A white wine from black grapes: the label is the ONLY thing that says so.
    ["Blanc de Noirs Champagne", "red", "Egly-Ouriet, Blanc de Noirs Grand Cru, NV. Champagne, France.", ["Pinot Noir"], "white"],
    // No colour word: the grape list still beats a regional prior.
    ["Chablis", "red", "Domaine A, Chablis, 2021. Burgundy, France.", ["Chardonnay"], "white"],
  ])("%s: %s → %s", (_label, modelColour, fullText, varieties, expected) => {
    expect(reconcileColour(modelColour, fullText, varieties as string[])).toBe(expected);
  });

  // The mirror risk. Overriding the model must not introduce a new class of wrong colour.
  it.each([
    // French `blanc` is not a colour qualifier — it lives inside proprietary names of famous reds.
    ["Château Cheval Blanc", "red", "Château Cheval Blanc, 2015. Saint-Émilion, Bordeaux, France.", ["Cabernet Franc", "Merlot"], "red"],
    // "Red" is a producer name here; the grape list is unanimously white and wins.
    ["Red Car Chardonnay", "white", "Red Car, Chardonnay, 2021. Sonoma Coast, California, USA.", ["Chardonnay"], "white"],
    // Blush wines are rosé despite the word "White" — the rosé cue is read first.
    ["White Zinfandel", "rose", "Beringer, White Zinfandel, 2022. California, USA.", ["Zinfandel"], "rose"],
    // Rosé and orange are MADE, not implied by the grape, so a variety list must never overturn them.
    ["Provence rosé", "rose", "Domaine Tempier, Bandol Rosé, 2022. Provence, France.", ["Mourvèdre", "Grenache"], "rose"],
    ["ramato (no cue word in the label)", "orange", "Radikon, Oslavje, 2016. Friuli, Italy.", ["Chardonnay", "Sauvignon Blanc"], "orange"],
  ])("%s stays %s", (_label, modelColour, fullText, varieties, expected) => {
    expect(reconcileColour(modelColour, fullText, varieties as string[])).toBe(expected);
  });

  it("keeps the model's colour when nothing explicit contradicts it", () => {
    // No colour word, no recognised grape — the model's regional knowledge is all there is, and that
    // is a legitimate use of it.
    expect(reconcileColour("red", "Producer, Cuvée Speciale, 2019. Somewhere, Nowhere.", [])).toBe("red");
  });

  it("fills a colour the model declined to give, when the label states one", () => {
    expect(reconcileColour("", ETNA_BIANCO, [])).toBe("white");
  });

  it("leaves the colour empty when the model declined and nothing is explicit", () => {
    expect(reconcileColour("", "Producer, Cuvée Speciale, 2019.", [])).toBe("");
  });
});

describe("explicitColourSignal reports WHY it is sure", () => {
  it("distinguishes a label word from a grape list", () => {
    expect(explicitColourSignal(ETNA_BIANCO, [])).toEqual({ colour: "white", basis: "label" });
    expect(explicitColourSignal("Domaine A, Chablis, 2021. Burgundy, France.", ["Chardonnay"]))
      .toEqual({ colour: "white", basis: "variety" });
  });

  it("returns null on a label that states nothing and names no known grape", () => {
    expect(explicitColourSignal("Producer, Cuvée Speciale, 2019.", [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
// The already-persisted damage. A stored colour still outranks inference — but not the words on the
// bottle, which is what turned one bad Haiku call into a quarantined question.
// ---------------------------------------------------------------------------------------------------
describe("a stated label colour overrides a wrong PERSISTED colour", () => {
  it("Etna Bianco stored as red resolves white and passes Paper 1 (the reported quarantine)", () => {
    const w = wine({ slot: 4, varieties: ["Carricante"], region: "Etna", fullText: ETNA_BIANCO, colour: "red" });
    expect(resolveWineScope(w).colour).toBe("white");
    expect(validatePaperColour(1, [w])).toHaveLength(0);
  });

  it.each([
    ["white Rioja", { varieties: ["Viura"], region: "Rioja", fullText: "CVNE, Monopole Rioja Blanco, 2022. Rioja, Spain.", colour: "red" as const }, "white"],
    ["Etna Rosato", { varieties: ["Nerello Mascalese"], region: "Etna", fullText: "Graci, Etna Rosato, 2022. Etna, Sicily, Italy.", colour: "red" as const }, "rose"],
    ["Sancerre Rouge", { varieties: ["Pinot Noir"], region: "Sancerre", fullText: "Domaine Vacheron, Sancerre Rouge, 2021. Loire, France.", colour: "white" as const }, "red"],
  ])("%s stored wrong resolves %s", (_l, w, expected) => {
    expect(resolveWineScope(wine(w as Partial<AuditWine>)).colour).toBe(expected);
  });

  it("a wrongly-stored white on a red wine is still blocked on Paper 1", () => {
    const w = wine({ slot: 1, varieties: ["Pinot Noir"], region: "Sancerre", fullText: "Domaine Vacheron, Sancerre Rouge, 2021. Loire, France.", colour: "white" });
    expect(validatePaperColour(1, [w]).some((x) => x.rule === "wrong_colour_for_paper")).toBe(true);
  });

  it("does NOT override on a variety disagreement alone — the stored value keeps that argument", () => {
    // The generation-time value saw the enrichment, the appellation and the answer key; a bare grape
    // list did not. Only a colour word on the label is better informed than it.
    const w = wine({ varieties: ["Syrah"], region: "Hermitage", fullText: "Producer, Hermitage Blanc equivalent", colour: "white" });
    expect(resolveWineScope(w).colour).toBe("white");
  });
});

// ---------------------------------------------------------------------------------------------------
// Inference (no stored colour) has to reach the same answers, since that is the path every unbackfilled
// bank row and every serve-time caller takes.
// ---------------------------------------------------------------------------------------------------
describe("inference with no stored colour", () => {
  it.each([
    ["Etna Bianco", { varieties: ["Carricante"], fullText: ETNA_BIANCO }, "white"],
    ["Etna Bianco with no grape resolved", { fullText: ETNA_BIANCO }, "white"],
    ["Blanc de Noirs", { varieties: ["Pinot Noir"], fullText: "Egly-Ouriet, Blanc de Noirs Grand Cru, NV. Champagne, France." }, "white"],
    ["Blanc de Blancs", { varieties: ["Chardonnay"], fullText: "Salon, Blanc de Blancs Le Mesnil, 2013. Champagne, France." }, "white"],
    ["Cheval Blanc (the mirror risk)", { varieties: ["Cabernet Franc", "Merlot"], fullText: "Château Cheval Blanc, 2015. Saint-Émilion, Bordeaux, France." }, "red"],
  ])("%s resolves %s", (_l, w, expected) => {
    expect(resolveWineScope(wine(w as Partial<AuditWine>)).colour).toBe(expected);
  });

  // Measured over the live bank: 7 of the 17 questions quarantined on `wrong_colour_for_paper` were
  // white Paper 1 wines whose only colour evidence was the French word Blanc, which the resolver
  // refused to read because of Château Cheval Blanc. Five of them compounded it by keying a white
  // grape whose NAME contains a red one ("Grenache Blanc" matches the red `grenache` token).
  it.each([
    ["Rayas CdP Blanc (key names the appellation's RED grapes)", { varieties: ["Grenache", "Syrah", "Mourvèdre"], fullText: "Château Rayas, Châteauneuf-du-Pape Blanc, 2020. Southern Rhône, France. (13.0%)" }],
    ["Smith Haut Lafitte Blanc (same)", { varieties: ["Cabernet Sauvignon", "Merlot"], fullText: "Château Smith Haut Lafitte Blanc, 2022. Pessac-Léognan, France. (13.5%)" }],
    ["Beaucastel Blanc (same)", { varieties: ["Grenache", "Syrah", "Mourvedre", "Cinsault"], fullText: "Château de Beaucastel Blanc, 2023. Châteauneuf-du-Pape, Rhône Valley, France. (13.5%)" }],
    ["Lirac Blanc", { varieties: ["Grenache Blanc", "Clairette", "Viognier"], fullText: "Domaine de la Mordorée, Lirac Blanc, 2023. Southern Rhône, France. (14.0% ABV)" }],
    ["Gramenon Côtes du Rhône Blanc", { varieties: ["Grenache Blanc", "Clairette"], fullText: "Domaine Gramenon La Mémé en Blanc, 2022. Côtes du Rhône Blanc, Rhône Valley, France. (14%)" }],
    ["Gauby Côtes Catalanes Blanc", { varieties: ["Grenache Blanc", "Macabeu"], fullText: "Domaine Gauby, Côtes Catalanes Blanc Vieilles Vignes, 2022. Roussillon, France. (14.0%)" }],
    ["Esprit de Tablas Blanc", { varieties: ["Grenache Blanc", "Roussanne", "Picpoul Blanc"], fullText: "Tablas Creek Vineyard, Esprit de Tablas Blanc, 2022. Paso Robles, California, USA. (14.0%)" }],
    ["Trousseau Gris (keyed as Trousseau, a red)", { varieties: ["Trousseau"], fullText: "Arnot-Roberts, Trousseau Gris, 2023. Russian River Valley, California, USA. (12.5%)" }],
  ])("%s is white and legal on Paper 1", (_l, w) => {
    const wn = wine({ slot: 1, ...(w as Partial<AuditWine>) });
    expect(resolveWineScope(wn).colour).toBe("white");
    expect(validatePaperColour(1, [wn])).toHaveLength(0);
  });

  // The grape's own name states its colour, and it has to outrank a substring match on the indicator
  // lists in BOTH directions.
  it.each([
    ["Grenache Blanc (contains the red `grenache`)", ["Grenache Blanc", "Clairette"], "white"],
    ["Picpoul Blanc", ["Picpoul Blanc"], "white"],
    ["Malvasia Nera (contains the white `malvasia`)", ["Malvasia Nera"], "red"],
    ["Grenache Noir", ["Grenache Noir"], "red"],
    ["Pinot Gris", ["Pinot Gris"], "white"],
  ])("%s resolves %s from the variety list alone", (_l, varieties, expected) => {
    expect(explicitColourSignal("", varieties)).toEqual({ colour: expected, basis: "variety" });
  });

  // The French-blanc carve-outs. Believing `blanc` is a deliberate trade: it fixes seven real wines at
  // the cost of a proprietary-name risk, held down by a denylist and by refusing "blanc de X".
  it.each([
    ["Château Cheval Blanc", { varieties: ["Cabernet Franc", "Merlot"], fullText: "Château Cheval Blanc, 2015. Saint-Émilion, Bordeaux, France. (14%)" }, "red"],
    ["Clos Blanc de Vougeot as a red fixture", { varieties: ["Pinot Noir"], fullText: "Domaine X, Clos Blanc de Vougeot, 2019. Burgundy, France." }, "red"],
    ["Domaine Paul Blanck Pinot Noir", { varieties: ["Pinot Noir"], fullText: "Domaine Paul Blanck, Pinot Noir, 2021. Alsace, France." }, "red"],
    // `gris` only means white after a GRAPE name. "Vin" is not one, so the rosé classifier keeps it.
    ["Vin Gris", { varieties: ["Pinot Noir"], fullText: "Producer, Vin Gris, 2022. California, USA." }, "rose"],
  ])("%s still resolves %s", (_l, w, expected) => {
    expect(resolveWineScope(wine(w as Partial<AuditWine>)).colour).toBe(expected);
  });

  it("a Blanc de Noirs is white AND sparkling — Paper 1 still blocks it on the style axis", () => {
    const w = wine({ slot: 1, varieties: ["Pinot Noir"], fullText: "Egly-Ouriet, Blanc de Noirs Grand Cru Champagne, NV. Champagne, France." });
    const got = resolveWineScope(w);
    expect(got.colour).toBe("white");
    expect(got.style).toBe("sparkling");
    expect(validatePaperColour(1, [w]).some((x) => x.rule === "wrong_colour_for_paper")).toBe(true);
  });
});
