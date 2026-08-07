// Signed proposals — the mechanism that lets the Coach offer to do something without being able to
// do it on its own.
//
// THE SHAPE. A write tool never mutates when the model calls it. It returns a PROPOSAL; the loop
// turns that into a confirmation card and tells the model to stop. Nothing happens until the
// candidate presses Confirm, which POSTs the signed token back to /api/coach/confirm — the only
// path in the system that executes a write.
//
// WHY SIGN IT AT ALL, given the server could just remember the pending proposal? Because a
// serverless function has nowhere to remember it. Signing moves the state to the client without
// trusting the client: the payload is readable but not forgeable, so the args that get executed are
// provably the args that were shown on the card.
//
// WHAT THE SIGNATURE COVERS, and why each part matters:
//   tool + args   the card showed these; without them in the payload a client could swap the
//                 arguments after approval and execute something else entirely
//   userId        binds the token to one account. Cellarhand omits this and leans on tenant
//                 re-scoping at commit; we have no tenant layer, so without it a token issued to
//                 one user could be replayed by another (plan H5)
//   exp           a 5-minute window. A card left open overnight should not still be armed
//   nonce         burned by a unique-constrained insert at commit, making execution exactly-once
//   kind          'commit' vs 'resume'. A picker token must never be POSTable to the commit path;
//                 without the discriminator the two are the same string shape

import { createHmac, randomUUID, timingSafeEqual } from "crypto";

const TTL_MS = 5 * 60 * 1000;

export interface ProposalPayload {
  tool: string;
  args: Record<string, unknown>;
  userId: number;
  exp: number;
  nonce: string;
  kind: "commit" | "resume";
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  // Fail loudly. An unsigned or predictably-signed proposal is worse than no confirmation flow at
  // all, because the UI would still say "confirmed".
  if (!s) throw new Error("JWT_SECRET is required to sign Coach proposals.");
  return s;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createProposalToken(opts: {
  tool: string;
  args: Record<string, unknown>;
  userId: number;
  kind?: "commit" | "resume";
  ttlMs?: number;
}): string {
  const payload: ProposalPayload = {
    tool: opts.tool,
    args: opts.args,
    userId: opts.userId,
    exp: Date.now() + (opts.ttlMs ?? TTL_MS),
    nonce: randomUUID(),
    kind: opts.kind ?? "commit",
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export type VerifyResult =
  | { ok: true; payload: ProposalPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_user" | "wrong_kind" };

export function verifyProposalToken(
  token: string,
  opts: { userId: number; kind?: "commit" | "resume" }
): VerifyResult {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;

  // Constant-time compare. Length is checked first because timingSafeEqual throws on a mismatch,
  // and that throw would itself be a timing signal.
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };

  let payload: ProposalPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof payload?.exp !== "number" || Date.now() > payload.exp) {
    return { ok: false, reason: "expired" };
  }
  if (payload.userId !== opts.userId) return { ok: false, reason: "wrong_user" };
  if (payload.kind !== (opts.kind ?? "commit")) return { ok: false, reason: "wrong_kind" };

  return { ok: true, payload };
}

/** What a write tool returns instead of doing the work. */
export interface CoachProposal {
  __proposal: true;
  /** One line, shown on the card. This is what the candidate is actually agreeing to. */
  preview: string;
  /** Field-by-field detail rendered under the preview. */
  details: { label: string; value: string }[];
  /**
   * Unresolved fields. A proposal with any of these is a DRAFT: it renders without a token and is
   * therefore structurally uncommittable, rather than committable-but-discouraged.
   */
  blockers?: string[];
}

export function proposal(p: Omit<CoachProposal, "__proposal">): CoachProposal {
  return { __proposal: true, ...p };
}

export function asProposal(value: unknown): CoachProposal | null {
  return value && typeof value === "object" && (value as CoachProposal).__proposal === true
    ? (value as CoachProposal)
    : null;
}
