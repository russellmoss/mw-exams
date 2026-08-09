// /api/admin/role-rulings — the banker/curveball ruling loop's control surface.
//
// GET   read the ledger: pending claims, decided rulings, the repair queue, and the sweep's standing
//       count. Free — no model calls.
// POST  four actions, each an explicit decision by a named admin:
//         adjudicate  rule on pending claims (one Opus call over a batch)
//         codify      open the PR that carries upheld rulings into data/banker_signals.json
//         sweep       re-check the servable bank under the current calibration and queue repairs
//         repair      run a capped batch of queued repairs (one generation each — the expensive one)
//
// NOTHING HERE RUNS ON A SCHEDULE. Every action that spends money is behind a POST from a human who
// has seen a preview, which is the standing rule in this codebase after bulk generation cost $1,053
// in a week. `sweep` is free and could be a cron, but queueing repairs nobody has looked at would
// make the queue read as work that is going to happen, so it stays manual too.

import { getUser } from "@/lib/auth";
import { getUserApiKey } from "@/lib/api-key";
import { neon } from "@neondatabase/serverless";
import { getRoleRulings, adjudicateRoleRulings } from "@/lib/wine-role-rulings";
import { codifyUpheldRulings, getCodifiableRulings, findConflicts, describeSignal } from "@/lib/role-ruling-codify";
import { sweepRoleViolations, enqueueRepairs } from "@/lib/role-sweep";
import { runRepairBatch, findReplacements, MAX_REPAIR_BATCH } from "@/lib/wine-swap";
import type { AuditWine } from "@/lib/question-validator";

export const runtime = "nodejs";
// A repair batch is sequential pinned generations at ~190s of budget each. The cap (MAX_REPAIR_BATCH)
// is what keeps a batch inside this ceiling; a batch that runs out of time leaves the remainder
// 'queued', which is the correct resting state.
export const maxDuration = 300;

function db() {
  return neon(process.env.DATABASE_URL!);
}

export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user?.isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const sql = db();
  const [pending, decided, codifiable, repairs, counts] = await Promise.all([
    getRoleRulings({ verdict: "pending", limit: 100 }),
    getRoleRulings({ limit: 100 }),
    getCodifiableRulings(50),
    sql`
      SELECT r.*, g.paper, g.family, g.question_text
      FROM question_repairs r
      LEFT JOIN generated_questions g ON g.question_id = r.question_id
      ORDER BY r.created_at DESC LIMIT 100
    `,
    sql`
      SELECT verdict, count(*)::int AS n FROM wine_role_rulings GROUP BY verdict
    `,
  ]);

  // The upheld:overruled ratio, stated up front. It is the only evidence that this loop adjudicates
  // rather than rubber-stamps one expert's recall, and it is the number to watch if the calibration
  // starts drifting.
  const byVerdict = Object.fromEntries(
    (counts as { verdict: string; n: number }[]).map((r) => [r.verdict, r.n])
  );

  return Response.json({
    pending,
    decided: decided.filter((r) => r.verdict !== "pending"),
    codifiable: codifiable.map((r) => ({
      ...r,
      targetSignalDescription: r.targetSignal ? describeSignal(r.targetSignal) : null,
    })),
    conflicts: findConflicts(codifiable),
    repairs,
    counts: byVerdict,
    maxRepairBatch: MAX_REPAIR_BATCH,
  });
}

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user?.isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");

  try {
    if (action === "adjudicate") {
      const keyResult = await getUserApiKey(request);
      if (!keyResult?.key?.apiKey) {
        return Response.json({ error: "No Claude API key available" }, { status: 400 });
      }
      const ids = Array.isArray(body.rulingIds) ? body.rulingIds.map(Number).filter(Number.isInteger) : undefined;
      const result = await adjudicateRoleRulings({
        apiKey: keyResult.key.apiKey,
        rulingIds: ids,
        limit: Number(body.limit) || 10,
        userId: user.id,
      });
      return Response.json({
        ok: true,
        ...result,
        // Surfaced, not swallowed: "considered and disagreed" and "fell on the floor" look identical
        // to a reviewer waiting on a verdict, and only one of them is acceptable.
        note:
          result.unruled.length > 0
            ? `${result.unruled.length} claim(s) came back without a parseable ruling and remain pending.`
            : undefined,
      });
    }

    if (action === "codify") {
      const ids = Array.isArray(body.rulingIds) ? body.rulingIds.map(Number).filter(Number.isInteger) : undefined;
      const result = await codifyUpheldRulings({ adminUserId: user.id, rulingIds: ids });
      return Response.json({ ok: result.dispatched, ...result });
    }

    if (action === "sweep") {
      const { scanned, hits } = await sweepRoleViolations({ limit: Number(body.limit) || 1000 });
      // includeAdvisory is opt-in and stays that way. A flight-composition hit is a judgement call the
      // real exam breaks ~1 in 20 times; queueing those wholesale would reverse a measured decision
      // (question-validator.ts's pool-admission note) and spend a generation call per question.
      const enqueued =
        body.enqueue === true
          ? await enqueueRepairs(hits, body.rulingId ? Number(body.rulingId) : null, {
              includeAdvisory: body.includeAdvisory === true,
            })
          : { queued: 0, alreadyQueued: 0, advisorySkipped: 0 };
      return Response.json({
        ok: true,
        scanned,
        hits,
        blocking: hits.filter((h) => h.blocking).length,
        advisory: hits.filter((h) => !h.blocking).length,
        ...enqueued,
      });
    }

    // A dry-run preview of ONE repair: which slot, and what the bank can offer in its place. This is
    // what makes the batch approvable — an admin should never be asked to authorise spend on a swap
    // whose replacement wine they have not seen.
    if (action === "preview") {
      const questionId = String(body.questionId ?? "");
      const { hits } = await sweepRoleViolations({ questionIds: [questionId] });
      const hit = hits[0];
      if (!hit) return Response.json({ ok: true, hit: null, candidates: [] });
      const slot = Number(body.slot) || hit.suggestedSlot;
      if (!slot) return Response.json({ ok: true, hit, candidates: [], note: hit.suggestedReason });
      const flight: AuditWine[] = hit.wines.map(
        (w) =>
          ({
            slot: w.slot,
            varieties: w.variety ? w.variety.split(" / ") : [],
            region: w.region ?? "",
            country: w.country ?? "",
            fullText: w.label,
          }) as AuditWine
      );
      const candidates = await findReplacements({
        departing: flight.find((w) => w.slot === slot)!,
        flight,
        stem: hit.stem,
        paper: hit.paper,
      });
      return Response.json({ ok: true, hit, slot, candidates });
    }

    if (action === "repair") {
      const keyResult = await getUserApiKey(request);
      if (!keyResult?.key?.apiKey) {
        return Response.json({ error: "No Claude API key available" }, { status: 400 });
      }
      const repairIds = Array.isArray(body.repairIds)
        ? body.repairIds.map(Number).filter(Number.isInteger)
        : [];
      if (repairIds.length === 0) {
        return Response.json({ error: "repairIds is required — repairs are never run wholesale" }, { status: 400 });
      }
      const result = await runRepairBatch({
        repairIds,
        apiKey: keyResult.key.apiKey,
        userId: user.id,
      });
      return Response.json({ ok: true, ...result });
    }

    return Response.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err) {
    console.error("[role-rulings] action failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 }
    );
  }
}
