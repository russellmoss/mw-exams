// GET /api/question-review/queue?limit=12
//
// The next slice of this reviewer's queue plus their countdown. No cursor: casting a vote removes
// the question from the underlying set, so a refetch always resumes exactly where they left off —
// including from a different device mid-session.

import { requireReviewer } from "../gate";
import {
  getReviewQueue,
  getReviewProgress,
  getReviewerStandings,
  getReviewSpendToday,
} from "@/lib/question-review";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await requireReviewer(request);
  if (gate instanceof Response) return gate;

  const limitParam = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 12;

  try {
    const [cards, progress, standings, spendToday] = await Promise.all([
      getReviewQueue(gate.id, limit),
      getReviewProgress(gate.id),
      getReviewerStandings(),
      getReviewSpendToday(gate.id),
    ]);
    return Response.json({ cards, progress, standings, spendToday });
  } catch (err) {
    console.error("question-review queue error:", err);
    return Response.json({ error: "Failed to load the review queue" }, { status: 500 });
  }
}
