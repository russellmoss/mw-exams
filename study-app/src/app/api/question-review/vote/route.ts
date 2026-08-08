// POST /api/question-review/vote  { questionId, verdict: 'up'|'down'|'skip', tags?, note? }
//
// Records one reviewer's verdict on one banked question.
//
//   up   → endorses the question (migration 057). No model call, no cost.
//   down → writes a user_attempts row tagged source='question_review' and immediately hands it to
//          runFeedbackAnalysis, so the reviewer gets an adjudicated verdict in the notification bell
//          while the question is still fresh and can rebut it in the existing thread UI.
//   skip → recorded, nothing else. Leaves the queue without becoming a complaint or an exemplar.
//
// A down-vote is the ONLY branch that spends money. See getReviewSpendToday for why that is surfaced.

import { after } from "next/server";
import { requireReviewer } from "../gate";
import { getUserApiKey } from "@/lib/api-key";
import { runFeedbackAnalysis } from "@/lib/feedback-analysis";
import {
  recordReviewVote,
  attachAnalysisToReview,
  getReviewProgress,
  getReviewSpendToday,
  sanitizeReviewTags,
  sanitizeReviewNote,
  isReviewVerdict,
} from "@/lib/question-review";

export const runtime = "nodejs";
// The analysis runs in after() and takes an Opus round-trip plus a Tavily fact-check.
export const maxDuration = 300;

export async function POST(request: Request) {
  const gate = await requireReviewer(request);
  if (gate instanceof Response) return gate;

  const body = await request.json().catch(() => ({}));
  const { questionId, verdict, tags: rawTags, note: rawNote } = body as Record<string, unknown>;

  if (typeof questionId !== "string" || !questionId) {
    return Response.json({ error: "Missing questionId" }, { status: 400 });
  }
  if (!isReviewVerdict(verdict)) {
    return Response.json({ error: "verdict must be 'up', 'down' or 'skip'" }, { status: 400 });
  }

  const tags = sanitizeReviewTags(rawTags);
  const note = sanitizeReviewNote(rawNote);

  // A thumbs-down MUST say why. This is the whole point of the surface: an unexplained rejection
  // tells the feedback loop that something is wrong and nothing about what, which is the one input
  // the analyzer cannot do anything useful with. Enforced here and not only in the UI, because the
  // rule is about the integrity of the data, not the convenience of the form.
  if (verdict === "down" && !note) {
    return Response.json(
      { error: "A thumbs-down needs a written reason." },
      { status: 400 }
    );
  }

  try {
    const recorded = await recordReviewVote({
      reviewerId: gate.id,
      reviewerName: gate.name,
      questionId,
      verdict,
      tags,
      note,
      route: "/review",
    });

    // Resolve the reviewer's own key where they have one, so the spend and the rate limit land on
    // the right account. Falls back to the server key inside runFeedbackAnalysis (every reviewer is
    // an admin, so that fallback always resolves) — a missing key must not lose the vote, which is
    // already committed above.
    let apiKey: string | undefined;
    if (recorded.attemptId) {
      const resolved = await getUserApiKey(request).catch(() => null);
      apiKey = resolved?.key?.apiKey;
    }

    const attemptId = recorded.attemptId;
    const reviewId = recorded.reviewId;
    if (attemptId) {
      // after(): the reviewer advances to the next card immediately. The analysis is durable
      // server-side and the notification bell delivers the verdict whenever it lands, so nothing is
      // lost if they navigate away — this is the failure mode the whole pipeline was moved
      // server-side to fix.
      after(async () => {
        try {
          const result = await runFeedbackAnalysis({ attemptId, apiKey, source: "user" });
          if (result.analysisId) await attachAnalysisToReview(reviewId, result.analysisId);
          console.log(
            `[question-review] attempt ${attemptId}: ${result.status}/${result.recommendation ?? "-"}`
          );
        } catch (err) {
          // The sweeper (sweepStrandedFeedback) retries anything left with a NULL auto_analysis_id.
          console.error("[question-review] analysis failed (sweeper will retry):", err);
        }
      });
    }

    const [progress, spendToday] = await Promise.all([
      getReviewProgress(gate.id),
      getReviewSpendToday(gate.id),
    ]);

    return Response.json({
      ok: true,
      revote: recorded.revote,
      attemptId,
      awaitingVerdict: !!attemptId,
      progress,
      spendToday,
    });
  } catch (err) {
    console.error("question-review vote error:", err);
    return Response.json({ error: "Failed to record the vote" }, { status: 500 });
  }
}
