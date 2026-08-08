// POST /api/question-review/prefs  { papers?, families?, order? }
//
// Persist the reviewer's block selection. Saved server-side rather than in localStorage because a
// pass over 511 questions is not a one-sitting job — starting on a laptop and continuing on an iPad
// should resume the same walk, not silently reset to the whole bank.
//
// Returns the sanitized filter alongside the freshly-scoped blocks and queue head, so the client can
// re-render from one round-trip instead of saving and then refetching.

import { requireReviewer } from "../gate";
import {
  saveReviewFilter,
  getReviewQueue,
  getReviewBlocks,
  getReviewProgress,
} from "@/lib/question-review";
import { sanitizeReviewFilter } from "@/lib/question-review-shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const gate = await requireReviewer(request);
  if (gate instanceof Response) return gate;

  const body = await request.json().catch(() => ({}));

  try {
    // sanitizeReviewFilter reads an empty/absent selection as "everything", so a malformed body can
    // only ever widen the queue back to the default — never produce an empty one that looks
    // indistinguishable from having finished.
    const filter = await saveReviewFilter(gate.id, sanitizeReviewFilter(body));
    const [cards, blocks, progress] = await Promise.all([
      getReviewQueue(gate.id, 12, filter),
      getReviewBlocks(gate.id, filter),
      getReviewProgress(gate.id),
    ]);
    return Response.json({ ok: true, filter, cards, blocks, progress });
  } catch (err) {
    console.error("question-review prefs error:", err);
    return Response.json({ error: "Failed to save the selection" }, { status: 500 });
  }
}
