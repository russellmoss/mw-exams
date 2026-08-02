import { neon } from "@neondatabase/serverless";

function getDb() {
  return neon(process.env.DATABASE_URL!);
}

/**
 * App-wide key/value settings stored in the `app_settings` table.
 * Values are stored as jsonb so any serialisable shape is supported.
 */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const sql = getDb();
  const rows = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
  if (!rows[0]) return fallback;
  return rows[0].value as T;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(value)}::jsonb, updated_at = NOW()
  `;
}

/**
 * Whether accepted feedback should auto-dispatch the verified-code-change pipeline.
 * Two kill switches: the DB toggle and the AUTO_APPLY_HARD_DISABLE env override.
 */
export async function isAutoApplyEnabled(): Promise<boolean> {
  if (process.env.AUTO_APPLY_HARD_DISABLE === "1") return false;
  return (await getSetting<boolean>("auto_apply_enabled", false)) === true;
}

/**
 * Whether confirming a Feature Request should auto-dispatch the feature-build pipeline.
 * When OFF, "Build it" only LOGS the confirmed spec (status 'ready') for an admin to build
 * manually via a per-item "Build now". Mirrors isAutoApplyEnabled — DB toggle + env kill switch.
 */
export async function isAutoFeatureEnabled(): Promise<boolean> {
  if (process.env.AUTO_FEATURE_HARD_DISABLE === "1") return false;
  return (await getSetting<boolean>("auto_feature_enabled", false)) === true;
}

export const REASONING_SETTING_KEY = "reasoning_enabled";

/**
 * Whether AI calls request the model's visible reasoning (adaptive thinking).
 *
 * The cost lever for streamed thinking: OFF stops paying thinking tokens on every generation and
 * grading call. Phase/status progress is unaffected — that's our own code, costs nothing, and is
 * what actually stops a long wait looking hung.
 *
 * Defaults to TRUE, unlike the auto_* toggles: this is a kill switch over shipped behaviour, so
 * an absent row must mean "as built". Same two-switch shape otherwise — DB toggle plus the
 * REASONING_HARD_DISABLE env override, which works even if the database is unreachable.
 */
export async function isReasoningEnabled(): Promise<boolean> {
  if (process.env.REASONING_HARD_DISABLE === "1") return false;
  return (await getSetting<boolean>(REASONING_SETTING_KEY, true)) !== false;
}
