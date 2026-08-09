// role-sweep.ts — after the calibration changes, which banked questions are now wrong?
//
// This is the half of the loop that nothing previously did. A reviewer's role correction used to reach
// (at best) the generation prompt, so it improved the NEXT question and left every already-banked
// question that the corrected calibration would now reject sitting servable, indistinguishable from a
// good one. The bank is ~370 servable questions deep; a single ruling can invalidate a dozen of them.
//
// The sweep re-runs the real validator — the same validateQuestion() call the nightly audit makes, not
// a reimplementation of the flight rules — over the servable bank, and reports every question that now
// carries a hard flight-role violation, naming the SLOT to blame. A repair queue that says "question
// gen_p1_F2_… is broken" is not actionable; one that says "wine 3, the Somló Furmint, is the only
// curveball-over-budget wine and swapping it fixes the flight" is.
//
// IT REPORTS, IT DOES NOT MUTATE. Deciding which questions get rebuilt is a spending decision (each
// repair is a generation call) and belongs to a human — see wine-swap.ts and the admin surface. The
// one thing this must never become is a job that quietly rewrites the bank overnight.

import { neon } from "@neondatabase/serverless";
import {
  validateQuestion,
  isBanker,
  matchingBankerSignal,
  type AuditWine,
  type Violation,
} from "@/lib/question-validator";
// Registers the appellation -> primary-variety fallback the colour rules need. Without it every
// appellation-only label resolves to "unknown" and the sweep silently exempts the wines it exists to
// catch — the same trap question-audit.ts documents.
import "@/lib/appellation-resolver";

// ── Which role faults justify a repair, and which only justify a look ────────────────────────────
//
// THIS DISTINCTION IS THE WHOLE SAFETY PROPERTY OF THE SWEEP, and it cost a wrong first draft to
// find. `validateQuestion` deliberately downgrades flight-composition to SOFT in the audit path — see
// the "POOL-ADMISSION ASYMMETRY" note in question-validator.ts. The measured reason: even with the
// banker detector repaired the rule still rejects ~5% of REAL IMW flights (2023 P1 Q3 is four South
// African whites with no classic anchor; 2016 P2 Q2 is three cool-climate Pinots), and 235 of the
// bank's violations were this one rule. The codebase's stated position is that making the wine choice
// better at GENERATION is right and deleting the question afterwards is not.
//
// A repair loop that auto-queued every flight-composition hit would overturn that decision silently,
// at scale, and spend a generation call per question doing it. So:
//
//   BLOCKING  — hard in the audit path, no real-exam false positives to trade against. The question is
//               genuinely broken and a repair is the right answer.
//   ADVISORY  — flight-composition. Surfaced, counted, and repairable ON REQUEST, never queued by
//               default. It is a reviewer's judgement call, which is exactly what the ruling loop is
//               for — a human decides, one question at a time.
//
// The first draft of this file filtered on `severity === "hard"` and therefore found NOTHING for
// flight-composition — the most common role fault, and the one the reviewers actually raise. It swept
// 333 servable questions and reported zero hits while wines were being demoted underneath it.
const BLOCKING_ROLE_RULES = new Set(["old-world-anchor", "single-wine-flight-banker"]);
const ADVISORY_ROLE_RULES = new Set(["flight-composition"]);
const ROLE_RULES = new Set([...BLOCKING_ROLE_RULES, ...ADVISORY_ROLE_RULES]);

export interface SweepHit {
  questionId: string;
  paper: number;
  family: string;
  stem: string;
  /** The role violations this question now carries, blocking and advisory alike. */
  violations: Violation[];
  /**
   * True when at least one violation is BLOCKING. False means every finding is advisory
   * (flight-composition), so this question is a judgement call rather than a defect — the exam itself
   * sets flights like this about one time in twenty.
   */
  blocking: boolean;
  /**
   * The slot the repair should target, and why. null when the sweep cannot single one out — which is
   * itself the answer: a flight with no defensible single swap needs a human, not a retry.
   */
  suggestedSlot: number | null;
  suggestedReason: string | null;
  wines: {
    slot: number;
    label: string;
    variety: string | null;
    region: string | null;
    country: string | null;
    isBanker: boolean;
    signalId: string | null;
  }[];
}

interface Row {
  question_id: string;
  paper: number;
  family: string;
  question_text: string;
  total_marks: number;
  wines: unknown;
  model_answer: string | null;
  wine_profiles: unknown;
  scope: string | null;
  source: string | null;
  ground_truth: unknown;
}

function parse<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

