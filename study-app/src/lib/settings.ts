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
