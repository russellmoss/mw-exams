import { neon } from "@neondatabase/serverless";
import { BUNDLED_TASTING_LEXICON, type TastingLexicon } from "./prompts/tasting-lexicon";
import { classifyP3Category, classifyWineStyle } from "./p3-category.mjs";
import { detectPrimaryVariety } from "./question-rules.mjs";
import {
  deriveQuestionType,
  deriveCurveball,
  deriveFlightPriceBand,
  deriveFlightSize,
} from "./bank-health/derive";
import {
  extractFlightProducers,
  producerStatus,
  buildExclusionList,
  type ProducerFlag,
} from "./bank-health/producer";
import { getAppVersion } from "./app-version";
import { DEFAULT_PACE_PREFERENCE, isPaceMode, isSpeedSeconds, type PaceData, type PacePreference } from "./pace";

function getDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return sql;
}

export interface GeneratedQuestion {
  id: number;
  question_id: string;
  paper: number;
  family: string;
  family_label: string;
  subcategory: string | null;
  question_text: string;
  // Stem Detail variants (migration 013). NULL until backfilled lazily by /api/get-question;
  // question_text is the canonical fallback for any that is null.
  stem_guided: string | null;
  stem_exam_real: string | null;
  wines: { slot: number; fullText: string; appearance?: string }[];
  total_marks: number;
  // Paper 3 style family (migration 015): sparkling|sweet|fortified|oxidative|rose|other. NULL for
  // Papers 1/2 and for any P3 row not yet backfilled. Server-only — the serve layer strips it from
  // every payload (see sanitizeQuestionMetadata) so the candidate never sees it.
  p3_category: string | null;
  model_answer: string | null;
  proposed_annotation: string | null;
  reasoning_trace: string | null;
  study_diagram_assist: string | null;
  metadata: Record<string, unknown>;
  wine_profiles: Record<string, unknown>;
  created_at: string;
  // Bank review gate (migration 022). 'approved' is the default and the only status ever served to a
  // candidate; 'pending' awaits admin review; 'rejected' was binned. batch_id links a bulk-generated
  // row to its bank_batches run.
  status: string;
  batch_id: string | null;
  reviewed_at: string | null;
  reviewed_by: number | null;
  // Unreviewed Queue (migration 040): the per-item review decision, independent of any batch.
  // 'unreviewed' (default — every fresh generation) until an admin keeps or bins it; then 'kept' /
  // 'binned'. This is what the standing Unreviewed Queue on /admin/bank-health filters on.
  review_status: string;
  // Flag Question (migration 037): true when a candidate flagged the item and it was withdrawn back to
  // the pending review gate. Drives the "Flagged by candidate" tag + top-of-queue sort. false otherwise.
  flagged_by_candidate?: boolean;
  // Batch Undo (migration 033). auto_kept = reached 'kept' without an admin ever reviewing it (the
  // "Never reviewed" state); an explicit admin keep sets reviewed_by and auto_kept=false. served_count
  // / first_served_at track candidate serves so the reopen path can leave already-served items kept.
  auto_kept: boolean;
  served_count: number;
  first_served_at: string | null;
  // Producer Spread (migration 032). The over-used-producer flags computed when the item landed in the
  // pending-review queue: [{producer_display, appearance_number, paper}]. NULL for servable rows and for
  // any pending item whose producers were all within their normal share.
  producer_flags: ProducerFlag[] | null;
  // Exam Mix (migration 034). The generator-emitted category + curveball tags used by the invisible
  // composition-balancing layer. NULL for every pre-feature row and for any item the accept-anyway
  // fallback deliberately excludes from the mix counters. Server-only — stripped from served payloads.
  wine_category: string | null;
  curveball_level: string | null;
  // Length Check (migration 035). 'clean' | 'trimmed' | 'over', or NULL for a pre-feature / unchecked
  // row (read as 'clean', no badge). length_check holds the audit + before/after diff for the admin
  // review panel; NULL unless the item was checked and needed attention.
  length_check_status: string | null;
  length_check: Record<string, unknown> | null;
  // Answer Length (migration 039). The model-ANSWER counterpart of the stem's length check:
  // 'clean' | 'corrected' | 'over' | 'under', or NULL for a pre-feature / unmeasured row (read as
  // 'clean'). answer_word_count is the body words measured in code — the only count to trust, since
  // the model's own `actual_word_count` self-report was fabricated on ~half the corpus.
  answer_length_status: string | null;
  answer_word_count: number | null;
  answer_length: Record<string, unknown> | null;
}

export interface UserAttempt {
  id: number;
  question_id: string;
  pre_glass_reasoning: string | null;
  pre_glass_feedback: string | null;
  tasting_notes: string[] | null;
  user_answer: string | null;
  answer_feedback: string | null;
  pass_estimate: "pass" | "fail" | "borderline" | null;
  marks_estimate: string | null;
  started_at: string;
  completed_at: string | null;
  user_feedback: string | null;
  feedback_submitted_at: string | null;
  feedback_status: string | null;
  feedback_admin_note: string | null;
  feedback_reviewed_at: string | null;
  // Who made the accept/reject decision: 'auto' (Auto-Apply pipeline) or 'manual' (admin).
  feedback_decided_by: string | null;
  // Set once feedback analysis has been kicked off (links to feedback_analyses.id). NULL means
  // the feedback was never analyzed — the "stranded" set the sweeper looks for.
  auto_analysis_id: number | null;
  // Flash Notes (mode = 'flash') per-card / per-deck metadata (migration 011). NULL for every
  // other mode.
  prompt_type: string | null;
  flight_wine_count: number | null;
  deck_id: string | null;
  card_index: number | null;
  deck_settings: Record<string, unknown> | null;
  // Stem Detail (migration 013): the level the attempt was STARTED at, and the level it ENDED at if
  // "Add detail" was used (NULL if never escalated).
  stem_detail: string;
  stem_detail_escalated_to: string | null;
  // Pace (migration 021): per-attempt pace report for 'full' / 'known-wine' attempts. NULL for
  // every other mode and for attempts predating the column.
  pace: PaceData | null;
  // Short git sha of the build that served this attempt (migration 019). NULL for local dev and for
  // attempts predating the column. Lets a bug report be pinned to the exact code that produced it.
  app_version: string | null;
}

// Persist derived Stem Detail variants for a question. COALESCE keeps any level that already has a
// stored value, so a concurrent/partial backfill can only ever fill blanks (never overwrite).
export async function updateStemVariants(
  questionId: string,
  variants: { guided?: string | null; exam_real?: string | null }
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE generated_questions SET
      stem_guided    = COALESCE(stem_guided,    ${variants.guided ?? null}),
      stem_exam_real = COALESCE(stem_exam_real, ${variants.exam_real ?? null})
    WHERE question_id = ${questionId}
  `;
}

// Fetch a single question by id. Used by the out-of-band Stem Detail backfill endpoint, which is
// handed only a question_id by the client.
export async function getQuestionById(questionId: string): Promise<GeneratedQuestion | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM generated_questions WHERE question_id = ${questionId} LIMIT 1`;
  return (rows[0] as GeneratedQuestion) ?? null;
}

export async function getUserStemDetailDefault(userId: number): Promise<string> {
  const sql = getDb();
  const rows = await sql`SELECT stem_detail_default FROM users WHERE id = ${userId}`;
  const v = rows[0]?.stem_detail_default;
  // Coerce any legacy/unknown value (including the retired 'blind') to the exam-real default.
  return v === "guided" || v === "exam_real" ? v : "exam_real";
}

export async function setUserStemDetailDefault(userId: number, level: string): Promise<void> {
  const sql = getDb();
  await sql`UPDATE users SET stem_detail_default = ${level} WHERE id = ${userId}`;
}

// Pace (migration 021): per-user default pace + Speed Notes length. Falls back to the system
// default (Exam Pace / 8 min) for legacy rows or unrecognised values.
export async function getUserPacePreference(userId: number): Promise<PacePreference> {
  const sql = getDb();
  const rows = await sql`SELECT pace_default, pace_speed_seconds FROM users WHERE id = ${userId}`;
  const pace = rows[0]?.pace_default;
  const speed = Number(rows[0]?.pace_speed_seconds);
  return {
    pace: isPaceMode(pace) ? pace : DEFAULT_PACE_PREFERENCE.pace,
    speedSeconds: isSpeedSeconds(speed) ? speed : DEFAULT_PACE_PREFERENCE.speedSeconds,
  };
}

export async function setUserPacePreference(userId: number, pref: PacePreference): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE users SET pace_default = ${pref.pace}, pace_speed_seconds = ${pref.speedSeconds}
    WHERE id = ${userId}
  `;
}

// Live Tasting market prefs (migration 041): where the user shops and their per-bottle budget.
// Currency whitelist is enforced app-side (the route), not by a DB CHECK.
export type LiveTastingPrefs = {
  city: string | null;
  country: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  radiusMinutes: number | null;
};

export async function getUserLiveTastingPrefs(userId: number): Promise<LiveTastingPrefs> {
  const sql = getDb();
  const rows = await sql`
    SELECT live_city, live_country, live_budget_amount, live_budget_currency, live_radius_minutes
    FROM users WHERE id = ${userId}
  `;
  const r = rows[0];
  const amount = r?.live_budget_amount != null ? Number(r.live_budget_amount) : null;
  const radius = r?.live_radius_minutes != null ? Number(r.live_radius_minutes) : null;
  return {
    city: r?.live_city ?? null,
    country: r?.live_country ?? null,
    budgetAmount: Number.isFinite(amount as number) && (amount as number) > 0 ? amount : null,
    budgetCurrency: r?.live_budget_currency ?? null,
    radiusMinutes: Number.isFinite(radius as number) && (radius as number) > 0 ? radius : null,
  };
}

export async function setUserLiveTastingPrefs(userId: number, prefs: LiveTastingPrefs): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE users SET
      live_city = ${prefs.city},
      live_country = ${prefs.country},
      live_budget_amount = ${prefs.budgetAmount},
      live_budget_currency = ${prefs.budgetCurrency},
      live_radius_minutes = ${prefs.radiusMinutes}
    WHERE id = ${userId}
  `;
}

export async function saveGeneratedQuestion(q: {
  questionId: string;
  paper: number;
  family: string;
  familyLabel: string;
  subcategory?: string;
  questionText: string;
  wines: { slot: number; fullText: string; appearance?: string }[];
  totalMarks: number;
  modelAnswer?: string;
  proposedAnnotation?: string;
  reasoningTrace?: string;
  studyDiagramAssist?: string;
  metadata?: Record<string, unknown>;
  // Who generated it (migration 020). Global pool — this is provenance only, never a serve filter.
  createdByUserId?: number | null;
  // Bank review gate (migration 022). Omitted → DB default 'approved' (the on-the-fly study path is
  // pre-validated and served immediately). The Fill-the-Bank worker passes 'pending' + a batchId so
  // the row is held out of every candidate-facing read until an admin approves it. The ON CONFLICT
  // path deliberately never touches status/batch_id, so a background model-answer re-save can't flip
  // a pending question live.
  status?: string;
  batchId?: string | null;
  // Exam Mix (migration 034). The generator-emitted category + curveball tags, written verbatim at
  // insert. Passed only by the bank-generation path; omitted (→ NULL) everywhere else and on the
  // accept-anyway fallback that deliberately excludes an item from the mix counters.
  wineCategory?: string | null;
  curveballLevel?: string | null;
  // Live Tasting (migration 041): 'live-tasting' rows belong to one user's session and are
  // excluded from every pool query (which all filter scope='pool'). Omitted → 'pool'.
  scope?: string;
}): Promise<GeneratedQuestion> {
  const sql = getDb();
  // Tag Paper 3 questions with their style family at insert (pure code, no LLM) so the weighted
  // sampler can serve them on-mix from the moment they land in the bank. Papers 1/2 stay NULL.
  const p3Category = q.paper === 3 ? classifyP3Category(q.wines) : null;
  // Bank Health slicing dimensions (migration 026), stamped at write time so the SQL GROUP BY slices
  // stay accurate for every new row. Re-derived here from the exact stem/wines/metadata being stored,
  // using the same logic migration 026 used to backfill the historical rows.
  const questionType = deriveQuestionType(q.questionText);
  const curveball = deriveCurveball(q.metadata);
  const priceBand = deriveFlightPriceBand(q.wines);
  const flightSize = deriveFlightSize(q.wines);
  // Producer Spread review flag (migration 032). Computed ONLY for a fresh pending item, against the
  // producer tally as of insert time; a servable/approved study-path row carries no flag. The ON
  // CONFLICT re-save (background model answer) never recomputes it, so the flag from first insert holds.
  const producerFlags = q.status === "pending" ? await computeProducerFlags(q.paper, q.wines) : null;
  const rows = await sql`
    INSERT INTO generated_questions (
      question_id, paper, family, family_label, subcategory,
      question_text, wines, total_marks, p3_category,
      model_answer, proposed_annotation, reasoning_trace, study_diagram_assist,
      metadata, created_by_user_id, status, batch_id, review_state,
      question_type, curveball, price_band, flight_size, producer_flags,
      wine_category, curveball_level, scope
    ) VALUES (
      ${q.questionId}, ${q.paper}, ${q.family}, ${q.familyLabel}, ${q.subcategory || null},
      ${q.questionText}, ${JSON.stringify(q.wines)}, ${q.totalMarks}, ${p3Category},
      ${q.modelAnswer || null}, ${q.proposedAnnotation || null},
      ${q.reasoningTrace || null}, ${q.studyDiagramAssist || null},
      ${JSON.stringify(q.metadata || {})}, ${q.createdByUserId ?? null},
      ${q.status ?? "approved"}, ${q.batchId ?? null},
      ${q.status === "pending" ? "pending" : q.status === "rejected" ? "binned" : "kept"},
      ${questionType}, ${curveball}, ${priceBand}, ${flightSize},
      ${producerFlags && producerFlags.length > 0 ? JSON.stringify(producerFlags) : null}::jsonb,
      ${q.wineCategory ?? null}, ${q.curveballLevel ?? null}, ${q.scope ?? "pool"}
    )
    ON CONFLICT (question_id) DO UPDATE SET
      -- Keep an existing tag; only fill it if the row predates classification (COALESCE keeps the
      -- stored value when EXCLUDED is NULL, e.g. the background model-answer re-save).
      p3_category = COALESCE(generated_questions.p3_category, EXCLUDED.p3_category),
      -- Exam Mix tags (migration 034): keep the value from first insert; only fill from EXCLUDED when
      -- the row predates it, so a background model-answer re-save never clears them.
      wine_category = COALESCE(generated_questions.wine_category, EXCLUDED.wine_category),
      curveball_level = COALESCE(generated_questions.curveball_level, EXCLUDED.curveball_level),
      model_answer = COALESCE(EXCLUDED.model_answer, generated_questions.model_answer),
      proposed_annotation = COALESCE(EXCLUDED.proposed_annotation, generated_questions.proposed_annotation),
      reasoning_trace = COALESCE(EXCLUDED.reasoning_trace, generated_questions.reasoning_trace),
      study_diagram_assist = COALESCE(EXCLUDED.study_diagram_assist, generated_questions.study_diagram_assist)
    RETURNING *
  `;
  // Producer Spread derived table (migration 032): keep bank_wine_producer in step with this item's
  // wines. Delete-then-insert so a re-save (background model answer, or an edited flight) never leaves
  // stale producer rows behind. Best-effort — a tally hiccup must never fail a save.
  try {
    await syncProducerRowsForItem(q.questionId, q.paper, q.wines);
  } catch (err) {
    console.error(`[producer-spread] failed to sync producer rows for ${q.questionId}:`, err);
  }
  return rows[0] as GeneratedQuestion;
}

// Length Check (migration 035). Stamp the length-check verdict on a question AFTER it has been saved,
// and — when the auto-repair rewrote the stem ('trimmed') — persist the trimmed question_text too. The
// mark total is invariant by construction (the repair may only split a bullet into parts whose marks
// sum to the original), so total_marks is never touched here. Called only on the bank-generation path,
// and only when the check produced a non-clean verdict; a 'clean' item is left with NULL columns (read
// as no-badge). Best-effort at the call site — a length-check hiccup must never fail a saved question.
export async function applyLengthCheck(
  questionId: string,
  params: { status: string; lengthCheck: Record<string, unknown> | null; questionText?: string | null }
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE generated_questions SET
      length_check_status = ${params.status},
      length_check        = ${params.lengthCheck ? JSON.stringify(params.lengthCheck) : null}::jsonb,
      question_text       = COALESCE(${params.questionText ?? null}, question_text)
    WHERE question_id = ${questionId}
  `;
}

// Answer Length (migration 039). Stamp the measured word count + verdict on a question AFTER its
// model answer has been saved. Mirrors applyLengthCheck above, with one difference: the count is
// stamped on EVERY measured answer, not only the off-budget ones, because the count is the datum the
// offline repair selector filters on and a distribution query wants every row. The status/JSONB are
// still NULL for a clean answer (read as no badge). Best-effort at the call site — a measurement
// hiccup must never fail a saved answer.
export async function applyAnswerLength(
  questionId: string,
  params: { status: string; wordCount: number; answerLength: Record<string, unknown> | null }
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE generated_questions SET
      answer_length_status = ${params.status},
      answer_word_count    = ${params.wordCount},
      answer_length        = ${params.answerLength ? JSON.stringify(params.answerLength) : null}::jsonb
    WHERE question_id = ${questionId}
  `;
}

// ── Producer Spread tally (migration 032) ────────────────────────────────────────────────────────
//
// bank_wine_producer holds one row per banked wine, keyed on a normalised producer string. It is
// written here on every insert and backfilled once by migration 032. Every READ joins back to
// generated_questions and applies the SAME servable gate the rest of Bank Health uses, so a pending or
// binned item's rows never leak into the counts.

// Replace this item's derived producer rows with the current flight's. A wine whose descriptor yields
// no usable producer contributes no row (see extractFlightProducers).
export async function syncProducerRowsForItem(
  itemId: string,
  paper: number,
  wines: unknown
): Promise<void> {
  const sql = getDb();
  const producers = extractFlightProducers(wines);
  await sql`DELETE FROM bank_wine_producer WHERE item_id = ${itemId}`;
  for (const p of producers) {
    await sql`
      INSERT INTO bank_wine_producer (item_id, slot, paper, producer_key, producer_display, region, country)
      VALUES (${itemId}, ${p.slot}, ${paper}, ${p.key}, ${p.display}, ${p.region}, ${p.country})
      ON CONFLICT (item_id, slot) DO UPDATE SET
        paper = EXCLUDED.paper,
        producer_key = EXCLUDED.producer_key,
        producer_display = EXCLUDED.producer_display,
        region = EXCLUDED.region,
        country = EXCLUDED.country
    `;
  }
}

// The servable producer counts for a paper, plus the paper's total banked-wine count — the denominator
// for producer share. Excludes the item being inserted (it has no rows yet), so it is the tally "as of
// insert time" the review flag is judged against.
async function getProducerBaseCounts(
  paper: number
): Promise<{ counts: Map<string, number>; total: number }> {
  const sql = getDb();
  const rows = (await sql`
    SELECT bwp.producer_key AS key, COUNT(*)::int AS count
    FROM bank_wine_producer bwp
    JOIN generated_questions g ON g.question_id = bwp.item_id
    WHERE bwp.paper = ${paper}
      AND g.review_state = 'kept'
      AND g.invalid_reasons IS NULL
      AND g.is_retired IS NOT TRUE
      AND g.scope = 'pool'
    GROUP BY bwp.producer_key
  `) as { key: string; count: number }[];
  const counts = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    counts.set(r.key, r.count);
    total += r.count;
  }
  return { counts, total };
}

