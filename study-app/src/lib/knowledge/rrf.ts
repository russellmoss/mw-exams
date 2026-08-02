// Reciprocal Rank Fusion. Ported from the Wine-inventory knowledge stack (plan 079) essentially
// unchanged — it is pure and had no Prisma dependency.
//
// Combines N ranked lists into one, rewarding a chunk that ranks well in ANY of them, without having
// to reconcile their incomparable score scales (cosine distance vs ts_rank). k=60 is the standard
// constant.
//
// WHY N LISTS AND NOT TWO. The source system fuses exactly two arms, dense and lexical. Ours fuses one
// dense arm plus ONE LEXICAL ARM PER CORPUS LANGUAGE, because a single tsquery cannot span text-search
// configurations — see retrieve.ts. rrfFuse already took an array, so this needed no change; the
// generalisation was free.

export interface FusedResult {
  id: string;
  score: number;
}

export function rrfFuse(rankedLists: string[][], k = 60): FusedResult[] {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

/** Min-max normalize fused scores into [0,1] so they're comparable to cosine similarity in MMR. */
export function normalizeScores(results: FusedResult[]): Map<string, number> {
  if (results.length === 0) return new Map();
  const scores = results.map((r) => r.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  return new Map(results.map((r) => [r.id, (r.score - min) / span]));
}
