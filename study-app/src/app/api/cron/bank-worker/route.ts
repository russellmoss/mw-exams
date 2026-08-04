import { isCronAuthorized } from "@/lib/cron-auth";
import { getRunningBatches } from "@/lib/db";
import { runBankBatch } from "@/lib/bank-worker";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Safety net for Fill-the-Bank: resumes any batch left 'running' (e.g. an invocation killed before it
 * could self-schedule a resume). Driven hourly by .github/workflows/bank-worker-hourly.yml and daily
 * by the Vercel cron, both sending Authorization: Bearer $CRON_SECRET; an admin session may also
 * trigger it. Processes one stalled batch per call to stay inside maxDuration.
 */
export async function GET(request: Request) {
  if (!(await isCronAuthorized(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "Server API key not configured" }, { status: 500 });

  const running = await getRunningBatches();
  const batch = running[0];
  if (!batch) return Response.json({ ok: true, resumed: null });

  const baseUrl = new URL(request.url).origin;
  await runBankBatch({ batchId: batch.id, apiKey, userId: batch.created_by, baseUrl });
  return Response.json({ ok: true, resumed: batch.id });
}