// The over-used-producer flags for a fresh pending flight, judged against the tally as of insert time.
// One entry per over-used producer (deduped by key, keeping the highest appearance number).
export async function computeProducerFlags(paper: number, wines: unknown): Promise<ProducerFlag[]> {
  const producers = extractFlightProducers(wines);
  if (producers.length === 0) return [];
  const { counts, total } = await getProducerBaseCounts(paper);
  const running = new Map<string, number>();
  const flagsByKey = new Map<string, ProducerFlag>();
  let added = 0;
  for (const p of producers) {
    added++;
    const prev = running.get(p.key) ?? 0;
    running.set(p.key, prev + 1);
    const appearance = (counts.get(p.key) ?? 0) + prev + 1;
    const denom = total + added;
    const share = denom > 0 ? appearance / denom : 0;
    if (producerStatus(appearance, share) === "over-used") {
      const existing = flagsByKey.get(p.key);
      if (!existing || appearance > existing.appearance_number) {
        flagsByKey.set(p.key, { producer_display: p.display, appearance_number: appearance, paper });
      }
    }
  }
  return [...flagsByKey.values()];
}

export interface ProducerTallyRow {
  producer_key: string;
  producer_display: string;
  region: string | null;
  country: string | null;
  count: number;
  share: number;
  status: "over-used" | "watch" | "ok";
}

export interface ProducerTally {
  total_wines: number;
  distinct_producers: number;
  widest_share: number;
  rows: ProducerTallyRow[];
}

// The full producer tally for a paper (or all papers), sorted by count desc. Display / region / country
// take the most frequent raw spelling per key (spec). status/share are computed in TS from the config.
//
// includeRetiredEvidence: count kept rows even when retired or quarantined. The default (false) is
// the SERVABLE tally the review pane and Producer Spread endpoint show. The generation exclusion
// passes true, because retirement must not erase the evidence of over-use: retiring a producer's
// questions (the 2026-08-05 Weinbach/Seppeltsfield sweep) zeroes the servable tally, and a ban
// derived from it would disarm itself at exactly the moment the over-use was confirmed.
export async function getProducerTally(
  paper: number | "all",
  opts?: { includeRetiredEvidence?: boolean }
): Promise<ProducerTally> {
  const sql = getDb();
  const paperArg = paper === "all" ? null : paper;
  const includeRetired = opts?.includeRetiredEvidence === true;
  const rows = (await sql`
    SELECT bwp.producer_key AS producer_key,
           COUNT(*)::int AS count,
           mode() WITHIN GROUP (ORDER BY bwp.producer_display) AS producer_display,
           mode() WITHIN GROUP (ORDER BY bwp.region)  AS region,
           mode() WITHIN GROUP (ORDER BY bwp.country) AS country
    FROM bank_wine_producer bwp
    JOIN generated_questions g ON g.question_id = bwp.item_id
    WHERE g.review_state = 'kept'
      AND g.scope = 'pool'
      AND (${includeRetired}::bool OR (g.invalid_reasons IS NULL AND g.is_retired IS NOT TRUE))
      AND (${paperArg}::int IS NULL OR bwp.paper = ${paperArg})
    GROUP BY bwp.producer_key
    ORDER BY count DESC, producer_display ASC
  `) as { producer_key: string; count: number; producer_display: string; region: string | null; country: string | null }[];

  const total = rows.reduce((a, r) => a + r.count, 0);
  const widest = rows.length > 0 ? rows[0].count : 0;
  const tallyRows: ProducerTallyRow[] = rows.map((r) => {
    const share = total > 0 ? r.count / total : 0;
    return {
      producer_key: r.producer_key,
      producer_display: r.producer_display || r.producer_key,
      region: r.region,
      country: r.country,
      count: r.count,
      share,
      status: producerStatus(r.count, share),
    };
  });
  return {
    total_wines: total,
    distinct_producers: rows.length,
    widest_share: total > 0 ? widest / total : 0,
    rows: tallyRows,
  };
}

// Compact producer signal for the generation nudge: the paper's total banked wines + its heaviest
// producers by display name with counts. Returns the top `limit` producers, count desc.
export async function getProducerNudge(
  paper: number,
  limit: number
): Promise<{ totalWines: number; top: { display: string; count: number }[] }> {
  const tally = await getProducerTally(paper);
  return {
    totalWines: tally.total_wines,
    top: tally.rows.slice(0, limit).map((r) => ({ display: r.producer_display, count: r.count })),
  };
}

// The producers generation must NOT use: the reviewer's standing bans (REVIEWER_EXCLUDED_PRODUCERS
// — always listed, immune to tally state) plus every producer 'over-used' for the paper by the same
// producerStatus thresholds the review pane's flags use, count desc, capped. The tally half counts
// retired/quarantined kept rows as evidence (includeRetiredEvidence) so a clean-up sweep cannot
// disarm a ban. Unlike getProducerNudge this is a HARD list: the prompt forbids these producers
// outright and validateProducerExclusion rejects any draft that names one.
export async function getOverusedProducers(
  paper: number,
  limit: number
): Promise<{ key: string; display: string }[]> {
  const tally = await getProducerTally(paper, { includeRetiredEvidence: true });
  return buildExclusionList(tally.rows, limit);
}

// Producers used in the last `limit` generated questions for a paper — the unconditional last-N
// exclusion window (question-engine PRODUCER_RECENT_WINDOW). Reads each question's wines JSON directly
// (not the bank_wine_producer tally) so a just-generated draft still blocks its producers before it is
// tallied; deduped on the normalised producer key, newest question first.
export async function getRecentProducerKeys(
  paper: number,
  limit = 10
): Promise<{ key: string; display: string }[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT wines FROM generated_questions
    WHERE paper = ${paper}
      AND scope = 'pool'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as { wines: unknown }[];
  const byKey = new Map<string, { key: string; display: string }>();
  for (const r of rows) {
    for (const p of extractFlightProducers(r.wines)) {
      if (!byKey.has(p.key)) byKey.set(p.key, { key: p.key, display: p.display });
    }
  }
  return [...byKey.values()];
}

// Wine descriptors for a paper's live (kept, pool, valid) questions, one string[] per question, newest
// first — feeds the generation-time niche wine-STYLE cap (detection + share/last-N logic run in
// question-engine so they stay DB-free and testable). Reads wines JSON directly.
export async function getPaperWineTextsByQuestion(paper: number): Promise<string[][]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT wines FROM generated_questions
    WHERE paper = ${paper}
      AND scope = 'pool'
      AND review_state = 'kept'
      AND invalid_reasons IS NULL
    ORDER BY created_at DESC
  `) as { wines: unknown }[];
  return rows.map((r) => {
    let list: { fullText?: string }[] = [];
    const w = r.wines;
    if (typeof w === "string") {
      try {
        const parsed = JSON.parse(w);
        if (Array.isArray(parsed)) list = parsed as { fullText?: string }[];
      } catch {
        list = [];
      }
    } else if (Array.isArray(w)) {
      list = w as { fullText?: string }[];
    }
    return list.map((x) => (typeof x?.fullText === "string" ? x.fullText : "")).filter(Boolean);
  });
}

// How many pending items awaiting review carry a producer flag (paper-scoped, or all papers). Feeds the
// Bank Health "N flagged items awaiting review" deep-link + count.
export async function getFlaggedPendingCount(paper: number | "all"): Promise<number> {
  const sql = getDb();
  const paperArg = paper === "all" ? null : paper;
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM generated_questions
    WHERE review_state = 'pending'
      AND producer_flags IS NOT NULL
      AND jsonb_array_length(producer_flags) > 0
      AND (${paperArg}::int IS NULL OR paper = ${paperArg})
  `) as { count: number }[];
  return rows[0]?.count ?? 0;
}

// Every pending item awaiting review that carries a producer flag, oldest first — the cross-batch queue
// the Bank Health deep-link opens (?review=flagged:producer).
export async function getFlaggedPendingQuestions(): Promise<GeneratedQuestion[]> {
  const sql = getDb();
  return (await sql`
    SELECT * FROM generated_questions
    WHERE review_state = 'pending'
      AND producer_flags IS NOT NULL
      AND jsonb_array_length(producer_flags) > 0
    ORDER BY created_at ASC
  `) as GeneratedQuestion[];
}

export async function getQuestionsByFilter(
  paper: number,
  family?: string
): Promise<GeneratedQuestion[]> {
  // NOTE: badness is gated by `invalid_reasons IS NULL` (the quarantine flag set by the
  // validator/audit and the "question" feedback kind) plus the failed-answer-key gate below. We
  // intentionally do NOT exclude questions merely because some attempt has
  // feedback_status='accepted': accepting a UX complaint (e.g. "you repeated this") or an
  // answer-key fix must not silently delete an otherwise-valid question from everyone's bank.
  // Per-user repetition is handled at the serve layer, not here.
  // status = 'approved' (migration 022): pending/rejected bank questions must never reach a
  // candidate, and this is a serve path (the study producer's stale tier + generation fallback).
  //
  // Failed-key gate: a question whose stem_answer_key derived with validated=false could not resolve
  // a consistent variety+origin per wine — usually a mangled or unresolvable wine label. The drills
  // (stem-sniper next/produce) already require validated=true; the main flow kept serving these, so
  // a wine the key resolver could not make sense of still reached candidates. A missing key row does
  // NOT exclude (keys derive asynchronously ~30s after generation; unkeyed ≠ known-bad).
  const sql = getDb();
  if (family && family !== "any") {
    return (await sql`
      SELECT * FROM generated_questions
      WHERE paper = ${paper} AND family = ${family}
        AND invalid_reasons IS NULL
        AND review_state = 'kept'
        AND scope = 'pool'
        AND NOT EXISTS (
          SELECT 1 FROM stem_answer_keys k
          WHERE k.question_id = generated_questions.question_id AND k.validated = false
        )
      ORDER BY created_at DESC
    `) as GeneratedQuestion[];
  }
  return (await sql`
    SELECT * FROM generated_questions
    WHERE paper = ${paper}
      AND invalid_reasons IS NULL
      AND review_state = 'kept'
      AND scope = 'pool'
      AND NOT EXISTS (
        SELECT 1 FROM stem_answer_keys k
        WHERE k.question_id = generated_questions.question_id AND k.validated = false
      )
    ORDER BY created_at DESC
  `) as GeneratedQuestion[];
}

