#!/usr/bin/env node
/**
 * A/B split balance check — "is the model roll actually 50/50 (or whatever you set)?"
 *
 * Counts ATTEMPT-1 ROLLS ONLY (rows where `ab_group IS NOT NULL`) per task and arm.
 * This deliberately EXCLUDES retries and fallbacks: question generation (and a few
 * other tasks) only stamp `ab_group` on the first attempt — retries are hardcoded to
 * Sonnet and logged with ab_group=null, so raw model counts skew Sonnet even when the
 * experiment is perfectly balanced. To judge the *split*, look at ab_group, not model.
 *
 * It also prints the saved `model_ab_config` (the target weights) next to the observed
 * rolls, so you can compare intended vs actual at a glance.
 *
 * ── Reading the output ────────────────────────────────────────────────────────
 * A 50/50 split is an independent coin flip per request — it does NOT alternate, and
 * only converges visibly after a few dozen rolls per task. At n=2-4 any skew is noise;
 * at n≈20 expect roughly 7-13 of one arm 95% of the time. A 0% or 100% arm at large n
 * is the real signal worth investigating.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   cd study-app
 *   node scripts/ab-balance.mjs                 # all-time
 *   node scripts/ab-balance.mjs --since=24h     # last 24 hours (also: 7d, 30d, or 2026-05-01)
 *
 * DATABASE_URL is read from the environment, or falls back to study-app/.env.local.
 */

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ── DB URL: prefer env, else parse .env.local (so `node scripts/ab-balance.mjs` just works) ──
function resolveDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
    const env = readFileSync(envPath, "utf8");
    const m = env.match(/DATABASE_URL\s*=\s*"?([^"\n]+)/);
    if (m) return m[1].trim();
  } catch {
    /* fall through */
  }
  return null;
}

// ── CLI: --since=<24h|7d|30d|YYYY-MM-DD>; omitted = all time ──────────────────
function parseSince() {
  const hit = process.argv.find((a) => a.startsWith("--since="));
  if (!hit) return { label: "ALL TIME", clause: "'epoch'" };
  const v = hit.slice("--since=".length);
  const rel = v.match(/^(\d+)(h|d)$/);
  if (rel) {
    const unit = rel[2] === "h" ? "hours" : "days";
    return { label: `LAST ${v}`, clause: `now() - interval '${rel[1]} ${unit}'` };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { label: `SINCE ${v}`, clause: `'${v}'` };
  console.error(`✖ --since must be like 24h, 7d, 30d, or YYYY-MM-DD (got "${v}")`);
  process.exit(1);
}

const DB_URL = resolveDbUrl();
if (!DB_URL) {
  console.error("✖ DATABASE_URL not set and study-app/.env.local has no DATABASE_URL.");
  process.exit(1);
}

const { label, clause } = parseSince();
const sql = neon(DB_URL);

const pct = (n, total) => (total ? Math.round((100 * n) / total) + "%" : "—");

(async () => {
  // Saved target weights, for intended-vs-actual comparison.
  const cfgRow = await sql`SELECT value FROM app_settings WHERE key = 'model_ab_config'`;
  const cfg = cfgRow[0]?.value || {};
  const target = (task) => {
    const w = cfg[task];
    if (!w) return "default (no split)";
    return Object.entries(w)
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => `${k} ${v}`)
      .join(" / ");
  };

  const rows = await sql`
    SELECT task_type,
           count(*) FILTER (WHERE ab_group = 'opus')   AS opus,
           count(*) FILTER (WHERE ab_group = 'sonnet') AS sonnet,
           count(*) FILTER (WHERE ab_group = 'haiku')  AS haiku,
           count(*)                                    AS rolls
    FROM model_usage
    WHERE ab_group IS NOT NULL
      AND created_at > ${sql.unsafe(clause)}
    GROUP BY task_type
    ORDER BY task_type`;

  const out = rows.map((r) => ({
    task: r.task_type,
    opus: Number(r.opus),
    sonnet: Number(r.sonnet),
    haiku: Number(r.haiku),
    rolls: Number(r.rolls),
    opus_pct: pct(Number(r.opus), Number(r.rolls)),
    target: target(r.task_type),
  }));

  console.log(`\n=== A/B attempt-1 rolls (ab_group NOT NULL) — ${label} ===`);
  if (out.length === 0) {
    console.log("(no rolls in this window — generate some content, then re-run)");
  } else {
    console.table(out);
    const totalRolls = out.reduce((s, r) => s + r.rolls, 0);
    console.log(
      `Total rolls: ${totalRolls}. Reminder: at this n, per-task skew is mostly noise — ` +
        `a 50/50 split only looks balanced after a few dozen rolls per task.`
    );
  }
})().catch((e) => {
  console.error("✖", e.message);
  process.exit(1);
});
