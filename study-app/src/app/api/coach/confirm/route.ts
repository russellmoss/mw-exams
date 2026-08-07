import { after } from "next/server";
import { getUser } from "@/lib/auth";
import { getApiKeyForUserId } from "@/lib/api-key";
import { isCoachEnabled } from "@/lib/settings";
import { commitProposal } from "@/lib/coach/commit";

export const runtime = "nodejs";
// The defect path defers a feedback analysis via after(); the route itself returns immediately, but
// the function must stay alive long enough for that work to finish.
export const maxDuration = 300;

/**
 * POST /api/coach/confirm — execute a proposal the candidate approved.
 * Body: { token: string, route?: string }
 *
 * The ONLY path that performs a Coach write. Deliberately separate from the chat route: the model
 * cannot reach it, the request is initiated by a human pressing a button, and the token proves the
 * arguments are the ones that were shown on the card.
 */
export async function POST(request: Request) {
  if (!(await isCoachEnabled())) {
    return Response.json({ error: "The Coach is currently unavailable." }, { status: 503 });
  }

  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) return Response.json({ error: "token is required" }, { status: 400 });

  const route = typeof body?.route === "string" ? body.route.slice(0, 512) : null;

  try {
    // Not requireApiKey: a candidate without their own key must still be able to file feedback and
    // flag a broken question. Absent simply means the analysis waits for the nightly sweeper.
    const apiKey = await getApiKeyForUserId(user.id).catch(() => null);

    const result = await commitProposal(token, {
      userId: user.id,
      route,
      apiKey,
      // Without the keepalive a detached promise dies with the serverless response — the same
      // lesson the Live Tasting engine learned about background model-answer work.
      defer: (work) => after(work),
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ ok: true, message: result.message, data: result.data });
  } catch (err) {
    // A committer's own error message is written for the candidate (the rate limit, for example),
    // so it is surfaced rather than swallowed into a generic 500.
    const message = err instanceof Error ? err.message : "That didn't work.";
    console.error("[coach] commit failed:", err);
    return Response.json({ error: message }, { status: 400 });
  }
}
