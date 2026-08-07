// The Coach's exam-integrity gate — the single choke point every question-touching tool goes through.
//
// THE PROBLEM. The Coach has tools that can reach wine identities, model answers and answer keys.
// The candidate is frequently mid-blind-attempt while talking to it. Nothing in a system prompt is
// strong enough to hold that line, so the control is structural: while an attempt is open, the
// dangerous tools are not in the list handed to the model at all, and the tools that remain redact
// themselves.
//
// WHY STATE IS PER-USER, NOT PER-SCREEN (plan H2). The obvious implementation resolves state from
// "the attempt on screen". That fails the two-tab case: a graded attempt in one tab and a live blind
// attempt in another yields `graded`, and the full tool set, while an attempt is open. So the
// question this module asks is "does this USER have any attempt open right now?" — never "what is on
// screen". Screen context is a display hint; it is never the security input.
//
// FAIL-CLOSED. Every branch that cannot answer confidently returns `in_progress`. A database error
// resolves to the restricted state, not the permissive one: a Coach that is briefly less useful is a
// recoverable problem, and a Coach that hands over a wine identity is not.

import { neon } from "@neondatabase/serverless";

export type AttemptState = "none" | "in_progress" | "submitted" | "graded";

export interface CoachState {
  state: AttemptState;
  /** The open attempt's id, when there is one. For telemetry and the leak probe — never for display. */
  openAttemptId: number | null;
  /** True when identity-bearing tools must be withheld. The one predicate callers should branch on. */
  restricted: boolean;
}

/**
 * How long an untouched attempt still counts as "open".
 *
 * Attempts are created when a question is served and completed when it is submitted, so a candidate
 * who opens a question and wanders off leaves `completed_at` NULL forever. Without a cutoff, one
 * abandoned attempt would pin that user into process mode permanently and the Coach would look
 * broken. A real question is ~12 minutes; six hours is far past any legitimate session while still
 * being nowhere near "yesterday".
 *
 * Note the direction of the trade: shortening this makes the Coach more useful and less safe.
 * Lengthening it is always the safe edit.
 */
const OPEN_ATTEMPT_HOURS = 6;

/**
 * Resolve whether this user has any attempt in flight.
 *
 * TWO EXCLUSIONS, BOTH LOAD-BEARING — remove either and the gate silently jams shut:
 *
 *   source = 'feedback_tab'  Feedback submissions are stored AS user_attempts rows (migration 053)
 *                            with mode='full' and completed_at NULL. They are not attempts at
 *                            anything. Counting them means a candidate who sends one piece of
 *                            feedback is locked out of the full Coach for six hours.
 *   scope = 'general'        Same store, same reason.
 *
 * `started_at` is used rather than a created timestamp because it is the column every study mode
 * actually stamps when serving a question.
 */
export async function resolveCoachState(userId: number): Promise<CoachState> {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = (await sql`
      /* theory-mode-guard: all-modes -- integrity gate spans every study mode by design */
      SELECT id, user_answer
      FROM user_attempts
      WHERE user_id = ${userId}
        AND completed_at IS NULL
        AND (source IS NULL OR source <> 'feedback_tab')
        AND (scope IS NULL OR scope <> 'general')
        AND started_at IS NOT NULL
        AND started_at > NOW() - (${OPEN_ATTEMPT_HOURS} * INTERVAL '1 hour')
      ORDER BY started_at DESC
      LIMIT 1
    `) as { id: number; user_answer: string | null }[];

    const open = rows[0];
    // Nothing in flight. Deliberately `none` rather than `graded`: a user who has never attempted
    // anything is not "graded", and this value is written to coach_messages.attempt_state, where a
    // wrong label would mislead exactly the person tracing a leak back to the decision that allowed
    // it. `graded` is reserved for a future state that distinguishes "last attempt is marked" — it
    // would cost an extra query per turn to determine and nothing currently branches on it.
    if (!open) return { state: "none", openAttemptId: null, restricted: false };

    // An answer exists but grading hasn't stamped completed_at yet. Still restricted: grading can
    // fail and be retried, and the wines are not revealed to the candidate until it lands.
    const state: AttemptState = open.user_answer ? "submitted" : "in_progress";
    return { state, openAttemptId: open.id, restricted: true };
  } catch (err) {
    console.error("[coach] attempt-state resolution failed, failing closed:", err);
    return { state: "in_progress", openAttemptId: null, restricted: true };
  }
}

/**
 * `graded` is also what a user with no history at all resolves to — there is nothing in flight, so
 * nothing to protect. Kept as a named helper so call sites read as intent rather than as a string
 * comparison, and so the meaning stays in one place if the enum ever grows.
 */
export function isRestricted(state: CoachState): boolean {
  return state.restricted;
}