export async function getRecentGeneratedQuestions(limit = 5): Promise<GeneratedQuestion[]> {
  const sql = getDb();
  return (await sql`
    SELECT * FROM generated_questions
    WHERE invalid_reasons IS NULL
      AND scope = 'pool'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as GeneratedQuestion[];
}

// ── Duplicate-wine cooldown + flight-signature dedup ─────────────────────────────────────────────
//
// Feedback (recurring bin cluster "same wine reused across recently generated questions"): the
// generator kept re-serving the same specific bottle — and the same (region, variety, style) flight
// SHAPE — within a short window of one paper's questions. Two guards close that, both keyed off a
// cheap created_at-ordered read of the paper's most recent rows:
//
//   1. EXACT-WINE cooldown  — a specific bottle may not reappear inside the last RECENT_WINE_WINDOW
//      questions for a paper (getRecentWineIds).
//   2. FLIGHT-SIGNATURE dedup — the sorted SET of (region, variety, style) triples may not match any
//      of the last RECENT_FLIGHT_WINDOW questions (getRecentFlightSignatures). This catches the
//      admin's "rated vs non-rated white Burgundy again" and same-region/same-variety repeats even
//      when the exact bottles differ.
//
// The signature is persisted on each row's metadata at save time (metadata.flightSignature), so the
// lookup is a read of a stored value rather than a re-derivation — with a compute-on-the-fly fallback
// for rows generated before this feature.

export const RECENT_WINE_WINDOW = 20;
export const RECENT_FLIGHT_WINDOW = 50;

function normLowerText(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Specific place tokens, most-specific first, so "meursault" wins over the "burgundy" umbrella. Kept
// as plain substrings matched against the normalised descriptor — a wine descriptor in this codebase
// names its appellation/region in full, so this is enough to fingerprint the flight's SHAPE. Anything
// not on the list falls back to the country (detectCountryToken), which still groups a same-country
// same-variety repeat without ever inventing a finer distinction than the text supports.
const REGION_KEYWORDS: string[] = [
  // Burgundy — specific appellations before the umbrella term
  "puligny-montrachet", "chassagne-montrachet", "gevrey-chambertin", "nuits-saint-georges",
  "pouilly-fuisse", "meursault", "chablis", "macon", "cote de beaune", "cote de nuits",
  "cote d'or", "bourgogne", "burgundy",
  // Loire
  "pouilly-fume", "sancerre", "vouvray", "chinon", "bourgueil", "muscadet", "savennieres",
  // Bordeaux & SW France
  "sauternes", "barsac", "pomerol", "saint-emilion", "pessac-leognan", "pauillac", "margaux",
  "saint-julien", "medoc", "graves", "bordeaux", "madiran", "cahors",
  // Champagne / Alsace / Beaujolais / Jura
  "champagne", "alsace", "beaujolais", "jura", "arbois", "chateau-chalon",
  // Rhone
  "chateauneuf-du-pape", "cote-rotie", "cote rotie", "crozes-hermitage", "hermitage", "cornas",
  "condrieu", "gigondas", "vacqueyras", "rhone",
  // Spain
  "rioja", "ribera del duero", "priorat", "rias baixas", "rueda", "toro", "jerez", "montilla",
  // Portugal
  "douro", "dao", "bairrada", "vinho verde", "madeira", "porto", "setubal",
  // Italy
  "barolo", "barbaresco", "brunello di montalcino", "montalcino", "chianti", "bolgheri",
  "amarone", "valpolicella", "soave", "etna", "piedmont", "piemonte", "tuscany", "toscana", "veneto",
  // Germany / Austria
  "mosel", "rheingau", "rheinhessen", "pfalz", "nahe", "wachau", "kamptal", "kremstal", "burgenland",
  // Greece / Hungary
  "santorini", "nemea", "naoussa", "tokaj", "tokaji",
  // Australia
  "barossa", "mclaren vale", "clare valley", "eden valley", "hunter valley", "yarra valley",
  "margaret river", "coonawarra", "adelaide hills", "rutherglen", "tasmania",
  // New Zealand
  "marlborough", "central otago", "hawke's bay", "martinborough",
  // USA
  "napa", "sonoma", "russian river", "willamette", "santa barbara", "paso robles", "finger lakes",
  // South America
  "mendoza", "uco valley", "maipo", "colchagua", "casablanca",
  // South Africa
  "stellenbosch", "swartland", "hemel-en-aarde", "constantia", "franschhoek",
];

const COUNTRY_KEYWORDS: string[] = [
  "south africa", "new zealand", "united states", "usa", "france", "italy", "spain", "portugal",
  "germany", "austria", "greece", "hungary", "australia", "argentina", "chile", "canada", "england",
  "georgia", "lebanon", "switzerland", "croatia", "slovenia", "israel",
];

function detectCountryToken(t: string): string {
  for (const c of COUNTRY_KEYWORDS) {
    if (t.includes(c)) return c === "united states" ? "usa" : c;
  }
  return "unknown";
}

// The region component of a wine's signature triple: the most specific place named in the descriptor,
// falling back to its country, then "unknown".
export function wineRegionToken(fullText: string): string {
  const t = normLowerText(fullText);
  for (const k of REGION_KEYWORDS) {
    if (t.includes(k)) return k;
  }
  return detectCountryToken(t);
}

// Reduce a wine descriptor to a stable identity for the exact-wine cooldown: strip diacritics, the
// vintage year and the ABV parenthetical, and collapse punctuation, so "Domaine X, 2019. …" and the
// 2020 of the same bottle read as ONE wine.
export function wineCooldownId(fullText: string): string {
  return (fullText || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\(\s*\d+(?:\.\d+)?\s*%\s*\)/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The (region, variety, style) triple for a single wine.
export function wineSignatureTriple(fullText: string): string {
  const region = wineRegionToken(fullText);
  const variety = detectPrimaryVariety(fullText) || "unknown";
  const style = classifyWineStyle(fullText).style || "other";
  return `${region}|${variety}|${style}`;
}

// The flight signature: the SORTED SET of its wines' (region, variety, style) triples, joined. Two
// flights with the same set of triples share a signature even when the exact bottles differ.
export function flightSignature(wines: { fullText: string }[] | null | undefined): string {
  const set = new Set((wines || []).filter((w) => w && w.fullText).map((w) => wineSignatureTriple(w.fullText)));
  return [...set].sort().join("; ");
}

function parseWinesLoose(raw: unknown): { fullText: string }[] {
  const wines = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  return Array.isArray(wines) ? (wines as { fullText: string }[]) : [];
}

// The set of wine identities used across the last `limit` questions for a paper — the exact-wine
// cooldown pool. scope='pool' only; ordered by recency so it is the paper's freshest window.
export async function getRecentWineIds(paper: number, limit = RECENT_WINE_WINDOW): Promise<Set<string>> {
  const sql = getDb();
  const rows = (await sql`
    SELECT wines FROM generated_questions
    WHERE paper = ${paper} AND scope = 'pool'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as { wines: unknown }[];
  const ids = new Set<string>();
  for (const r of rows) {
    for (const w of parseWinesLoose(r.wines)) {
      if (w && typeof w.fullText === "string") {
        const id = wineCooldownId(w.fullText);
        if (id) ids.add(id);
      }
    }
  }
  return ids;
}

// The set of flight signatures over the last `limit` questions for a paper. Prefers the value stored
// on the row's metadata at generation time; re-derives from the wines for any older row that has none.
export async function getRecentFlightSignatures(
  paper: number,
  limit = RECENT_FLIGHT_WINDOW
): Promise<Set<string>> {
  const sql = getDb();
  const rows = (await sql`
    SELECT wines, metadata FROM generated_questions
    WHERE paper = ${paper} AND scope = 'pool'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as { wines: unknown; metadata: Record<string, unknown> | null }[];
  const sigs = new Set<string>();
  for (const r of rows) {
    const stored = r.metadata && typeof r.metadata.flightSignature === "string"
      ? (r.metadata.flightSignature as string)
      : null;
    if (stored) {
      sigs.add(stored);
      continue;
    }
    const wines = parseWinesLoose(r.wines);
    if (wines.length > 0) sigs.add(flightSignature(wines));
  }
  return sigs;
}

export async function getUnansweredQuestions(
  paper: number,
  family?: string,
  userId?: number | null
): Promise<GeneratedQuestion[]> {
  // "Unanswered" means not completed BY THIS USER. Previously the completed-attempt join was
  // global, so a question any user finished disappeared from everyone's pool — and, conversely,
  // one user's history could never protect a different user from repeats. Scoping the join to
  // `userId` fixes both. `uid` null (server/no-user context) preserves the old global behaviour.
  const uid = userId ?? null;
  const sql = getDb();
  if (family && family !== "any") {
    return (await sql`
      SELECT q.* FROM generated_questions q
      LEFT JOIN user_attempts a ON q.question_id = a.question_id
        AND a.completed_at IS NOT NULL
        AND (${uid}::int IS NULL OR a.user_id = ${uid})
      WHERE q.paper = ${paper}
        AND q.family = ${family}
        AND q.invalid_reasons IS NULL
        AND q.review_state = 'kept'
        AND q.scope = 'pool'
        AND NOT EXISTS (
          SELECT 1 FROM stem_answer_keys k
          WHERE k.question_id = q.question_id AND k.validated = false
        )
        AND q.model_answer IS NOT NULL
        AND length(q.model_answer) > 100
        AND a.id IS NULL
      ORDER BY q.created_at ASC
    `) as GeneratedQuestion[];
  }
  return (await sql`
    SELECT q.* FROM generated_questions q
    LEFT JOIN user_attempts a ON q.question_id = a.question_id
      AND a.completed_at IS NOT NULL
      AND (${uid}::int IS NULL OR a.user_id = ${uid})
    WHERE q.paper = ${paper}
      AND q.invalid_reasons IS NULL
      AND q.review_state = 'kept'
      AND q.scope = 'pool'
      AND NOT EXISTS (
        SELECT 1 FROM stem_answer_keys k
        WHERE k.question_id = q.question_id AND k.validated = false
      )
      AND q.model_answer IS NOT NULL
      AND length(q.model_answer) > 100
      AND a.id IS NULL
    ORDER BY q.created_at ASC
  `) as GeneratedQuestion[];
}

export async function getQuestionCounts(): Promise<
  { paper: number; family: string; count: number }[]
> {
  const sql = getDb();
  return (await sql`
    SELECT paper, family, COUNT(*)::int as count
    FROM generated_questions
    GROUP BY paper, family
    ORDER BY paper, family
  `) as { paper: number; family: string; count: number }[];
}

// ── Question bank + per-user exposure (migration 020) ───────────────────────────────────────────
//
// The bank IS `generated_questions` (a validated question is written there on every successful
// generation, independent of attempts). "Seen" is `question_views`: one row per (user, question)
// written the moment a question is served — from the bank OR freshly generated, finished or not.
//
// NOTE ON MODE: a generated question is mode-agnostic in this codebase — the same row is graded as
// full / stem-only / known-wine / flash without change (generation never reads mode), and
// question_views is keyed on (user, question) with no mode. So eligibility is by paper + family +
// unseen; `mode` is the practice mode the served question is then run in, not a pool partition.

// Record that a question has been served to a user. Idempotent: the unique(user_id, question_id)
// constraint means a re-serve keeps the original first_seen_at rather than resetting it.
export async function recordQuestionView(userId: number, questionId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO question_views (user_id, question_id)
    VALUES (${userId}, ${questionId})
    ON CONFLICT (user_id, question_id) DO NOTHING
  `;
}

export async function incrementTimesServed(questionId: string): Promise<void> {
  const sql = getDb();
  // Batch Undo (migration 033): served_count mirrors the times_served soft counter and first_served_at
  // is stamped once, on the first serve. Both feed the reopen safety rail — an item that has already
  // reached a candidate is left kept rather than yanked back to the review queue.
  await sql`
    UPDATE generated_questions SET
      times_served = COALESCE(times_served, 0) + 1,
      served_count = COALESCE(served_count, 0) + 1,
      first_served_at = COALESCE(first_served_at, NOW())
    WHERE question_id = ${questionId}
  `;
}

// How many banked questions this user has NEVER seen, for a paper (+ optional family). Gated on
// both retirement flags: is_retired (soft switch) and invalid_reasons (validator/feedback
// quarantine), plus the failed-answer-key gate (validated=false ⇒ unresolvable wines — see
// getQuestionsByFilter). family 'any'/empty means "any family in this paper".
export async function getBankCount(
  userId: number,
  paper: number,
  family?: string
): Promise<number> {
  const sql = getDb();
  const fam = family && family !== "any" ? family : null;
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM generated_questions q
    WHERE q.paper = ${paper}
      AND (${fam}::text IS NULL OR q.family = ${fam})
      AND q.invalid_reasons IS NULL
      AND q.review_state = 'kept'
      AND q.is_retired IS NOT TRUE
      AND q.scope = 'pool'
      AND NOT EXISTS (
        SELECT 1 FROM stem_answer_keys k
        WHERE k.question_id = q.question_id AND k.validated = false
      )
      AND NOT EXISTS (
        SELECT 1 FROM question_views v
        WHERE v.question_id = q.question_id AND v.user_id = ${userId}
      )
  `) as { count: number }[];
  return rows[0]?.count ?? 0;
}

// The newest eligible (unseen, not retired) banked questions for a user, most-recent-first. The
// caller picks one at random from this window — recency weighting, per the feature spec: pick from
// the 20 newest eligible, or from all eligible when fewer than 20 exist.
export async function getEligibleBankedQuestions(
  userId: number,
  paper: number,
  family?: string,
  limit = 20
): Promise<GeneratedQuestion[]> {
  const sql = getDb();
  const fam = family && family !== "any" ? family : null;
  return (await sql`
    SELECT q.* FROM generated_questions q
    WHERE q.paper = ${paper}
      AND (${fam}::text IS NULL OR q.family = ${fam})
      AND q.invalid_reasons IS NULL
      AND q.review_state = 'kept'
      AND q.is_retired IS NOT TRUE
      AND q.scope = 'pool'
      AND NOT EXISTS (
        SELECT 1 FROM stem_answer_keys k
        WHERE k.question_id = q.question_id AND k.validated = false
      )
      AND NOT EXISTS (
        SELECT 1 FROM question_views v
        WHERE v.question_id = q.question_id AND v.user_id = ${userId}
      )
    ORDER BY q.created_at DESC
    LIMIT ${limit}
  `) as GeneratedQuestion[];
}

// ── Fill the Bank: bulk generation + review gate (migration 022) ─────────────────────────────────
//
// A bank_batch is one bulk run. The worker (src/lib/bank-worker.ts) writes generated_count after
// every persisted item so progress survives a tab close; the Fill-the-Bank section of the Admin card polls the
// helpers below. Every question the worker creates lands as status='pending' with the batch_id set,
// and is invisible to candidates until an admin approves it (see the status='approved' filters above).

export interface BankBatch {
  id: string;
  paper: number;
  requested_count: number;
  generated_count: number;
  failed_count: number;
  status: "running" | "ready" | "complete" | "done" | "cancelled" | "error" | "failed" | "stalled";
  replace_rejected: boolean;
  replace_binned: boolean;
  kept_count: number;
  created_by: number | null;
  created_at: string;
  completed_at: string | null;
  // Batch Undo (migration 033). resolved_by / resolved_at record who explicitly kept the batch (via
  // keep-all); reopened_at is stamped when an admin reverses that auto-keep and is what makes "Reopen
  // all" one-shot (a batch already reopened cannot be reopened again).
  resolved_by: number | null;
  resolved_at: string | null;
  reopened_at: string | null;
  // Stall recovery (migration 027). started_at is set once; updated_at is a heartbeat stamped on
  // every counter increment / status change, so a dead 'running' run can be told from a live one.
  started_at: string | null;
  updated_at: string | null;
  est_cost_usd: string | null;
  actual_cost_usd: string | null;
  est_cost_min_cents: number | null;
  est_cost_max_cents: number | null;
  actual_cost_cents: number | null;
  // Bank Health targeted generation (migration 026). The soft-constraint aim for this batch, or NULL
  // for an untargeted Fill-the-Bank run. Persisted so a resumed invocation keeps the same aim.
  targeting: BankTargeting | null;
  // Exam Mix (migration 034). mix_summary is the per-batch category/curveball tally rendered in the
  // review header (NULL until the run completes); retry_log is an internal-only debugging array of
  // {attempt, reason, targetedGap} — never surfaced in any UI.
  mix_summary: BankMixSummary | null;
  retry_log: BankRetryLogEntry[];
}

// The per-batch tally rendered in the review header (Exam Mix, migration 034).
export interface BankMixSummary {
  paper: number;
  categories: Record<string, number>;
  curveball: Record<string, number>;
}

// One internal retry-log entry (Exam Mix, migration 034). Never surfaced.
export interface BankRetryLogEntry {
  attempt: number;
  reason: string;
  targetedGap: string | null;
}

// The soft-constraint aim threaded into generation by a Bank Health "Generate more like this" run.
// Every field is optional — the panel only sends the ones a slice pins down.
export interface BankTargeting {
  paper?: number;
  questionType?: string;
  curveball?: string;
  flightSize?: string;
  grape?: string;
  region?: string;
  priceBand?: string;
  // Grape Balance "Fill the gap": the dominant variety KEY (e.g. "sangiovese") the whole batch should
  // be built around, spread across its classic sub-styles / appellations / price bands.
  varietyFocus?: string;
}

export async function createBankBatch(input: {
  paper: number;
  requestedCount: number;
  replaceBinned: boolean;
  createdBy: number | null;
  estCostUsd: number;
  estCostMinCents?: number | null;
  estCostMaxCents?: number | null;
  targeting?: BankTargeting | null;
}): Promise<BankBatch> {
  const sql = getDb();
  // replace_rejected (migration 022) and replace_binned (migration 025) are the same flag under two
  // names; write both so either read path is correct.
  const rows = await sql`
    INSERT INTO bank_batches (
      paper, requested_count, replace_rejected, replace_binned, created_by,
      est_cost_usd, est_cost_min_cents, est_cost_max_cents, targeting
    )
    VALUES (
      ${input.paper}, ${input.requestedCount}, ${input.replaceBinned}, ${input.replaceBinned},
      ${input.createdBy}, ${input.estCostUsd},
      ${input.estCostMinCents ?? null}, ${input.estCostMaxCents ?? null},
      ${input.targeting ? JSON.stringify(input.targeting) : null}
    )
    RETURNING *
  `;
  return rows[0] as BankBatch;
}

export async function getBankBatch(id: string): Promise<BankBatch | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM bank_batches WHERE id = ${id} LIMIT 1`;
  return (rows[0] as BankBatch) ?? null;
}

// A paper may only have ONE live run at a time (the generate guard). 'running' is live.
export async function getRunningBatchForPaper(paper: number): Promise<BankBatch | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM bank_batches WHERE paper = ${paper} AND status = 'running'
    ORDER BY created_at DESC LIMIT 1
  `;
  return (rows[0] as BankBatch) ?? null;
}

// Every batch currently generating, newest first — the Admin card badges these per paper.
export async function getRunningBatches(): Promise<BankBatch[]> {
  const sql = getDb();
  return (await sql`
    SELECT * FROM bank_batches WHERE status = 'running' ORDER BY created_at DESC
  `) as BankBatch[];
}

// Batches the cron may pick back up — 'running' AND 'stalled'.
//
// 'stalled' exists to RELEASE THE PAPER LOCK when a heartbeat goes cold (see releaseStalledBatches),
// not to abandon the run. But the cron only ever looked for 'running', and runBankBatch refuses
// anything that is not 'running', so a released batch could never be picked up by anything. Seven
// accumulated over ~25 hours, one of them 24 questions into a request for 50, and each had to be
// cleared by hand.
//
// Three guards, because this drives autonomous spend:
//   • unfinished only — a batch that met its request is done, whatever its status says
//   • not poor-yield — resuming a 3-generated/16-failed run just burns more money; that shape is
//     what the circuit breaker exists to stop, and a stall must not launder it into a fresh start.
//     NOTE: this predicate duplicates shouldAbortForPoorYield() in bank-worker.ts (>=10 failures and
//     yield <=1-in-4). It is repeated here because the filter has to run in SQL, and the two will not
//     track each other automatically — change both, or the cron will resume batches the worker then
//     immediately aborts.
//   • age-capped — a day-old batch is abandoned, not interrupted. Without this, fixing the dead end
//     would resurrect every historical stall at once the first time the cron fired.
export async function getResumableBatches(maxAgeHours = 24): Promise<BankBatch[]> {
  const sql = getDb();
  return (await sql`
    SELECT * FROM bank_batches
    WHERE status IN ('running', 'stalled')
      AND generated_count + failed_count < requested_count
      AND created_at > NOW() - (${maxAgeHours} * INTERVAL '1 hour')
      AND NOT (failed_count >= 10 AND generated_count * 3 <= failed_count)
    ORDER BY created_at DESC
  `) as BankBatch[];
}

// Re-acquire a stalled batch so the worker may drive it again: flip it back to 'running' and reset
// the heartbeat in one statement, so two concurrent resumers cannot both claim it (the second sees
// no row). A batch already 'running' is left alone — its own invocation still owns it.
export async function reclaimStalledBatch(id: string): Promise<BankBatch | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE bank_batches SET status = 'running', updated_at = NOW()
    WHERE id = ${id} AND status = 'stalled'
    RETURNING *
  `;
  return (rows[0] as BankBatch) ?? null;
}

// Ready batches that still hold unreviewed (pending) questions — the "Review N questions" surface
// and the NotificationBell feed.
export async function getReviewableBatches(): Promise<(BankBatch & { pending_count: number })[]> {
  const sql = getDb();
  return (await sql`
    SELECT b.*, COUNT(q.id) FILTER (WHERE q.review_state = 'pending')::int AS pending_count
    FROM bank_batches b
    LEFT JOIN generated_questions q ON q.batch_id = b.id
    WHERE b.status IN ('ready', 'complete', 'done', 'stalled', 'cancelled')
    GROUP BY b.id
    HAVING COUNT(q.id) FILTER (WHERE q.review_state = 'pending') > 0
    ORDER BY b.completed_at DESC NULLS LAST, b.created_at DESC
  `) as (BankBatch & { pending_count: number })[];
}

// Atomically bump generated/failed counters. Returns the fresh row so the worker can decide whether
// the run is complete (generated + failed >= requested).
export async function incrementBatchCounts(
  id: string,
  delta: { generated?: number; failed?: number }
): Promise<BankBatch | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE bank_batches SET
      generated_count = generated_count + ${delta.generated ?? 0},
      failed_count    = failed_count + ${delta.failed ?? 0},
      updated_at      = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as BankBatch) ?? null;
}

// Heartbeat: bump updated_at without touching any counter. Called at the start of an invocation (and
// on resume) so a batch that is genuinely alive but between chunks is never mistaken for stalled.
export async function touchBankBatch(id: string): Promise<void> {
  const sql = getDb();
  await sql`UPDATE bank_batches SET updated_at = NOW() WHERE id = ${id}`;
}

// STALL RECOVERY (spec §1). Mark any batch left 'running' with a heartbeat older than the threshold
// (5 minutes) as 'stalled' and release it, so a new run can start for that paper. Already-persisted
// questions for the batch are untouched and remain reviewable (getReviewableBatches includes
// 'stalled'). Idempotent — safe to call on every status poll and at the start of any new run.
// Returns the released rows so callers can report "previous run stalled and was released".
export async function releaseStalledBatches(thresholdMinutes = 5): Promise<BankBatch[]> {
  const sql = getDb();
  const rows = await sql`
    UPDATE bank_batches SET status = 'stalled'
    WHERE status = 'running'
      AND updated_at < NOW() - (${thresholdMinutes} * INTERVAL '1 minute')
    RETURNING *
  `;
  return rows as BankBatch[];
}

// CANCEL (spec §2). Flip a running batch to 'cancelled'. The worker re-reads status before each chunk
// and exits, keeping every question generated so far. Scoped to 'running' so a completed/stalled run
// isn't retro-cancelled.
export async function cancelBankBatch(id: string): Promise<BankBatch | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE bank_batches SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND status = 'running'
    RETURNING *
  `;
  return (rows[0] as BankBatch) ?? null;
}

// The most recent batch per paper (any status), with its live pending-review count. The Fill-the-Bank
// status endpoint reads this to drive the resting / running / stalled / done states without a
// round-trip per paper.
export async function getLatestBatchPerPaper(): Promise<(BankBatch & { pending_count: number })[]> {
  const sql = getDb();
  return (await sql`
    SELECT DISTINCT ON (b.paper) b.*,
      COALESCE(p.pending, 0)::int AS pending_count
    FROM bank_batches b
    LEFT JOIN (
      SELECT batch_id, COUNT(*)::int AS pending
      FROM generated_questions WHERE review_state = 'pending' GROUP BY batch_id
    ) p ON p.batch_id = b.id
    WHERE b.paper IN (1, 2, 3)
    ORDER BY b.paper, b.created_at DESC
  `) as (BankBatch & { pending_count: number })[];
}

// Add one more unit of work to a batch (used when an admin bins a question and replace_rejected is
// on). Re-opens the run to 'running' so the completion check fires again after the replacement lands.
export async function extendBatchForReplacement(id: string): Promise<BankBatch | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE bank_batches SET requested_count = requested_count + 1, status = 'running', completed_at = NULL
    WHERE id = ${id} AND status IN ('running', 'ready', 'complete')
    RETURNING *
  `;
  return (rows[0] as BankBatch) ?? null;
}

// The Fill-the-Bank reviewer's "Replace anything I bin" toggle writes here. Never re-opens a run; it only sets
// the flag the review endpoint reads when an admin bins a question.
export async function setBatchReplaceRejected(id: string, replaceRejected: boolean): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE bank_batches SET replace_rejected = ${replaceRejected}, replace_binned = ${replaceRejected}
    WHERE id = ${id}
  `;
}

export async function setBankBatchStatus(
  id: string,
  status: BankBatch["status"],
  opts?: { completed?: boolean; actualCostUsd?: number }
): Promise<void> {
  const sql = getDb();
  const actualCents =
    opts?.actualCostUsd == null ? null : Math.round(opts.actualCostUsd * 100);
  await sql`
    UPDATE bank_batches SET
      status = ${status},
      completed_at = ${opts?.completed ? new Date().toISOString() : null}::timestamptz,
      actual_cost_usd = COALESCE(${opts?.actualCostUsd ?? null}::numeric, actual_cost_usd),
      actual_cost_cents = COALESCE(${actualCents}::int, actual_cost_cents),
      updated_at = NOW()
    WHERE id = ${id}
  `;
}

// ── Exam Mix (migration 034) ─────────────────────────────────────────────────────────────────────
//
// The running-count math is BATCH-SCOPED and reads only rows Exam Mix itself tagged: a row carries a
// non-NULL wine_category / curveball_level ONLY when the generator emitted one for this batch, so
// legacy pre-feature rows and the accept-anyway fallback's excluded rows never enter the counts.

// Running category (Paper 3) + curveball (all papers) tallies for a batch, over the kept + pending
// tagged rows only (a binned row is out — it will not reach the bank).
export async function getBatchMixCounts(
  batchId: string
): Promise<{ categories: Record<string, number>; curveball: Record<string, number> }> {
  const sql = getDb();
  const catRows = (await sql`
    SELECT wine_category AS k, COUNT(*)::int AS n
    FROM generated_questions
    WHERE batch_id = ${batchId} AND wine_category IS NOT NULL AND review_state <> 'binned'
    GROUP BY wine_category
  `) as { k: string; n: number }[];
  const cbRows = (await sql`
    SELECT curveball_level AS k, COUNT(*)::int AS n
    FROM generated_questions
    WHERE batch_id = ${batchId} AND curveball_level IS NOT NULL AND review_state <> 'binned'
    GROUP BY curveball_level
  `) as { k: string; n: number }[];
  const categories: Record<string, number> = {};
  for (const r of catRows) categories[r.k] = r.n;
  const curveball: Record<string, number> = {};
  for (const r of cbRows) curveball[r.k] = r.n;
  return { categories, curveball };
}

// Append one internal retry-log entry (never surfaced). jsonb || so concurrent appends don't clobber.
export async function appendBatchRetryLog(id: string, entry: BankRetryLogEntry): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE bank_batches
    SET retry_log = COALESCE(retry_log, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb,
        updated_at = NOW()
    WHERE id = ${id}
  `;
}

// Persist the per-batch mix tally rendered in the review header. Recomputed from the tagged rows at
// completion, so it is correct even after a resume.
export async function setBatchMixSummary(id: string, summary: BankMixSummary): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE bank_batches SET mix_summary = ${JSON.stringify(summary)}::jsonb, updated_at = NOW()
    WHERE id = ${id}
  `;
}

// The pending items an admin reviews for a batch, oldest-first (review in generation order).
// The resolved answer key's ground truth for one question, or null if it hasn't been derived yet.
// The Fill-the-Bank review pane runs the hard validator against this so a reviewer sees the same
// verdict the corpus audit would give — a stem<->wine contradiction is often invisible in the raw
// wine list (Cannonau and Garnacha are both Grenache, and neither label says so).
export async function getAnswerKeyGroundTruth(questionId: string): Promise<unknown[] | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT ground_truth FROM stem_answer_keys WHERE question_id = ${questionId} LIMIT 1
  `;
  if (!rows[0]) return null;
  const gt = (rows[0] as { ground_truth: unknown }).ground_truth;
  const parsed = typeof gt === "string" ? JSON.parse(gt) : gt;
  return Array.isArray(parsed) ? parsed : null;
}

// Bulk form of getAnswerKeyGroundTruth — one round-trip for a whole batch, so the review pane can
// tell the reviewer how many of the REMAINING questions fail validation before they press "Keep all".
export async function getAnswerKeyGroundTruths(
  questionIds: string[]
): Promise<Map<string, unknown[]>> {
  const out = new Map<string, unknown[]>();
  if (questionIds.length === 0) return out;
  const sql = getDb();
  const rows = (await sql`
    SELECT question_id, ground_truth FROM stem_answer_keys
    WHERE question_id = ANY(${questionIds})
  `) as { question_id: string; ground_truth: unknown }[];
  for (const r of rows) {
    const parsed = typeof r.ground_truth === "string" ? JSON.parse(r.ground_truth) : r.ground_truth;
    if (Array.isArray(parsed) && parsed.length > 0) out.set(r.question_id, parsed);
  }
  return out;
}

