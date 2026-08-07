import { neon } from "@neondatabase/serverless";
import { getUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/coach/verdict?attemptId=N — has the adjudication landed yet, and what did it say?
 *
 * Polled by the confirmation card after a question report is filed, so the candidate sees the
 * accept / partial / reject ruling in the conversation rather than having to go and look for it.
 *
 * WHY NOT REUSE /api/feedback-analysis/[id]:
 *   - It marks the analysis READ as a side effect of being fetched. Polling it would silently
 *     consume the notification the candidate is supposed to get, so the bell would never ring for a
 *     verdict they had not actually read yet.
 *   - It keys on the analysis id, which the committer cannot return: the analysis row is created
 *     inside the deferred run, after Confirm has already responded. The attempt id is the only
 *     handle that exists at that point.
 *   - It returns the whole row, including the engineering-only tail after [[INTERNAL]].
 *
 * So this is a read-only, ownership-scoped projection: status, recommendation, and the two-to-three
 * sentence candidate-facing reason. Nothing internal crosses the wire.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

  const attemptId = Number(new URL(request.url).searchParams.get("attemptId"));
  if (!Number.isFinite(attemptId) || attemptId <= 0) {
    return Response.json({ error: "attemptId is required" }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // Ownership is asserted on the ATTEMPT, not the analysis: the analysis row may not exist yet, and
  // "no row" must not be reachable for someone else's attempt (it would confirm the id exists).
  const owner = await sql`
    /* theory-mode-guard: all-modes -- feedback rows are filed across modes */
    SELECT user_id FROM user_attempts WHERE id = ${attemptId}
  `;
  if (!owner[0] || (owner[0].user_id !== user.id && !user.isAdmin)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await sql`
    SELECT status, recommendation, thread
    FROM feedback_analyses
    WHERE attempt_id = ${attemptId}
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  const row = rows[0];

  // No row yet means the deferred run has not created one. Report it as pending rather than 404 —
  // from the card's point of view "not started" and "running" are the same state: keep waiting.
  if (!row) return Response.json({ status: "pending", recommendation: null, reason: null });

  return Response.json({
    status: row.status as string,
    recommendation: (row.recommendation as string | null) ?? null,
    reason: reasonFrom(row.thread),
  });
}

/**
 * The candidate-facing reason, in the analysis's own words.
 *
 * Two cuts, in order, and both matter: everything after [[INTERNAL]] is engineering-only (EK ids,
 * file paths, the proposed code change) and must never reach a candidate; and within what remains we
 * want the `**Reasoning:**` paragraph, which the analysis prompt specifies as 2–3 plain-language
 * sentences — the rest of PART 1 is section headings and evidence, too long for a chat card.
 *
 * The cap is set from the real corpus, not guessed: across the 56 completed analyses in the database
 * these paragraphs run 272–832 characters (mean 517), so 900 truncates none of them. An earlier 600
 * would have cut a quarter of them off mid-sentence, and a verdict that stops mid-clause reads as a
 * bug rather than as a ruling.
 */
const MAX_REASON = 900;

export function reasonFrom(thread: unknown): string | null {
  if (!Array.isArray(thread)) return null;
  const first = thread.find(
    (m): m is { role: string; content: string } =>
      !!m && typeof (m as { content?: unknown }).content === "string"
  );
  if (!first) return null;

  const candidateFacing = (first.content.split("[[INTERNAL]]")[0] || "").trim();
  if (!candidateFacing) return null;

  // Up to the next bold label or heading, so "What this means for you" is not swept in.
  const m = candidateFacing.match(/\*\*Reasoning:\*\*\s*([\s\S]*?)(?=\n\s*(?:\*\*|#{1,6}\s)|$)/i);
  const reason = (m?.[1] || "").trim();
  if (!reason) return null;
  if (reason.length <= MAX_REASON) return reason;

  // Over the cap: end on a sentence if there is one to end on, otherwise a word.
  const head = reason.slice(0, MAX_REASON);
  const cut = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "));
  if (cut > MAX_REASON / 2) return head.slice(0, cut + 1);
  return `${head.slice(0, head.lastIndexOf(" ")).trimEnd()}…`;
}
