// question-rules.mjs — THE single source of truth for the stem<->wine "contradiction" rules.
//
// These rules used to live twice: text-based copies in question-engine.ts (run at generation on raw
// fullText) and key-based copies in question-validator.ts (run by the audit + feedback path on the
// resolved answer key). That duplication drifted. They now live HERE, once, operating on a small
// normalized shape (a resolved wine: { slot, varieties[], region?, country?, is_blend?, style? }).
// Each stage adapts its data and calls applyQuestionRules — the engine via a text adapter (detect
// variety/country from fullText), the validator by passing its already-resolved AuditWine.
//
// Kept as plain .mjs (not .ts) so the CI-invoked node scripts (audit-questions.mjs via
// question-validator.ts) can import it directly; the TS app imports it too (allowJs + bundler), the
// same pattern as stem-answer-key.mjs. Stage-specific checks intentionally stay with their stage:
// the engine keeps generation-only checks (banker, flight-size, novelty, generation-consistency,
// white/red grape scope, per-sub-question marks) + its retry/relax loop; the validator keeps the
// severity->ok mapping.

const NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

// Canonicalise so synonyms don't read as different grapes (the "same variety" check).
const VARIETY_SYNONYMS = {
  shiraz: "syrah", spatburgunder: "pinot noir", "pinot nero": "pinot noir",
  grauburgunder: "pinot gris", weissburgunder: "pinot blanc", alvarinho: "albarino",
  garnacha: "grenache", carinena: "carignan", mazuelo: "carignan", mataro: "mourvedre",
  "tinta de toro": "tempranillo", "tinto fino": "tempranillo", spanna: "nebbiolo", primitivo: "zinfandel",
  "tocai friulano": "friulano",
};