export async function getBatchPendingQuestions(batchId: string): Promise<GeneratedQuestion[]> {
  const sql = getDb();
  return (await sql`
    SELECT * FROM generated_questions
    WHERE batch_id = ${batchId} AND review_state = 'pending'
    ORDER BY created_at ASC
  `) as GeneratedQuestion[];
}

// All rows for a batch (any status) — lets the review page show kept/binned outcomes and the
// "N reviewed · X kept, Y binned" summary without a second round-trip.
export async function getBatchQuestions(batchId: string): Promise<GeneratedQuestion[]> {
  const sql = getDb();
  return (await sql`
    SELECT * FROM generated_questions
    WHERE batch_id = ${batchId}
    ORDER BY created_at ASC
  `) as GeneratedQuestion[];
}

// Decide one pending bank question. Scoped to review_state='pending' so a double-click or a replayed
// request can't flip a decision that was already made. Returns the row's batch_id so the caller can
// trigger a replacement only on a genuine first-time bin.
//
// keep → review_state='kept' (servable) and the batch's kept_count is bumped.
// bin  → the row is HARD-DELETED (binned rows have no resurrect path). Before it goes, an optional
//        reason (tags + free text) is captured into the bank_bin_reasons ledger keyed by item_id +
//        paper + family, so the reason survives the delete and feeds forward. We RETURN the batch_id
//        so the caller can enqueue a replacement.
export interface BinReason {
  tags: string[] | null;
  note: string | null;
}
export async function reviewBankQuestion(
  questionId: string,
  decision: "keep" | "bin",
  reviewerId: number,
  reason?: BinReason
): Promise<{ batchId: string | null; changed: boolean } | null> {
  const sql = getDb();

  if (decision === "bin") {
    // SOFT-delete (review_state='pending' → 'binned') rather than a hard DELETE, so the 10s "Undo"
    // window can reverse it (see unbinBankQuestion). Binned rows are excluded from every servable and
    // pending read exactly as before; they simply retain their row instead of vanishing. RETURNING
    // paper/family lets us log the bin ledger with context.
    // Scope also covers an UNREVIEWED banked item (migration 040): an on-the-fly generation lands
    // review_state='kept' but review_status='unreviewed', so it is servable yet never decided. Binning
    // it from the Unreviewed Queue must work exactly as binning a pending batch item does.
    const rows = await sql`
      UPDATE generated_questions SET
        status = 'rejected', review_state = 'binned', review_status = 'binned',
        reviewed_at = NOW(), reviewed_by = ${reviewerId}
      WHERE question_id = ${questionId}
        AND (review_state = 'pending' OR review_status = 'unreviewed')
      RETURNING batch_id, paper, family
    `;
    if (rows.length === 0) return { batchId: null, changed: false };
    const row = rows[0] as { batch_id: string | null; paper: number; family: string | null };
    // Always log the bin (even a bare, reasonless one — a reason is never required). Reasons now arrive
    // separately via a fire-and-forget PATCH (applyBinReasons) while the Undo bar is up, so this row
    // usually starts with NULL tags/note. reason_tags is a Postgres text[]; an empty list stores NULL.
    const tags = reason?.tags && reason.tags.length > 0 ? reason.tags : null;
    await sql`
      INSERT INTO bank_bin_reasons (item_id, paper, family_id, reason_tags, reason_note, binned_by)
      VALUES (${questionId}, ${row.paper}, ${row.family}, ${tags}, ${reason?.note ?? null}, ${reviewerId})
    `;
    // Flag Question (migration 037): a bin is the admin's "Delete" decision — resolve any pending
    // candidate flag on this item to 'deleted' so it leaves the flag queue and stops pinging admins.
    await resolveQuestionFlags(questionId, "deleted", reviewerId);
    return { batchId: row.batch_id ?? null, changed: true };
  }

  // Also accepts a 'binned' row — this is the "Reinstate" path from The Bin page, which reverses a bin
  // by keeping the item (approved / servable). A kept item carries no fault, so its bin-ledger row is
  // dropped; for a normal pending→kept there is no ledger row, so the DELETE is a harmless no-op.
  // Scope also covers an UNREVIEWED banked item (migration 040) — keeping it from the Unreviewed
  // Queue records the explicit decision (review_status='kept', auto_kept cleared) without changing its
  // already-servable review_state.
  const rows = await sql`
    UPDATE generated_questions SET
      status = 'approved', review_state = 'kept', review_status = 'kept',
      reviewed_at = NOW(), reviewed_by = ${reviewerId},
      auto_kept = false, flagged_by_candidate = false
    WHERE question_id = ${questionId}
      AND (review_state IN ('pending', 'binned') OR review_status = 'unreviewed')
    RETURNING batch_id
  `;
  if (rows.length === 0) return { batchId: null, changed: false };
  await sql`DELETE FROM bank_bin_reasons WHERE item_id = ${questionId}`;
  // Flag Question (migration 037): a keep is the admin's "Keep" decision — return the item to rotation
  // (flagged_by_candidate cleared above) and resolve any pending candidate flag on it to 'kept'.
  await resolveQuestionFlags(questionId, "kept", reviewerId);
  const batchId = (rows[0].batch_id as string) ?? null;
  if (batchId) {
    await sql`UPDATE bank_batches SET kept_count = kept_count + 1 WHERE id = ${batchId}`;
  }
  return { batchId, changed: true };
}

// ── Unreviewed Queue (migration 040) ──────────────────────────────────────────────────────────────
//
// The standing catch-all: every banked question an admin has never explicitly kept or binned, keyed
// off review_status (independent of any batch). Ordered oldest-first so the backlog is worked FIFO.

export interface UnreviewedQueueItem {
  id: string;
  paper: number;
  family: string;
  familyLabel: string | null;
  wineCount: number;
  createdAt: string;
  stemPreview: string;
}

// Cheap count for the badge — a single indexed COUNT over unreviewed rows.
export async function getUnreviewedCount(): Promise<number> {
  const sql = getDb();
  const rows = await sql`
    SELECT COUNT(*)::int AS n FROM generated_questions WHERE review_status = 'unreviewed'
  `;
  return (rows[0]?.n as number) ?? 0;
}

// One page of the queue. Keyset-paginated on (created_at, question_id) so a growing bank can't shift
// rows across page boundaries. `cursor` is the last item of the previous page; omit it for page one.
// Returns the page plus the cursor for the next page (null when the queue is exhausted).
export async function getUnreviewedQueue(
  limit: number,
  cursor?: { createdAt: string; id: string } | null
): Promise<{
  total: number;
  items: UnreviewedQueueItem[];
  nextCursor: { createdAt: string; id: string } | null;
}> {
  const sql = getDb();
  const lim = Math.min(Math.max(Math.trunc(limit) || 25, 1), 100);
  const rows = (cursor
    ? await sql`
        SELECT question_id, paper, family, family_label, wines, question_text, created_at
        FROM generated_questions
        WHERE review_status = 'unreviewed'
          AND (created_at, question_id) > (${cursor.createdAt}::timestamptz, ${cursor.id})
        ORDER BY created_at ASC, question_id ASC
        LIMIT ${lim + 1}
      `
    : await sql`
        SELECT question_id, paper, family, family_label, wines, question_text, created_at
        FROM generated_questions
        WHERE review_status = 'unreviewed'
        ORDER BY created_at ASC, question_id ASC
        LIMIT ${lim + 1}
      `) as {
    question_id: string;
    paper: number;
    family: string | null;
    family_label: string | null;
    wines: unknown;
    question_text: string | null;
    created_at: string;
  }[];

  const hasMore = rows.length > lim;
  const page = hasMore ? rows.slice(0, lim) : rows;

  const items: UnreviewedQueueItem[] = page.map((r) => {
    let wineCount = 0;
    try {
      const arr = typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
      if (Array.isArray(arr)) wineCount = arr.length;
    } catch {
      wineCount = 0;
    }
    const stem = (r.question_text || "").replace(/\s+/g, " ").trim();
    const stemPreview = stem.length > 140 ? `${stem.slice(0, 140).trimEnd()}…` : stem;
    return {
      id: r.question_id,
      paper: r.paper,
      family: r.family ?? "",
      familyLabel: r.family_label ?? null,
      wineCount,
      createdAt: r.created_at,
      stemPreview,
    };
  });

  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? { createdAt: last.created_at, id: last.question_id } : null;
  const total = await getUnreviewedCount();

  return { total, items, nextCursor };
}

// ── Flag Question (migration 037) ──────────────────────────────────────────────────────────────
//
// A candidate flags a served question from the debrief. The flag ledger (question_flags) carries the
// admin BinReasonChips codes + optional note + who flagged it; the bank item goes back to the pending
// review gate with a flagged_by_candidate marker so it stops being served and sorts to the top of the
// review queue; the attempt is stamped flagged (never deleted) so History can tag it.

export interface QuestionFlagInput {
  questionId: string;
  attemptId: number | null;
  userId: number;
  reasons: string[]; // BinReasonChips codes (already sanitised)
  note: string | null;
}

// Create a candidate flag in one transaction. Idempotent: if a pending flag already exists for the
// item, the bank-state change is NOT duplicated (spec) — we still stamp the attempt so History tags
// this attempt too. Returns whether a genuinely new flag was created.
export async function createQuestionFlag(
  input: QuestionFlagInput
): Promise<{ created: boolean; duplicated: boolean; flagId: number | null }> {
  const sql = getDb();

  const existing = await sql`
    SELECT id FROM question_flags WHERE question_id = ${input.questionId} AND status = 'pending' LIMIT 1
  `;

  // The attempt is NEVER deleted — always tag it so /history shows the "Flagged" pill, even when this
  // is a duplicate flag on an item already withdrawn.
  if (input.attemptId != null) {
    await sql`UPDATE user_attempts SET flagged = true WHERE id = ${input.attemptId}`;
  }

  if (existing.length > 0) {
    // A pending flag is already routing this item through review — return without duplicating the
    // insert or re-touching bank state.
    return { created: false, duplicated: true, flagId: (existing[0].id as number) ?? null };
  }

  // Empty reason list stores NULL (a reason is never required at the DB level; the API enforces >=1).
  const reasons = input.reasons.length > 0 ? input.reasons : null;

  // One transaction: ledger row + withdraw the item from rotation (back to the 'pending' gate) +
  // mark it flagged_by_candidate so the queue can render the tag and sort it to the top.
  const results = await sql.transaction([
    sql`
      INSERT INTO question_flags (question_id, attempt_id, user_id, reasons, note, status)
      VALUES (${input.questionId}, ${input.attemptId}, ${input.userId}, ${reasons}, ${input.note}, 'pending')
      RETURNING id
    `,
    sql`
      UPDATE generated_questions
      SET review_state = 'pending', status = 'pending', flagged_by_candidate = true
      WHERE question_id = ${input.questionId}
    `,
  ]);
  const flagId = (results?.[0]?.[0]?.id as number) ?? null;
  return { created: true, duplicated: false, flagId };
}

// Resolve every pending flag on an item when an admin decides it (bin → 'deleted', keep → 'kept').
export async function resolveQuestionFlags(
  questionId: string,
  status: "deleted" | "kept",
  resolverId: number
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE question_flags
    SET status = ${status}, resolved_by = ${resolverId}, resolved_at = NOW()
    WHERE question_id = ${questionId} AND status = 'pending'
  `;
}

export interface FlagContext {
  flaggedBy: string; // display name
  reasons: string[];
  note: string | null;
  flaggedAt: string;
}

// Flag context per item (the newest pending flag) for a set of question ids — drives the review-card
// "Flagged by candidate" tag. Keyed by question_id; items with no pending flag are simply absent.
export async function getFlagContextForItems(
  questionIds: string[]
): Promise<Map<string, FlagContext>> {
  const map = new Map<string, FlagContext>();
  if (questionIds.length === 0) return map;
  const sql = getDb();
  const rows = await sql`
    SELECT DISTINCT ON (f.question_id)
      f.question_id, f.reasons, f.note, f.created_at, u.name AS flagged_by
    FROM question_flags f
    JOIN users u ON f.user_id = u.id
    WHERE f.status = 'pending' AND f.question_id = ANY(${questionIds})
    ORDER BY f.question_id, f.created_at DESC
  `;
  for (const r of rows as Array<{ question_id: string; reasons: string[] | null; note: string | null; created_at: string; flagged_by: string }>) {
    map.set(r.question_id, {
      flaggedBy: r.flagged_by,
      reasons: Array.isArray(r.reasons) ? r.reasons : [],
      note: r.note,
      flaggedAt: r.created_at,
    });
  }
  return map;
}

// Every pending candidate-flagged bank item (across batches) — the cross-batch flag review queue,
// newest flag first. Mirrors getFlaggedPendingQuestions (producer) but scoped to candidate flags.
export async function getCandidateFlaggedQuestions(): Promise<GeneratedQuestion[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT q.* FROM generated_questions q
    JOIN LATERAL (
      SELECT created_at FROM question_flags
      WHERE question_id = q.question_id AND status = 'pending'
      ORDER BY created_at DESC LIMIT 1
    ) f ON true
    WHERE q.review_state = 'pending' AND q.flagged_by_candidate = true
    ORDER BY f.created_at DESC
  `;
  return rows as GeneratedQuestion[];
}

// Pending candidate flags for the admin NotificationBell — "Question flagged by <name>". Newest first.
export async function getFlagNotifications(): Promise<
  { id: number; questionId: string; flaggedBy: string; paper: number | null; createdAt: string }[]
> {
  const sql = getDb();
  const rows = await sql`
    SELECT f.id, f.question_id, f.created_at, u.name AS flagged_by, q.paper
    FROM question_flags f
    JOIN users u ON f.user_id = u.id
    LEFT JOIN generated_questions q ON f.question_id = q.question_id
    WHERE f.status = 'pending'
    ORDER BY f.created_at DESC
    LIMIT 20
  `;
  return (rows as Array<{ id: number; question_id: string; created_at: string; flagged_by: string; paper: number | null }>).map(
    (r) => ({ id: r.id, questionId: r.question_id, flaggedBy: r.flagged_by, paper: r.paper, createdAt: r.created_at })
  );
}

// Keep every pending question in a batch in one shot ("Keep all").
export async function keepAllPending(batchId: string, reviewerId: number): Promise<number> {
  const sql = getDb();
  const rows = await sql`
    UPDATE generated_questions SET
      status = 'approved', review_state = 'kept', review_status = 'kept',
      reviewed_at = NOW(), reviewed_by = ${reviewerId}, auto_kept = false
    WHERE batch_id = ${batchId} AND review_state = 'pending'
    RETURNING id
  `;
  if (rows.length > 0) {
    await sql`UPDATE bank_batches SET kept_count = kept_count + ${rows.length} WHERE id = ${batchId}`;
  }
  // Batch Undo (migration 033): keep-all is an explicit admin resolution — record who resolved it so
  // the Recent-batches strip can show "Reviewed by <name>". Always stamp (even a 0-row keep-all still
  // marks the batch as reviewed by this admin).
  await sql`
    UPDATE bank_batches SET resolved_by = ${reviewerId}, resolved_at = NOW()
    WHERE id = ${batchId}
  `;
  return rows.length;
}

// ── Batch Undo (migration 033) ──────────────────────────────────────────────────────────────────
//
// Reverse a bulk auto-keep: items kept without ever being reviewed go back to the review queue. An
// item that has ALREADY been served to a candidate is left kept (skipped) — pulling a question a
// candidate has seen back into "pending" would make it un-servable and orphan their attempt.

// One short, human wine label for a bank item, for the skipped-list ("these stayed kept"). Derived
// from the flight's first wine descriptor — the producer/cuvée head before the first comma — never a
// question id or internal state name.
function bankItemLabel(wines: unknown, paper: number): string {
  try {
    const arr = typeof wines === "string" ? JSON.parse(wines) : wines;
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0] as { fullText?: string };
      const full = (first?.fullText || "").trim();
      if (full) {
        const head = full.split(",")[0]?.trim();
        if (head) return head.length > 60 ? `${head.slice(0, 60)}…` : head;
      }
    }
  } catch {
    /* fall through to the generic label */
  }
  return `Paper ${paper} question`;
}

export interface ReopenResult {
  reopened: number;
  skipped: number;
  skippedItems: { id: string; label: string }[];
}

// Reopen every auto-kept item in a batch that hasn't yet been served. Served items are left kept and
// returned as `skippedItems`. Reopened items go review_state='pending', reviewed_by/reviewed_at NULL,
// auto_kept=false. Stamps batch.reopened_at (one-shot: a batch already reopened returns nulls upstream).
export async function reopenBatch(batchId: string, adminId: number): Promise<ReopenResult> {
  const sql = getDb();
  // Only auto-kept items are candidates — an explicit admin keep is a real decision and stays kept.
  const rows = (await sql`
    SELECT question_id, wines, paper, served_count
    FROM generated_questions
    WHERE batch_id = ${batchId} AND review_state = 'kept' AND auto_kept = true
  `) as { question_id: string; wines: unknown; paper: number; served_count: number }[];

  const toReopen = rows.filter((r) => (r.served_count ?? 0) === 0);
  const skipped = rows.filter((r) => (r.served_count ?? 0) > 0);

  if (toReopen.length > 0) {
    const ids = toReopen.map((r) => r.question_id);
    await sql`
      UPDATE generated_questions SET
        review_state = 'pending', status = 'pending',
        reviewed_by = NULL, reviewed_at = NULL, auto_kept = false
      WHERE question_id = ANY(${ids})
    `;
    await sql`
      UPDATE bank_batches SET kept_count = GREATEST(0, kept_count - ${toReopen.length})
      WHERE id = ${batchId}
    `;
  }
  // Stamp the reopen even when nothing moved (all served) — the action was taken and must not repeat.
  await sql`
    UPDATE bank_batches SET reopened_at = NOW(), resolved_by = ${adminId}
    WHERE id = ${batchId}
  `;

  return {
    reopened: toReopen.length,
    skipped: skipped.length,
    skippedItems: skipped.map((r) => ({ id: r.question_id, label: bankItemLabel(r.wines, r.paper) })),
  };
}

// FALLBACK for historic items with no batch_id: reopen auto-kept items in a created_at window. Same
// served-item safety rail. There is no batch row to stamp, so reopened_at lives only on real batches.
export async function reopenWindow(from: string, to: string): Promise<ReopenResult> {
  const sql = getDb();
  const rows = (await sql`
    SELECT question_id, wines, paper, served_count
    FROM generated_questions
    WHERE batch_id IS NULL AND review_state = 'kept' AND auto_kept = true
      AND created_at >= ${from}::timestamptz AND created_at <= ${to}::timestamptz
  `) as { question_id: string; wines: unknown; paper: number; served_count: number }[];

  const toReopen = rows.filter((r) => (r.served_count ?? 0) === 0);
  const skipped = rows.filter((r) => (r.served_count ?? 0) > 0);

  if (toReopen.length > 0) {
    const ids = toReopen.map((r) => r.question_id);
    await sql`
      UPDATE generated_questions SET
        review_state = 'pending', status = 'pending',
        reviewed_by = NULL, reviewed_at = NULL, auto_kept = false
      WHERE question_id = ANY(${ids})
    `;
  }

  return {
    reopened: toReopen.length,
    skipped: skipped.length,
    skippedItems: skipped.map((r) => ({ id: r.question_id, label: bankItemLabel(r.wines, r.paper) })),
  };
}

// ── "Send back to review" ─────────────────────────────────────────────────────────────────────────
// Live counts for a batch after a mutation, so the admin card can update in place without a full
// refetch. Only counts the review states we surface; auto_kept is the "never reviewed & kept" bucket
// the Send-back button keys off.
export interface BatchCounts {
  generated: number;
  kept: number;
  binned: number;
  pending: number;
  autoKept: number;
}

