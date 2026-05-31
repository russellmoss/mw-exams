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
  weissburgunder: "pinot blanc",
  alvarinho: "albarino",
  garnacha: "grenache",
  "garnacha tinta": "grenache",
  carinena: "carignan",
  mazuelo: "carignan",
  "tinta de toro": "tempranillo",
  "tinto fino": "tempranillo",
  spanna: "nebbiolo",
  mataro: "mourvedre",
  primitivo: "zinfandel",
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
