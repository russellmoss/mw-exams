// p3-category.mjs — Paper 3 category classifier + the invisible weighted-sampling math.
//
// THE single source of truth for (a) how a Paper 3 flight is tagged into one of six style
// families and (b) the target mix + deficit-weighting used to steer P3 sampling toward the
// historical exam composition. Kept as plain .mjs (same pattern as question-rules.mjs /
// stem-answer-key.mjs) so the one-off backfill script and the CI test can import it directly,
// while the TS app imports it too (allowJs + bundler moduleResolution).
//
// NOTHING here is candidate-facing. The category label is a serving/analytics concept; it is
// never rendered, and the weights/target mix never leave the server.

export const P3_CATEGORIES = /** @type {const} */ ([
  "sparkling",
  "fortified",
  "sweet",
  "oxidative",
  "rose",
  "other",
]);

// Target weights, derived from historical Paper 3 paper composition (see mw_exam_empirical_knowledge
// §4 / EK-0035..EK-0037: sparkling opener + fortified/sweet 10–12 slots dominate, oxidative/rosé are
// the thin slots). Single named constant so the mix can be tuned WITHOUT touching any call site.
export const P3_TARGET_MIX = {
  sparkling: 0.24,
  fortified: 0.26,
  sweet: 0.24,
  oxidative: 0.12,
  other: 0.07,
  rose: 0.07,
};

// The window of recent Paper 3 attempts the streak-suppressor looks back over.
export const P3_RECENT_WINDOW = 8;

