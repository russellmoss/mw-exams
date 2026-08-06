import { after } from "next/server";
import { requireApiKey } from "@/lib/api-key";
import { getUser } from "@/lib/auth";
import { sseStream } from "@/lib/thinking-stream";
import { createLiveTasting } from "@/lib/live-tasting-engine";
import {
  getLiveTastingSessionsForUser,
  getUserLiveTastingPrefs,
  countRecentLiveTastingSessions,
} from "@/lib/db";
import { deriveSessionState, deriveBlindIntegrity } from "@/lib/live-tasting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/live-tasting — the user's sessions. List payload carries NO wine identity. */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

  const sessions = await getLiveTastingSessionsForUser(user.id);
  return Response.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      state: deriveSessionState(s),
      blindIntegrity: deriveBlindIntegrity(s),
      paper: s.paper,
      flightSize: s.flight_size,
      city: s.city,
      country: s.country,
      createdAt: s.created_at,
      gradedAt: s.graded_at,
    })),
  });
}

/**
 * POST /api/live-tasting — create a session (SSE progress; live_tasting_plan.md §4).
 * Body: { paper: 1|2|3, flightSize: 2-4, budgetAmount?, budgetCurrency? } — market comes from the
 * user's saved prefs; budget can be overridden per session.
 */
export async function POST(request: Request) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  const userId = keyResult.user.id;

  const body = await request.json();
  const paper = Number(body.paper);
  const flightSize = Math.min(4, Math.max(2, Number(body.flightSize) || 3));
  if (![1, 2, 3].includes(paper)) {
    return Response.json({ error: "paper must be 1, 2 or 3" }, { status: 400 });
  }

  const prefs = await getUserLiveTastingPrefs(userId);
  if (!prefs.city || !prefs.country) {
    return Response.json(
      { error: "Set your city and country in Settings → Live Tasting first." },
      { status: 400 }
    );
  }

  // Rate limit (plan §5.3): each generation is a bounded but real Tavily + LLM spend.
  const recent = await countRecentLiveTastingSessions(userId);
  if (recent >= 2) {
    return Response.json(
      { error: "Live Tasting is limited to 2 new sessions per day — your cellar can only drink so fast." },
      { status: 429 }
    );
  }

  const overrideAmount = Number(body.budgetAmount);
  const budgetAmount =
    Number.isFinite(overrideAmount) && overrideAmount > 0 ? overrideAmount : prefs.budgetAmount;
  const budgetCurrency =
    typeof body.budgetCurrency === "string" && body.budgetCurrency.trim()
      ? body.budgetCurrency.trim().toUpperCase()
      : prefs.budgetCurrency;

  return sseStream(async (emit) => {
    const outcome = await createLiveTasting({
      userId,
      apiKey: keyResult.apiKey,
      paper,
      flightSize,
      city: prefs.city!,
      country: prefs.country!,
      budgetAmount,
      budgetCurrency,
      radiusMinutes: prefs.radiusMinutes,
      emit,
      // Keep the invocation alive until the detached model-answer/audit chain settles — on
      // serverless, detached promises die with the response (E2E run 2, session B).
      keepAlive: (work) => after(() => work.catch(() => {})),
    });
    if ("error" in outcome) throw new Error(outcome.error);
    emit({ type: "status", label: "Session ready — time to go shopping." });
    // Redacted result: the client gets the session id and state, never the flight.
    return { sessionId: outcome.session.id };
  });
}
