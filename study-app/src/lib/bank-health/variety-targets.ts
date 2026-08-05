// variety-targets.ts — the historical "shape" of the exam by GRAPE VARIETY, per paper.
//
// A static, VERSIONED reference table of the share (% of that paper's wines) each variety carries
// across the historical MW practical corpus, with the last ~5 exam years weighted more heavily (per
// EK-0004). Grounded in the per-variety corpus census (EK-0075, 360 scored wines 2015–2025) and the
// paper-shape signals EK-0034 (P1 always Chardonnay, Riesling ~8/10 years), EK-0036/0037 (P3 wines
// 11–12 fortified/sweet; Sherry/Port/Madeira + Tokaji), and EK-0038 (P2 Bordeaux-variety flight most
// years). It is NOT admin-editable in v1 — a code-owned constant, bumped with EXPECTED_SHARE_VERSION.
//
// Nothing here is candidate-facing. It backs the always-on Grape Balance readout on
// /admin/bank-health and the one-click "Fill the gap" grape-targeted generation.

// Bump when the numbers below are recomputed from a newer corpus slice.
export const EXPECTED_SHARE_VERSION = "2026-08-05";

// A normalized, lowercase variety key (the space the bank tally and the targets both live in).
export type VarietyKey = string;

// Key → user-facing display label. Only keys the balance tracks appear here.
export const VARIETY_LABEL: Record<VarietyKey, string> = {
  chardonnay: "Chardonnay",
  riesling: "Riesling",
  sauvignon_blanc: "Sauvignon Blanc",
  chenin_blanc: "Chenin Blanc",
  pinot_gris: "Pinot Gris",
  gewurztraminer: "Gewürztraminer",
  semillon: "Sémillon",
  albarino: "Albariño",
  gruner_veltliner: "Grüner Veltliner",
  viognier: "Viognier",
  muscat: "Muscat",
  furmint: "Furmint",
  palomino: "Palomino",
  touriga: "Touriga",
  cabernet_sauvignon: "Cabernet Sauvignon",
  merlot: "Merlot",
  pinot_noir: "Pinot Noir",
  syrah: "Syrah",
  grenache: "Grenache",
  sangiovese: "Sangiovese",
  nebbiolo: "Nebbiolo",
  tempranillo: "Tempranillo",
  malbec: "Malbec",
  cabernet_franc: "Cabernet Franc",
  gamay: "Gamay",
  nerello_mascalese: "Nerello Mascalese",
  aglianico: "Aglianico",
  zinfandel: "Zinfandel",
  corvina: "Corvina",
};

export function varietyLabel(key: VarietyKey): string {
  return VARIETY_LABEL[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Expected share (% of that PAPER's wines) per variety. Each paper's named shares intentionally sum to
// a little under 100 — the residual is the long tail of single-appearance varieties (EK-0075) and is
// never a tracked row. Hard-anchor varieties (spec) are always present so a bank that carries none of
// one still reads as a shortfall rather than being invisible.
export const EXPECTED_VARIETY_SHARE: Record<1 | 2 | 3, Record<VarietyKey, number>> = {
  // Paper 1 — whites. Chardonnay + Riesling are the two reliable anchors (EK-0034).
  1: {
    chardonnay: 26,
    riesling: 18,
    sauvignon_blanc: 14,
    chenin_blanc: 9,
    pinot_gris: 7,
    semillon: 6,
    gewurztraminer: 5,
    albarino: 4,
    gruner_veltliner: 3,
    viognier: 3,
  },
  // Paper 2 — reds. A Bordeaux-variety flight most years (EK-0038); the eight anchors carry the paper.
  2: {
    cabernet_sauvignon: 18,
    pinot_noir: 15,
    syrah: 13,
    merlot: 11,
    sangiovese: 8,
    tempranillo: 8,
    nebbiolo: 6,
    grenache: 6,
    malbec: 6,
    cabernet_franc: 4,
  },
  // Paper 3 — special (sparkling / fortified / sweet). Sherry (Palomino), Port (Touriga), Tokaji
  // (Furmint), Sauternes (Sémillon) + sweet Chenin/Muscat, with sparkling Chardonnay/Pinot Noir.
  3: {
    palomino: 14,
    touriga: 12,
    chardonnay: 12,
    muscat: 10,
    furmint: 9,
    semillon: 8,
    pinot_noir: 8,
    chenin_blanc: 7,
    riesling: 6,
  },
};

// The sub-styles / appellations a grape-targeted "Fill the gap" run should spread across so a batch of
// (say) Sangiovese isn't twelve Chianti Classicos. Injected into the generation prompt as a soft
// steer. Absent keys fall back to a generic "spread across sub-styles, appellations and price bands".
export const VARIETY_SUBSTYLE_SPREAD: Record<VarietyKey, string> = {
  sangiovese:
    "Chianti Classico, Chianti Classico Riserva / Gran Selezione, Brunello di Montalcino, Rosso di Montalcino, Vino Nobile di Montepulciano, Morellino di Scansano, IGT Toscana Sangiovese",
  nebbiolo: "Barolo, Barbaresco, Langhe Nebbiolo, Roero, Gattinara / Ghemme (Alto Piemonte), Valtellina",
  cabernet_sauvignon:
    "Left-Bank Bordeaux (Pauillac / St-Julien / Margaux), Napa / Sonoma, Coonawarra, Maipo, Bolgheri",
  merlot: "Right-Bank Bordeaux (Pomerol / St-Émilion), Washington, Tuscan Merlot, cooler-climate New World",
  pinot_noir: "Côte de Nuits / Côte de Beaune, Central Otago, Sonoma Coast / Oregon, Mornington, Baden",
  syrah:
    "Northern Rhône (Hermitage / Côte-Rôtie / Cornas), Barossa / McLaren Vale Shiraz, cool-climate Australia, South Africa, Chile",
  tempranillo: "Rioja (Crianza / Reserva / Gran Reserva), Ribera del Duero, Toro, Douro field-blend context",
  malbec: "Mendoza (Uco Valley vs. Luján de Cuyo), high-altitude Salta, Cahors",
  grenache: "Châteauneuf-du-Pape, Priorat, Gigondas, old-vine Barossa, Spanish Garnacha",
  chardonnay:
    "Chablis, Côte de Beaune (Meursault / Puligny), Champagne Blanc de Blancs, cool New World, oaked California",
  riesling: "Mosel Kabinett → Auslese, Alsace dry, Clare / Eden Valley, Wachau, Grosses Gewächs",
  sauvignon_blanc: "Sancerre / Pouilly-Fumé, Marlborough, white Bordeaux (Sém blend), South African",
  chenin_blanc: "Vouvray (sec → moelleux), Savennières, South African, sweet Coteaux du Layon",
  palomino: "Fino, Manzanilla, Amontillado, Oloroso, Palo Cortado — across the sherry oxidative spectrum",
  touriga: "Vintage / LBV / Tawny / Colheita Port and dry Douro reds",
  furmint: "Dry Furmint, Tokaji Szamorodni, Tokaji Aszú across puttonyos levels",
  muscat: "Sparkling Moscato d'Asti, VDN (Muscat de Beaumes-de-Venise), Rutherglen, dry Alsace Muscat",
  semillon: "Sauternes / Barsac, dry Hunter Valley, white-Bordeaux blend",
};

export function substyleSpreadFor(key: VarietyKey): string {
  return (
    VARIETY_SUBSTYLE_SPREAD[key] ||
    "a range of its classic sub-styles, appellations and price bands"
  );
}
