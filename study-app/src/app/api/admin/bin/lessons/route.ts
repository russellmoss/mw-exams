import { getUser } from "@/lib/auth";
import { requireApiKey } from "@/lib/api-key";
import {
  getBinLessons,
  getUseBinLessons,
  setUseBinLessons,
  regenerateBinLessons,
} from "@/lib/bin-lessons";

export const runtime = "nodejs";
// Regeneration makes one Claude call; give it room past the response like the other admin AI routes.
export const maxDuration = 120;

/**
 * GET /api/admin/bin/lessons — admin-only. Read the "Lessons for new questions" summary + toggle.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const [{ summary, updatedAt }, useBinLessons] = await Promise.all([
    getBinLessons(),
    getUseBinLessons(),
  ]);
  return Response.json({ summary, updatedAt, useBinLessons });
}

/**
 * POST /api/admin/bin/lessons — admin-only. Two shapes:
 *   • { useBinLessons: boolean } — flip the "use bin lessons when writing new questions" toggle.
 *   • {} (or anything else)      — regenerate the summary from the recent bins (needs a Claude key).
 *
 * The toggle needs no API key (nothing is generated); regeneration does, so it gates on requireApiKey.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (typeof (body as { useBinLessons?: unknown }).useBinLessons === "boolean") {
    const user = await getUser(request);
    if (!user || !user.isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const value = (body as { useBinLessons: boolean }).useBinLessons;
    await setUseBinLessons(value);
    return Response.json({ ok: true, useBinLessons: value });
  }

  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  if (!keyResult.user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const lessons = await regenerateBinLessons(keyResult.apiKey, keyResult.user.id);
  return Response.json({ ok: true, ...lessons });
}
