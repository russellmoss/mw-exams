// GET /api/question-review/queue?limit=12
//
// The next slice of this reviewer's queue, their countdown, and the state of every paper × family
// block in their current selection.
//
// No cursor: casting a vote removes the question from the underlying set, so a refetch always
// resumes exactly where they left off — including from a different device, and including after the
// filter changes. The filter itself is read from the reviewer's saved preference (POST ../prefs),
// never from the query string, so the queue and the block list can never disagree about scope.

import { requireReviewer } from "../gate";
import {
  getReviewQueue,
  getReviewProgress,
  getReviewBlocks,
  getReviewFilter,
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
    const filter = await getReviewFilter(gate.id);
    const [cards, progress, blocks, standings, spendToday] = await Promise.all([
      getReviewQueue(gate.id, limit, filter),
      getReviewProgress(gate.id),
      getReviewBlocks(gate.id, filter),
      getReviewerStandings(),
      getReviewSpendToday(gate.id),
    ]);
    return Response.json({ cards, progress, blocks, filter, standings, spendToday });
  } catch (err) {
    console.error("question-review queue error:", err);
    return Response.json({ error: "Failed to load the review queue" }, { status: 500 });
  }
}