async function batchCounts(batchId: string): Promise<BatchCounts> {
  const sql = getDb();
  const rows = (await sql`
    SELECT COUNT(*)::int                                                    AS generated,
           COUNT(*) FILTER (WHERE review_state = 'kept')::int               AS kept,
           COUNT(*) FILTER (WHERE review_state = 'binned')::int             AS binned,
           COUNT(*) FILTER (WHERE review_state = 'pending')::int            AS pending,
           COUNT(*) FILTER (WHERE auto_kept AND review_state = 'kept')::int AS auto_kept
    FROM generated_questions
    WHERE batch_id = ${batchId}
  `) as { generated: number; kept: number; binned: number; pending: number; auto_kept: number }[];
  const r = rows[0] ?? { generated: 0, kept: 0, binned: 0, pending: 0, auto_kept: 0 };
  return { generated: r.generated, kept: r.kept, binned: r.binned, pending: r.pending, autoKept: r.auto_kept };
}

export interface SendBackResult {
  movedCount: number;
  batch: BatchCounts;
}

// Revert every auto-approved item in a batch back to the review queue. Unlike reopenBatch this has NO
// served-item safety rail (per spec: no special handling for items already served — attempt history is
// left untouched regardless). Items go review_state='pending', status='pending', and every keep-decision
// field (reviewed_by/reviewed_at/auto_kept) is cleared so they behave identically to never-reviewed
// items in the queue. Explicit admin keeps (auto_kept=false) are never touched.
export async function sendBatchBackToReview(batchId: string): Promise<SendBackResult> {
  const sql = getDb();
  const moved = (await sql`
    UPDATE generated_questions SET
      review_state = 'pending', status = 'pending',
      reviewed_by = NULL, reviewed_at = NULL, auto_kept = false
    WHERE batch_id = ${batchId} AND review_state = 'kept' AND auto_kept = true
    RETURNING question_id
  `) as { question_id: string }[];

  if (moved.length > 0) {
    await sql`
      UPDATE bank_batches SET kept_count = GREATEST(0, kept_count - ${moved.length})
      WHERE id = ${batchId}
    `;
  }

  return { movedCount: moved.length, batch: await batchCounts(batchId) };
}

// FALLBACK for historic items with no batch_id (surfaced as a day-window pseudo-batch). Same revert,
// scoped to a created_at window. There is no batch row to update; counts are reported for the window.
export async function sendWindowBackToReview(from: string, to: string): Promise<SendBackResult> {
  const sql = getDb();
  const moved = (await sql`
    UPDATE generated_questions SET
      review_state = 'pending', status = 'pending',
      reviewed_by = NULL, reviewed_at = NULL, auto_kept = false
    WHERE batch_id IS NULL AND review_state = 'kept' AND auto_kept = true
      AND created_at >= ${from}::timestamptz AND created_at <= ${to}::timestamptz
    RETURNING question_id
  `) as { question_id: string }[];

  const rows = (await sql`
    SELECT COUNT(*)::int                                                    AS generated,
           COUNT(*) FILTER (WHERE review_state = 'kept')::int               AS kept,
           COUNT(*) FILTER (WHERE review_state = 'binned')::int             AS binned,
           COUNT(*) FILTER (WHERE review_state = 'pending')::int            AS pending,
           COUNT(*) FILTER (WHERE auto_kept AND review_state = 'kept')::int AS auto_kept
    FROM generated_questions
    WHERE batch_id IS NULL AND created_at >= ${from}::timestamptz AND created_at <= ${to}::timestamptz
  `) as { generated: number; kept: number; binned: number; pending: number; auto_kept: number }[];
  const c = rows[0] ?? { generated: 0, kept: 0, binned: 0, pending: 0, auto_kept: 0 };

  return {
    movedCount: moved.length,
    batch: { generated: c.generated, kept: c.kept, binned: c.binned, pending: c.pending, autoKept: c.auto_kept },
  };
}

export interface RecentBatchRow {
  kind: "batch" | "window";
  id: string;
  paper: number | null;
  createdAt: string;
  generated: number;
  kept: number;
  binned: number;
  pending: number;
  autoKept: number;
  servedInBatch: number;
  // Batch Undo confirm split: how many auto-kept items would actually reopen (never served) vs stay
  // kept because they've already been served, and the wine labels of those skipped items.
  reopenable: number;
  skipped: number;
  skippedItems: { id: string; label: string }[];
  resolverName: string | null;
  reopenedAt: string | null;
  canReopen: boolean;
  // Only present on 'window' rows — the historic-item fallback carries the timestamp range to reopen.
  window?: { from: string; to: string };
}

// Recent batches for the Recent-batches strip: real bank_batches rows plus, for historic items that
// predate batch bookkeeping (batch_id NULL, auto-kept), pseudo-rows synthesised from a created_at
// day-cluster. canReopen = there are auto-kept-and-still-kept items AND it has not been reopened.
export async function getRecentBatches(
  limit = 10,
  paper?: number | null
): Promise<RecentBatchRow[]> {
  const sql = getDb();
  const paperArg = paper ?? null;

  const real = (await sql`
    SELECT b.id, b.paper, b.created_at, b.reopened_at,
           u.name AS resolver_name,
           COUNT(q.id)::int AS generated,
           COUNT(q.id) FILTER (WHERE q.review_state = 'kept')::int AS kept,
           COUNT(q.id) FILTER (WHERE q.review_state = 'binned')::int AS binned,
           COUNT(q.id) FILTER (WHERE q.review_state = 'pending')::int AS pending,
           COUNT(q.id) FILTER (WHERE q.auto_kept AND q.review_state = 'kept')::int AS auto_kept,
           COUNT(q.id) FILTER (WHERE q.auto_kept AND q.review_state = 'kept' AND COALESCE(q.served_count, 0) > 0)::int AS served_auto_kept,
           COUNT(q.id) FILTER (WHERE COALESCE(q.served_count, 0) > 0)::int AS served_in_batch
    FROM bank_batches b
    LEFT JOIN generated_questions q ON q.batch_id = b.id
    LEFT JOIN users u ON u.id = b.resolved_by
    WHERE (${paperArg}::int IS NULL OR b.paper = ${paperArg})
    GROUP BY b.id, u.name
    ORDER BY b.created_at DESC
    LIMIT ${limit}
  `) as {
    id: string; paper: number | null; created_at: string; reopened_at: string | null;
    resolver_name: string | null; generated: number; kept: number; binned: number;
    pending: number; auto_kept: number; served_auto_kept: number; served_in_batch: number;
  }[];

  const realRows: RecentBatchRow[] = real.map((r) => ({
    kind: "batch",
    id: r.id,
    paper: r.paper,
    createdAt: r.created_at,
    generated: r.generated,
    kept: r.kept,
    binned: r.binned,
    pending: r.pending,
    autoKept: r.auto_kept,
    servedInBatch: r.served_in_batch,
    reopenable: Math.max(0, r.auto_kept - r.served_auto_kept),
    skipped: r.served_auto_kept,
    skippedItems: [],
    resolverName: r.resolver_name,
    reopenedAt: r.reopened_at,
    canReopen: r.auto_kept > 0 && r.reopened_at == null,
  }));

  // Historic fallback: auto-kept items with no batch, clustered by calendar day.
  const clusters = (await sql`
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
           MIN(created_at) AS from_ts, MAX(created_at) AS to_ts,
           MIN(paper)::int AS paper,
           COUNT(*)::int AS generated,
           COUNT(*) FILTER (WHERE review_state = 'kept')::int AS kept,
           COUNT(*) FILTER (WHERE auto_kept AND review_state = 'kept')::int AS auto_kept,
           COUNT(*) FILTER (WHERE auto_kept AND review_state = 'kept' AND COALESCE(served_count, 0) > 0)::int AS served_auto_kept,
           COUNT(*) FILTER (WHERE COALESCE(served_count, 0) > 0)::int AS served_in_batch
    FROM generated_questions
    WHERE batch_id IS NULL AND auto_kept = true
      AND (${paperArg}::int IS NULL OR paper = ${paperArg})
    GROUP BY day
    ORDER BY from_ts DESC
    LIMIT ${limit}
  `) as {
    day: string; from_ts: string; to_ts: string; paper: number;
    generated: number; kept: number; auto_kept: number; served_auto_kept: number; served_in_batch: number;
  }[];

  const windowRows: RecentBatchRow[] = clusters.map((c) => ({
    kind: "window",
    id: `window:${c.day}`,
    paper: c.paper,
    createdAt: c.to_ts,
    generated: c.generated,
    kept: c.kept,
    binned: 0,
    pending: 0,
    autoKept: c.auto_kept,
    servedInBatch: c.served_in_batch,
    reopenable: Math.max(0, c.auto_kept - c.served_auto_kept),
    skipped: c.served_auto_kept,
    skippedItems: [],
    resolverName: null,
    reopenedAt: null,
    canReopen: c.auto_kept > 0,
    window: { from: c.from_ts, to: c.to_ts },
  }));

  const merged = [...realRows, ...windowRows]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, limit);

  // Attach the wine labels of the skipped (served, auto-kept) items so the confirm panel can list
  // exactly which questions will stay kept. One narrow scan (served + auto-kept is a small set),
  // bucketed by batch_id for real batches and by calendar day for the historic-window pseudo-rows.
  const needLabels = merged.some((m) => m.skipped > 0);
  if (needLabels) {
    const skippedRows = (await sql`
      SELECT question_id, wines, paper, batch_id,
             to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day
      FROM generated_questions
      WHERE review_state = 'kept' AND auto_kept = true AND COALESCE(served_count, 0) > 0
    `) as { question_id: string; wines: unknown; paper: number; batch_id: string | null; day: string }[];
    for (const m of merged) {
      if (m.skipped === 0) continue;
      const matches =
        m.kind === "batch"
          ? skippedRows.filter((s) => s.batch_id === m.id)
          : skippedRows.filter((s) => s.batch_id === null && `window:${s.day}` === m.id);
      m.skippedItems = matches.map((s) => ({ id: s.question_id, label: bankItemLabel(s.wines, s.paper) }));
    }
  }

  return merged;
}

// Reverse a bin within the Undo window (review_state='binned' → 'pending'). Scoped to 'binned' so a
// replayed/late undo can't resurrect a row that was already kept or re-binned. The bin ledger row is
// removed too — an undone bin carries no reason and must not feed the "learned from your bins" digest.
// Returns the batch_id so the caller can reconcile counts.
export async function unbinBankQuestion(
  questionId: string,
  reviewerId: number
): Promise<{ batchId: string | null; changed: boolean }> {
  const sql = getDb();
  const rows = await sql`
    UPDATE generated_questions SET
      status = 'pending', review_state = 'pending', review_status = 'unreviewed',
      reviewed_at = NULL, reviewed_by = ${reviewerId}
    WHERE question_id = ${questionId} AND review_state = 'binned'
    RETURNING batch_id
  `;
  if (rows.length === 0) return { batchId: null, changed: false };
  await sql`DELETE FROM bank_bin_reasons WHERE item_id = ${questionId}`;
  return { batchId: (rows[0].batch_id as string) ?? null, changed: true };
}

// Attach reasons to already-binned items, applied to EVERY id currently on the Undo stack. Reasons are
// optional and non-blocking; each chip tap overwrites the whole (tags, note) pair for these items, so
// the client sends the current full selection every time. A no-op (0 rows) is fine — the item may have
// been undone, or expired out of the ledger. Returns how many ledger rows were updated.
export async function applyBinReasons(
  itemIds: string[],
  tags: string[] | null,
  note: string | null
): Promise<number> {
  if (itemIds.length === 0) return 0;
  const sql = getDb();
  const tagsVal = tags && tags.length > 0 ? tags : null;
  // A changed reason invalidates any stored adjudication (migration 041) — the pushback verdict was
  // computed for the OLD (tags, note) pair. Cleared here so a stale challenge can neither gate the
  // prompt feeds nor show against a reason the admin has since rewritten.
  const rows = await sql`
    UPDATE bank_bin_reasons SET reason_tags = ${tagsVal}, reason_note = ${note},
      check_verdict = NULL, check_analysis = NULL, check_fingerprint = NULL, checked_at = NULL,
      rebuttal = NULL
    WHERE item_id = ANY(${itemIds})
    RETURNING item_id
  `;
  return rows.length;
}

// ── Bin reasons (migration 028) ───────────────────────────────────────────────────────────────────

// The most recent bin reasons for a paper — SOFT feed-forward. Deduped tag+note rows, newest first,
// so the generation prompt can list "previously rejected — avoid these faults" for that paper. Rows
// with neither a tag nor a note carry no signal and are excluded. A reason the pushback check
// adjudicated INVALID (migration 041) is withheld — it would mis-train the generator; every other
// verdict (NULL = unchecked, valid, uncertain, upheld) feeds exactly as before.
export async function getRecentBinReasons(
  paper: number,
  limit = 20
): Promise<{ tags: string[]; note: string | null; binnedAt: string }[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT reason_tags, reason_note, binned_at
    FROM bank_bin_reasons
    WHERE paper = ${paper}
      AND (reason_tags IS NOT NULL OR reason_note IS NOT NULL)
      AND (check_verdict IS NULL OR check_verdict <> 'invalid')
      AND codified_by IS NULL
    ORDER BY binned_at DESC
    LIMIT ${limit}
  `) as { reason_tags: string[] | null; reason_note: string | null; binned_at: string }[];
  return rows.map((r) => ({
    tags: Array.isArray(r.reason_tags) ? r.reason_tags : [],
    note: r.reason_note ?? null,
    binnedAt: r.binned_at,
  }));
}

// Top bin-reason TAG for a paper over the last 30 days — the "Learned from your bins · Most common
// reason: … (N)" line. Returns null when there have been no tagged bins in the window.
export async function getTopBinReason(
  paper: number,
  days = 30
): Promise<{ tag: string; count: number } | null> {
  const sql = getDb();
  const rows = (await sql`
    SELECT tag, COUNT(*)::int AS count
    FROM bank_bin_reasons, UNNEST(reason_tags) AS tag
    WHERE paper = ${paper}
      AND reason_tags IS NOT NULL
      AND binned_at >= NOW() - (${days} * INTERVAL '1 day')
    GROUP BY tag
    ORDER BY count DESC, tag ASC
    LIMIT 1
  `) as { tag: string; count: number }[];
  return rows[0] ? { tag: rows[0].tag, count: rows[0].count } : null;
}

// Top bin-reason tag for every paper in one round-trip (the Fill-the-Bank status poll reads this).
export async function getTopBinReasons(
  days = 30
): Promise<Map<number, { tag: string; count: number }>> {
  const sql = getDb();
  const rows = (await sql`
    SELECT paper, tag, COUNT(*)::int AS count
    FROM bank_bin_reasons, UNNEST(reason_tags) AS tag
    WHERE reason_tags IS NOT NULL
      AND binned_at >= NOW() - (${days} * INTERVAL '1 day')
    GROUP BY paper, tag
  `) as { paper: number; tag: string; count: number }[];
  const best = new Map<number, { tag: string; count: number }>();
  for (const r of rows) {
    const cur = best.get(r.paper);
    if (!cur || r.count > cur.count || (r.count === cur.count && r.tag < cur.tag)) {
      best.set(r.paper, { tag: r.tag, count: r.count });
    }
  }
  return best;
}

// ── The Bin page (/admin/bin) ───────────────────────────────────────────────────────────────────

export interface BinnedItem {
  itemId: string;
  paper: number;
  familyLabel: string | null;
  stem: string;
  marks: number | null;
  reasons: string[];
  note: string | null;
  binnedByName: string | null;
  binnedAt: string;
}

// The binned-item list for The Bin, newest first, optionally filtered by a single reason tag and/or a
// paper. Joins the reason ledger to the (soft-deleted) generated_questions row for the stem/marks/family
// and to users for the "binned by" name. A ledger row whose question was hard-deleted by an older path
// still shows (LEFT JOIN) with a null stem, so counts never silently drop.
export async function getBinnedItems(
  opts: { reason?: string | null; paper?: number | null; limit?: number } = {}
): Promise<BinnedItem[]> {
  const sql = getDb();
  const reason = opts.reason ?? null;
  const paper = opts.paper ?? null;
  const limit = opts.limit ?? 200;
  const rows = (await sql`
    SELECT b.item_id, b.paper, b.reason_tags, b.reason_note, b.binned_at,
           g.family_label, g.question_text, g.total_marks,
           u.name AS binned_by_name
    FROM bank_bin_reasons b
    LEFT JOIN generated_questions g ON g.question_id = b.item_id
    LEFT JOIN users u ON u.id = b.binned_by
    WHERE (${paper}::int IS NULL OR b.paper = ${paper})
      AND (${reason}::text IS NULL OR ${reason} = ANY(b.reason_tags))
    ORDER BY b.binned_at DESC
    LIMIT ${limit}
  `) as {
    item_id: string;
    paper: number;
    reason_tags: string[] | null;
    reason_note: string | null;
    binned_at: string;
    family_label: string | null;
    question_text: string | null;
    total_marks: number | null;
    binned_by_name: string | null;
  }[];
  return rows.map((r) => ({
    itemId: r.item_id,
    paper: r.paper,
    familyLabel: r.family_label ?? null,
    stem: r.question_text ?? "",
    marks: r.total_marks ?? null,
    reasons: Array.isArray(r.reason_tags) ? r.reason_tags : [],
    note: r.reason_note ?? null,
    binnedByName: r.binned_by_name ?? null,
    binnedAt: r.binned_at,
  }));
}

// Reason tally across the whole ledger — the "reason label + count" row on The Bin. Only tagged rows
// contribute; a bare (reasonless) bin adds to no tally bucket.
export async function getBinReasonTally(): Promise<{ reason: string; count: number }[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT tag AS reason, COUNT(*)::int AS count
    FROM bank_bin_reasons, UNNEST(reason_tags) AS tag
    WHERE reason_tags IS NOT NULL
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `) as { reason: string; count: number }[];
  return rows;
}

// Distinct papers present in the ledger — drives The Bin's paper filter dropdown.
export async function getBinPapers(): Promise<number[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT DISTINCT paper FROM bank_bin_reasons ORDER BY paper ASC
  `) as { paper: number }[];
  return rows.map((r) => r.paper);
}

// The most recent bins ACROSS ALL PAPERS (tags + note + paper), newest first — the raw material the
// LLM distils into the "Lessons for new questions" summary. Rows carrying neither a tag nor a note hold
// no signal and are skipped, as is any reason the pushback check adjudicated INVALID (migration 041).
export async function getRecentBinReasonRows(
  limit = 50
): Promise<{ tags: string[]; note: string | null; paper: number }[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT reason_tags, reason_note, paper
    FROM bank_bin_reasons
    WHERE (reason_tags IS NOT NULL OR reason_note IS NOT NULL)
      AND (check_verdict IS NULL OR check_verdict <> 'invalid')
      AND codified_by IS NULL
    ORDER BY binned_at DESC
    LIMIT ${limit}
  `) as { reason_tags: string[] | null; reason_note: string | null; paper: number }[];
  return rows.map((r) => ({
    tags: Array.isArray(r.reason_tags) ? r.reason_tags : [],
    note: r.reason_note ?? null,
    paper: r.paper,
  }));
}

// ── Bin-reason pushback (migration 041) ───────────────────────────────────────────────────────────

export interface ChallengedBin {
  itemId: string;
  paper: number;
  stem: string;
  reasons: string[];
  note: string | null;
  analysis: string | null;
  binnedAt: string;
}

