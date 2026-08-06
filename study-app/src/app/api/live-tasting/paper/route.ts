import { requireApiKey } from "@/lib/api-key";
import { getUser } from "@/lib/auth";
import { getUserLiveTastingPrefs, getLiveTastingPapersForUser, getPaperSessions } from "@/lib/db";
import { geoFromHeaders } from "@/lib/geo";
import { createPaper, paperComposition } from "@/lib/live-tasting-paper-engine";
import { deriveSessionState } from "@/lib/live-tasting";

export const runtime = "nodejs";
export const maxDuration = 300;

/** GET /api/live-tasting/paper — the user's papers with per-flight progress (no wine identity). */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

  const papers = await getLiveTastingPapersForUser(user.id);
  const out = [];
  for (const p of papers) {
    const children = await getPaperSessions(p.id);
    const comp = paperComposition(p);
    out.push({
      id: p.id,
      paper: p.paper,
      size: p.size,
      mode: p.mode,
      pacing: p.pacing,
      city: p.city,
      createdAt: p.created_at,
      flights: comp.length,
      generated: children.length,
      graded: children.filter((c) => deriveSessionState(c) === "tasted").length,
      examStartedAt: p.exam_started_at,
      examDeadlineAt: p.exam_deadline_at,
    });
  }
  return Response.json({ papers: out });
}

/**
 * POST /api/live-tasting/paper — create a paper (Phase D).
 * Body: { paper: 1|2|3, size: 'half'|'full', mode: 'pick-for-me'|'byo',
 *         pacing: 'flight-by-flight'|'exam-conditions', totalBudget? }
 * Composition is SAMPLED from the corpus — no family choice, by design.
 */
export async function POST(request: Request) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  const userId = keyResult.user.id;

  const body = await request.json().catch(() => ({}));
  const paperNo = Number(body.paper);
  if (![1, 2, 3].includes(paperNo)) return Response.json({ error: "paper must be 1, 2 or 3" }, { status: 400 });
  const size = body.size === "half" ? "half" : "full";
  const mode = body.mode === "byo" ? "byo" : "pick-for-me";
  const pacing = body.pacing === "exam-conditions" ? "exam-conditions" : "flight-by-flight";
  const rawBudget = Number(body.totalBudget);
  const totalBudget = Number.isFinite(rawBudget) && rawBudget > 0 ? Math.min(rawBudget, 100000) : null;

  const prefs = await getUserLiveTastingPrefs(userId);
  let city = prefs.city;
  let country = prefs.country;
  if (!city || !country) {
    const detected = geoFromHeaders(request.headers);
    if (!detected) {
      return Response.json({ error: "Set your city and country in Settings → Live Tasting first." }, { status: 400 });
    }
    city = detected.city;
    country = detected.country;
  }

  const outcome = await createPaper({
    userId,
    apiKey: keyResult.apiKey,
    paper: paperNo,
    size,
    mode,
    pacing,
    totalBudget,
    budgetCurrency: prefs.budgetCurrency ?? "USD",
    city,
    country,
  });
  if ("error" in outcome) return Response.json({ error: outcome.error }, { status: 502 });
  return Response.json({ paperId: outcome.paper.id });
}
