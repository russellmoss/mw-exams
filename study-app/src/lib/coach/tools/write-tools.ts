// Write tools, and the committers that actually execute them.
//
// Each write is a PAIR: a tool the model can call, which only ever returns a proposal, and a
// committer the model cannot reach, which does the work after the candidate confirms. Keeping them
// in one file makes the pairing obvious — a tool without a committer would be an offer that can
// never be honoured, and a committer without a tool is dead code.
//
// EVERYTHING LANDS IN user_attempts. There is no separate Coach-feedback store, because migration
// 053 already decided this question: the feedback tab, the History flow and /api/admin/feedback all
// read user_attempts. Routing Coach-filed feedback anywhere else would create a second queue nobody
// triages — and would cut it off from the analysis pipeline that turns accepted feedback into PRs,
// which is most of the value of being able to file it from here.

import { countRecentTabFeedback, createQuestionFlag, recordTabFeedback } from "@/lib/db";
import { runFeedbackAnalysis } from "@/lib/feedback-analysis";
import { proposal, type CoachProposal } from "../confirm";
import type { CoachTool } from "../types";

const MAX_BODY = 4000;
/** The same 10/hour the Feedback tab enforces. Shared, not parallel — see RATE_LIMIT note below. */
const RATE_LIMIT_PER_HOUR = 10;

const CATEGORIES = ["wrong_misleading", "confusing_wording", "grading_off", "bug", "idea"] as const;

function clampBody(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_BODY) : "";
}

// ── Tools (model-facing; never mutate) ───────────────────────────────────────────────────────────

export const reportQuestion: CoachTool = {
  name: "report_question",
  kind: "write",
  description:
    "File a report against a specific generated question — that it is wrong, misleading, unrealistic, " +
    "badly worded, or graded unfairly. Use this when the candidate has challenged a question and you " +
    "have CHECKED and agree with them, or when they explicitly ask you to report it. " +
    "Put their complaint in `body` in concrete terms, including what you verified — a report that " +
    "says 'this producer has never appeared in 15 years of papers' is actionable; 'user thinks this " +
    "is wrong' is not. Never file one without the candidate agreeing first.",
  inputSchema: {
    type: "object",
    properties: {
      questionId: { type: "string", description: "The question being reported. Omit to use the one on screen." },
      body: { type: "string", description: "The complaint, specific and checkable." },
      category: { type: "string", enum: [...CATEGORIES] },
    },
    required: ["body"],
  },
  async run(ctx, input): Promise<CoachProposal | { error: string }> {
    const body = clampBody(input.body);
    if (!body) return { error: "A report needs a body." };

    const questionId =
      (typeof input.questionId === "string" ? input.questionId : null) || ctx.screen?.questionId || null;
    const category = CATEGORIES.includes(input.category as (typeof CATEGORIES)[number])
      ? (input.category as string)
      : "wrong_misleading";

    // Drafts are structurally uncommittable: no question to attach to means no token is minted, so
    // the card renders as "I need this before I can file it" rather than filing an orphan report.
    const blockers = questionId ? undefined : ["Which question? I couldn't tell from the screen."];

    return proposal({
      preview: questionId ? `Report question ${questionId}` : "Report a question",
      details: [
        { label: "Question", value: questionId || "— not identified —" },
        { label: "Category", value: category },
        { label: "Report", value: body },
      ],
      blockers,
    });
  },
};

export const submitFeedback: CoachTool = {
  name: "submit_feedback",
  kind: "write",
  description:
    "Send general feedback about the app — an idea, a complaint about how something works, a request. " +
    "Not tied to a question (use report_question for that) and not a defect (use file_bug). " +
    "Only after the candidate has agreed to send it.",
  inputSchema: {
    type: "object",
    properties: {
      body: { type: "string" },
      category: { type: "string", enum: ["idea", "confusing_wording", "grading_off", "wrong_misleading"] },
    },
    required: ["body"],
  },
  async run(_ctx, input): Promise<CoachProposal | { error: string }> {
    const body = clampBody(input.body);
    if (!body) return { error: "Feedback needs a body." };
    const category = CATEGORIES.includes(input.category as (typeof CATEGORIES)[number])
      ? (input.category as string)
      : "idea";
    return proposal({
      preview: "Send this as feedback",
      details: [
        { label: "Category", value: category },
        { label: "Feedback", value: body },
      ],
    });
  },
};