// Reasoned bins the adjudication check judged INVALID and the admin has not yet acted on — the
// "Pushback" strip on /admin. Newest first. Restoring the question (unbin) or upholding the bin both
// remove a row from this set (unbin drops the ledger row; uphold flips the verdict to 'upheld').
export async function getChallengedBins(limit = 12): Promise<ChallengedBin[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT b.item_id, b.paper, b.reason_tags, b.reason_note, b.check_analysis, b.binned_at,
           g.question_text
    FROM bank_bin_reasons b
    LEFT JOIN generated_questions g ON g.question_id = b.item_id
    WHERE b.check_verdict = 'invalid'
    ORDER BY b.binned_at DESC
    LIMIT ${limit}
  `) as {
    item_id: string;
    paper: number;
    reason_tags: string[] | null;
    reason_note: string | null;
    check_analysis: string | null;
    binned_at: string;
    question_text: string | null;
  }[];
  return rows.map((r) => ({
    itemId: r.item_id,
    paper: r.paper,
    stem: r.question_text ?? "",
    reasons: Array.isArray(r.reason_tags) ? r.reason_tags : [],
    note: r.reason_note ?? null,
    analysis: r.check_analysis ?? null,
    binnedAt: r.binned_at,
  }));
}

// The admin's override of a challenge: the bin stays binned AND the reason re-enters the prompt
// feeds ('upheld' passes the digest/lessons gate). Scoped to 'invalid' so a replayed click can't
// stamp over a verdict that has since been recomputed for a new reason.
export async function upholdBinReason(itemId: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    UPDATE bank_bin_reasons SET check_verdict = 'upheld'
    WHERE item_id = ${itemId} AND check_verdict = 'invalid'
    RETURNING item_id
  `;
  return rows.length > 0;
}

// Store the admin's rebuttal to a challenge (migration 043). Scoped to rows currently at 'invalid' —
// a rebuttal is an answer to a live challenge, nothing else. The caller re-runs the check afterwards;
// the changed fingerprint (which includes the rebuttal) is what lets it run.
export async function setBinReasonRebuttal(itemId: string, rebuttal: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    UPDATE bank_bin_reasons SET rebuttal = ${rebuttal}
    WHERE item_id = ${itemId} AND check_verdict = 'invalid'
    RETURNING item_id
  `;
  return rows.length > 0;
}

// ── Bin root-cause miner + codify-and-retire (migration 042) ─────────────────────────────────────

// Ledger rows the miner may cluster: reasoned, not challenged-invalid, not already codified into a
// shipped fix. Joined to the (soft-deleted) question row for the stem so clusters can be grounded.
export async function getBinRowsForMining(
  limit = 150
): Promise<{ itemId: string; paper: number; tags: string[]; note: string | null; stem: string | null; binnedAt: string }[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT b.item_id, b.paper, b.reason_tags, b.reason_note, b.binned_at, g.question_text
    FROM bank_bin_reasons b
    LEFT JOIN generated_questions g ON g.question_id = b.item_id
    WHERE (b.reason_tags IS NOT NULL OR b.reason_note IS NOT NULL)
      AND (b.check_verdict IS NULL OR b.check_verdict <> 'invalid')
      AND b.codified_by IS NULL
    ORDER BY b.binned_at DESC
    LIMIT ${limit}
  `) as {
    item_id: string;
    paper: number;
    reason_tags: string[] | null;
    reason_note: string | null;
    // string in JSON call paths, Date in direct ones — the map below normalises (see its comment).
    binned_at: string | Date;
    question_text: string | null;
  }[];
  return rows.map((r) => ({
    itemId: r.item_id,
    paper: r.paper,
    tags: Array.isArray(r.reason_tags) ? r.reason_tags : [],
    note: r.reason_note ?? null,
    stem: r.question_text ?? null,
    // The neon driver hands TIMESTAMPTZ back as a Date in direct (non-JSON) call paths — normalise
    // to ISO here so consumers (the miner prompt slices a date prefix) always get a string.
    binnedAt: r.binned_at instanceof Date ? r.binned_at.toISOString() : String(r.binned_at),
  }));
}

export interface BinFixProposal {
  id: number;
  theme: string;
  kind: string;
  paper: number | null;
  evidenceItemIds: string[];
  proposal: string;
  status: string;
  workBranch: string | null;
  prUrl: string | null;
  applyError: string | null;
  retiredAt: string | null;
  createdAt: string;
}

function mapBinFixProposal(r: Record<string, unknown>): BinFixProposal {
  return {
    id: r.id as number,
    theme: r.theme as string,
    kind: r.kind as string,
    paper: (r.paper as number | null) ?? null,
    evidenceItemIds: Array.isArray(r.evidence_item_ids) ? (r.evidence_item_ids as string[]) : [],
    proposal: r.proposal as string,
    status: r.status as string,
    workBranch: (r.work_branch as string | null) ?? null,
    prUrl: (r.pr_url as string | null) ?? null,
    applyError: (r.apply_error as string | null) ?? null,
    retiredAt: (r.retired_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

export async function getBinFixProposals(limit = 50): Promise<BinFixProposal[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT * FROM bin_fix_proposals ORDER BY created_at DESC LIMIT ${limit}
  `) as Record<string, unknown>[];
  return rows.map(mapBinFixProposal);
}

export async function getBinFixProposal(id: number): Promise<BinFixProposal | null> {
  const sql = getDb();
  const rows = (await sql`
    SELECT * FROM bin_fix_proposals WHERE id = ${id}
  `) as Record<string, unknown>[];
  return rows[0] ? mapBinFixProposal(rows[0]) : null;
}

export async function insertBinFixProposal(p: {
  theme: string;
  kind: string;
  paper: number | null;
  evidenceItemIds: string[];
  proposal: string;
}): Promise<BinFixProposal> {
  const sql = getDb();
  const rows = (await sql`
    INSERT INTO bin_fix_proposals (theme, kind, paper, evidence_item_ids, proposal)
    VALUES (${p.theme}, ${p.kind}, ${p.paper}, ${p.evidenceItemIds}, ${p.proposal})
    RETURNING *
  `) as Record<string, unknown>[];
  return mapBinFixProposal(rows[0]);
}

// Status transitions are SCOPED to the states they may leave from, so a replayed click or a stale
// reconcile can't drag a proposal backwards (e.g. shipped → dispatched).
export async function markBinFixDispatched(
  id: number,
  workBranch: string,
  decidedBy: number
): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    UPDATE bin_fix_proposals SET
      status = 'dispatched', work_branch = ${workBranch}, decided_by = ${decidedBy}, updated_at = NOW()
    WHERE id = ${id} AND status IN ('proposed', 'failed', 'pr_closed')
    RETURNING id
  `;
  return rows.length > 0;
}

export async function markBinFixRejected(id: number, decidedBy: number): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    UPDATE bin_fix_proposals SET status = 'rejected', decided_by = ${decidedBy}, updated_at = NOW()
    WHERE id = ${id} AND status = 'proposed'
    RETURNING id
  `;
  return rows.length > 0;
}

export async function markBinFixPrState(id: number, state: "merged" | "pr_closed"): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE bin_fix_proposals SET status = ${state}, updated_at = NOW()
    WHERE id = ${id} AND status IN ('dispatched', 'pr_opened')
  `;
}

// Codify-and-retire: the fix is merged, so the cluster's ledger rows leave the digest/lessons
// prompt feeds permanently and the proposal closes as 'shipped'. Idempotent — a re-run finds
// status already 'shipped' and does nothing.
export async function retireBinFixEvidence(id: number): Promise<number> {
  const sql = getDb();
  const rows = await sql`
    UPDATE bin_fix_proposals SET status = 'shipped', retired_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND status = 'merged'
    RETURNING evidence_item_ids
  `;
  if (rows.length === 0) return 0;
  const evidence = (rows[0].evidence_item_ids as string[]) ?? [];
  if (evidence.length === 0) return 0;
  const retired = await sql`
    UPDATE bank_bin_reasons SET codified_by = ${id}
    WHERE item_id = ANY(${evidence}) AND codified_by IS NULL
    RETURNING item_id
  `;
  return retired.length;
}

// ── "Why wines get binned" (spec: learning loop) ─────────────────────────────────────────────────
//
// Aggregate the reason_codes over the bins that belong to the last N bank_batches (default 5), plus
// the 3 most-recent free-text notes from that same window. Bins are keyed by item_id, so we join the
// (soft-deleted) generated_questions row to recover its batch_id and scope to the recent batches. The
// caller maps codes → labels; here we only count.
export interface BinReasonAggregation {
  reasons: { code: string; count: number }[];
  notes: { note: string; paper: number; binnedAt: string }[];
}
export async function getBinReasonAggregation(batches = 5): Promise<BinReasonAggregation> {
  const sql = getDb();

  const reasons = (await sql`
    SELECT tag AS code, COUNT(*)::int AS count
    FROM bank_bin_reasons b
    JOIN generated_questions g ON g.question_id = b.item_id
    CROSS JOIN LATERAL UNNEST(b.reason_tags) AS tag
    WHERE b.reason_tags IS NOT NULL
      AND g.batch_id IN (
        SELECT id FROM bank_batches ORDER BY created_at DESC LIMIT ${batches}
      )
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `) as { code: string; count: number }[];

  const notes = (await sql`
    SELECT b.reason_note AS note, b.paper, b.binned_at
    FROM bank_bin_reasons b
    JOIN generated_questions g ON g.question_id = b.item_id
    WHERE b.reason_note IS NOT NULL AND btrim(b.reason_note) <> ''
      AND g.batch_id IN (
        SELECT id FROM bank_batches ORDER BY created_at DESC LIMIT ${batches}
      )
    ORDER BY b.binned_at DESC
    LIMIT 3
  `) as { note: string; paper: number; binned_at: string }[];

  return {
    reasons,
    notes: notes.map((n) => ({ note: n.note, paper: n.paper, binnedAt: n.binned_at })),
  };
}

// Per-paper bank health for the Admin card: how many APPROVED (servable) and PENDING (awaiting
// review) questions exist per paper.
export async function getBankStatusCounts(): Promise<
  { paper: number; approved: number; pending: number }[]
> {
  const sql = getDb();
  const rows = (await sql`
    SELECT paper,
      COUNT(*) FILTER (WHERE review_state = 'kept' AND invalid_reasons IS NULL AND is_retired IS NOT TRUE)::int AS approved,
      COUNT(*) FILTER (WHERE review_state = 'pending')::int AS pending
    FROM generated_questions
    WHERE paper IN (1, 2, 3)
    GROUP BY paper
    ORDER BY paper
  `) as { paper: number; approved: number; pending: number }[];
  return rows;
}

// Kept-bank composition per (paper, family) — how many APPROVED, servable questions of each
// question-family currently sit in the bank. The Admin card reads this to derive the "gap hint"
// (the least-represented family for a paper) and the diversity worker could reuse it to steer
// round-robin generation toward thin families.
export async function getBankFamilyHistogram(): Promise<
  { paper: number; family: string; count: number }[]
> {
  const sql = getDb();
  const rows = (await sql`
    SELECT paper, family, COUNT(*)::int AS count
    FROM generated_questions
    WHERE paper IN (1, 2, 3)
      AND review_state = 'kept'
      AND invalid_reasons IS NULL
      AND is_retired IS NOT TRUE
      AND scope = 'pool'
      AND family IS NOT NULL
    GROUP BY paper, family
  `) as { paper: number; family: string; count: number }[];
  return rows;
}

// Sum the real Claude spend attributed to a batch's questions (question_generation +
// model_answer + enrichment all stamp question_id), so bank_batches.actual_cost_usd reflects money
// actually spent rather than the up-front estimate.
export async function getBatchActualCost(batchId: string): Promise<number> {
  const sql = getDb();
  // Attribute by batch_id OR question_id, never double-counting a row that carries both. batch_id
  // (migration 029) is the one that survives a FAILED attempt: it saves no question, so the
  // question_id join alone silently dropped its spend and a batch that banked nothing reconciled to
  // $0.00. The question_id arm stays so rows written before 028 still reconcile.
  const rows = (await sql`
    SELECT COALESCE(SUM(m.cost_usd), 0) AS cost
    FROM model_usage m
    WHERE m.batch_id = ${batchId}
       OR m.question_id IN (SELECT question_id FROM generated_questions WHERE batch_id = ${batchId})
  `) as { cost: string }[];
  return Number(rows[0]?.cost ?? 0);
}

// Real average Claude spend per banked question, derived from the SAME model_usage rows the
// /admin/costs dashboard reads: total spend attributed to bank-batch questions ÷ number of those
// questions. Every banked question pays for a generation + a model answer + an enrichment pass, so
// this rolls all three into one honest per-question figure. Returns 0 when no bank spend exists yet
// (the Admin card then falls back to the static EST_COST_PER_QUESTION estimate).
export async function getBankPerQuestionAvgCost(): Promise<number> {
  const sql = getDb();
  const rows = (await sql`
    SELECT COALESCE(SUM(m.cost_usd), 0) AS cost,
           COUNT(DISTINCT q.question_id)::int AS questions
    FROM generated_questions q
    JOIN model_usage m ON m.question_id = q.question_id
    WHERE q.batch_id IS NOT NULL
  `) as { cost: string; questions: number }[];
  const cost = Number(rows[0]?.cost ?? 0);
  const questions = Number(rows[0]?.questions ?? 0);
  return questions > 0 ? cost / questions : 0;
}

// ── Bank Health analytics (migration 026) ────────────────────────────────────────────────────────
//
// The Bank Health page aggregates the servable ("kept") pool. The scalar slices are computed as SQL
// GROUP BY over the indexed columns migration 026 added, so they stay fast at 10k+ rows; the
// free-text-dependent slices (grape/region coverage, mark focus, over-representation) read a lite
// projection and derive in TypeScript. The whole payload is cached for 60s by the route.

// A servable banked question is kept, not quarantined, not retired. The candidate-facing bank reads
// additionally exclude questions whose stem_answer_key failed validation (k.validated = false, an
// unresolvable-wine signal — see getQuestionsByFilter), so Bank Health may count a handful more rows
// than are actually servable; the analytics deliberately keep the cheaper three-flag gate.
const KEPT_BANK_SQL_WHERE = "review_state = 'kept' AND invalid_reasons IS NULL AND is_retired IS NOT TRUE AND scope = 'pool'";

export interface BankHealthLiteRow {
  question_id: string;
  paper: number;
  question_text: string;
  wines: unknown;
  total_marks: number;
  times_served: number;
  created_at: string;
  // Batch Undo (migration 033): true when an admin explicitly reviewed this item (reviewed_by set),
  // false for a never-reviewed auto-keep. Drives the "Reviewed" / "Never reviewed" badge + filter.
  reviewed: boolean;
}

// Total servable questions + how many have never been served. `paper` (1|2|3) scopes the counts to a
// single paper for the Bank Health paper filter; null/undefined keeps the all-papers behaviour.
export async function getBankHealthTotals(
  paper?: number | null
): Promise<{ total: number; unserved: number }> {
  const sql = getDb();
  const paperArg = paper ?? null;
  const rows = (await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE COALESCE(times_served, 0) = 0)::int AS unserved
    FROM generated_questions
    WHERE review_state = 'kept' AND invalid_reasons IS NULL AND is_retired IS NOT TRUE
      AND scope = 'pool'
      AND (${paperArg}::int IS NULL OR paper = ${paperArg})
  `) as { total: number; unserved: number }[];
  return { total: rows[0]?.total ?? 0, unserved: rows[0]?.unserved ?? 0 };
}

// GROUP BY count over one of the four scalar slice columns. `column` is a fixed whitelist member —
// never user input — so interpolating it into the query text is safe. NULLs are coalesced to a
// slice-appropriate default (curveball → 'low'; question_type → 'other') except price_band, whose
// NULLs (no price signal) are excluded so the slice's percentages are over rows that actually carry
// a band.
export async function getBankSliceCounts(
  column: "paper" | "question_type" | "curveball" | "price_band",
  paper?: number | null
): Promise<{ key: string; count: number }[]> {
  const sql = getDb();
  const keyExpr =
    column === "curveball"
      ? "COALESCE(curveball, 'low')"
      : column === "question_type"
        ? "COALESCE(question_type, 'other')"
        : column;
  const extraWhere = column === "price_band" ? " AND price_band IS NOT NULL" : "";
  // paper is a validated 1|2|3 (or null) — never raw user text — so parameterising it keeps the
  // all-papers behaviour untouched while scoping the GROUP BY when a paper is selected.
  const paperArg = paper ?? null;
  const rows = (await sql.query(
    `SELECT ${keyExpr}::text AS key, COUNT(*)::int AS count
       FROM generated_questions
      WHERE ${KEPT_BANK_SQL_WHERE}${extraWhere}
        AND ($1::int IS NULL OR paper = $1)
      GROUP BY ${keyExpr}`,
    [paperArg]
  )) as { key: string; count: number }[];
  return rows;
}

// Flight-size slice, bucketed to the 2 / 3 / 4+ benchmark keys in SQL.
export async function getFlightSizeCounts(
  paper?: number | null
): Promise<{ key: string; count: number }[]> {
  const sql = getDb();
  const paperArg = paper ?? null;
  const rows = (await sql`
    SELECT CASE
             WHEN flight_size = 2 THEN '2'
             WHEN flight_size = 3 THEN '3'
             WHEN flight_size >= 4 THEN '4plus'
           END AS key,
           COUNT(*)::int AS count
    FROM generated_questions
    WHERE ${sql.unsafe(KEPT_BANK_SQL_WHERE)}
      AND flight_size >= 2
      AND (${paperArg}::int IS NULL OR paper = ${paperArg})
    GROUP BY key
  `) as { key: string; count: number }[];
  return rows;
}

// Keep/bin funnel across completed bulk runs: how many drafts were generated vs kept. Binned rows
// are hard-deleted, so the bin count is (generated − kept). Feeds the overview keep/binned rates.
export async function getBankBatchKeepStats(
  paper?: number | null
): Promise<{ generated: number; kept: number }> {
  const sql = getDb();
  const paperArg = paper ?? null;
  const rows = (await sql`
    SELECT COALESCE(SUM(generated_count), 0)::int AS generated,
           COALESCE(SUM(kept_count), 0)::int AS kept
    FROM bank_batches
    WHERE status IN ('ready', 'complete')
      AND (${paperArg}::int IS NULL OR paper = ${paperArg})
  `) as { generated: number; kept: number }[];
  return { generated: rows[0]?.generated ?? 0, kept: rows[0]?.kept ?? 0 };
}

// The rule names that most often caused a draft to be rejected, from the generation attempt log.
// Powers the "top bin reason" caption. Rule names are internal; the UI maps them to plain copy.
export async function getTopRejectionReasons(
  limit = 5
): Promise<{ reason: string; count: number }[]> {
  const sql = getDb();
  try {
    const rows = (await sql`
      SELECT rule AS reason, COUNT(*)::int AS count
      FROM generation_attempts, LATERAL unnest(rules_fired) AS rule
      WHERE passed = false
      GROUP BY rule
      ORDER BY count DESC
      LIMIT ${limit}
    `) as { reason: string; count: number }[];
    return rows;
  } catch {
    // generation_attempts may not be migrated in every environment — degrade to no reasons.
    return [];
  }
}

// Lite projection of the servable pool for the TypeScript-derived slices. Only the columns those
// derivations need, so even a 10k-row scan stays a few MB and is cached for 60s upstream.
export async function getKeptBankLite(paper?: number | null): Promise<BankHealthLiteRow[]> {
  const sql = getDb();
  const paperArg = paper ?? null;
  const rows = (await sql`
    SELECT question_id, paper, question_text, wines, total_marks,
           COALESCE(times_served, 0)::int AS times_served, created_at,
           (reviewed_by IS NOT NULL) AS reviewed
    FROM generated_questions
    WHERE review_state = 'kept' AND invalid_reasons IS NULL AND is_retired IS NOT TRUE
      AND scope = 'pool'
      AND (${paperArg}::int IS NULL OR paper = ${paperArg})
  `) as BankHealthLiteRow[];
  return rows;
}

export interface BankSliceItemRow {
  question_id: string;
  paper: number;
  question_text: string;
  wines: unknown;
  total_marks: number;
  times_served: number;
  created_at: string;
  reviewed: boolean;
}

// Batch Undo (migration 033): the "Never reviewed" filter chip on Bank Health. 'never' = auto-kept
// items an admin has not reviewed; 'reviewed' = explicitly reviewed. Maps to a SQL predicate over the
// column-backed slices and is applied in TypeScript for the derived slices.
export type ReviewStateFilter = "all" | "reviewed" | "never";
function reviewStatePredicate(filter: ReviewStateFilter): string {
  if (filter === "reviewed") return " AND reviewed_by IS NOT NULL";
  if (filter === "never") return " AND reviewed_by IS NULL";
  return "";
}

// Items for a column-backed slice (paper / questionType / curveball / flightSize / priceBand),
// paginated by created_at + id. Free-text slices (grape/region/markFocus/overRepetition) are
// filtered in TypeScript by the route from getKeptBankLite instead.
export async function getBankSliceItemsByColumn(
  column: "paper" | "question_type" | "curveball" | "price_band" | "flight_size",
  key: string,
  limit: number,
  offset: number,
  reviewStateFilter: ReviewStateFilter = "all",
  paper?: number | null
): Promise<BankSliceItemRow[]> {
  const sql = getDb();
  let predicate: string;
  const params: unknown[] = [];
  if (column === "flight_size") {
    predicate = key === "4plus" ? "flight_size >= 4" : "flight_size = $1";
    if (key !== "4plus") params.push(Number(key));
  } else if (column === "curveball") {
    predicate = "COALESCE(curveball, 'low') = $1";
    params.push(key);
  } else if (column === "question_type") {
    predicate = "COALESCE(question_type, 'other') = $1";
    params.push(key);
  } else if (column === "paper") {
    predicate = "paper = $1";
    params.push(Number(key));
  } else {
    predicate = "price_band = $1";
    params.push(key);
  }
  // Bank Health paper filter: scope the drill-down list to a single paper when selected. `paper` is a
  // validated 1|2|3 from the route; null keeps the unscoped behaviour.
  let paperScope = "";
  if (paper != null) {
    params.push(Number(paper));
    paperScope = ` AND paper = $${params.length}`;
  }
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;
  params.push(limit, offset);
  const rows = (await sql.query(
    `SELECT question_id, paper, question_text, wines, total_marks,
            COALESCE(times_served, 0)::int AS times_served, created_at,
            (reviewed_by IS NOT NULL) AS reviewed
       FROM generated_questions
      WHERE ${KEPT_BANK_SQL_WHERE} AND ${predicate}${paperScope}${reviewStatePredicate(reviewStateFilter)}
      ORDER BY created_at DESC, question_id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  )) as BankSliceItemRow[];
  return rows;
}

