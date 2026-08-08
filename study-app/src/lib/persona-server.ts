/**
 * Server-side resolution of a user's persona (migration 068).
 *
 * Split from lib/personas.ts so that module stays importable from client components — the Settings
 * picker needs the catalog, and pulling `neon` in behind it would drag the driver into the bundle.
 *
 * CACHED, because this is read on the hot path of every graded answer and every Coach turn, and it
 * is a one-column read of a value that changes maybe twice in an account's lifetime. Same shape as
 * `reasoningEnabledForUser` in lib/thinking-stream.ts: short TTL so a save on another instance
 * propagates within a minute, plus an explicit invalidation the PATCH route calls so the instance
 * that handled the save is correct immediately. Without that hook the candidate changes their
 * persona, asks the Coach something, and gets the old voice back — which reads as the setting not
 * working.
 */

import { neon } from "@neondatabase/serverless";
import { DEFAULT_PERSONA, isPersonaId, type PersonaId } from "./personas";

const TTL_MS = 60_000;
const cache = new Map<number, { persona: PersonaId; at: number }>();

export function invalidatePersonaCache(userId: number): void {
  cache.delete(userId);
}

/**
 * This user's chosen voice.
 *
 * FAILS SOFT TO THE DEFAULT, deliberately. Every caller is a prompt builder mid-request, and not
 * knowing someone's tone preference must never be able to stop them being graded — a debrief in
 * the wrong voice is a cosmetic problem, a 500 instead of a debrief is a lost attempt. A null
 * userId (server jobs, cron sweeps, token-authenticated flows) has no persona to look up and gets
 * the default for the same reason.
 */
export async function getUserPersona(userId?: number | null): Promise<PersonaId> {
  if (userId == null) return DEFAULT_PERSONA;

  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.persona;

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT persona FROM users WHERE id = ${userId}`;
    const raw = rows[0]?.persona;
    const persona = isPersonaId(raw) ? raw : DEFAULT_PERSONA;
    cache.set(userId, { persona, at: Date.now() });
    return persona;
  } catch (err) {
    console.error("getUserPersona failed (falling back to default voice):", err);
    return cache.get(userId)?.persona ?? DEFAULT_PERSONA;
  }
}

/** Save this user's voice. Validated by the caller; the CHECK constraint is the backstop. */
export async function setUserPersona(userId: number, persona: PersonaId): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE users SET persona = ${persona} WHERE id = ${userId}`;
  invalidatePersonaCache(userId);
}
