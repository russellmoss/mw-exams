import { getUser } from "@/lib/auth";
import { getLiveTastingSession, stampLiveTastingEvent } from "@/lib/db";
import { deriveSessionState } from "@/lib/live-tasting";

export const runtime = "nodejs";

/**
 * POST /api/live-tasting/[id]/shopping — the explicit "reveal the shopping list" action.
 *
 * Stamps user_revealed_at (set-once): from this moment the session's blind-integrity badge is
 * 'self' forever — the interstitial in the UI makes sure the user chose this knowingly. The
 * partner flow never calls this route; it reads the same list via /shop/[token].
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
  const { id } = await params;

  const session = await getLiveTastingSession(id, user.id);
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });
  if (deriveSessionState(session) !== "shopping") {
    return Response.json({ error: "This session is no longer in shopping" }, { status: 409 });
  }

  await stampLiveTastingEvent(session.id, "user_revealed_at");
  return Response.json({
    archetypeLabel: (session.availability as { archetypeLabel?: string })?.archetypeLabel ?? null,
    availability: session.availability,
    budgetAmount: session.budget_amount,
    budgetCurrency: session.budget_currency,
    baggingInstructions:
      "Have the bottles bagged and numbered 1–" + session.flight_size +
      " (ideally by someone else), and pour in slot order when you taste.",
  });
}