export async function createAttempt(
  questionId: string,
  mode: string | null = null,
  stemDetail: string = "exam_real"
): Promise<UserAttempt> {
  const sql = getDb();
  // `mode` is NOT NULL DEFAULT 'full' in the DB. A column default only applies when the column is
  // OMITTED from the INSERT — an explicit NULL violates the constraint and 500s. A "normal" study
  // attempt is canonically 'full' (the query layer already treats NULL and 'full' as equivalent),
  // so coalesce null → 'full' here rather than inserting NULL. stem_detail is likewise NOT NULL.
  const rows = await sql`
    INSERT INTO user_attempts (question_id, mode, stem_detail, app_version)
    VALUES (${questionId}, ${mode ?? "full"}, ${stemDetail || "exam_real"}, ${getAppVersion()})
    RETURNING *
  `;
  return rows[0] as UserAttempt;
}

export async function createAttemptWithUser(
  questionId: string,
  userId: number,
  mode: string | null = null,
  stemDetail: string = "exam_real"
): Promise<UserAttempt> {
  const sql = getDb();
  // See createAttempt: coalesce null → 'full' so the explicit insert satisfies the NOT NULL mode column.
  const rows = await sql`
    INSERT INTO user_attempts (question_id, user_id, mode, stem_detail, app_version)
    VALUES (${questionId}, ${userId}, ${mode ?? "full"}, ${stemDetail || "exam_real"}, ${getAppVersion()})
    RETURNING *
  `;
  return rows[0] as UserAttempt;
}

// Record user feedback WITHOUT ever overwriting an attempt that already carries different
// feedback. Two distinct submissions used to clobber one row's `user_feedback` (the attempt-188
// incident); the one-shot analysis guard then meant the second was never analyzed, and apply/sync
// re-read the mutated column at different times → divergent ledger. Now each distinct feedback gets
// its own attempt row (multiple attempts per question are already supported and rendered), so every
// feedback has an immutable home that is analyzed exactly once against the text it contains.
//
// Returns the attempt id the feedback now lives on, and whether the caller should run analysis
// (true for a fresh write or a forked row; false for an idempotent re-submit of identical text).
export async function getAttemptById(attemptId: number): Promise<UserAttempt | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM user_attempts WHERE id = ${attemptId}`;
  return (rows[0] as UserAttempt) ?? null;
}

export async function recordUserFeedback(
  attemptId: number,
  text: string
): Promise<{ id: number; analyze: boolean }> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, question_id, user_id, mode, user_feedback, app_version
    FROM user_attempts WHERE id = ${attemptId}
  `;
  const existing = rows[0] as
    | {
        id: number;
        question_id: string;
        user_id: number | null;
        mode: string | null;
        user_feedback: string | null;
        app_version: string | null;
      }
    | undefined;
  if (!existing) {
    // No such attempt — fall back to a plain update so behaviour matches the legacy path.
    await sql`
      UPDATE user_attempts SET
        user_feedback = ${text},
        feedback_submitted_at = COALESCE(feedback_submitted_at, NOW())
      WHERE id = ${attemptId}
    `;
    return { id: attemptId, analyze: true };
  }

  const current = (existing.user_feedback || "").trim();
  // First feedback on this attempt → record it on the row.
  if (!current) {
    await sql`
      UPDATE user_attempts SET
        user_feedback = ${text},
        feedback_submitted_at = COALESCE(feedback_submitted_at, NOW())
      WHERE id = ${attemptId}
    `;
    return { id: attemptId, analyze: true };
  }
  // Identical re-submission → idempotent no-op (don't spawn a duplicate or re-analyze).
  if (current === text.trim()) {
    return { id: attemptId, analyze: false };
  }
  // A different second feedback → give it its own attempt row instead of overwriting. The fork
  // inherits the parent's build stamp (it describes the same study episode); only a parent from
  // before migration 019 falls back to the build recording the feedback.
  const ins = await sql`
    INSERT INTO user_attempts (question_id, user_id, mode, user_feedback, feedback_submitted_at, app_version)
    VALUES (
      ${existing.question_id}, ${existing.user_id}, ${existing.mode ?? "full"}, ${text}, NOW(),
      ${existing.app_version ?? getAppVersion()}
    )
    RETURNING id
  `;
  return { id: ins[0].id as number, analyze: true };
}

export async function updateAttempt(
  attemptId: number,
  data: Partial<{
    pre_glass_reasoning: string;
    pre_glass_feedback: string;
    tasting_notes: string[];
    user_answer: string;
    // How the answer was produced (migration 023). Written alongside user_answer.
    input_method: "typed" | "voice";
    answer_feedback: string;
    pass_estimate: string;
    marks_estimate: string;
    completed_at: string;
    user_feedback: string;
    elapsed_seconds: number;
    current_step: string;
    // Flash Notes per-card / per-deck metadata (migration 011). Written once, right after the
    // attempt is created, in a single update before the card is graded.
    prompt_type: string;
    flight_wine_count: number;
    deck_id: string | null;
    card_index: number | null;
    deck_settings: Record<string, unknown> | null;
    // Stem Detail escalation ("Add detail"): the level the candidate ended at. One-way.
    stem_detail_escalated_to: string;
    // Pace (migration 021): the per-attempt pace report, written once at submit.
    pace: PaceData;
  }>
): Promise<UserAttempt> {
  const sql = getDb();

  if (data.pace !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET pace = ${JSON.stringify(data.pace)} WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }

  if (data.stem_detail_escalated_to !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET stem_detail_escalated_to = ${data.stem_detail_escalated_to} WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }

  // Flash Notes metadata write — set the per-card/per-deck columns in one shot. Detected by
  // prompt_type (always present for a Flash card) so it can't collide with the field-at-a-time
  // study updates below.
  if (data.prompt_type !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET
        prompt_type = ${data.prompt_type},
        flight_wine_count = ${data.flight_wine_count ?? null},
        deck_id = ${data.deck_id ?? null},
        card_index = ${data.card_index ?? null},
        deck_settings = ${data.deck_settings ? JSON.stringify(data.deck_settings) : null}
      WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }

  if (data.current_step !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET current_step = ${data.current_step} WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }
  if (data.pre_glass_reasoning !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET pre_glass_reasoning = ${data.pre_glass_reasoning} WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }
  if (data.pre_glass_feedback !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET pre_glass_feedback = ${data.pre_glass_feedback} WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }
  if (data.tasting_notes !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET tasting_notes = ${JSON.stringify(data.tasting_notes)} WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }
  if (data.user_answer !== undefined) {
    // input_method rides along with the answer it describes (migration 023) — 'voice' means the
    // grader reported spelling without deducting for it. Guarded to the two legal values because
    // the column carries a CHECK constraint; anything else keeps the 'typed' default.
    const inputMethod = data.input_method === "voice" ? "voice" : "typed";
    const rows = await sql`
      UPDATE user_attempts SET user_answer = ${data.user_answer}, input_method = ${inputMethod}
      WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }
  if (data.answer_feedback !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET
        answer_feedback = ${data.answer_feedback},
        pass_estimate = ${data.pass_estimate || null},
        marks_estimate = ${data.marks_estimate || null},
        elapsed_seconds = ${data.elapsed_seconds || null},
        completed_at = NOW()
      WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }
  if (data.user_feedback !== undefined) {
    // Stamp when feedback was left (kept stable across later edits via COALESCE) so
    // the admin dashboard can sort by feedback recency rather than question completion.
    const rows = await sql`
      UPDATE user_attempts SET
        user_feedback = ${data.user_feedback},
        feedback_submitted_at = COALESCE(feedback_submitted_at, NOW())
      WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }

  const rows = await sql`SELECT * FROM user_attempts WHERE id = ${attemptId}`;
  return rows[0] as UserAttempt;
}

export async function reviewFeedback(
  attemptId: number,
  status: string,
  adminNote: string | null,
  decidedBy: "auto" | "manual" = "manual"
): Promise<UserAttempt> {
  const sql = getDb();
  const rows = await sql`
    UPDATE user_attempts SET
      feedback_status = ${status},
      feedback_admin_note = ${adminNote},
      feedback_decided_by = ${decidedBy},
      feedback_reviewed_at = NOW()
    WHERE id = ${attemptId} RETURNING *
  `;
  return rows[0] as UserAttempt;
}

// Serve a cached feedback image (base64 bytes) by id. Used by /api/media/[id].
export async function getMediaById(
  id: number
): Promise<{ content_type: string; image_base64: string } | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT content_type, image_base64 FROM media_cache
    WHERE id = ${id} AND image_base64 IS NOT NULL`;
  return rows.length ? (rows[0] as { content_type: string; image_base64: string }) : null;
}

export type RecentAttempt = UserAttempt & {
  paper: number;
  family: string;
  family_label: string;
  p3_category: string | null;
};

export async function getRecentAttempts(
  limit = 20,
  userId?: number | null
): Promise<RecentAttempt[]> {
  // When `userId` is given, returns only that user's recent attempts — so the serve layer can build
  // a per-user "recently served" set instead of one polluted by other users' activity. `uid` null
  // preserves the prior global behaviour for any caller that wants a cross-user view.
  //
  // p3_category rides along so the Paper 3 weighted sampler can count recently-served style families
  // without a second query.
  const uid = userId ?? null;
  const sql = getDb();
  return (await sql`
    SELECT a.*, q.paper, q.family, q.family_label, q.p3_category
    FROM user_attempts a
    JOIN generated_questions q ON a.question_id = q.question_id
    WHERE (${uid}::int IS NULL OR a.user_id = ${uid})
    ORDER BY a.started_at DESC
    LIMIT ${limit}
  `) as RecentAttempt[];
}

export interface AttemptWithDetails extends UserAttempt {
  paper: number;
  family: string;
  family_label: string;
  question_text: string;
  wines: { slot: number; fullText: string }[];
  model_answer: string | null;
  total_marks: number;
  subcategory: string | null;
  // Drill attempts (Stem Sniper / Reverse Tasting): mode + the full scored payload. Returned by the
  // a.* select in getUserAttempts; history renders these instead of the study answer/debrief fields.
  mode: string | null;
  drill_payload: unknown;
  // Stem Detail (migration 013): start level + escalation target (via a.* in getUserAttempts).
  stem_detail: string;
  stem_detail_escalated_to: string | null;
  // Pace (migration 021): per-attempt pace report (via a.* in getUserAttempts). NULL when absent.
  pace: PaceData | null;
  // The AI's response to this attempt's feedback (latest feedback_analyses row): recommendation +
  // the conversation thread (system = "Analysis", user = follow-ups). History shows it inline.
  ai_recommendation: "accept" | "reject" | "pending" | null;
  ai_thread: unknown;
  ai_status: string | null;
}

export async function getUserAttempts(userId: number, limit = 50): Promise<AttemptWithDetails[]> {
  const sql = getDb();
  return (await sql`
    SELECT
      a.*,
      q.paper,
      q.family,
      q.family_label,
      q.subcategory,
      q.question_text,
      q.wines,
      q.model_answer,
      q.total_marks,
      fa.recommendation AS ai_recommendation,
      fa.thread AS ai_thread,
      fa.status AS ai_status
    FROM user_attempts a
    JOIN generated_questions q ON a.question_id = q.question_id
    LEFT JOIN LATERAL (
      SELECT recommendation, thread, status
      FROM feedback_analyses
      WHERE attempt_id = a.id
      ORDER BY updated_at DESC
      LIMIT 1
    ) fa ON true
    WHERE a.user_id = ${userId}
    ORDER BY a.started_at DESC
    LIMIT ${limit}
  `) as AttemptWithDetails[];
}

export interface UserStats {
  total_attempts: number;
  completed_attempts: number;
  pass_count: number;
  fail_count: number;
  borderline_count: number;
  by_paper: { paper: number; total: number; pass: number; fail: number; borderline: number }[];
  by_family: { family: string; family_label: string; total: number; pass: number; borderline: number; fail: number }[];
  recent_results: { pass_estimate: string; started_at: string }[];
}

// ── Feedback Analyses ──

export interface FeedbackAnalysis {
  id: number;
  attempt_id: number;
  user_id: number;
  recommendation: "accept" | "reject" | "pending" | null;
  thread: { role: "system" | "user"; content: string; timestamp: string }[];
  is_read: boolean;
  status: "analyzing" | "complete" | "error";
  error_message: string | null;
  created_at: string;
  updated_at: string;
  // Auto-apply pipeline audit (set by the dispatch path and the GitHub Action)
  apply_status: string | null; // dispatched|verifying|merged|deployed|pr_opened|pr_closed|failed
  work_branch: string | null;
  commit_sha: string | null;
  pr_url: string | null;
  deploy_state: string | null;
  applied_by: string | null; // 'auto' | 'admin:{id}'
  applied_at: string | null;
  apply_error: string | null;
}

/**
 * Update the auto-apply audit columns on a feedback_analyses row. Only non-null fields are
 * written (COALESCE), and applied_at is stamped once on first write. The GitHub Action also
 * writes these columns directly via scripts/record-apply.mjs.
 */
export async function recordApply(
  analysisId: number,
  data: Partial<{
    apply_status: string;
    work_branch: string;
    commit_sha: string;
    pr_url: string;
    deploy_state: string;
    applied_by: string;
    apply_error: string;
  }>
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE feedback_analyses SET
      apply_status = COALESCE(${data.apply_status ?? null}::text, apply_status),
      work_branch  = COALESCE(${data.work_branch ?? null}::text, work_branch),
      commit_sha   = COALESCE(${data.commit_sha ?? null}::text, commit_sha),
      pr_url       = COALESCE(${data.pr_url ?? null}::text, pr_url),
      deploy_state = COALESCE(${data.deploy_state ?? null}::text, deploy_state),
      applied_by   = COALESCE(${data.applied_by ?? null}::text, applied_by),
      apply_error  = COALESCE(${data.apply_error ?? null}::text, apply_error),
      applied_at   = CASE WHEN applied_at IS NULL THEN NOW() ELSE applied_at END,
      updated_at   = NOW()
    WHERE id = ${analysisId}
  `;
}

export async function createFeedbackAnalysis(attemptId: number, userId: number): Promise<FeedbackAnalysis> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO feedback_analyses (attempt_id, user_id, status, thread)
    VALUES (${attemptId}, ${userId}, 'analyzing', '[]'::jsonb)
    RETURNING *
  `;
  const analysis = rows[0] as FeedbackAnalysis;
  await sql`UPDATE user_attempts SET auto_analysis_id = ${analysis.id} WHERE id = ${attemptId}`;
  return analysis;
}

export async function updateFeedbackAnalysis(
  id: number,
  data: Partial<{
    recommendation: string;
    thread: unknown[];
    status: string;
    error_message: string;
    is_read: boolean;
  }>
): Promise<FeedbackAnalysis> {
  const sql = getDb();
  if (data.status === "complete" && data.thread && data.recommendation) {
    const rows = await sql`
      UPDATE feedback_analyses SET
        status = 'complete',
        recommendation = ${data.recommendation},
        thread = ${JSON.stringify(data.thread)},
        updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `;
    return rows[0] as FeedbackAnalysis;
  }
  if (data.status === "error") {
    const rows = await sql`
      UPDATE feedback_analyses SET
        status = 'error',
        error_message = ${data.error_message || "Unknown error"},
        updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `;
    return rows[0] as FeedbackAnalysis;
  }
  if (data.is_read !== undefined) {
    const rows = await sql`
      UPDATE feedback_analyses SET is_read = ${data.is_read}, updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `;
    return rows[0] as FeedbackAnalysis;
  }
  if (data.thread) {
    const rows = await sql`
      UPDATE feedback_analyses SET
        thread = ${JSON.stringify(data.thread)},
        status = ${data.status || "analyzing"},
        is_read = false,
        updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `;
    return rows[0] as FeedbackAnalysis;
  }
  const rows = await sql`SELECT * FROM feedback_analyses WHERE id = ${id}`;
  return rows[0] as FeedbackAnalysis;
}

/**
 * Store the spoken-verdict narration on an analysis row. Best-effort: called
 * just before the row flips to 'complete' so the audio is ready the instant the
 * notification surfaces. audioBase64 is base64-encoded mp3 (kept inline).
 */
export async function saveNarration(
  analysisId: number,
  data: { text: string; audioBase64: string; voiceId: string; characters: number }
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE feedback_analyses SET
      narration_text  = ${data.text},
      narration_audio = ${data.audioBase64},
      narration_voice = ${data.voiceId},
      narration_chars = ${data.characters}
    WHERE id = ${analysisId}
  `;
}

/** Fetch just the narration audio (base64 mp3) for one analysis, scoped to its owner. */
export async function getNarrationAudio(
  analysisId: number,
  userId: number
): Promise<string | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT narration_audio FROM feedback_analyses
    WHERE id = ${analysisId} AND user_id = ${userId}
  `;
  return (rows[0]?.narration_audio as string | null) || null;
}

/**
 * Mark a user's verdict narrations as already spoken so the bell never replays
 * them. Called once playback actually starts. Stamps the given analysis plus any
 * other still-unplayed narrations the user has, so a backlog that accumulated
 * while they were away is consumed by the single clip they just heard (at most
 * one sound per catch-up, nothing refires later). Returns rows affected.
 */
export async function markNarrationsPlayed(userId: number): Promise<number> {
  const sql = getDb();
  const rows = await sql`
    UPDATE feedback_analyses SET narration_played_at = NOW()
    WHERE user_id = ${userId}
      AND narration_audio IS NOT NULL
      AND narration_played_at IS NULL
    RETURNING id
  `;
  return rows.length;
}

export async function getFeedbackAnalysis(id: number): Promise<(FeedbackAnalysis & {
  question_text: string;
  wines: unknown;
  paper: number;
  family: string;
  family_label: string;
  user_feedback: string;
  user_answer: string | null;
  model_answer: string | null;
  // The attempt's generated artifacts, so a follow-up reply is grounded in the same evidence the
  // first-pass analysis saw (runFeedbackAnalysis selects the identical set).
  tasting_notes: unknown;
  pre_glass_reasoning: string | null;
  pre_glass_feedback: string | null;
  answer_feedback: string | null;
  pass_estimate: string | null;
  marks_estimate: string | null;
  mode: string | null;
  stem_detail: string | null;
  stem_detail_escalated_to: string | null;
  app_version: string | null;
  reasoning_trace: string | null;
}) | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT fa.*, a.user_feedback, a.user_answer,
      a.tasting_notes, a.pre_glass_reasoning, a.pre_glass_feedback, a.answer_feedback,
      a.pass_estimate, a.marks_estimate, a.mode, a.stem_detail, a.stem_detail_escalated_to,
      a.app_version,
      q.question_text, q.wines, q.paper, q.family, q.family_label, q.model_answer, q.reasoning_trace
    FROM feedback_analyses fa
    JOIN user_attempts a ON fa.attempt_id = a.id
    JOIN generated_questions q ON a.question_id = q.question_id
    WHERE fa.id = ${id}
  `;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows[0] as any) || null;
}

