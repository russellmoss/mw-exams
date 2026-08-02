import { requireApiKey } from "@/lib/api-key";
import { type UsageMeta } from "@/lib/question-engine";
import { produceDrill } from "./produce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/stem-sniper/drill?paper=&family=
 * The plain-JSON Stem Sniper drill source. Serves the question STEM only (never wines, model
 * answer, or answer key). A share of drills (STEM_FRESH_RATIO, default 90%) are generated FRESH
 * through the same engine the study page uses; the rest come from the validated banked pool.
 *
 * This route is what the client uses to PREFETCH the next drill in the background — no one is
 * watching it, so it takes the silent path. The drill the candidate is actually waiting on is
 * fetched from `./stream`, which runs the identical producer with a live progress feed.
 */
export async function GET(request: Request) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;

  const { searchParams } = new URL(request.url);
  const paperRaw = searchParams.get("paper");
  const meta: UsageMeta = { source: keyResult.source, userId: keyResult.user.id };

  const drill = await produceDrill({
    paper: paperRaw ? Number(paperRaw) : null,
    family: searchParams.get("family"),
    apiKey: keyResult.apiKey,
    meta,
  });

  if ("error" in drill) return Response.json(drill, { status: 404 });
  return Response.json(drill);
}