/**
 * Rebuild the AuditWine list exactly the way question-audit.ts does.
 *
 * The zips matter and are not defensive padding: ground_truth has DISCARDED the original label, and
 * the raw label is what isBanker() matches its region pattern against. A sweep that skipped it would
 * classify by resolved region alone and disagree with the live validator on precisely the wines whose
 * region the key could not place — the ones most likely to be in dispute.
 */
function auditWines(r: Row): AuditWine[] {
  const gt = parse<AuditWine[]>(r.ground_truth, []);
  const raw = parse<{ slot: number; fullText?: string }[]>(r.wines, []);
  const bySlot = new Map(raw.map((w) => [w.slot, w.fullText ?? ""]));
  const profiles = parse<Record<string, { colour?: unknown } | undefined>>(r.wine_profiles, {});
  const colourBySlot = new Map<number, "white" | "red" | "rose" | "orange">();
  for (const [slot, p] of Object.entries(profiles ?? {})) {
    const c = p?.colour;
    if (c === "white" || c === "red" || c === "rose" || c === "orange") colourBySlot.set(Number(slot), c);
  }
  return (gt || []).map((w) => ({
    ...w,
    ...(bySlot.has(w.slot) ? { fullText: bySlot.get(w.slot) } : {}),
    ...(colourBySlot.has(w.slot) ? { colour: colourBySlot.get(w.slot) } : {}),
  }));
}

/**
 * Which wine should be swapped, and why.
 *
 * The heuristic is deliberately conservative and states its own reasoning, because a wrong answer here
 * spends a generation call rebuilding the wrong flight:
 *
 *  · a bankerless flight → swap the curveball whose ORIGIN the key could not place at all. That wine
 *    is the least defensible member of the flight and the cheapest to replace, since nothing in the
 *    stem can be leaning on an identity the key does not have. Failing that, the last slot: the exam's
 *    own convention puts the anchor early and the oddity late.
 *  · too many curveballs → same, one at a time; the caller re-sweeps after each repair rather than
 *    swapping several at once, because one swap often clears the whole violation.
 *  · a lone banker on a single-wine flight → nothing to swap. That question needs a different wine
 *    entirely and the answer is a human decision, so it returns null rather than guessing.
 */
function suggestSlot(
  wines: AuditWine[],
  violations: Violation[]
): { slot: number | null; reason: string | null } {
  const rules = new Set(violations.map((v) => v.rule));

  if (rules.has("single-wine-flight-banker")) {
    return {
      slot: null,
      reason:
        "A one-wine flight has to BE a curveball — there is no second wine to swap, so this needs a " +
        "replacement question rather than a repair.",
    };
  }

  if (rules.has("old-world-anchor")) {
    // The fix is to make one wine the Old World anchor. Replace the New World wine that contributes
    // least: the one whose country is duplicated, else the last slot.
    const byCountry = new Map<string, number[]>();
    for (const w of wines) {
      const c = (w.country || "").toLowerCase();
      byCountry.set(c, [...(byCountry.get(c) ?? []), w.slot]);
    }
    const dupe = [...byCountry.values()].find((slots) => slots.length > 1);
    const slot = dupe ? dupe[dupe.length - 1] : wines[wines.length - 1]?.slot ?? null;
    return {
      slot,
      reason: dupe
        ? "This flight needs an Old World anchor of its variety. Replacing the second wine from a " +
          "duplicated country costs the flight the least breadth."
        : "This flight needs an Old World anchor of its variety; the last slot is the exam's " +
          "conventional position for the wine carrying least of the question.",
    };
  }

  const curveballs = wines.filter((w) => !isBanker(w));
  if (curveballs.length === 0) return { slot: null, reason: null };

  const unplaceable = curveballs.find((w) => !w.region && !w.country);
  if (unplaceable) {
    return {
      slot: unplaceable.slot,
      reason:
        "This wine's origin could not be resolved at all, so it is the least defensible member of " +
        "the flight and nothing in the stem can be relying on an identity it does not have.",
    };
  }

  const last = curveballs[curveballs.length - 1];
  return {
    slot: last.slot,
    reason:
      "The flight is over its curveball budget. The exam's own convention puts the anchor early and " +
      "the oddity late, so the last curveball is the one to replace with a banker.",
  };
}

/**
 * Sweep the servable bank for questions the current calibration now rejects on flight role.
 *
 * `questionIds` narrows it to a specific set — used after a repair, to re-check one question without
 * paying for a full pass over ~370 rows.
 */
