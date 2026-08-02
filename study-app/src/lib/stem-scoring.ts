// stem-scoring.ts — Stem Sniper deterministic scorer (Phase 1).
//
// Pure, no I/O. Grades a candidate's variety+region predictions for a flight against a
// stem_answer_key. Aligned to the MW rubric the trees target: VARIETY + (country OR major
// region) earns full credit — naming "Burgundy" for a Côte de Nuits Pinot is a HIT; naming
// only the country is a NEAR; right grape / wrong place is VARIETY; a sound-but-not-in-glass
// confusable is PLAUSIBLE_OK. Also emits a calibration side-channel (was each confidence
// tier actually correct?) to feed the future calibration mode.

export type Tier = "STRONG" | "PLAUSIBLE" | "CURVEBALL";
export type Grade = "HIT" | "NEAR" | "VARIETY" | "PLAUSIBLE_OK" | "MISS";

export interface Prediction {
  variety?: string;
  region?: string;
  country?: string;
  style?: string; // Paper 3: predicted style/method (e.g. "Amontillado", "Tawny Port")
  tier?: Tier; // candidate's self-assigned confidence
}
export interface GroundTruthBucket {
  slot: number;
  varieties: string[];
  region: string;
  country?: string;
  is_blend?: boolean;
  difficulty?: Tier; // optional: how hard this bucket is (drives curveball bonus)
  // Paper 3 only: style/method is the discriminator (variety is uniform, e.g. all Sherry = Palomino).
  style?: string;
  style_category?: string;
  style_tokens?: string[];
}
export interface PlausibleBucket {
  variety: string;
  region: string;
  country?: string | null;
  tier?: Tier;
}
export interface AnswerKey {
  ground_truth: GroundTruthBucket[];
  plausible: PlausibleBucket[];
}
export interface PredictionGrade {
  prediction: Prediction;
  grade: Grade;
  points: number;
  matchedSlot: number | null;
  note: string;
}
export interface CalibrationEntry {
  tier: Tier | null;
  correct: boolean; // HIT or NEAR
  grade: Grade;
}
export interface ScoreResult {
  points: number;
  maxPoints: number;
  percent: number;
  grades: PredictionGrade[];
  calibration: CalibrationEntry[];
  summary: { hits: number; nears: number; varietyOnly: number; plausibleOk: number; misses: number };
}

const POINTS: Record<Grade, number> = { HIT: 10, NEAR: 6, PLAUSIBLE_OK: 4, VARIETY: 3, MISS: 0 };
const RANK: Record<Grade, number> = { HIT: 5, NEAR: 4, PLAUSIBLE_OK: 3, VARIETY: 2, MISS: 0 };
const CURVEBALL_BONUS = 2;

// Synonyms map a label to its canonical variety. Keys/values are pre-normalized at use.
const VARIETY_SYNONYMS: Record<string, string> = {
  shiraz: "syrah",
  spatburgunder: "pinot noir",
  "pinot nero": "pinot noir",
  grauburgunder: "pinot gris",
  "pinot grigio": "pinot gris",
  weissburgunder: "pinot blanc",
  alvarinho: "albarino",
  garnacha: "grenache",
  "garnacha tinta": "grenache",
  carinena: "carignan",
  mazuelo: "carignan",
  "tinta de toro": "tempranillo",
  "tinto fino": "tempranillo",
  "tinta roriz": "tempranillo",
  aragonez: "tempranillo",
  spanna: "nebbiolo",
  mataro: "mourvedre",
  monastrell: "mourvedre",
  primitivo: "zinfandel",
  cot: "malbec",
  "melon de bourgogne": "muscadet",
  melon: "muscadet",
  "tocai friulano": "friulano",
};