export const fileBug: CoachTool = {
  name: "file_bug",
  kind: "write",
  description:
    "Report something broken — a page that errors, a control that does nothing, a layout that is " +
    "wrong, a total that does not add up on screen. Include what they did, what happened, and what " +
    "they expected. The route they are on AND the question they are looking at are attached " +
    "automatically, so you do not need to name either in the body. Only after the candidate has " +
    "agreed to send it. " +
    "Note this is about the APP being broken, not the question being wrong — a question that is " +
    "factually wrong or badly worded goes to report_question or flag_defect. Withdrawing a question " +
    "from rotation cannot fix a rendering bug, so do not offer that here.",
  inputSchema: {
    // No questionId: the screen's is attached server-side (see proposalArgs). Letting the model name
    // one would put an unvalidated id on the row's foreign key for a field that is only context.
    type: "object",
    properties: { body: { type: "string" } },
    required: ["body"],
  },
  async run(ctx, input): Promise<CoachProposal | { error: string }> {
    const body = clampBody(input.body);
    if (!body) return { error: "A bug report needs a description." };

    // Shown on the card because the attachment is inferred from the screen rather than stated by the
    // candidate. If they are describing a bug they hit on a DIFFERENT question, seeing the wrong id
    // here is the only chance they get to say so before it is filed under it.
    const details = [{ label: "Where", value: ctx.screen?.route || "unknown" }];
    if (ctx.screen?.questionId) details.push({ label: "Question on screen", value: ctx.screen.questionId });
    details.push({ label: "Bug", value: body });

    // No blockers, unlike the report paths: a bug with no question is an ordinary app bug, not an
    // incomplete draft.
    return proposal({ preview: "File this as a bug", details });
  },
};

/**
 * The defect path — the one write with consequences beyond a queue entry.
 *
 * WHAT IT DOES AND DOES NOT DO. Confirming this card pulls the question from rotation immediately,
 * files the report, and fires the analysis that already exists. It does NOT decide anything about
 * the code. That distinction is the whole design: `runFeedbackAnalysis` is an Opus pass grounded in
 * the empirical-knowledge base which produces an accept/reject verdict and, only when auto-apply is
 * enabled, dispatches the branch-and-PR pipeline behind the deploy-quota guard. Letting a chat turn
 * skip that would trade every one of those controls for a few minutes of latency.
 *
 * So the Coach's judgement decides ONE thing — whether this question stops being served — which is
 * instant, reversible, touches no code, and is the part the candidate actually cares about. The
 * durable fix goes through the pipeline that was built to make it safely.
 */
export const flagDefect: CoachTool = {
  name: "flag_defect",
  kind: "write",
  // A broken question is wasting their time now; making them finish it first is the wrong trade.
  allowedWhenAttemptOpen: true,
  description:
    "Report a question as DEFECTIVE, which withdraws it from rotation so nobody is served it again, " +
    "files the report, and starts the review that can produce a fix. " +
    "Use this ONLY when you have actually checked and are confident there is a real defect — you have " +
    "searched the corpus for precedent, or you can see the problem in the question itself (marks that " +
    "do not add up, a stem that contradicts its own sub-parts, a wine that is wrong for the paper). " +
    "If you have not checked, check first. If you checked and the candidate is mistaken, tell them so " +
    "and do not call this. " +
    "This is heavier than report_question: it takes the question out of circulation. Use " +
    "report_question for a complaint you have not been able to verify.",
  inputSchema: {
    type: "object",
    properties: {
      questionId: { type: "string", description: "Omit to use the question on screen." },
      reasons: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "wrong_marks",
            "not_realistic",
            "duplicate_wine",
            "weak_stem",
            "factually_wrong",
            "wrong_paper",
            "too_easy",
            "too_obscure",
            "wrong_colour_for_paper",
          ],
        },
        description: "At least one. These are the same codes the admin review uses.",
      },
      note: { type: "string", description: "What you verified, specifically, and how." },
      winePosition: {
        type: "integer",
        description: "1-based slot, only with 'wrong_colour_for_paper'.",
      },
    },
    required: ["reasons", "note"],
  },
  async run(ctx, input): Promise<CoachProposal | { error: string }> {
    const note = clampBody(input.note);
    const reasons = Array.isArray(input.reasons)
      ? (input.reasons as unknown[]).filter((r): r is string => typeof r === "string")
      : [];
    if (!reasons.length) return { error: "At least one reason code is required." };
    if (!note) return { error: "Say what you verified." };

    const questionId =
      (typeof input.questionId === "string" ? input.questionId : null) || ctx.screen?.questionId || null;
    const blockers = questionId ? undefined : ["Which question? I couldn't tell from the screen."];

    // The card spells out the consequence in plain words. "Filed a report" and "took this question
    // out of circulation" are different things to agree to, and the candidate is agreeing to the
    // second one here.
    return proposal({
      preview: "Pull this question from rotation and open a review",
      details: [
        { label: "Question", value: questionId || "— not identified —" },
        { label: "Problem", value: reasons.join(", ") },
        { label: "What I checked", value: note },
        {
          label: "What happens",
          value:
            "It stops being served to anyone, the report goes to review, and the fix pipeline picks it up.",
        },
      ],
      blockers,
    });
  },
};