export async function sweepRoleViolations(
  opts: { questionIds?: string[]; limit?: number } = {}
): Promise<{ scanned: number; hits: SweepHit[] }> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (
    opts.questionIds && opts.questionIds.length > 0
      ? await sql`
          SELECT g.question_id, g.paper, g.family, g.question_text, g.total_marks, g.wines,
                 g.model_answer, g.wine_profiles, g.scope, g.metadata->>'source' AS source,
                 k.ground_truth
          FROM generated_questions g
          JOIN stem_answer_keys k ON k.question_id = g.question_id
          WHERE g.question_id = ANY(${opts.questionIds})`
      : await sql`
          SELECT g.question_id, g.paper, g.family, g.question_text, g.total_marks, g.wines,
                 g.model_answer, g.wine_profiles, g.scope, g.metadata->>'source' AS source,
                 k.ground_truth
          FROM generated_questions g
          JOIN stem_answer_keys k ON k.question_id = g.question_id
          WHERE g.invalid_reasons IS NULL
            AND g.review_state = 'kept'
            AND g.is_retired IS NOT TRUE
            AND g.scope = 'pool'
            AND k.validated IS NOT false
          ORDER BY g.served_count DESC NULLS LAST
          LIMIT ${Math.max(1, Math.min(2000, opts.limit ?? 1000))}`
  ) as unknown as Row[];

  const hits: SweepHit[] = [];
  for (const r of rows) {
    const wines = auditWines(r);
    if (wines.length === 0) continue;

    const res = validateQuestion({
      questionId: r.question_id,
      paper: r.paper,
      family: r.family,
      questionText: r.question_text,
      totalMarks: r.total_marks,
      wines,
      modelAnswer: r.model_answer,
      stemIsAuthoritative: r.source === "historical_stem",
    });

    // Deliberately NOT filtered on severity — see the BLOCKING/ADVISORY note at the top of this file.
    // flight-composition is emitted soft by this entry point on purpose, and a severity filter here is
    // what made the first version of this sweep report zero hits over the whole bank.
    const violations = res.violations.filter((v) => ROLE_RULES.has(v.rule));
    if (violations.length === 0) continue;
    const blocking = violations.some((v) => BLOCKING_ROLE_RULES.has(v.rule));

    const { slot, reason } = suggestSlot(wines, violations);
    hits.push({
      questionId: r.question_id,
      paper: r.paper,
      family: r.family,
      stem: r.question_text,
      violations,
      blocking,
      suggestedSlot: slot,
      suggestedReason: reason,
      wines: wines.map((w) => {
        const signal = matchingBankerSignal(w);
        return {
          slot: w.slot,
          label: w.fullText ?? "",
          variety: (w.varieties || []).join(" / ") || null,
          region: w.region ?? null,
          country: w.country ?? null,
          isBanker: signal !== null,
          signalId: signal?.id ?? null,
        };
      }),
    });
  }

  return { scanned: rows.length, hits };
}

/**
 * Write the sweep's hits into question_repairs as a reviewable queue.
 *
 * BLOCKING HITS ONLY, unless the caller explicitly asks otherwise. An advisory hit
 * (flight-composition) is a stylistic judgement the real exam breaks about one time in twenty, and
 * question-validator.ts's pool-admission note is an explicit decision not to retire banked questions
 * over it. Queueing those by default would reverse that decision silently and spend a generation call
 * per question doing it — so `includeAdvisory` exists, and a human has to turn it on.
 *
 * Idempotent per question: a question already sitting at 'queued' is left alone rather than duplicated,
 * so re-running the sweep after a partial batch does not multiply the work. Questions whose suggested
 * slot is null are still queued — with the reason — because "this one needs a human" is information the
 * admin needs, and dropping them would make the queue look complete when it is not.
 */
export async function enqueueRepairs(
  hits: SweepHit[],
  rulingId?: number | null,
  opts: { includeAdvisory?: boolean } = {}
): Promise<{ queued: number; alreadyQueued: number; advisorySkipped: number }> {
  const sql = neon(process.env.DATABASE_URL!);
  let queued = 0;
  let alreadyQueued = 0;
  let advisorySkipped = 0;
  for (const h of hits) {
    if (!h.blocking && !opts.includeAdvisory) {
      advisorySkipped++;
      continue;
    }
    const existing = await sql`
      SELECT id FROM question_repairs WHERE question_id = ${h.questionId} AND status = 'queued'
    `;
    if (existing.length > 0) {
      alreadyQueued++;
      continue;
    }
    const wine = h.wines.find((w) => w.slot === h.suggestedSlot);
    await sql`
      INSERT INTO question_repairs (question_id, ruling_id, slot, wine_before, trigger_reasons)
      VALUES (
        ${h.questionId}, ${rulingId ?? null}, ${h.suggestedSlot ?? 0}, ${wine?.label ?? null},
        ${JSON.stringify({ violations: h.violations, suggestedReason: h.suggestedReason })}::jsonb
      )
    `;
    queued++;
  }
  return { queued, alreadyQueued, advisorySkipped };
}
