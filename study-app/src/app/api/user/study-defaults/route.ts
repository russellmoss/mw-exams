import { getUser } from "@/lib/auth";
import { getUserStudyDefaults, setUserStudyDefaults } from "@/lib/db";
import { invalidateUserReasoningCache } from "@/lib/thinking-stream";

export const runtime = "nodejs";

// Study defaults (migration 047) — the onboarding-screen choices: which acquire path the study
// flow leads with (banked = free pool read, fresh = generate on the user's key) and whether their
// model calls request visible reasoning (thinking tokens billed to their key).

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    return Response.json(await getUserStudyDefaults(user.id));
  } catch (err) {
    console.error("GET study-defaults error:", err);
    // Fall back to the column defaults rather than erroring — the settings UI can still render.
    return Response.json({ questionSource: "fresh", reasoningStream: true });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const questionSource = body.questionSource;
    const reasoningStream = body.reasoningStream;
    if (questionSource !== "banked" && questionSource !== "fresh") {
      return Response.json({ error: "questionSource must be 'banked' or 'fresh'" }, { status: 400 });
    }
    if (typeof reasoningStream !== "boolean") {
      return Response.json({ error: "reasoningStream must be a boolean" }, { status: 400 });
    }

    await setUserStudyDefaults(user.id, { questionSource, reasoningStream });
    // The generation path caches the per-user reasoning flag — drop this user's entry so the
    // change applies to their very next question on this instance.
    invalidateUserReasoningCache(user.id);

    return Response.json({ success: true, questionSource, reasoningStream });
  } catch (err) {
    console.error("PATCH study-defaults error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