export const WRITE_TOOLS: CoachTool[] = [reportQuestion, submitFeedback, fileBug, flagDefect];

// ── Committers (never model-facing) ──────────────────────────────────────────────────────────────

export interface CommitterContext {
  userId: number;
  route: string | null;
  /**
   * The candidate's own key, when they have one. Only the defect path needs it, to run the feedback
   * analysis immediately rather than leaving it to the nightly sweep. Absent is fine — the sweep
   * still picks the row up, so the fix is delayed rather than lost.
   */
  apiKey?: string | null;
  /** Deferred work, so a 120s analysis doesn't hold the candidate's Confirm click open. */
  defer?: (work: Promise<unknown>) => void;
}

export type Committer = (
  ctx: CommitterContext,
  args: Record<string, unknown>
) => Promise<{ message: string; data?: unknown }>;

/**
 * The rate limit is SHARED with the Feedback tab, not a second allowance.
 *
 * countRecentTabFeedback counts rows with source='feedback_tab' in the last hour, and everything
 * filed here is written with that same source — so the Coach cannot be used to route around the
 * limit. That matters more than it sounds: the Coach makes filing feedback conversational and
 * therefore much easier, and each accepted item eventually becomes a merge to master.
 */
async function assertUnderRateLimit(userId: number): Promise<void> {
  const recent = await countRecentTabFeedback(userId);
  if (recent >= RATE_LIMIT_PER_HOUR) {
    throw new Error(
      `You've sent ${recent} pieces of feedback in the last hour, which is the limit. Try again later.`
    );
  }
}

/**
 * Start the adjudication for a question-scoped report, deferred.
 *
 * WHY EVERY QUESTION REPORT AND NOT JUST DEFECTS. `sweepStrandedFeedback` would eventually pick
 * these up, but it takes three per run, so a report filed in conversation could sit for days behind
 * a backlog — and the candidate is standing right there having just been told a review would happen.
 * Running it here is the same call the sweeper would make, just now.
 *
 * Deferred, so a ~120s Opus pass does not hold the Confirm click open, and swallowed on failure
 * because the sweeper remains the backstop: the row keeps `auto_analysis_id IS NULL` if this throws
 * before creating the analysis, which is exactly the set the sweeper looks for.
 *
 * The analysis reaches its own accept / partial / reject verdict, independently of whatever the
 * Coach argued in chat, and applies it only when Auto-Apply is enabled. Nothing here shortcuts that.
 */
function startAdjudication(ctx: CommitterContext, attemptId: number, label: string): void {
  const work = runFeedbackAnalysis({ attemptId, apiKey: ctx.apiKey ?? undefined, source: "user" })
    .then((r) => {
      console.log(`[coach] ${label} analysis for attempt ${attemptId}: ${r.status}/${r.recommendation ?? "-"}`);
    })
    .catch((e) => console.error(`[coach] ${label} analysis failed (sweeper will retry):`, e));
  if (ctx.defer) ctx.defer(work);
}