// ── Per-wine style detection ─────────────────────────────────────────────────────────────────
// Accent-insensitive, lower-cased matching so "rosé"/"château-chalon"/"pétillant" all resolve.
function norm(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Fortified FIRST — many fortified wines are also sweet and/or oxidative (PX, cream Sherry,
// Rutherglen Muscat, oxidative Tawny Port); the fortification is the defining P3 style.
// Conservative tokens: avoid bare "vintage"/"ruby" (they collide with vintage Champagne etc.);
// only match "port" and unambiguous fortified names.
const FORTIFIED = /\b(fortified|port\b|tawny|colheita|lbv|sherry|jerez|fino|manzanilla|amontillado|oloroso|palo cortado|pedro ximenez|\bpx\b|montilla|madeira|malmsey|sercial|verdelho madeira|bual|boal|marsala|vin doux naturel|\bvdn\b|banyuls|maury|rivesaltes|rasteau|rutherglen|beaumes[- ]de[- ]venise|muscat de|commandaria|mavrodaphne|moscatel de setubal|vermouth|solera|vino generoso|vins de liqueur)\b/;

// Backstop for fortified wines whose label names neither the style nor a giveaway region —
// "Taylor's Vintage, 1985. Douro, Portugal. (20.5%)", "JMK Shiraz VP, Kalleske. (18.5%)". We
// deliberately don't token-match bare "vintage"/"ruby", so ABV is what's left. Calibrated against
// the 504-wine corpus: ALL 30 wines at >=17% are Port/Sherry/Madeira/Rutherglen/VP, while the
// 16–16.5% band still holds dry Amarone and Mollydooker Shiraz. Move this threshold only with
// fresh corpus evidence.
const FORTIFIED_ABV = 17;
function statedAbv(t) {
  const m = t.match(/(\d{1,2}(?:[.,]\d)?)\s*%/);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

// `tokaj`/`tokaji` is NOT here: Tokaj makes dry Furmint (a recurring Paper 3 curveball) as well as
// Aszú, so the region alone proves nothing. The sweetness has to be named — aszú, puttonyos,
// eszencia, szamorodni.
const SWEET = /\b(sauternes|barsac|monbazillac|loupiac|sainte[- ]croix[- ]du[- ]mont|jurancon|coteaux du layon|quarts de chaume|bonnezeaux|moelleux|beerenauslese|trockenbeerenauslese|\btba\b|auslese|spatlese|eiswein|ice ?wine|aszu|puttonyos|eszencia|essencia|szamorodni|passito|recioto|vin santo|vinsanto|vendange tardive|vendemmia tardiva|selection de grains nobles|\bsgn\b|late harvest|noble rot|botrytis|moscato|moscadello|\basti\b|brachetto|clairette de die|dolce|moscatel|straw wine|vin de paille|strohwein|vin de constance|passerillage|late[- ]picked|dulce|sweet)\b/;

// `sekt\w*` because German sparkling houses bury the term in a compound — "Sektmanufaktur",
// "Sekthaus", "Sektkellerei" — and a bare \bsekt\b misses every one of them.
const SPARKLING = /\b(sparkling|champagne|cremant|cava|prosecco|valdobbiadene|cartizze|conegliano|franciacorta|trentodoc|sekt\w*|espumante|spumante|cap classique|blanc de blancs|blanc de noirs|mousseux|petillant|metodo classico|methode traditionnelle|traditional method|pet[- ]?nat|petillant naturel|col fondo|sui lieviti|nyetimber|schramsberg|\bbrut\b|extra brut|dosage|lambrusco)\b/;

// Explicitly-stated oxidative handling — the style is named on the label.
// Note what is NOT here any more: the bare Jura appellation names (`arbois`, `l'étoile`). An
// appellation is not a winemaking style — Arbois covers ouillé Chardonnay and Trousseau reds as
// readily as it covers vin jaune — so the Jura signal has to come from the grape (`savagnin`, which
// in Jura is the flor grape by default) or from the style itself (`vin jaune`, `sous voile`,
// `voile`), all of which are listed here. `chateau-chalon` stays: that AOC is vin jaune and nothing
// else.
const OXIDATIVE = /\b(oxidative|oxidatively|oxidised|oxidized|sous voile|sous le voile|vin de voile|voile|vin jaune|chateau[- ]chalon|savagnin|rancio|velo de flor|flor[- ]aged|aged under flor|under flor|biologically aged|vernaccia di oristano|orange wine|amber|qvevri|kvevri|skin[- ]contact|skin contact)\b/;

// "Ouillé" (topped up) is the EXPLICIT opposite of sous voile: the barrel is kept full so no flor
// ever forms, giving a fresh, reductive white. It has to beat every cue above, because an "Arbois
// Savagnin Ouillé" trips both `savagnin` and its Jura context while being the exact wine the
// oxidative bucket must not serve.
const NON_OXIDATIVE = /\b(ouille|ouillee|ouilles|ouillage|topped[- ]up|non[- ]oxidative|non oxidative|no flor|without flor)\b/;

// Oxidatively-aged whites are usually NAMED, not described: the label says neither "oxidative" nor
// "sous voile", and the candidate is expected to know the house. Two cues:
//   1. White-only traditional cuvées, which ARE the style — no white qualifier needed (Viña Gravonia
//      appears in the corpus as "Viña Gravonia, Lopez de Heredia Viña Tondonia" with no "Blanco").
//   2. The traditional Rioja houses on a WHITE bottling. The white cue is required because their
//      reds carry the same cuvée names — "Castillo Ygay Gran Reserva" is a red, "Castillo Ygay
//      Blanco Gran Reserva Especial" is the oxidative white.
const OXIDATIVE_WHITE_CUVEE = /\b(gravonia|capellania|monopole clasico)\b/;
const TRAD_WHITE_HOUSE = /\b(lopez de heredia|tondonia|castillo ygay|marques de murrieta)\b/;
const WHITE_CUE = /\b(blanco|blanc|bianco|white|viura|malvasia|garnacha blanca)\b/;

// Jura houses whose white production is voile-aged BY DEFAULT, so the label needs to say nothing:
// Macle, Montbourgeau, Berthet-Bondet, Bourdy. This list is deliberately short and excludes the
// domaines that bottle both styles (Tissot, Rolet, Ganevat, Puffeney) — for those the label does
// the talking, via `savagnin`/`vin jaune` on one side and the `ouillé` veto on the other. This is
// the knowledge an appellation token can't carry: Arbois and L'Étoile each cover both styles, the
// house is what decides.
const OXIDATIVE_HOUSE = /\b(macle|montbourgeau|berthet[- ]bondet|bourdy)\b/;

// ...but those houses bottle reds too, and a red cue vetoes the house route — "Berthet-Bondet
// Trousseau Tradition" is a Jura RED. Same trap as "Castillo Ygay Gran Reserva" (red) vs "Castillo
// Ygay Blanco" (oxidative white): the cuvée/house name alone never settles the colour.
const RED_CUE = /\b(trousseau|poulsard|ploussard|pinot noir|tinto|tinta|rouge|\bred\b|noir)\b/;

// Georgian qvevri whites are almost never labelled "qvevri" or "amber" — the corpus has
// "Pheasant's Tears, Rkatsiteli. 2011. Kakheti, Georgia". Country/region + a traditional white
// grape is the reliable cue; the amber treatment is the regional default for these varieties.
const GEORGIA = /\b(georgia|kakheti|kartli|imereti)\b/;
const GEORGIAN_WHITE_GRAPE = /\b(rkatsiteli|mtsvane|kisi|khikhvi|tsolikouri|tsitska)\b/;

/**
 * Whites whose long aerobic ageing (voile, qvevri, old-oak ullage) is implied by house, grape or
 * region rather than stated on the label — the knowledge a candidate is expected to bring.
 * @param {string} t normalised text
 */
function isOxidativeAgedWhite(t) {
  if (OXIDATIVE_WHITE_CUVEE.test(t)) return true;
  if (RED_CUE.test(t)) return false;
  if (OXIDATIVE_HOUSE.test(t)) return true;
  if (GEORGIA.test(t) && GEORGIAN_WHITE_GRAPE.test(t)) return true;
  if (!WHITE_CUE.test(t)) return false;
  if (TRAD_WHITE_HOUSE.test(t)) return true;
  // A white Rioja carrying a barrel-age designation is the traditional style by definition: Blanco
  // Reserva demands years in old oak, and essentially only the traditionalist houses still bottle it.
  return /\brioja\b/.test(t) && /\breserva\b/.test(t);
}

// "White Zinfandel" is the archetypal blush wine and says none of the words below on the label.
const ROSE = /\b(rose|rosado|rosato|rosat|vin gris|clairet|tavel|oeil de perdrix|cerasuolo|blush|pink|white zinfandel|weissherbst)\b/;

/**
 * Classify ONE wine's fullText.
 * @returns {{ style: "sparkling"|"fortified"|"sweet"|"oxidative"|"other", isRose: boolean }}
 * `style` is the wine's single dominant NON-rosé style (priority fortified > sweet > sparkling >
 * oxidative > other). `isRose` is tracked separately because rosé cross-cuts the other styles
 * (a rosé Champagne is both) and the flight-level rule keys on "every wine is a rosé".
 */
export function classifyWineStyle(fullText) {
  const t = norm(fullText);
  const isRose = ROSE.test(t);
  // A stated "ouillé" vetoes both oxidative routes — stated cue and implied house alike.
  const oxidative = !NON_OXIDATIVE.test(t) && (OXIDATIVE.test(t) || isOxidativeAgedWhite(t));
  const abv = statedAbv(t);
  let style;
  if (FORTIFIED.test(t) || (abv !== null && abv >= FORTIFIED_ABV)) style = "fortified";
  else if (SWEET.test(t)) style = "sweet";
  else if (SPARKLING.test(t)) style = "sparkling";
  else if (oxidative) style = "oxidative";
  else style = "other";
  return { style, isRose };
}

/**
 * Classify a whole Paper 3 flight into one p3_category.
 *   - 'rose' ONLY if EVERY wine in the flight is a rosé (a single rosé in a mixed flight does not
 *     make the question 'rose').
 *   - otherwise the DOMINANT style across the flight (most wines), ties broken by the priority
 *     order fortified > sweet > sparkling > oxidative > other.
 * @param {{fullText:string}[]} wines
 * @returns {"sparkling"|"fortified"|"sweet"|"oxidative"|"rose"|"other"}
 */
export function classifyP3Category(wines) {
  const list = Array.isArray(wines) ? wines.filter((w) => w && w.fullText) : [];
  if (list.length === 0) return "other";
  const perWine = list.map((w) => classifyWineStyle(w.fullText));

  if (perWine.every((w) => w.isRose)) return "rose";

  const counts = { fortified: 0, sweet: 0, sparkling: 0, oxidative: 0, other: 0 };
  for (const w of perWine) counts[w.style]++;

  // Dominant (highest count); ties resolved by this fixed priority order.
  const PRIORITY = ["fortified", "sweet", "sparkling", "oxidative", "other"];
  let best = PRIORITY[0];
  for (const cat of PRIORITY) {
    if (counts[cat] > counts[best]) best = cat;
  }
  return best;
}

// ── Weighted sampling math (invisible; Paper 3 only) ─────────────────────────────────────────

// Focus override target mix. A non-'balanced' focus pins the chosen category to 0.65 and splits the
// remaining 0.35 across the OTHER categories in proportion to their P3_TARGET_MIX share, so the
// natural shape of the remainder is preserved (fortified still outweighs oxidative, etc.).
function targetMixFor(focus) {
  if (!focus || focus === "balanced" || !P3_TARGET_MIX[focus]) {
    return { ...P3_TARGET_MIX };
  }
  const others = P3_CATEGORIES.filter((c) => c !== focus);
  const sumOthers = others.reduce((s, c) => s + P3_TARGET_MIX[c], 0);
  const mix = { [focus]: 0.65 };
  for (const c of others) mix[c] = 0.35 * (P3_TARGET_MIX[c] / sumOthers);
  return mix;
}

/**
 * Deficit-weighted score per category over the recent window.
 *   weight = target * (1 + (target*N - recentCount)/N), clamped to >= 0.02.
 * A category served MORE than its target share recently is suppressed; one served less is pulled up,
 * dragging the running mix back toward target. Streak suppression still applies inside a focus
 * session because the focus override only changes the `target`, not the formula.
 * @param {(string|null|undefined)[]} recentCategories most-recent-first list of served categories
 * @param {string} [focus='balanced']
 * @returns {Record<string, number>}
 */
export function computeP3Weights(recentCategories, focus = "balanced") {
  const N = P3_RECENT_WINDOW;
  const target = targetMixFor(focus);
  const counts = {};
  for (const c of P3_CATEGORIES) counts[c] = 0;
  const recent = (recentCategories || []).slice(0, N);
  for (const c of recent) {
    if (c && counts[c] !== undefined) counts[c]++;
  }
  const weights = {};
  for (const c of P3_CATEGORIES) {
    const t = target[c] ?? 0;
    const w = t * (1 + (t * N - counts[c]) / N);
    weights[c] = Math.max(0.02, w);
  }
  return weights;
}

/**
 * Order the categories for selection: a single weighted-random draw picks the FIRST category, and
 * the rest follow in descending weight so a caller can walk the list as a fallback chain ("if the
 * chosen category has no eligible question, fall back to the next-highest-weighted category").
 * @param {Record<string, number>} weights
 * @param {() => number} [rng=Math.random]
 * @returns {string[]}
 */
export function orderCategoriesByWeight(weights, rng = Math.random) {
  const cats = P3_CATEGORIES.slice();
  const total = cats.reduce((s, c) => s + (weights[c] || 0), 0);
  let r = (rng() || 0) * total;
  let first = cats[cats.length - 1];
  for (const c of cats) {
    r -= weights[c] || 0;
    if (r <= 0) {
      first = c;
      break;
    }
  }
  const rest = cats.filter((c) => c !== first).sort((a, b) => (weights[b] || 0) - (weights[a] || 0));
  return [first, ...rest];
}

/**
 * THE decision the serve layer actually makes: given the style families that are ACTUALLY available
 * in the current candidate pool, pick the one to serve from.
 *
 * Split out from the pool-narrowing itself (question-engine.narrowToWeightedP3Category) so the whole
 * steering rule is pure, dependency-free and unit-testable. Weight → weighted-random draw → walk the
 * remainder in descending weight until one is available. Returns null only when nothing is available,
 * which the caller treats as "leave the pool alone".
 *
 * @param {Iterable<string>} availableCategories categories present in the pool
 * @param {(string|null|undefined)[]} recentCategories most-recent-first served categories
 * @param {string} [focus='balanced']
 * @param {() => number} [rng=Math.random]
 * @returns {string|null}
 */
export function chooseP3Category(availableCategories, recentCategories, focus = "balanced", rng = Math.random) {
  const available = new Set(availableCategories);
  if (available.size === 0) return null;
  const order = orderCategoriesByWeight(computeP3Weights(recentCategories, focus), rng);
  for (const cat of order) {
    if (available.has(cat)) return cat;
  }
  // A pool tagged with something outside P3_CATEGORIES (shouldn't happen — the CHECK constraint in
  // migration 015 forbids it) still gets served rather than dropped.
  return [...available][0];
}
