// The only path in the Coach that executes a write.
//
// Two properties this file exists to guarantee:
//
//   EXACTLY ONCE. The nonce is inserted BEFORE the committer runs, so a duplicate token loses on the
//   primary key rather than on a check-then-act race. A double-click files one piece of feedback.
//
//   NO TOOL DISPATCH. Committers are looked up in a closed map keyed by tool name; the model never
//   reaches this code and cannot name a function into it. A token for an unknown tool is rejected,
//   not attempted.

import { neon } from "@neondatabase/serverless";
import { verifyProposalToken } from "./confirm";
import { COMMITTERS } from "./tools/write-tools";

export interface CommitContext {
  userId: number;
  route: string | null;
  apiKey?: string | null;
  defer?: (work: Promise<unknown>) => void;
}

export type CommitResult =
  | { ok: true; message: string; data?: unknown }
  | { ok: false; error: string; status: number };

export async function commitProposal(
  token: string,
  ctx: CommitContext
): Promise<CommitResult> {
  const verified = verifyProposalToken(token, { userId: ctx.userId, kind: "commit" });
  if (!verified.ok) {
    // Deliberately vague to the client. Distinguishing "expired" from "signed for another user"
    // tells a prober which of the two they got wrong; the log carries the detail instead.
    const status = verified.reason === "expired" ? 410 : 400;
    console.warn(`[coach] proposal rejected: ${verified.reason}`);
    return {
      ok: false,
      status,
      error:
        verified.reason === "expired"
          ? "That confirmation expired. Ask me again and I'll re-offer it."
          : "That confirmation isn't valid.",
    };
  }

  const { tool, args, nonce } = verified.payload;
  const committer = COMMITTERS[tool];
  if (!committer) {
    console.error(`[coach] no committer registered for tool ${tool}`);
    return { ok: false, status: 400, error: "That action isn't available." };
  }

  const sql = neon(process.env.DATABASE_URL!);
  try {
    await sql`
      INSERT INTO coach_confirmations (nonce, user_id, tool, args)
      VALUES (${nonce}, ${ctx.userId}, ${tool}, ${JSON.stringify(args)}::jsonb)
    `;
  } catch (err) {
    // 23505 = unique_violation. The nonce is already burned, so this is a replay.
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      return { ok: false, status: 409, error: "That was already confirmed." };
    }
    throw err;
  }

  const outcome = await committer(
    { userId: ctx.userId, route: ctx.route, apiKey: ctx.apiKey, defer: ctx.defer },
    args
  );

  await sql`
    UPDATE coach_confirmations SET result = ${JSON.stringify(outcome.data ?? null)}::jsonb
    WHERE nonce = ${nonce}
  `;

  return { ok: true, message: outcome.message, data: outcome.data };
}