export const COMMITTERS: Record<string, Committer> = {
  async report_question(ctx, args) {
    await assertUnderRateLimit(ctx.userId);
    const questionId = typeof args.questionId === "string" ? args.questionId : null;
    if (!questionId) throw new Error("No question was identified, so there was nothing to report.");

    // recordTabFeedback, not recordUserFeedback: the latter takes an attempt id and updates that
    // row. This one resolves the question-scoped case properly — attaching to the candidate's
    // attempt when there is one, forking a row rather than clobbering existing feedback, and
    // creating a fresh row when the question was never attempted.
    const { id } = await recordTabFeedback({
      userId: ctx.userId,
      text: clampBody(args.body),
      category: typeof args.category === "string" ? args.category : "wrong_misleading",
      scope: "question",
      route: ctx.route || "",
      pausedMs: null,
      questionId,
      attemptId: typeof args.attemptId === "number" ? args.attemptId : null,
    });

    startAdjudication(ctx, id, "report");

    // `awaitingVerdict` tells the card to poll. Set only on the question-scoped writes, because they
    // are the only ones an adjudication exists for — see the general-feedback committers below.
    return {
      message: `Filed against ${questionId}. Reviewing it now.`,
      data: { attemptId: id, awaitingVerdict: true },
    };
  },

  async submit_feedback(ctx, args) {
    await assertUnderRateLimit(ctx.userId);
    const { id } = await recordTabFeedback({
      userId: ctx.userId,
      text: clampBody(args.body),
      category: typeof args.category === "string" ? args.category : "idea",
      scope: "general",
      route: ctx.route || "",
      pausedMs: null,
      questionId: null,
      attemptId: null,
    });
    return { message: "Sent. Thanks.", data: { attemptId: id } };
  },

  async flag_defect(ctx, args) {
    await assertUnderRateLimit(ctx.userId);
    const questionId = typeof args.questionId === "string" ? args.questionId : null;
    if (!questionId) throw new Error("No question was identified, so there was nothing to flag.");

    const reasons = Array.isArray(args.reasons)
      ? (args.reasons as unknown[]).filter((r): r is string => typeof r === "string")
      : [];
    const note = clampBody(args.note);
    const attemptId = typeof args.attemptId === "number" ? args.attemptId : null;

    // 1. Take it out of rotation. One transaction: writes the flag, sets review_state='pending' +
    //    flagged_by_candidate so the serve paths skip it, stamps the attempt, and pings admins.
    //    Idempotent — flagging twice while one is pending does not double-withdraw.
    await createQuestionFlag({
      questionId,
      attemptId,
      userId: ctx.userId,
      reasons,
      note,
      winePosition:
        reasons.includes("wrong_colour_for_paper") && typeof args.winePosition === "number"
          ? (args.winePosition as number)
          : null,
    });

    // 2. File the report into the same store everything else uses, so it reaches the same queue.
    const { id } = await recordTabFeedback({
      userId: ctx.userId,
      text: note,
      category: "wrong_misleading",
      scope: "question",
      route: ctx.route || "",
      pausedMs: null,
      questionId,
      attemptId,
    });

    // 3. Hand off to the existing pipeline — see startAdjudication. It dispatches the branch-and-PR
    //    run ONLY if auto-apply is enabled, which the Coach does not get to shortcut.
    startAdjudication(ctx, id, "defect");

    return {
      message: "Pulled from rotation — nobody gets served it again. Reviewing it now.",
      data: { attemptId: id, questionId, awaitingVerdict: true },
    };
  },

  /**
   * A bug keeps its question but stays OUT of the question-quality pipeline.
   *
   * The row is written with the question attached and `scope: 'general'`, which looks like a
   * contradiction and is the whole point: `question_id` says what the candidate was looking at,
   * `scope` says who reads it. An admin can now see that attempt 407 is about a P2 F5 question
   * instead of the bare "General feedback" the old NULL produced.
   *
   * NO startAdjudication, and that is deliberate rather than an omission. runFeedbackAnalysis is a
   * question-QUALITY analyser: it prompts on the stem, the wines, the model answer and the empirical
   * knowledge for that paper, and reaches accept/reject on whether the QUESTION is sound. A footer
   * that renders 44 for a question that correctly totals 50 is not a fact about the question — the
   * question is fine and the analyser would say so, producing a "reject" that reads as "your bug
   * report was wrong". Worse, an "accept" would dispatch the branch-and-PR pipeline against the
   * generation rules to fix a bug that lives in a React component.
   *
   * So `awaitingVerdict` is absent too: no adjudication runs, so the card must not poll for one. The
   * "only promises a verdict where an adjudication actually runs" test in coach-confirm.test.ts pins
   * that pairing, and sweepStrandedFeedback skips scope='general' so the nightly sweep cannot start
   * one behind our back.
   */
  async file_bug(ctx, args) {
    await assertUnderRateLimit(ctx.userId);
    const { id } = await recordTabFeedback({
      userId: ctx.userId,
      text: clampBody(args.body),
      category: "bug",
      scope: "general",
      route: ctx.route || "",
      pausedMs: null,
      // From the screen, signed into the token by proposalArgs — never model-named.
      questionId: typeof args.questionId === "string" ? args.questionId : null,
      attemptId: null,
    });
    return { message: "Bug filed. Thanks — that's genuinely useful.", data: { attemptId: id } };
  },
};
