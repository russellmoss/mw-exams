import { getUser } from "@/lib/auth";
import { createQuestionFlag } from "@/lib/db";
import { sanitizeBinTags, sanitizeBinNote } from "@/lib/bin-reasons";

export const runtime = "nodejs";

/**
 * POST /api/question-flags — any logged-in user.
 *
 * Flag a served question as unrealistic/broken from the debrief. In one transaction (see
 * createQuestionFlag): insert a question_flags row (pending); withdraw the bank item from rotation
 * (review_state → 'pending' + flagged_by_candidate) so /api/get-question and /banked stop serving it;
 * stamp the attempt flagged (never deleted) so History tags it. The pending flag itself is what pings
 * admins via the NotificationBell ("Question flagged by <name>"), so no separate notification row is
 * written. Idempotent: a second flag while one is still pending returns 200 without duplicating the
 * bank-state change.
 *
 * Reasons reuse the admin BinReasonChips codes; >=1 is required (the modal enforces it, we re-check).
 */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: "Auth required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { questionId, attemptId, reasons, note, winePosition } = body as {
    questionId?: unknown;
    attemptId?: unknown;
    reasons?: unknown;
    note?: unknown;
    winePosition?: unknown;
  };

  if (typeof questionId !== "string" || questionId.length === 0) {
    return Response.json({ error: "Missing questionId" }, { status: 400 });
  }

  // Reuse the admin bin-reason sanitisers so a flag speaks the exact same reason vocabulary.
  const cleanReasons = sanitizeBinTags(reasons) ?? [];
  if (cleanReasons.length === 0) {
    return Response.json({ error: "At least one reason is required" }, { status: 400 });
  }
  const cleanNote = sanitizeBinNote(note);
  const cleanAttemptId =
    typeof attemptId === "number" && Number.isFinite(attemptId) ? attemptId : null;
  // The per-wine selector (Right Paper Check) only applies to the 'Wrong wine for this paper' reason;
  // keep the recorded position only when that reason was actually chosen. A 1-based slot within range.
  const cleanWinePosition =
    cleanReasons.includes("wrong_colour_for_paper") &&
    typeof winePosition === "number" &&
    Number.isInteger(winePosition) &&
    winePosition >= 1 &&
    winePosition <= 12
      ? winePosition
      : null;

  try {
    const result = await createQuestionFlag({
      questionId,
      attemptId: cleanAttemptId,
      userId: user.id,
      reasons: cleanReasons,
      note: cleanNote,
      winePosition: cleanWinePosition,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("question-flags error:", err);
    return Response.json({ error: "Failed to flag question" }, { status: 500 });
  }
}
