import { getUser } from "@/lib/auth";
import { getBankBatch } from "@/lib/db";
import { runBankBatch } from "@/lib/bank-worker";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/bank/resume  { batchId }
 *
 * Continues a run that couldn't finish inside one invocation's wall-clock budget. The worker
 * self-calls this (Bearer CRON_SECRET) when it hands off; an admin session may also hit it. Runs the
 * worker inline (this invocation IS the fresh one), so it awaits rather than using after().
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  let authorized = isCron;
  if (!authorized) {
    const user = await getUser(request);
    authorized = !!user?.isAdmin;
  }
  if (!authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { batchId } = await request.json().catch(() => ({}));
  if (!batchId) return Response.json({ error: "Missing batchId" }, { status: 400 });

  const batch = await getBankBatch(batchId);
  if (!batch) return Response.json({ error: "Batch not found" }, { status: 404 });
  if (batch.status !== "running") return Response.json({ ok: true, status: batch.status });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "Server API key not configured" }, { status: 500 });

  const baseUrl = new URL(request.url).origin;
  await runBankBatch({ batchId, apiKey, userId: batch.created_by, baseUrl });
  return Response.json({ ok: true });
}