export const norm = (s) =>
  (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export const canonVariety = (s) => {
  const n = norm(s);
  return VARIETY_SYNONYMS[n] || n;
};

// Normalise a stem (lower-case, accents stripped, punctuation flattened so "same, single grape
// variety" reads as "same single grape variety" — a real comma-bug seen in the corpus).
export const normStem = (questionText) =>
  norm(questionText).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Stem Sniper scoring model for a flight. In a "same (single) grape variety" flight the variety is
// ONE shared answer but the origins differ per wine, and the stem gives no clue which origin maps to
// which wine number — so the candidate can only identify the likely *pool* of origins. The MW exam
// rewards that pool/funnel reasoning, so such flights score as a SET (variety + origin pool); every
// other flight keeps per-wine scoring.
export function stemSniperScoringModel(questionText, wineCount = 0) {
  const stem = normStem(questionText);
  const sameVariety = /\bsame (?:single )?grape variety\b|\bsame variety\b/.test(stem);
  return sameVariety && wineCount >= 2 ? "set" : "per-wine";
}

// True when the stem describes the flight in subsets/pairs ("Wines 1 and 2 ... the other two ...").
// Per-subset claims can't be validated flight-wide without false positives, so flight-wide rules
// (country/variety diversity) are skipped for these.
function isSubsetSplit(stem) {
  return /the other (?:two|three|one|wine)\b|\btwo wines\b|\bwines?\s+1\s+and\s+2\b|\bwines?\s+3\s+and\s+4\b|\bwine\s+[1-9]\s+(?:is|are|comes)\b/.test(
    stem
  );
}

/**
 * Run the shared contradiction rules against a (normalized) question.
 * @param {{ paper: number, questionText: string, totalMarks?: number,
 *           wines: Array<{ slot: number, varieties: string[], region?: string, country?: string,
 *                          is_blend?: boolean, style?: string }> }} q
 * @returns {Array<{ rule: string, severity: "hard"|"soft", detail: string }>}
 * hard = stem contradicts its own wines/key (unanswerable as framed); soft = worth flagging.
 */
export function applyQuestionRules(q, opts = {}) {
  const v = [];
  const stem = normStem(q.questionText);
  const wines = q.wines || [];
  const primaries = wines.map((w) => canonVariety(w.varieties?.[0]));
  const distinctPrimary = new Set(primaries.filter(Boolean));
  const distinctCountry = new Set(wines.map((w) => norm(w.country)).filter(Boolean));
  const predominantly = /\bpredominantly\b/.test(stem); // explicitly permits blends / dominant grape
  const subsetSplit = isSubsetSplit(stem);
  // Detection-gap guard for the TEXT stage only (engine passes countryRequireAllKnown). When a wine's
  // country couldn't be detected from its label, flagging "N countries" would be a false positive, so
  // the engine skips the check unless every wine resolved a country. For the KEY stage (validator)
  // countries are always resolved, so this defaults off and the validator is byte-identical.
  const allCountriesKnown = wines.length > 0 && wines.every((w) => norm(w.country));
  const countryGuardOk = !opts.countryRequireAllKnown || allCountriesKnown;

  if (!subsetSplit) {
    // R1 — country diversity. "N different countries" needs N distinct; bare "different countries"
    // needs one per wine.
    const cc = stem.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b\s+(?:different\s+)?countries\b/);
    const bareDiff = /\bdifferent\s+countries\b/.test(stem);
    if (cc || bareDiff) {
      const required = cc ? (/^\d+$/.test(cc[1]) ? Number(cc[1]) : NUM[cc[1]]) : wines.length;
      if (required && countryGuardOk && distinctCountry.size < required)
        v.push({
          rule: "country-diversity",
          severity: "hard",
          detail: `stem implies ${required} different countries; key has only ${distinctCountry.size} distinct (${[...distinctCountry].join(", ") || "none"})`,
        });
    }

    // R2 — "same (single) grape variety" => one dominant variety across the flight.
    if (/\bsame (?:single )?grape variety\b|\bsame variety\b/.test(stem) && distinctPrimary.size > 1)
      v.push({
        rule: "same-variety",
        severity: "hard",
        detail: `stem says same variety; key has ${distinctPrimary.size}: ${[...distinctPrimary].join(", ")}`,
      });

    // R3 — "different grape varieties" => every dominant variety distinct.
    if (/different (?:single )?grape variet(?:y|ies)/.test(stem)) {
      const present = primaries.filter(Boolean);
      if (present.length !== distinctPrimary.size)
        v.push({
          rule: "distinct-variety",
          severity: "hard",
          detail: `stem says different varieties; duplicates present (${primaries.join(", ")})`,
        });
    }

    // R4 — "same country" => one country.
    if (/\bsame country\b/.test(stem) && distinctCountry.size > 1)
      v.push({
        rule: "same-country",
        severity: "hard",
        detail: `stem says same country; key has ${[...distinctCountry].join(", ")}`,
      });
  }

  // R5 — "single grape variety" + a blend wine. SOFT: a dominant-grape blend / co-ferment is often
  // legitimate, and "predominantly" explicitly permits it. Truly wrong wines are caught (hard) by R2.
  if (!predominantly && /\bsingle grape variety\b/.test(stem) && wines.some((w) => w.is_blend))
    v.push({
      rule: "single-variety-blend",
      severity: "soft",
      detail: `stem says single grape variety; a wine is a blend (${wines.filter((w) => w.is_blend).map((w) => w.varieties.join("/")).join("; ")})`,
    });

  // R6 — marks: 25 per wine (universal in the MW corpus). HARD.
  if (q.totalMarks && wines.length && q.totalMarks !== wines.length * 25)
    v.push({ rule: "marks", severity: "hard", detail: `total_marks ${q.totalMarks} != ${wines.length}x25` });

  // R7 — Paper 3 oxidative still-white scope (hard). P3 admits a STILL white only when flor/sous
  // voile-driven (Jura Vin Jaune / Savagnin) or paired with a fortified/biologically-aged wine.
  // Conventionally cask-oxidized still whites (oxidative white Rioja, oxidative Hunter Semillon) are
  // corpus-attested Paper 1 wines and are mis-papered in P3.
  if (q.paper === 3 && wines.length > 0) {
    const blob = (w) => norm(`${w.region || ""} ${w.style || ""} ${(w.varieties || []).join(" ")}`);
    const FLOR_SOUS_VOILE = /vin\s*jaune|sous\s*voile|chateau[\s-]*chalon|l['`’ ]?\s*etoile|\betoile\b|savagnin|\bjura\b|\bflor\b/;
    const FORTIFIED_OR_FLOR = /fortified|sherry|jerez|\bfino\b|manzanilla|amontillado|oloroso|palo\s*cortado|\bport\b|madeira|marsala|banyuls|rivesaltes|maury|rutherglen|vin\s*doux|\bvdn\b|vin\s*jaune|sous\s*voile|chateau[\s-]*chalon|\bflor\b/;
    const WHITE_HINT = /viura|macabeo|malvasia|garnacha\s*blanca|grenache\s*blanc|albari|verdejo|hondarrabi|semillon|hunter|\bwhite\b|\bblanc/;
    const isConvOxWhite = (w) => {
      const b = blob(w);
      if (FLOR_SOUS_VOILE.test(b) || FORTIFIED_OR_FLOR.test(b)) return false; // flor / fortified => legitimately P3
      const namedWhiteRioja = /\brioja\b/.test(b) && WHITE_HINT.test(b);
      const namedHunterSem = /hunter/.test(b) && /semillon/.test(b);
      const oxidativeWhite = /oxidativ/.test(b) && WHITE_HINT.test(b);
      return namedWhiteRioja || namedHunterSem || oxidativeWhite;
    };
    const hasAnchor = wines.some((w) => FORTIFIED_OR_FLOR.test(blob(w)));
    const offenders = wines.filter(isConvOxWhite);
    if (offenders.length > 0 && !hasAnchor)
      v.push({
        rule: "p3-oxidative-white",
        severity: "hard",
        detail: `Paper 3 conventionally-oxidative still white(s) with no fortified/flor anchor: ${offenders.map((w) => w.region || (w.varieties || []).join("/") || `wine ${w.slot}`).join("; ")}. Such wines (oxidative white Rioja, oxidative Hunter Semillon) are Paper 1 styles; P3 admits a still white only when flor/sous voile-driven or paired with a fortified/biologically-aged wine.`,
      });
  }

  return v;
}

// ---------------------------------------------------------------------------------------------------
// TEXT ADAPTER — turn raw generated wines ({slot, fullText}) into the normalized RuleWine shape the
// rules consume, by detecting variety/country/blend from the label. This is the generation-stage
// counterpart to the validator passing its already-resolved AuditWine. Ported verbatim from the
// engine so the engine can delegate to applyQuestionRules and the whole text path is testable here
// (no @/ aliases). The engine keeps its TEXT-ONLY extras (undetectable-variety, name-cross-check,
// blend-hard, P3 fullText scope, banker, flight-size, novelty, generation-consistency).
// ---------------------------------------------------------------------------------------------------

const WHITE_GRAPE_INDICATORS = /\b(chardonnay|sauvignon\s*blanc|riesling|pinot\s*gri[gs]|gewurz|muscat|moscato|viognier|chenin|semillon|albarino|gruner|verdejo|vermentino|soave|garganega|torrontes|fiano|greco|arneis|cortese|marsanne|roussanne|picpoul|muscadet|melon\s*de\s*bourgogne|blanc\s*de\s*blancs|prosecco|glera|palomino|pedro\s*xim[eé]nez|furmint|sercial|verdelho|malvasia|bual|assyrtiko|welschriesling|vidal)\b/i;
const RED_GRAPE_INDICATORS = /\b(cabernet\s*sauvignon|merlot|pinot\s*noir|syrah|shiraz|grenache|garnacha|tempranillo|sangiovese|nebbiolo|malbec|zinfandel|primitivo|mourvedre|carignan|barbera|dolcetto|touriga|tannat|carmenere|pinotage|gamay|blaufr[aä]nkisch|lemberger|zweigelt|aglianico|nero\s*d.avola|nerello|lagrein|cannonau|xinomavro|cabernet\s*franc|cinsault|monastrell|tinta\s*negra|tinta\s*roriz|touriga\s*nacional|touriga\s*franca|baga)\b/i;

const APPELLATION_TO_PRIMARY_VARIETY = [
  { pattern: /\b(barolo|barbaresco|gattinara|ghemme|carema|valtellina|sforzato)\b/i, variety: "nebbiolo" },
  { pattern: /\b(chianti|brunello|vino\s+nobile|morellino|montepulciano)\b/i, variety: "sangiovese" },
  { pattern: /\b(etna\s+rosso)\b/i, variety: "nerello mascalese" },
  { pattern: /\b(taurasi)\b/i, variety: "aglianico" },
  { pattern: /\b(valpolicella|amarone|ripasso|bardolino)\b/i, variety: "corvina blend" },
  { pattern: /\b(barbera)\b/i, variety: "barbera" },
  { pattern: /\b(dolcetto)\b/i, variety: "dolcetto" },
  { pattern: /\b(beaujolais|fleurie|morgon|moulin-a-vent|brouilly)\b/i, variety: "gamay" },
  { pattern: /\b(sherry|fino|manzanilla|amontillado|oloroso|palo\s*cortado)\b/i, variety: "palomino" },
  { pattern: /\b(madeira|malmsey|rainwater)\b/i, variety: "tinta negra" },
  { pattern: /\b(tokaj|tokaji|aszu|szamorodni)\b/i, variety: "furmint" },
  { pattern: /\b(sauternes|barsac)\b/i, variety: "semillon blend" },
  { pattern: /\b(port\b|vintage\s*port|lbv|tawny\s*\d+|ruby\s*port|vintage\s*port|colheita)\b/i, variety: "touriga nacional blend" },
  { pattern: /\b(banyuls|maury|rivesaltes)\b/i, variety: "grenache" },
  { pattern: /\b(rutherglen)\b/i, variety: "muscat" },
  { pattern: /\b(muscadet)\b/i, variety: "melon de bourgogne" },
  { pattern: /\b(burgundy|bourgogne|gevrey|chambolle|vosne|pommard|volnay)\b/i, variety: "pinot noir" },
  { pattern: /\b(rioja|ribera\s+del\s+duero)\b/i, variety: "tempranillo" },
  { pattern: /\b(cote-rotie|cornas|hermitage|crozes-hermitage|saint-joseph)\b/i, variety: "syrah" },
  { pattern: /\b(chateauneuf-du-pape|gigalondas|vacqueyras)\b/i, variety: "grenache blend" },
];

function normalizeVariety(value) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace("shiraz", "syrah")
    .replace("garnacha", "grenache")
    .replace("pinot gris", "pinot grigio")
    .replace("nerello", "nerello mascalese")
    .trim();
}

