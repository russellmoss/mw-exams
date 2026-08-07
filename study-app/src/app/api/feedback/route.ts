import { getUser } from "@/lib/auth";
import { recordTabFeedback, countRecentTabFeedback } from "@/lib/db";

export const runtime = "nodejs";

const VALID_CATEGORIES = new Set([
  "wrong_misleading",
  "confusing_wording",
  "grading_off",
  "bug",
  "idea",
]);

const MAX_BODY = 4000;
const RATE_LIMIT_PER_HOUR = 10;

// Feedback tab (migration 053). Writes the SAME user_attempts feedback store the History flow and
// /api/admin/feedback already use, so the item shows up in /admin with no new admin surface. No LLM
// call here — the existing sweep/analysis cron picks up question-scoped feedback unchanged.
export async function POST(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!body) {
      return Response.json({ error: "Feedback body is required" }, { status: 400 });
    }
    if (body.length > MAX_BODY) {
      return Response.json({ error: `Feedback is too long (max ${MAX_BODY} characters)` }, { status: 400 });
    }

    const scope: "question" | "general" = payload.scope === "question" ? "question" : "general";
    const category =
      typeof payload.category === "string" && VALID_CATEGORIES.has(payload.category)
        ? payload.category
        : null;
    const route = typeof payload.route === "string" ? payload.route.slice(0, 512) : "";
    const questionId = typeof payload.questionId === "string" ? payload.questionId : null;
    const attemptId =
      typeof payload.attemptId === "number" && Number.isFinite(payload.attemptId)
        ? payload.attemptId
        : null;
    const pausedMs =
      typeof payload.pausedMs === "number" && Number.isFinite(payload.pausedMs) && payload.pausedMs > 0
        ? Math.round(payload.pausedMs)
        : null;

    // Rate limit: 10 tab submissions per hour per user.
    const recent = await countRecentTabFeedback(user.id);
    if (recent >= RATE_LIMIT_PER_HOUR) {
      return Response.json(
        { error: "Rate limit reached — please try again later." },
        { status: 429 }
      );
    }

    const { id } = await recordTabFeedback({
      userId: user.id,
      text: body,
      category,
      scope,
      route,
      pausedMs,
      questionId: scope === "question" ? questionId : null,
      attemptId: scope === "question" ? attemptId : null,
    });

    return Response.json({ ok: true, attemptId: id });
  } catch (err) {
    console.error("POST /api/feedback error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
