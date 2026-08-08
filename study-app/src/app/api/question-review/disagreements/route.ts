// GET /api/question-review/disagreements
//
// Questions where the two reviewers landed on opposite verdicts. Available only once BOTH have voted
// on a question (that is what a disagreement is), so it never leaks one reviewer's vote to the other
// before they have formed their own — which is the point of voting blind.

import { requireReviewer } from "../gate";
import { getDisagreements, getReviewSpendToday } from "@/lib/question-review";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await requireReviewer(request);
  if (gate instanceof Response) return gate;

  try {
    const [disagreements, spendToday] = await Promise.all([
      getDisagreements(),
      getReviewSpendToday(gate.id),
    ]);
    return Response.json({ disagreements, spendToday });
  } catch (err) {
    console.error("question-review disagreements error:", err);
    return Response.json({ error: "Failed to load disagreements" }, { status: 500 });
  }
}