export function detectPrimaryVariety(fullText) {
  const text = fullText.toLowerCase();
  const whiteMatch = text.match(WHITE_GRAPE_INDICATORS);
  const redMatch = text.match(RED_GRAPE_INDICATORS);
  const direct = (whiteMatch?.[0] || redMatch?.[0])?.toLowerCase().trim();
  if (direct) return normalizeVariety(direct);
  const appellationMatch = APPELLATION_TO_PRIMARY_VARIETY.find((entry) => entry.pattern.test(text));
  return appellationMatch ? appellationMatch.variety : "unknown";
}

const KNOWN_BLEND_INDICATORS = /\b(tawny\s*(port|\d+\s*year)|ruby\s*port|lbv|vintage\s*port|champagne\s*(brut|nv|vintage|rose)|cremant|cava|franciacorta|prosecco|chateauneuf|cdp|gigondas|vacqueyras|bordeaux|medoc|haut-medoc|pauillac|margaux|saint-julien|saint-estephe|saint-emilion|pomerol|pessac|graves|cotes\s*du\s*rhone|gsm|meritage|ripasso|amarone|valpolicella)\b/i;

export function isLikelyBlend(fullText) {
  const text = fullText.toLowerCase();
  if (KNOWN_BLEND_INDICATORS.test(text)) return true;
  const variety = detectPrimaryVariety(fullText);
  if (variety.includes("blend")) return true;
  return false;
}

export function detectCountryName(fullText) {
  const text = fullText.toLowerCase();
  const countries = [
    "south africa", "new zealand", "united states", "france", "italy", "spain", "portugal",
    "germany", "austria", "greece", "hungary", "australia", "argentina", "chile", "canada",
    "usa", "england", "georgia", "uruguay", "brazil", "lebanon", "japan", "switzerland",
    "croatia", "slovenia", "israel", "mexico", "china",
  ];
  const match = countries.find((country) => text.includes(country));
  return match?.replace("united states", "usa") || "unknown";
}

/**
 * Build normalized RuleWine[] from raw generated wines by detecting variety/country/blend from the
 * label. Undetectable variety -> varieties:[] and undetectable country -> "" so the rules' "known"
 * filters behave exactly like the engine's detected/undetected split.
 * @param {Array<{ slot: number, fullText: string }>} wines
 */
export function winesFromText(wines) {
  return (wines || []).map((w) => {
    const primary = detectPrimaryVariety(w.fullText);
    const country = detectCountryName(w.fullText);
    return {
      slot: w.slot,
      varieties: primary === "unknown" ? [] : [primary],
      country: country === "unknown" ? "" : country,
      is_blend: isLikelyBlend(w.fullText),
    };
  });
}