/**
 * Decision-relevant empirical knowledge for the feedback-analysis agent, read live from the
 * `empirical_knowledge` projection (kept in sync with mw_exam_empirical_knowledge.md). Always
 * includes the generation rules / prior-rulings ledger / bug catalog (§5/§6/§7); includes the
 * structure/distribution facts (§1/§4) only when they're paper-agnostic or match this paper.
 * Returns a compact text block grouped by section, or "" if the table is empty/unavailable.
 */
export async function getEmpiricalKnowledgeForAnalysis(paper: number): Promise<string> {
  const sql = getDb();
  let rows: Record<string, unknown>[];
  try {
    rows = (await sql`
      SELECT ek_id, section, tier, title, claim
      FROM empirical_knowledge
      WHERE status = 'live'
        AND (section IN (2, 3, 5, 6, 7) OR (section IN (1, 4) AND (paper IS NULL OR paper = ${paper})))
      ORDER BY section, ek_id
    `) as Record<string, unknown>[];
  } catch {
    return ""; // table not present yet → caller falls back to the build-time digest
  }
  if (!rows.length) return "";
  const LABELS: Record<number, string> = {
    1: "§1 · Exam structure",
    // §2/§3 are the grading/examiner-cognition canon (trust account, plausibility gradient,
    // confidence≠correctness, contamination law, under-the-skin). Paper-agnostic, so always included —
    // they are the authoritative grounding when a candidate disputes the AI's EVALUATION/score.
    2: "§2 · Examiner mindset & grading philosophy",
    3: "§3 · Answer grading guidelines",
    4: "§4 · Wine selection & distribution (paper-relevant)",
    5: "§5 · Question-generation rules",
    6: "§6 · Prior feedback rulings (precedent)",
    7: "§7 · App bug catalog / known fixes",
  };
  const bySection = new Map<number, string[]>();
  for (const r of rows) {
    const sec = Number(r.section);
    const arr = bySection.get(sec) || [];
    arr.push(`- ${r.ek_id} · ${r.title} [${r.tier}]: ${r.claim}`);
    bySection.set(sec, arr);
  }
  return [...bySection.entries()]
    .map(([sec, items]) => `### ${LABELS[sec] || `§${sec}`}\n${items.join("\n")}`)
    .join("\n\n");
}

// Compact, cross-paper digest of the live empirical knowledge for the Feature Request engine, so
// proposals are grounded in how the exam actually works (id · title — short claim). Length-capped to
// keep the prompt bounded; the build Action reads the full doc. Empty string if the table is absent.
export async function getEmpiricalKnowledgeDigest(maxChars = 12000): Promise<string> {
  const sql = getDb();
  let rows: Record<string, unknown>[];
  try {
    rows = (await sql`
      SELECT ek_id, title, claim FROM empirical_knowledge
      WHERE status = 'live' ORDER BY ek_id
    `) as Record<string, unknown>[];
  } catch {
    return "";
  }
  const lines: string[] = [];
  let total = 0;
  for (const r of rows) {
    const claim = String(r.claim || "").replace(/\s+/g, " ").trim().slice(0, 240);
    const line = `- ${r.ek_id} · ${r.title} — ${claim}`;
    if (total + line.length > maxChars) break;
    lines.push(line);
    total += line.length + 1;
  }
  return lines.join("\n");
}

// The tasting lexicon, read from the editable Neon `tasting_lexicon` table with the bundled copy as
// fallback. Cached in-memory per server instance (the lexicon changes rarely) with a short TTL so
// admin edits take effect without a redeploy. On any error / empty table it returns the bundled copy.
let lexiconCache: { value: TastingLexicon; at: number } | null = null;
const LEXICON_TTL_MS = 5 * 60 * 1000;

export async function getTastingLexicon(): Promise<TastingLexicon> {
  if (lexiconCache && Date.now() - lexiconCache.at < LEXICON_TTL_MS) {
    return lexiconCache.value;
  }
  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT group_kind, category, term
      FROM tasting_lexicon
      WHERE active = TRUE
      ORDER BY group_kind, category, sort_order, id
    `) as { group_kind: string; category: string; term: string }[];
    if (!rows.length) {
      lexiconCache = { value: BUNDLED_TASTING_LEXICON, at: Date.now() };
      return BUNDLED_TASTING_LEXICON;
    }
    const value: TastingLexicon = { dimensions: {}, rhetoric: {} };
    for (const r of rows) {
      const bucket = r.group_kind === "rhetoric" ? value.rhetoric : value.dimensions;
      (bucket[r.category] ||= []).push(r.term);
    }
    lexiconCache = { value, at: Date.now() };
    return value;
  } catch {
    // table absent / unreachable → bundled copy keeps generation working
    lexiconCache = { value: BUNDLED_TASTING_LEXICON, at: Date.now() };
    return BUNDLED_TASTING_LEXICON;
  }
}

export async function getUserNotifications(userId: number): Promise<{
  unreadCount: number;
  analyses: (FeedbackAnalysis & { question_text: string; paper: number; family_label: string; user_feedback: string; has_narration: boolean; pending_narration: boolean })[];
}> {
  const sql = getDb();
  const countRows = await sql`
    SELECT COUNT(*)::int as count FROM feedback_analyses
    WHERE user_id = ${userId} AND is_read = false AND status IN ('complete', 'error')
  `;
  const analyses = await sql`
    SELECT fa.id, fa.attempt_id, fa.user_id, fa.recommendation, fa.thread,
      fa.is_read, fa.status, fa.error_message, fa.created_at, fa.updated_at,
      (fa.narration_audio IS NOT NULL) AS has_narration,
      -- Narration that exists but the bell has not yet spoken. Drives play-once.
      (fa.narration_audio IS NOT NULL AND fa.narration_played_at IS NULL) AS pending_narration,
      a.user_feedback,
      q.question_text, q.paper, q.family_label
    FROM feedback_analyses fa
    JOIN user_attempts a ON fa.attempt_id = a.id
    JOIN generated_questions q ON a.question_id = q.question_id
    WHERE fa.user_id = ${userId} AND fa.status IN ('complete', 'error')
    ORDER BY fa.updated_at DESC
    LIMIT 10
  `;
  return {
    unreadCount: (countRows[0]?.count as number) || 0,
    analyses: analyses as (FeedbackAnalysis & { question_text: string; paper: number; family_label: string; user_feedback: string; has_narration: boolean; pending_narration: boolean })[],
  };
}

export async function getUserStats(userId: number): Promise<UserStats> {
  const sql = getDb();

  // The exam-readiness scoreboard reflects full study reps only — Stem Sniper / Reverse Tasting
  // drills have no pass/fail and would deflate the pass rate and inflate the totals, so exclude them.
  const totals = await sql`
    SELECT
      COUNT(*)::int as total_attempts,
      COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END)::int as completed_attempts,
      COUNT(CASE WHEN pass_estimate = 'pass' THEN 1 END)::int as pass_count,
      COUNT(CASE WHEN pass_estimate = 'fail' THEN 1 END)::int as fail_count,
      COUNT(CASE WHEN pass_estimate = 'borderline' THEN 1 END)::int as borderline_count
    FROM user_attempts
    WHERE user_id = ${userId} AND (mode IS NULL OR mode = 'full')
  `;

  // By paper
  const byPaper = await sql`
    SELECT
      q.paper,
      COUNT(*)::int as total,
      COUNT(CASE WHEN a.pass_estimate = 'pass' THEN 1 END)::int as pass,
      COUNT(CASE WHEN a.pass_estimate = 'fail' THEN 1 END)::int as fail,
      COUNT(CASE WHEN a.pass_estimate = 'borderline' THEN 1 END)::int as borderline
    FROM user_attempts a
    JOIN generated_questions q ON a.question_id = q.question_id
    WHERE a.user_id = ${userId} AND a.completed_at IS NOT NULL AND (a.mode IS NULL OR a.mode = 'full')
    GROUP BY q.paper
    ORDER BY q.paper
  `;

  // By family
  const byFamily = await sql`
    SELECT
      q.family,
      q.family_label,
      COUNT(*)::int as total,
      COUNT(CASE WHEN a.pass_estimate = 'pass' THEN 1 END)::int as pass,
      COUNT(CASE WHEN a.pass_estimate = 'borderline' THEN 1 END)::int as borderline,
      COUNT(CASE WHEN a.pass_estimate = 'fail' THEN 1 END)::int as fail
    FROM user_attempts a
    JOIN generated_questions q ON a.question_id = q.question_id
    WHERE a.user_id = ${userId} AND a.completed_at IS NOT NULL AND (a.mode IS NULL OR a.mode = 'full')
    GROUP BY q.family, q.family_label
    ORDER BY total DESC
  `;

  // Recent 5 results
  const recentResults = await sql`
    SELECT pass_estimate, started_at
    FROM user_attempts
    WHERE user_id = ${userId} AND completed_at IS NOT NULL AND pass_estimate IS NOT NULL
      AND (mode IS NULL OR mode = 'full')
    ORDER BY completed_at DESC
    LIMIT 5
  `;

  const t = totals[0] || { total_attempts: 0, completed_attempts: 0, pass_count: 0, fail_count: 0, borderline_count: 0 };

  return {
    total_attempts: t.total_attempts as number,
    completed_attempts: t.completed_attempts as number,
    pass_count: t.pass_count as number,
    fail_count: t.fail_count as number,
    borderline_count: t.borderline_count as number,
    by_paper: byPaper as UserStats["by_paper"],
    by_family: byFamily as UserStats["by_family"],
    recent_results: recentResults as UserStats["recent_results"],
  };
}

// ── Feature Requests ──
// Admin-only Feature Request engine: an admin describes a feature; Opus clarifies + proposes
// (user-facing) and writes a technical spec; on confirm, the feature-build workflow implements it.
// Feedback classified as a feature request is logged here too (never auto-built). See migration 010.

export interface FeatureRequest {
  id: number;
  created_by: number | null;
  title: string | null;
  // drafting|clarifying|proposed|ready|building|built|pr_opened|pr_merged|pr_closed|answered|failed
  // `answered` is terminal and set by hand: the report was a question, and answering it was the
  // whole resolution. No automated writer ever produces it.
  // pr_merged / pr_closed are written by the PR reconciler (src/lib/pr-status.ts), not the pipeline.
  status: string;
  // mockups (optional) carry rendered UI samples on a proposing assistant turn — stored in the JSONB
  // thread so re-opening a request re-renders them. No schema change needed.
  thread: { role: "user" | "assistant"; content: string; timestamp: string; mockups?: { title: string; html: string }[] }[];
  user_facing_proposal: string | null;
  technical_spec: string | null;
  work_branch: string | null;
  commit_sha: string | null;
  pr_url: string | null;
  apply_status: string | null;
  apply_error: string | null;
  applied_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function createFeatureRequest(
  createdBy: number | null,
  title: string | null,
  thread: FeatureRequest["thread"],
  status = "drafting"
): Promise<FeatureRequest> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO feature_requests (created_by, title, status, thread)
    VALUES (${createdBy}, ${title}, ${status}, ${JSON.stringify(thread)}::jsonb)
    RETURNING *
  `;
  return rows[0] as FeatureRequest;
}

// Seed a Feature Request from a piece of user feedback that was classified as a feature request
// (not a fix). Stored as a 'drafting' row whose first turn is the raw feedback, so an admin can open
// it in the engine and continue the clarify → propose → build flow. Returns the new id.
export async function createFeatureRequestFromFeedback(opts: {
  userId: number | null;
  feedbackText: string;
  analysisText: string;
}): Promise<number> {
  const sql = getDb();
  const title = opts.feedbackText.replace(/^\[[^\]]*\]\s*/, "").trim().slice(0, 80);
  const thread = [
    { role: "user" as const, content: opts.feedbackText, timestamp: new Date().toISOString() },
  ];
  const rows = await sql`
    INSERT INTO feature_requests (created_by, title, status, thread)
    VALUES (${opts.userId}, ${title || "Feature request from feedback"}, 'drafting', ${JSON.stringify(thread)}::jsonb)
    RETURNING id
  `;
  return rows[0].id as number;
}

export async function getFeatureRequest(id: number): Promise<FeatureRequest | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM feature_requests WHERE id = ${id}`;
  return (rows[0] as FeatureRequest) ?? null;
}

export async function listFeatureRequests(limit = 50): Promise<FeatureRequest[]> {
  const sql = getDb();
  return (await sql`
    SELECT * FROM feature_requests ORDER BY created_at DESC LIMIT ${limit}
  `) as FeatureRequest[];
}

// Patch a subset of fields (thread / proposal / spec / status / audit). Only provided keys are written.
export async function updateFeatureRequest(
  id: number,
  data: Partial<{
    title: string;
    status: string;
    thread: FeatureRequest["thread"];
    user_facing_proposal: string;
    technical_spec: string;
    work_branch: string;
    applied_by: string;
    apply_status: string;
  }>
): Promise<FeatureRequest> {
  const sql = getDb();
  const rows = await sql`
    UPDATE feature_requests SET
      title = COALESCE(${data.title ?? null}, title),
      status = COALESCE(${data.status ?? null}, status),
      thread = COALESCE(${data.thread ? JSON.stringify(data.thread) : null}::jsonb, thread),
      user_facing_proposal = COALESCE(${data.user_facing_proposal ?? null}, user_facing_proposal),
      technical_spec = COALESCE(${data.technical_spec ?? null}, technical_spec),
      work_branch = COALESCE(${data.work_branch ?? null}, work_branch),
      applied_by = COALESCE(${data.applied_by ?? null}, applied_by),
      apply_status = COALESCE(${data.apply_status ?? null}::text, apply_status),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] as FeatureRequest;
}

// ── Live Tasting sessions (migration 041) ────────────────────────────────────────────────────────
//
// A session owns the multi-week lifecycle of one buy-local blind tasting: the generated question
// (scope='live-tasting'), the availability payload, and IMMUTABLE EVENT TIMESTAMPS from which the
// display state and blind-integrity badge are DERIVED at render time (src/lib/live-tasting.ts).
// There is deliberately no status enum to get stale — see live_tasting_plan.md §2.3.

export interface LiveTastingSession {
  id: string;
  user_id: number;
  question_id: string;
  paper: number;
  flight_size: number;
  archetype: string;
  city: string;
  country: string;
  budget_amount: number | null;
  budget_currency: string | null;
  availability: unknown;
  vintages_bought: unknown;
  share_token_hash: string | null;
  share_expires_at: string | null;
  attempt_id: number | null;
  user_revealed_at: string | null;
  share_created_at: string | null;
  token_first_used_at: string | null;
  graded_at: string | null;
  abandoned_at: string | null;
  created_at: string;
}

export async function createLiveTastingSession(s: {
  id: string;
  userId: number;
  questionId: string;
  paper: number;
  flightSize: number;
  archetype: string;
  city: string;
  country: string;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  availability: unknown;
}): Promise<LiveTastingSession> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO live_tasting_sessions (
      id, user_id, question_id, paper, flight_size, archetype, city, country,
      budget_amount, budget_currency, availability
    ) VALUES (
      ${s.id}, ${s.userId}, ${s.questionId}, ${s.paper}, ${s.flightSize}, ${s.archetype},
      ${s.city}, ${s.country}, ${s.budgetAmount}, ${s.budgetCurrency},
      ${JSON.stringify(s.availability)}::jsonb
    )
    RETURNING *
  `;
  return rows[0] as LiveTastingSession;
}

export async function getLiveTastingSession(
  id: string,
  userId: number
): Promise<LiveTastingSession | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM live_tasting_sessions WHERE id = ${id} AND user_id = ${userId} LIMIT 1
  `;
  return (rows[0] as LiveTastingSession) ?? null;
}

export async function getLiveTastingSessionsForUser(userId: number): Promise<LiveTastingSession[]> {
  const sql = getDb();
  return (await sql`
    SELECT * FROM live_tasting_sessions
    WHERE user_id = ${userId} AND abandoned_at IS NULL
    ORDER BY created_at DESC
    LIMIT 50
  `) as LiveTastingSession[];
}

export async function getLiveTastingSessionByTokenHash(
  tokenHash: string
): Promise<LiveTastingSession | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM live_tasting_sessions
    WHERE share_token_hash = ${tokenHash}
      AND share_expires_at > now()
      AND graded_at IS NULL
      AND abandoned_at IS NULL
    LIMIT 1
  `;
  return (rows[0] as LiveTastingSession) ?? null;
}

// Event stamps are set-once (COALESCE keeps the first value) so a fact can never be un-happened.
const SESSION_EVENT_COLUMNS = new Set([
  "user_revealed_at",
  "share_created_at",
  "token_first_used_at",
  "graded_at",
  "abandoned_at",
]);

export async function stampLiveTastingEvent(
  sessionId: string,
  column: string
): Promise<void> {
  if (!SESSION_EVENT_COLUMNS.has(column)) throw new Error(`Not a session event column: ${column}`);
  const sql = getDb();
  // Column name is whitelist-checked above; Neon's tagged templates can't parameterize
  // identifiers, so this goes through sql.query with the name interpolated from the whitelist.
  await sql.query(
    `UPDATE live_tasting_sessions SET ${column} = COALESCE(${column}, now()) WHERE id = $1`,
    [sessionId]
  );
}

// The double-submit grading lock (plan §2.4): row-level compare-and-set on attempt_id. Returns
// true when THIS call claimed the session; false when an attempt already exists (retry path).
export async function casClaimSessionAttempt(
  sessionId: string,
  attemptId: number
): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    UPDATE live_tasting_sessions SET attempt_id = ${attemptId}
    WHERE id = ${sessionId} AND attempt_id IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export async function setLiveTastingShareToken(
  sessionId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE live_tasting_sessions
    SET share_token_hash = ${tokenHash},
        share_expires_at = ${expiresAt.toISOString()},
        share_created_at = COALESCE(share_created_at, now())
    WHERE id = ${sessionId}
  `;
}

export async function setLiveTastingVintages(
  sessionId: string,
  vintages: Record<string, string>
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE live_tasting_sessions
    SET vintages_bought = ${JSON.stringify(vintages)}::jsonb
    WHERE id = ${sessionId}
  `;
}

// Replace-wine (plan §2.1): repoint the session at the regenerated question + fresh availability.
// The old question row stays behind (scope='live-tasting' keeps it out of pools) for audit.
export async function repointLiveTastingSession(
  sessionId: string,
  questionId: string,
  availability: unknown
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE live_tasting_sessions
    SET question_id = ${questionId}, availability = ${JSON.stringify(availability)}::jsonb
    WHERE id = ${sessionId}
  `;
}

// Token rotation (plan §2.5): clearing the hash 404s every previously-shared link. Used by
// replace-wine so a partner can never buy from a stale list; the user re-mints to share again.
export async function clearLiveTastingShareToken(sessionId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE live_tasting_sessions SET share_token_hash = NULL, share_expires_at = NULL
    WHERE id = ${sessionId}
  `;
}

// Rate limit (plan §5.3): sessions created by this user in the last 24h.
export async function countRecentLiveTastingSessions(userId: number): Promise<number> {
  const sql = getDb();
  const rows = (await sql`
    SELECT COUNT(*)::int AS count FROM live_tasting_sessions
    WHERE user_id = ${userId} AND created_at > now() - interval '24 hours'
  `) as { count: number }[];
  return rows[0]?.count ?? 0;
}
