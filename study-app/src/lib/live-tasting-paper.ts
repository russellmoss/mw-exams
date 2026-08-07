/**
 * Live Tasting full-paper composition sampler (Phase D, migration 046).
 *
 * Samples a corpus-realistic paper: NO user family choice — the family mix and flight-size
 * patterns below are DERIVED FROM THE REAL EXAM CORPUS (the 112-question taxonomy in
 * outputs/taxonomy_tags + data/exams.json, measured 2026-08-06):
 *
 *   Family share by paper (n=55/55/52 questions):
 *     P1: F1 .31  F2 .25  F4 .25  F3 .07  F7 .07  F5 .04
 *     P2: F4 .40  F2 .29  F1 .24  F3 .04  F7 .04
 *     P3: F4 .33  F5 .19  F2 .17  F6 .15  F1 .08  F7 .08
 *
 *   Real paper shapes (wines per question) cluster on 2-4-wine flights: 4+4+4, 4+3+3+2,
 *   2+2+2+2+4, 3+3+4+2, 6+3+3 … Patterns here keep the 12-wine total (6 for half papers) and
 *   restrict flights to the 2-4 range Live Tasting generation is validated for.
 *
 * Pure and deterministic-given-rng — unit-testable; the paper engine consumes the plan.
 */

export type PaperComposition = {
  position: number;        // Q1..Qn
  family: string;          // F1..F7 (the corpus taxonomy)
  flightSize: number;      // 2-4
  perBottleBudget: number | null;
};

const FAMILY_WEIGHTS: Record<number, [string, number][]> = {
  1: [["F1", 31], ["F2", 25], ["F4", 25], ["F3", 7], ["F7", 7], ["F5", 4]],
  2: [["F4", 40], ["F2", 29], ["F1", 24], ["F3", 4], ["F7", 4]],
  3: [["F4", 33], ["F5", 19], ["F2", 17], ["F6", 15], ["F1", 8], ["F7", 8]],
};

// 12-wine (full) and 6-wine (half) splits, from the corpus shapes, flights clamped to 2-4.
const FULL_PATTERNS: number[][] = [
  [4, 4, 4],
  [4, 3, 3, 2],
  [2, 2, 2, 2, 4],
  [3, 3, 4, 2],
  [2, 3, 3, 4],
  [3, 4, 3, 2],
];
const HALF_PATTERNS: number[][] = [
  [3, 3],
  [4, 2],
  [2, 2, 2],
  [2, 4],
];

export function samplePaperComposition(opts: {
  paper: number;
  size: "half" | "full";
  totalBudget: number | null;
  rng?: () => number;
}): PaperComposition[] {
  const { paper, size, totalBudget } = opts;
  const rng = opts.rng ?? Math.random;

  // Real wines-per-question, 2022-24 (data/exams.json): P1 [2,3,3,4,4,4,4,6,3,3] — 3-4 dominant,
  // a single 2-wine question in three years; P2 [4,2,2,2,2,4,4,4,3,4,5] and P3 [4,5,3,4,3,2,3,2,2,3,5]
  // — 2-wine questions are common. So an all-2s half paper is plausible on P2/P3 but not on P1.
  const patterns =
    size === "full"
      ? FULL_PATTERNS
      : paper === 1
        ? HALF_PATTERNS.filter((p) => p.some((n) => n >= 3))
        : HALF_PATTERNS;
  const pattern = patterns[Math.floor(rng() * patterns.length)];

  // Weighted family draw per flight, without letting any family exceed 2 slots and — matching
  // every real P1/P2 in the corpus — guaranteeing at least one comparative anchor (F1 or F2).
  const weights = FAMILY_WEIGHTS[paper] ?? FAMILY_WEIGHTS[1];
  const drawn: string[] = [];
  // Half papers (2-3 flights) additionally require DISTINCT families: paper-QA round 5 drew
  // F4 twice for a 2-flight half and the examiner judge called the result "an implausibly
  // narrow thematic pairing". With so few flights, a repeat family wastes half the paper's
  // question-type coverage; full papers keep the corpus cap of 2.
  const famCap = pattern.length <= 3 ? 1 : 2;
  const draw = (): string => {
    const pool = weights.filter(([f]) => drawn.filter((d) => d === f).length < famCap);
    const total = pool.reduce((s, [, w]) => s + w, 0);
    let roll = rng() * total;
    for (const [f, w] of pool) {
      roll -= w;
      if (roll <= 0) return f;
    }
    return pool[pool.length - 1][0];
  };
  for (let i = 0; i < pattern.length; i++) drawn.push(draw());
  if (paper !== 3 && !drawn.some((f) => f === "F1" || f === "F2")) {
    drawn[0] = rng() < 0.55 ? "F1" : "F2";
  }

  // Total-budget allocation, mirroring how real papers spread price points: one flight carries
  // the paper's premium moment (1.4x per-bottle), the rest sit slightly under base. 10% of the
  // budget is held back as slack for real-shelf prices vs estimates.
  const totalWines = pattern.reduce((a, b) => a + b, 0);
  const premiumIdx = Math.floor(rng() * pattern.length);
  let budgets: (number | null)[] = pattern.map(() => null);
  if (totalBudget && totalBudget > 0) {
    const base = (totalBudget * 0.9) / totalWines;
    budgets = pattern.map((_, i) =>
      Math.max(10, Math.round(i === premiumIdx ? base * 1.4 : base * 0.9))
    );
  }

  return pattern.map((flightSize, i) => ({
    position: i + 1,
    family: drawn[i],
    flightSize,
    perBottleBudget: budgets[i],
  }));
}

/** Real-exam pacing: ~12 minutes per wine (2h15 ≈ 12 wines). Half papers pro-rate. */
export function examDurationMinutes(size: "half" | "full"): number {
  return size === "full" ? 135 : 68;
}

/**
 * The composition's corpus-validity contract, used by the paper QA loop AND unit tests:
 * total wines, flight bounds, family caps, anchor rule.
 */
export function validateComposition(
  comp: PaperComposition[],
  paper: number,
  size: "half" | "full"
): string[] {
  const problems: string[] = [];
  const total = comp.reduce((s, c) => s + c.flightSize, 0);
  if (total !== (size === "full" ? 12 : 6)) problems.push(`total wines ${total} != ${size === "full" ? 12 : 6}`);
  for (const c of comp) {
    if (c.flightSize < 2 || c.flightSize > 4) problems.push(`Q${c.position}: flight size ${c.flightSize} outside 2-4`);
    if (!/^F[1-7]$/.test(c.family)) problems.push(`Q${c.position}: bad family ${c.family}`);
  }
  const fams = comp.map((c) => c.family);
  for (const f of new Set(fams)) {
    if (fams.filter((x) => x === f).length > 2) problems.push(`family ${f} appears ${fams.filter((x) => x === f).length}x (cap 2)`);
  }
  if (paper !== 3 && !fams.some((f) => f === "F1" || f === "F2")) {
    problems.push("no comparative anchor (F1/F2) in a P1/P2 paper");
  }
  const validFams = new Set((FAMILY_WEIGHTS[paper] ?? []).map(([f]) => f));
  for (const f of fams) {
    if (!validFams.has(f)) problems.push(`family ${f} never appears in real P${paper} papers`);
  }
  return problems;
}
