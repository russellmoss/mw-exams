import { neon } from "@neondatabase/serverless";

/**
 * THE WINES AN EXAMINER HAS ALREADY APPROVED, as a generation input.
 *
 * WHY THIS EXISTS. Wine selection is the dominant defect in the generated bank, and it is not a
 * distributional one. Measured against the 160 real past papers, the bank already matches the exam on
 * Old/New World mix (P1 64/36 vs 63/37), is MORE anchored than the exam (P1 four-wine flights with no
 * anchor: 0% against the exam's 7%), and its most-concentrated variety×region sits at 1.74% of slots
 * against the corpus's own maximum of 3.1%. Repetition does not explain it either: a repeated region
 * inside the reviewer's last five cards moved his reject rate from 39.2% to 39.8%.
 *
 * What he actually rejects is wine KNOWLEDGE — "Rolle from Provence, labelled as a banker it is not",
 * "Mas Jullien Blanc does not have Chardonnay in it", "Rully is a pretty obscure region within
 * Burgundy", "Australia isn't really known for Chenin Blanc". Fifteen rules written from individual
 * rejections produced no measurable improvement (reject rate 34% → 42% across 497 votes), because each
 * one over-fits: the anchor rule ended up rejecting 13.1% of real past-paper flights.
 *
 * You cannot enumerate a Master of Wine's palate as prohibitions. But you can reuse his verdicts. A
 * wine inside a flight he up-voted is a wine an examiner looked at in exam context and accepted — it
 * exists, it is correctly classified, it is not obscure, and it suits its role, because he said so.
 * 861 such wines already exist in the vote table, and every future up-vote adds more.
 *
 * WHAT THIS IS NOT. It is not a blocklist of the wines in DOWN-voted flights. Measured: only 1.5% of
 * those wines (9 of 593) are named in the reviewer's note. The rest are bystanders in a flight
 * rejected for its marks, its stem, or one bad bottle among four — condemning them would discard
 * mostly-innocent wines on guilt by association. Only a wine he NAMED is treated as rejected.
 */

export interface ApprovedWine {
  label: string;
  /** How many distinct up-voted questions this wine has appeared in. Higher = more corroborated. */
  endorsements: number;
}

export interface WinePool {
  paper: number;
  wines: ApprovedWine[];
  /** Wines the reviewer named in a rejection. Small by construction — see the note above. */
  rejected: string[];
}

// Short cache: generation can fire several times a minute and the pool moves only when someone votes.
const TTL_MS = 60_000;
const cache = new Map<number, { at: number; pool: WinePool }>();

export function invalidateWinePoolCache(): void {
  cache.clear();
}

/**
 * The approved pool for one paper, newest-corroborated first.
 *
 * Scoped BY PAPER because a wine's suitability is paper-specific: a sweet Tokaji approved in a Paper 3
 * flight is not thereby approved for Paper 1. Coverage as at 2026-08-09 — P1 428, P2 325, P3 138. P3
 * is thin by style (sparkling 30, sweet 36, fortified 29, still 38) and its ROSÉ pool is 5, which is
 * why callers must treat this as a strong preference and not a closed universe: a four-wine rosé
 * flight drawn from five wines would repeat immediately, which is the reviewer's other complaint.
 */
export async function getApprovedWinePool(paper: number): Promise<WinePool> {
  const hit = cache.get(paper);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.pool;

  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`
    SELECT btrim(w->>'fullText') AS label, COUNT(DISTINCT qr.question_id)::int AS endorsements
    FROM question_reviews qr
    JOIN generated_questions g ON g.question_id = qr.question_id,
    LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(g.wines::jsonb) = 'array' THEN g.wines::jsonb ELSE '[]'::jsonb END
    ) w
    WHERE qr.verdict = 'up' AND g.paper = ${paper}
      AND length(btrim(w->>'fullText')) > 12
    GROUP BY 1
    ORDER BY endorsements DESC, label
  `) as { label: string; endorsements: number }[];

  // The named-rejection list. `position(producer in note) > 0` is the same test the coverage check
  // used: the reviewer wrote the producer's name, so the objection is to THIS wine rather than to the
  // flight around it.
  const rejected = (await sql`
    SELECT DISTINCT btrim(w->>'fullText') AS label
    FROM question_reviews qr
    JOIN generated_questions g ON g.question_id = qr.question_id,
    LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(g.wines::jsonb) = 'array' THEN g.wines::jsonb ELSE '[]'::jsonb END
    ) w
    WHERE qr.verdict = 'down' AND g.paper = ${paper}
      AND length(coalesce(qr.reason_note, '')) > 20
      AND length(btrim(split_part(w->>'fullText', ',', 1))) > 3
      AND position(lower(btrim(split_part(w->>'fullText', ',', 1))) in lower(qr.reason_note)) > 0
  `) as { label: string }[];

  const rejectedSet = new Set(rejected.map((r) => r.label.toLowerCase()));
  const pool: WinePool = {
    paper,
    // A wine he named in a rejection is out, even if some other flight carrying it was approved —
    // the explicit verdict beats the implicit one.
    wines: rows.filter((r) => !rejectedSet.has(r.label.toLowerCase())),
    rejected: rejected.map((r) => r.label),
  };
  cache.set(paper, { at: Date.now(), pool });
  return pool;
}

/**
 * The prompt block. Appended to the generation system prompt the same way the producer exclusion is.
 *
 * PREFERENCE, NOT A CLOSED SET, and the wording matters. The pool cannot always satisfy a stem: a
 * "same single grape variety" flight over four countries needs four wines of one grape, and P3's rosé
 * pool holds five wines in total. Forbidding anything outside the pool would make those unsatisfiable
 * — the failure mode that deleted hist_2023_p3_q1 when an anchor rule could not be met. So the model
 * is told to prefer these and why, and told plainly what to do when they do not fit.
 *
 * `limit` keeps the block inside a sensible share of the prompt; the pool is ordered by corroboration,
 * so the truncation keeps the best-attested wines.
 */
export function buildApprovedPoolBlock(pool: WinePool, limit = 160): string {
  if (pool.wines.length === 0) return "";
  const listed = pool.wines.slice(0, limit);
  const lines = listed.map((w) => `- ${w.label}`).join("\n");
  const rejectedBlock = pool.rejected.length
    ? `\n\nNEVER use these — the reviewer rejected them BY NAME:\n${pool.rejected.map((r) => `- ${r}`).join("\n")}`
    : "";
  return `

## WINES AN EXAMINER HAS ALREADY APPROVED (prefer these)

Every wine below appeared in a Paper ${pool.paper} question that a Master of Wine reviewed and passed.
They are known to be real, correctly classified, appropriately well-known, and plausible in an exam
flight — which is exactly the judgement the generator keeps getting wrong. Reviewer rejections of
generated flights run at roughly 36-42%, and the reasons are wine knowledge ("Rolle from Provence,
labelled as a banker it is not"; "Mas Jullien Blanc does not have Chardonnay in it"; "Rully is a
pretty obscure region within Burgundy"), not question structure.

BUILD THE FLIGHT FROM THIS LIST WHERE YOU CAN. Reach outside it only when the stem cannot be satisfied
from it — a variety, origin or style the list does not cover — and when you do, choose a wine of the
same calibre: a real, currently-produced bottling from a producer a well-prepared MW candidate would
recognise, in a region genuinely classic for that style. Do not pad a flight with an outside wine
merely for variety.

${lines}${listed.length < pool.wines.length ? `\n(and ${pool.wines.length - listed.length} more approved wines not listed)` : ""}${rejectedBlock}
`;
}
