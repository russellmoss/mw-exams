// What is on the candidate's screen right now.
//
// This is the tool that reads a live question record, so it is the one that could actually leak an
// answer. Two structural controls, neither of which depends on the model behaving:
//
// 1. COLUMN ALLOW-LISTS, NOT FIELD DELETION. There are two SQL statements with two explicit column
//    lists. The restricted one cannot return `wines`, `model_answer`, `wine_profiles`,
//    `reasoning_trace`, `study_diagram_assist`, `proposed_annotation`, `wine_category`, `p3_category`
//    or `curveball` because it never selects them. A deny-list would leak the next identity column
//    somebody adds to generated_questions; an allow-list defaults new columns to hidden.
//
// 2. THE QUESTION ID IS VERIFIED, NOT TRUSTED. The id arrives from the browser, so a candidate could
//    post any question's id and read its model answer. Every read is therefore gated on the user
//    having an attempt on that question. Without that check this tool would be a way to fetch the
//    answer key for a question you are about to be served.

import { neon } from "@neondatabase/serverless";
import type { CoachTool } from "../types";

/** Safe while an attempt is open: the framing the candidate can already see on their own screen. */
const SAFE_COLUMNS = `
  question_id, paper, family, family_label, subcategory, question_text, total_marks, flight_size`;

/** Everything above, plus the identity material — only once nothing is in flight. */
const FULL_COLUMNS = `
  question_id, paper, family, family_label, subcategory, question_text, total_marks, flight_size,
  wines, model_answer, wine_profiles, proposed_annotation, study_diagram_assist,
  wine_category, p3_category, curveball, price_band`;

export const getScreenContext: CoachTool = {
  name: "get_screen_context",
  kind: "read",
  description:
    "Look at the question the candidate currently has open, so you can talk about the thing in front " +
    "of them without asking them to paste it. Returns the stem, paper, family, mark allocation and " +
    "flight size. " +
    "While an attempt is in progress the wines, model answer and wine profiles are NOT returned — you " +
    "will get the framing only, which is the same thing the candidate can see. Once the attempt is " +
    "finished you get the full record and can discuss the answer freely. " +
    "Call this whenever the candidate says 'this question', 'this wine' or 'what I'm looking at'.",
  inputSchema: {
    type: "object",
    properties: {
      questionId: {
        type: "string",
        description:
          "Usually omit this — the question on screen is resolved automatically. Only pass an id " +
          "when the candidate names a specific past question of their own.",
      },
    },
  },
  async run(ctx, input) {
    const sql = neon(process.env.DATABASE_URL!);
    const asked = typeof input.questionId === "string" ? input.questionId : null;
    const onScreen = ctx.screen?.questionId ?? null;
    const questionId = asked || onScreen;

    if (!questionId) {
      return {
        error:
          "No question is open. Ask the candidate what they're looking at, or answer from the " +
          "conversation instead.",
      };
    }

    // Authorisation, not filtering. The user must have attempted this question for it to be theirs
    // to read — otherwise a supplied id is just a request for somebody else's answer key.
    const owned = (await sql`
      /* theory-mode-guard: all-modes -- ownership check spans every study mode */
      SELECT 1 FROM user_attempts
      WHERE user_id = ${ctx.userId} AND question_id = ${questionId}
      LIMIT 1
    `) as unknown[];

    if (owned.length === 0) {
      return {
        error:
          "That question isn't one of yours — I can only look at questions you've been served. If " +
          "it's on your screen right now, it may not have been recorded yet; ask the candidate to " +
          "describe it instead.",
      };
    }

    const columns = ctx.state.restricted ? SAFE_COLUMNS : FULL_COLUMNS;
    const rows = (await sql`
      SELECT ${sql.unsafe(columns)} FROM generated_questions WHERE question_id = ${questionId}
    `) as Record<string, unknown>[];

    if (!rows[0]) return { error: "That question no longer exists." };

    return {
      attemptState: ctx.state.state,
      redacted: ctx.state.restricted,
      note: ctx.state.restricted
        ? "An attempt is open, so the wines and model answer are withheld. Coach the routing; do not state the conclusion."
        : undefined,
      question: rows[0],
    };
  },
};
