// The post-mortem tool: one of the candidate's own attempts, in full.
//
// WHY THIS IS SEPARATE FROM query_my_performance. That tool answers "how am I doing" across many
// attempts and deliberately returns only summary counts and snippets. This one answers "what did I
// do on THIS one" — their actual words, the grader's actual words, and the model answer side by
// side. Without it the Coach cannot discuss a debrief at all: asked "why did I lose marks here?" it
// would have to invent a plausible-sounding reason, which is the single worst failure mode available
// to a study tool, because the candidate will revise against it.
//
// THE COMPLETION GATE IS PER-ATTEMPT, NOT GLOBAL. Elsewhere the Coach withholds things while ANY
// attempt is open. Here the right question is narrower: has THIS attempt been graded? A finished
// attempt's wines and model answer are already on the candidate's own debrief screen, so there is
// nothing to protect — while an unfinished one must not hand over its answer key even if the
// candidate asks about it by id.

import { neon } from "@neondatabase/serverless";
import type { CoachTool } from "../types";

interface AttemptRow {
  id: number;
  question_id: string | null;
  theory_question_id: string | null;
  mode: string | null;
  stem_detail: string | null;
  pre_glass_reasoning: string | null;
  pre_glass_feedback: string | null;
  tasting_notes: unknown;
  user_answer: string | null;
  answer_feedback: string | null;
  pass_estimate: string | null;
  marks_estimate: string | null;
  elapsed_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
  input_method: string | null;
}

export const getAttemptDebrief: CoachTool = {
  name: "get_attempt_debrief",
  kind: "read",
  description:
    "Pull up one of the candidate's own attempts in full: what they wrote, their pre-glass reasoning " +
    "and tasting notes, the grader's feedback, the pass estimate, how long they took — and, once the " +
    "attempt is finished, the question with its wines and model answer. " +
    "Use this whenever they ask about a specific attempt: 'how did I do', 'why did I lose marks', " +
    "'what should I have said', 'was that fair', 'I disagree with the grading'. " +
    "With no arguments it returns their most recently completed attempt, which is almost always the " +
    "one they mean. NEVER discuss what they wrote or how it was marked without calling this first — " +
    "you cannot remember their answer, and guessing at it is worse than saying you need to look.",
  inputSchema: {
    type: "object",
    properties: {
      attemptId: {
        type: "integer",
        description: "A specific attempt. Omit for the one on screen, or their latest completed one.",
      },
    },
  },
  async run(ctx, input) {
    const sql = neon(process.env.DATABASE_URL!);
    const asked = typeof input.attemptId === "number" ? input.attemptId : null;
    const onScreen = ctx.screen?.attemptId ?? null;
    const wanted = asked ?? onScreen;

    // user_id is in every branch: an attempt id is a small integer and trivially guessable, so
    // ownership is enforced in the WHERE clause rather than checked afterwards.
    const rows = (wanted
      ? await sql`
          /* theory-mode-guard: all-modes -- a debrief is a debrief in every mode */
          SELECT id, question_id, theory_question_id, mode, stem_detail, pre_glass_reasoning,
                 pre_glass_feedback, tasting_notes, user_answer, answer_feedback, pass_estimate,
                 marks_estimate, elapsed_seconds, started_at, completed_at, input_method
          FROM user_attempts
          WHERE id = ${wanted} AND user_id = ${ctx.userId}`
      : await sql`
          /* theory-mode-guard: all-modes -- a debrief is a debrief in every mode */
          SELECT id, question_id, theory_question_id, mode, stem_detail, pre_glass_reasoning,
                 pre_glass_feedback, tasting_notes, user_answer, answer_feedback, pass_estimate,
                 marks_estimate, elapsed_seconds, started_at, completed_at, input_method
          FROM user_attempts
          WHERE user_id = ${ctx.userId} AND completed_at IS NOT NULL
            AND (source IS NULL OR source <> 'feedback_tab')
            AND (scope IS NULL OR scope <> 'general')
          ORDER BY completed_at DESC
          LIMIT 1`) as AttemptRow[];

    const a = rows[0];
    if (!a) {
      return {
        error: wanted
          ? "That attempt isn't one of yours, or it no longer exists."
          : "You haven't completed an attempt yet, so there's nothing to look back at.",
      };
    }

    const graded = !!a.completed_at;

    // The question is only joined once the attempt is finished. An in-flight attempt returns the
    // candidate's own draft (theirs to see) with no wines and no model answer.
    let question: Record<string, unknown> | null = null;
    if (graded && a.question_id) {
      const q = (await sql`
        SELECT question_id, paper, family, family_label, subcategory, question_text, total_marks,
               wines, model_answer, wine_profiles, study_diagram_assist
        FROM generated_questions WHERE question_id = ${a.question_id}
      `) as Record<string, unknown>[];
      question = q[0] ?? null;
    }

    return {
      attempt: {
        id: a.id,
        mode: a.mode,
        stemDetail: a.stem_detail,
        graded,
        passEstimate: a.pass_estimate,
        // Surfaced explicitly so the model does not quietly treat its absence as a low score. It is
        // unpopulated on essentially every attempt — there is no numeric mark to reason about.
        marksEstimate: a.marks_estimate,
        marksNote: a.marks_estimate
          ? undefined
          : "No numeric mark was recorded for this attempt. Do not invent one or imply a score.",
        elapsedSeconds: a.elapsed_seconds,
        inputMethod: a.input_method,
        completedAt: a.completed_at,
        theoryQuestionId: a.theory_question_id,
      },
      candidateWork: {
        preGlassReasoning: a.pre_glass_reasoning,
        tastingNotes: a.tasting_notes,
        answer: a.user_answer,
      },
      grading: {
        preGlassFeedback: a.pre_glass_feedback,
        answerFeedback: a.answer_feedback,
      },
      question,
      note: graded
        ? undefined
        : "This attempt is still open, so the wines and model answer are withheld. Talk about their draft and their process, not the identification.",
    };
  },
};