const norm = (s: string | null | undefined): string =>
  (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const canonVariety = (s: string): string => {
  const n = norm(s);
  return VARIETY_SYNONYMS[n] || n;
};

// Levenshtein edit distance (classic DP). Strings here are short, set sizes tiny.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

// Edits allowed for a token of the given length. Short tokens (countries like "usa",
// or distinct short grapes) must match exactly so we don't collapse genuinely different
// names; longer names tolerate 1–2 typos. Kept conservative on purpose: e.g. "douro" vs
// "duero" (distance 2, len 5 → tol 1) still do NOT match.
const maxEdits = (len: number): number => (len <= 4 ? 0 : len <= 7 ? 1 : 2);

// Typo-tolerant equality. Exact after normalization always wins; otherwise allow an
// edit distance scaled to the shorter token's length.
function fuzzyEq(a: string, b: string): boolean {
  if (a === b) return a.length > 0;
  if (!a || !b) return false;
  const tol = Math.min(maxEdits(a.length), maxEdits(b.length));
  if (tol === 0) return false;
  if (Math.abs(a.length - b.length) > tol) return false;
  return levenshtein(a, b) <= tol;
}

// True if `token` fuzzy-matches any member of `list`.
const fuzzyIncludes = (list: string[], token: string): boolean => list.some((t) => fuzzyEq(t, token));

// Ordered region tokens, most-specific first, with the country last.
// Region strings are stored comma-joined ("Côte de Nuits, Burgundy, France"), so split on commas.
const regionChain = (bucket: { region?: string; country?: string }): string[] => {
  const chain = (bucket.region || "").split(",").map((t) => norm(t)).filter(Boolean);
  const country = norm(bucket.country);
  if (country && !chain.includes(country)) chain.push(country);
  return [...new Set(chain)];
};

const countryToken = (bucket: { region?: string; country?: string }): string => {
  const country = norm(bucket.country);
  if (country) return country;
  const chain = regionChain(bucket);
  return chain[chain.length - 1] || "";
};

// A predicted region may itself be multi-part ("Santa Barbara County, California") — split it too.
const predRegionTokens = (p: Prediction): string[] => {
  const out: string[] = [];
  for (const part of (p.region || "").split(",")) {
    const n = norm(part);
    if (n) out.push(n);
  }
  const c = norm(p.country);
  if (c) out.push(c);
  return [...new Set(out)];
};

function varietyMatches(pred: Prediction, varieties: string[]): boolean {
  const pv = canonVariety(pred.variety || "");
  if (!pv) return false;
  return varieties.some((v) => fuzzyEq(canonVariety(v), pv));
}

// Paper-3 style scoring. The candidate may type the style in `style` (or `variety`).
//  2 = full (matches a stored style token, e.g. "amontillado")
//  1 = category (mentions the broad family, e.g. "sherry"/"sparkling"/"botrytis")
//  0 = none
function styleScore(pred: Prediction, bucket: GroundTruthBucket): 0 | 1 | 2 {
  const txt = norm(`${pred.style || ""} ${pred.variety || ""}`);
  if (!txt) return 0;
  for (const t of bucket.style_tokens || []) {
    const nt = norm(t);
    if (!nt) continue;
    if (txt.includes(nt) || (nt.length >= 4 && txt.length >= 4 && nt.includes(txt))) return 2;
  }
  const catWords = norm(bucket.style_category).split(" ").filter((w) => w.length > 3);
  if (catWords.some((w) => txt.includes(w))) return 1;
  return 0;
}

// Paper-3 grade from (style, region) — style-centric, region secondary.
function p3Grade(s: 0 | 1 | 2, r: "region" | "country" | "none"): { grade: Grade; note: string } {
  const rr = r === "region" ? 2 : r === "country" ? 1 : 0;
  if (s === 2 && rr === 2) return { grade: "HIT", note: "style + region" };
  if (s === 2 && rr >= 1) return { grade: "NEAR", note: "style + country" };
  if (s === 2 && rr === 0) return { grade: "PLAUSIBLE_OK", note: "style nailed, region off" };
  if (s === 1 && rr === 2) return { grade: "NEAR", note: "style category + region" };
  if (s === 1 && rr === 1) return { grade: "PLAUSIBLE_OK", note: "style category + country" };
  if (s === 1 && rr === 0) return { grade: "VARIETY", note: "style category only" };
  if (s === 0 && rr === 2) return { grade: "VARIETY", note: "region only, style off" };
  return { grade: "MISS", note: "style + region off" };
}

// Region relationship between a prediction and a bucket's chain.
//  "region"  -> matched a non-country token (specific or major region) => full credit
//  "country" -> matched only the country token                          => partial
//  "none"    -> no overlap
function regionRelation(pred: Prediction, bucket: GroundTruthBucket): "region" | "country" | "none" {
  const chain = regionChain(bucket);
  const country = countryToken(bucket);
  const nonCountry = chain.filter((t) => t !== country);
  const preds = predRegionTokens(pred);
  if (preds.some((t) => fuzzyIncludes(nonCountry, t))) return "region";
  if (country && preds.some((t) => fuzzyEq(t, country))) return "country";
  return "none";
}

function gradeAgainstBucket(pred: Prediction, bucket: GroundTruthBucket): { grade: Grade; note: string } {
  // Paper-3 style buckets: grade on style + region (variety is optional bonus, added later).
  if (bucket.style_tokens && bucket.style_tokens.length) {
    return p3Grade(styleScore(pred, bucket), regionRelation(pred, bucket));
  }
  // Paper 1/2: grade on variety + region.
  if (!varietyMatches(pred, bucket.varieties)) return { grade: "MISS", note: "variety mismatch" };
  const rel = regionRelation(pred, bucket);
  if (rel === "region") return { grade: "HIT", note: "variety + region" };
  if (rel === "country") return { grade: "NEAR", note: "variety + country only" };
  return { grade: "VARIETY", note: "variety only, region off" };
}

function matchesPlausible(pred: Prediction, plausible: PlausibleBucket[]): boolean {
  const pv = canonVariety(pred.variety || "");
  if (!pv) return false;
  const preds = predRegionTokens(pred);
  return plausible.some((pb) => {
    if (!fuzzyEq(canonVariety(pb.variety), pv)) return false;
    const chain = regionChain({ region: pb.region, country: pb.country || undefined });
    return preds.length === 0 || preds.some((t) => fuzzyIncludes(chain, t));
  });
}

/**
 * Score a candidate's predictions against an answer key.
 * Each ground-truth bucket is claimed by at most one prediction. Assignment is best-match-first
 * (a HIT-capable prediction claims its bucket before a weaker one can), so claim order never
 * starves a strong match. A variety-correct prediction whose region is a LISTED confusable
 * scores PLAUSIBLE_OK (above a random wrong region). Predictions matching only a plausible
 * bucket score PLAUSIBLE_OK; otherwise MISS. No penalty for over-predicting.
 */
export function scorePredictions(predictions: Prediction[], key: AnswerKey): ScoreResult {
  // Options per prediction = variety-matching buckets, best grade first.
  const options = predictions.map((pred) => {
    const opts: { idx: number; grade: Grade; note: string }[] = [];
    key.ground_truth.forEach((bucket, idx) => {
      const { grade, note } = gradeAgainstBucket(pred, bucket);
      if (grade !== "MISS") opts.push({ idx, grade, note });
    });
    opts.sort((a, b) => RANK[b.grade] - RANK[a.grade] || a.idx - b.idx);
    return opts;
  });
  // Process strongest-achievable predictions first so they claim their buckets.
  const order = predictions
    .map((_, i) => i)
    .sort((a, b) => (options[b][0] ? RANK[options[b][0].grade] : 0) - (options[a][0] ? RANK[options[a][0].grade] : 0) || a - b);

  const claimed = new Set<number>();
  const grades: PredictionGrade[] = new Array(predictions.length);

  for (const i of order) {
    const pred = predictions[i];
    const opt = options[i].find((o) => !claimed.has(o.idx));
    let grade: Grade, note: string, matchedSlot: number | null = null, bonus = 0;
    if (opt) {
      claimed.add(opt.idx);
      const bucket = key.ground_truth[opt.idx];
      matchedSlot = bucket.slot;
      grade = opt.grade;
      note = opt.note;
      const isStyle = !!(bucket.style_tokens && bucket.style_tokens.length);
      if (!isStyle && grade === "VARIETY" && matchesPlausible(pred, key.plausible)) {
        grade = "PLAUSIBLE_OK";
        note = "variety + listed confusable region";
      }
      if (grade === "HIT" && bucket.difficulty === "CURVEBALL") bonus = CURVEBALL_BONUS;
      // P3: getting the variety right too (optional) is a small bonus.
      if (isStyle && grade !== "MISS" && varietyMatches(pred, bucket.varieties)) {
        bonus += 1;
        note += " (+variety)";
      }
    } else if (matchesPlausible(pred, key.plausible)) {
      grade = "PLAUSIBLE_OK";
      note = "sound confusable, not in glass";
    } else {
      grade = "MISS";
      note = "no match";
    }
    grades[i] = { prediction: pred, grade, points: POINTS[grade] + bonus, matchedSlot, note };
  }
  const calibration: CalibrationEntry[] = grades.map((g) => ({
    tier: g.prediction.tier ?? null,
    correct: g.grade === "HIT" || g.grade === "NEAR",
    grade: g.grade,
  }));

  const points = grades.reduce((s, g) => s + g.points, 0);
  const maxPoints = key.ground_truth.length * POINTS.HIT;
  const percent = maxPoints > 0 ? Math.min(100, Math.round((points / maxPoints) * 100)) : 0;
  const summary = {
    hits: grades.filter((g) => g.grade === "HIT").length,
    nears: grades.filter((g) => g.grade === "NEAR").length,
    varietyOnly: grades.filter((g) => g.grade === "VARIETY").length,
    plausibleOk: grades.filter((g) => g.grade === "PLAUSIBLE_OK").length,
    misses: grades.filter((g) => g.grade === "MISS").length,
  };
  return { points, maxPoints, percent, grades, calibration, summary };
}

// ────────────────────────────────────────────────────────────────────────────
// Two-axis Stem Sniper scorer ("Two Marks, Not Three").
//
// Marks EXACTLY two axes — GRAPE and COUNTRY — and NEVER marks region. Naming grape +
// country is a full HIT; naming exactly one axis is a NEAR; neither is a MISS. Being MORE
// specific than a country (typing the region/appellation) must never cost marks: a region is
// resolved to its country before comparison, or matched against the wine's own region chain.
// Pure and deterministic — no I/O. Reverse Tasting keeps the legacy scorePredictions above.
// ────────────────────────────────────────────────────────────────────────────

export type Verdict = "HIT" | "NEAR" | "MISS";

// Conventional blend names that count as naming the grape for a blend (full recipe never required).
const BLEND_NAMES = new Set(
  ["bordeaux blend", "gsm", "rhone blend", "rhône blend", "field blend", "douro blend", "port blend"].map(norm)
);

// Country equivalences — normalised label → canonical country.
const COUNTRY_ALIASES: Record<string, string> = {
  uk: "united kingdom",
  "u k": "united kingdom",
  britain: "united kingdom",
  "great britain": "united kingdom",
  england: "united kingdom",
  gb: "united kingdom",
  usa: "united states",
  "u s a": "united states",
  us: "united states",
  "u s": "united states",
  america: "united states",
  "united states of america": "united states",
};

// Region / appellation / sub-region → country. Being more specific must never cost marks, so a
// region the candidate types is resolved to its country before the country axis is compared. The
// wine's OWN region chain is also matched (below), which covers regions not listed here.
const REGION_TO_COUNTRY: Record<string, string> = Object.fromEntries(
  (
    [
      // France
      ["burgundy", "france"], ["bourgogne", "france"], ["chablis", "france"], ["cote d or", "france"],
      ["cote de nuits", "france"], ["cote de beaune", "france"], ["beaujolais", "france"], ["maconnais", "france"],
      ["alsace", "france"], ["loire", "france"], ["sancerre", "france"], ["pouilly fume", "france"],
      ["muscadet", "france"], ["vouvray", "france"], ["chinon", "france"], ["rhone", "france"],
      ["cotes du rhone", "france"], ["chateauneuf du pape", "france"], ["hermitage", "france"], ["cote rotie", "france"],
      ["condrieu", "france"], ["champagne", "france"], ["bordeaux", "france"], ["medoc", "france"], ["margaux", "france"],
      ["pauillac", "france"], ["saint emilion", "france"], ["st emilion", "france"], ["pomerol", "france"],
      ["graves", "france"], ["pessac leognan", "france"], ["sauternes", "france"], ["provence", "france"],
      ["languedoc", "france"], ["roussillon", "france"], ["cahors", "france"], ["jura", "france"], ["savoie", "france"],
      // Italy
      ["tuscany", "italy"], ["toscana", "italy"], ["chianti", "italy"], ["brunello", "italy"], ["montalcino", "italy"],
      ["piedmont", "italy"], ["piemonte", "italy"], ["barolo", "italy"], ["barbaresco", "italy"], ["langhe", "italy"],
      ["veneto", "italy"], ["soave", "italy"], ["valpolicella", "italy"], ["amarone", "italy"], ["prosecco", "italy"],
      ["alto adige", "italy"], ["friuli", "italy"], ["sicily", "italy"], ["sicilia", "italy"], ["etna", "italy"],
      ["puglia", "italy"], ["apulia", "italy"], ["campania", "italy"],
      // Spain
      ["rioja", "spain"], ["ribera del duero", "spain"], ["priorat", "spain"], ["rias baixas", "spain"],
      ["rueda", "spain"], ["jerez", "spain"], ["sherry", "spain"], ["toro", "spain"], ["penedes", "spain"], ["jumilla", "spain"],
      // Portugal
      ["douro", "portugal"], ["dao", "portugal"], ["vinho verde", "portugal"], ["alentejo", "portugal"],
      ["bairrada", "portugal"], ["madeira", "portugal"],
      // Germany
      ["mosel", "germany"], ["rheingau", "germany"], ["rheinhessen", "germany"], ["pfalz", "germany"],
      ["nahe", "germany"], ["baden", "germany"], ["franken", "germany"],
      // Austria
      ["wachau", "austria"], ["kamptal", "austria"], ["burgenland", "austria"], ["kremstal", "austria"],
      // USA
      ["napa", "united states"], ["napa valley", "united states"], ["sonoma", "united states"],
      ["california", "united states"], ["oregon", "united states"], ["willamette", "united states"],
      ["willamette valley", "united states"], ["washington", "united states"], ["columbia valley", "united states"],
      ["finger lakes", "united states"], ["paso robles", "united states"], ["santa barbara", "united states"],
      // Australia
      ["barossa", "australia"], ["barossa valley", "australia"], ["mclaren vale", "australia"], ["coonawarra", "australia"],
      ["yarra valley", "australia"], ["hunter valley", "australia"], ["margaret river", "australia"],
      ["clare valley", "australia"], ["eden valley", "australia"], ["adelaide hills", "australia"],
      // New Zealand
      ["marlborough", "new zealand"], ["central otago", "new zealand"], ["hawkes bay", "new zealand"],
      ["hawke s bay", "new zealand"], ["martinborough", "new zealand"],
      // South Africa
      ["stellenbosch", "south africa"], ["swartland", "south africa"], ["walker bay", "south africa"],
      ["hemel en aarde", "south africa"], ["paarl", "south africa"], ["constantia", "south africa"],
      // Argentina / Chile
      ["mendoza", "argentina"], ["uco valley", "argentina"], ["salta", "argentina"], ["patagonia", "argentina"],
      ["maipo", "chile"], ["colchagua", "chile"], ["casablanca", "chile"], ["aconcagua", "chile"],
    ] as [string, string][]
  ).map(([k, v]) => [norm(k), v])
);

const canonCountry = (s: string): string => {
  const n = norm(s);
  return COUNTRY_ALIASES[n] || n;
};

// Resolve any free-text place the candidate typed to a country: alias → static region map →
// leave as-is (compared fuzzily against the expected country downstream).
function resolveToCountry(raw: string): string {
  const n = norm(raw);
  if (!n) return "";
  if (COUNTRY_ALIASES[n]) return COUNTRY_ALIASES[n];
  if (REGION_TO_COUNTRY[n]) return REGION_TO_COUNTRY[n];
  return n;
}

export interface TwoAxisPrediction {
  grape?: string; // variety (P1/P2) or style/method (P3)
  country?: string;
  tier?: Tier;
}

export interface TwoAxisWineGrade {
  slot: number;
  grapeGuess: string;
  countryGuess: string;
  grapeCorrect: boolean;
  countryCorrect: boolean;
  verdict: Verdict;
  points: number;
  correctGrape: string; // expected grape/style (display)
  correctCountry: string; // expected country (display)
  region: string; // information only — NEVER scored
  is_blend?: boolean;
}

export interface TwoAxisResult {
  twoAxis: true;
  points: number;
  maxPoints: number;
  percent: number;
  roundPoints: number; // hits + 0.5·nears
  roundMax: number; // one mark per wine
  grades: TwoAxisWineGrade[];
  calibration: CalibrationEntry[];
  summary: { hits: number; nears: number; misses: number };
}

// GRAPE axis: dominant grape, any listed component, a conventional blend name (for blends), or —
// on Paper 3 — the style/method. Synonyms and typos tolerated via canonVariety + fuzzyEq.
function grapeCorrect(pred: TwoAxisPrediction, bucket: GroundTruthBucket): boolean {
  const raw = (pred.grape || "").trim();
  if (!raw) return false;
  if (bucket.style_tokens && bucket.style_tokens.length) {
    return styleScore({ style: raw, variety: raw }, bucket) >= 1;
  }
  const n = norm(raw);
  if (bucket.is_blend && BLEND_NAMES.has(n)) return true;
  const cg = canonVariety(raw);
  return bucket.varieties.some((v) => fuzzyEq(canonVariety(v), cg));
}

// COUNTRY axis: country match after alias/region resolution. Typing a region, appellation or
// sub-region resolves to its country (never penalised); the wine's own region chain is matched
// too, so a correct sub-region the static map doesn't know still counts.
function countryCorrect(pred: TwoAxisPrediction, bucket: GroundTruthBucket): boolean {
  const raw = (pred.country || "").trim();
  if (!raw) return false;
  const expected = canonCountry(bucket.country || countryToken(bucket));
  if (!expected) return false;
  if (fuzzyEq(resolveToCountry(raw), expected)) return true;
  // The candidate was MORE specific than the country — match against the wine's own region chain.
  const chain = regionChain({ region: bucket.region, country: bucket.country });
  const parts = norm(raw).split(" ").filter(Boolean);
  for (const token of [norm(raw), ...parts]) {
    if (!token) continue;
    if (fuzzyIncludes(chain, token)) return true;
    if (REGION_TO_COUNTRY[token] && fuzzyEq(norm(REGION_TO_COUNTRY[token]), expected)) return true;
  }
  return false;
}

const verdictOf = (grape: boolean, country: boolean): Verdict =>
  grape && country ? "HIT" : grape || country ? "NEAR" : "MISS";

// Re-based from the legacy 3-axis scheme to two axes while KEEPING the displayed maximum: full
// credit per wine stays POINTS.HIT (10), a single-axis NEAR is half, a MISS is 0 — so historical
// percentages remain comparable in magnitude.
const TWO_AXIS_POINTS: Record<Verdict, number> = { HIT: POINTS.HIT, NEAR: POINTS.HIT / 2, MISS: 0 };

/**
 * Score a candidate's grape+country guesses for a flight. Assignment is order-independent and
 * best-verdict-first: each prediction claims at most one wine, strongest matches claim first, so
 * claim order never starves a HIT. Every wine (ground-truth bucket) is reported — a wine no guess
 * claimed is a MISS with blank guesses. Region is never part of the score.
 */
export function scoreStemSniper(predictions: TwoAxisPrediction[], key: AnswerKey): TwoAxisResult {
  const buckets = key.ground_truth;
  // Every (prediction, bucket) candidate pairing, strongest verdict first.
  const pairs: { p: number; b: number; g: boolean; c: boolean; rank: number }[] = [];
  predictions.forEach((pred, p) => {
    buckets.forEach((bucket, b) => {
      const g = grapeCorrect(pred, bucket);
      const c = countryCorrect(pred, bucket);
      if (!g && !c) return; // no signal — leave the wine claimable by a better guess
      pairs.push({ p, b, g, c, rank: (g ? 2 : 0) + (c ? 1 : 0) });
    });
  });
  pairs.sort((x, y) => y.rank - x.rank || x.b - y.b || x.p - y.p);

  const claimedBucket = new Set<number>();
  const usedPred = new Set<number>();
  const assigned = new Map<number, { p: number; g: boolean; c: boolean }>(); // bucket idx → claim
  for (const pair of pairs) {
    if (claimedBucket.has(pair.b) || usedPred.has(pair.p)) continue;
    claimedBucket.add(pair.b);
    usedPred.add(pair.p);
    assigned.set(pair.b, { p: pair.p, g: pair.g, c: pair.c });
  }

  const grades: TwoAxisWineGrade[] = buckets.map((bucket, b) => {
    const claim = assigned.get(b);
    const pred = claim ? predictions[claim.p] : undefined;
    const grape = claim?.g ?? false;
    const country = claim?.c ?? false;
    const verdict = verdictOf(grape, country);
    return {
      slot: bucket.slot,
      grapeGuess: (pred?.grape || "").trim(),
      countryGuess: (pred?.country || "").trim(),
      grapeCorrect: grape,
      countryCorrect: country,
      verdict,
      points: TWO_AXIS_POINTS[verdict],
      correctGrape: bucket.style || bucket.varieties.join(" / "),
      correctCountry: bucket.country || countryToken(bucket),
      region: bucket.region || "",
      is_blend: bucket.is_blend,
    };
  });

  const hits = grades.filter((g) => g.verdict === "HIT").length;
  const nears = grades.filter((g) => g.verdict === "NEAR").length;
  const misses = grades.filter((g) => g.verdict === "MISS").length;
  const points = grades.reduce((s, g) => s + g.points, 0);
  const maxPoints = buckets.length * POINTS.HIT;
  const percent = maxPoints > 0 ? Math.min(100, Math.round((points / maxPoints) * 100)) : 0;
  // Calibration side-channel keyed on each claimed prediction's tier (correct = HIT or NEAR).
  const calibration: CalibrationEntry[] = grades
    .map((g, b) => {
      const claim = assigned.get(b);
      const tier = claim ? predictions[claim.p].tier ?? null : null;
      return { tier, correct: g.verdict !== "MISS", grade: (g.verdict === "MISS" ? "MISS" : g.verdict) as Grade };
    })
    .filter((c) => c.tier !== null);

  return {
    twoAxis: true,
    points,
    maxPoints,
    percent,
    roundPoints: hits + nears * 0.5,
    roundMax: buckets.length,
    grades,
    calibration,
    summary: { hits, nears, misses },
  };
}
