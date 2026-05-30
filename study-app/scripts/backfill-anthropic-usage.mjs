#!/usr/bin/env node
/**
 * Backfill historical Anthropic usage into `model_usage` (the table the admin
 * Cost dashboard reads). Use this ONCE to seed lifetime spend that predates the
 * in-app logging that landed 2026-05-30. Going forward, live calls log
 * themselves via src/lib/usage-log.ts and you never need this again.
 *
 * ── What it can and cannot recover ──────────────────────────────────────────
 * Anthropic's Usage/Cost Admin API only exposes data aggregated into DAY buckets,
 * grouped by model / api_key / workspace — NEVER per request, and it has no idea
 * about this app's task_type, source, A/B arm, or latency. So backfilled rows are
 * coarse: one synthetic row per (day, model), tagged task_type='backfill',
 * source='backfill', so they never pollute the per-task A/B analysis. Token totals
 * and by-model/daily/total spend ARE faithful (this Anthropic key is used only by
 * this app, so key-level totals == app totals).
 *
 * ── Requirements ────────────────────────────────────────────────────────────
 *   • The Admin API needs an ORGANIZATION (it is "unavailable for individual
 *     accounts") and an ADMIN key that starts with `sk-ant-admin...` — NOT the
 *     app's `sk-ant-api...` key. Mint one at Console → Settings → Admin keys.
 *   • Env: ANTHROPIC_ADMIN_KEY (required), DATABASE_URL (required).
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   cd study-app
 *   ANTHROPIC_ADMIN_KEY=sk-ant-admin... DATABASE_URL=postgres://... \
 *     node scripts/backfill-anthropic-usage.mjs --since=2025-01-01 [--until=2026-05-30] [--dry-run]
 *
 * Docs: https://platform.claude.com/docs/en/api/usage-cost-api
 */

import { neon } from "@neondatabase/serverless";

// ── Pricing (USD per 1,000,000 tokens). MUST stay in sync with
//    src/lib/usage-log.ts so backfilled rows match live-logged rows. ──────────
const MODEL_PRICING = [
  { match: "opus", price: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 } },
  { match: "sonnet", price: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } },
  { match: "haiku", price: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } },
];
const FALLBACK_PRICE = { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 };

function priceForModel(model) {
  const lower = (model || "").toLowerCase();
  for (const { match, price } of MODEL_PRICING) if (lower.includes(match)) return price;
  return FALLBACK_PRICE;
}
function computeCost(model, t) {
  const p = priceForModel(model);
  return (
    (t.input * p.input +
      t.output * p.output +
      t.cacheCreate * p.cacheWrite +
      t.cacheRead * p.cacheRead) /
    1_000_000
  );
}

// ── CLI args ──────────────────────────────────────────────────────────────────
function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
}
const SINCE = arg("since", "2025-01-01");
const UNTIL = arg("until", new Date().toISOString().slice(0, 10));
const DRY_RUN = process.argv.includes("--dry-run");

const ADMIN_KEY = process.env.ANTHROPIC_ADMIN_KEY;
const DB_URL = process.env.DATABASE_URL;

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}
if (!ADMIN_KEY) die("ANTHROPIC_ADMIN_KEY is not set. Mint an admin key (sk-ant-admin...) in Console → Settings → Admin keys.");
if (!ADMIN_KEY.startsWith("sk-ant-admin"))
  die(`ANTHROPIC_ADMIN_KEY does not look like an admin key (expected to start with "sk-ant-admin"). The app key (sk-ant-api...) will NOT work with the Admin API.`);
if (!DB_URL && !DRY_RUN) die("DATABASE_URL is not set (required unless --dry-run).");

const API_BASE = "https://api.anthropic.com/v1/organizations";
const HEADERS = { "anthropic-version": "2023-06-01", "x-api-key": ADMIN_KEY };

// ── Date helpers ───────────────────────────────────────────────────────────────
const DAY_MS = 86_400_000;
function isoDay(d) {
  return new Date(d).toISOString().slice(0, 10);
}
/** Split [since, until) into windows of at most `maxDays` (the 1d-bucket cap is 31). */
function windows(since, until, maxDays = 31) {
  const out = [];
  let start = new Date(`${since}T00:00:00Z`).getTime();
  const end = new Date(`${until}T00:00:00Z`).getTime() + DAY_MS; // inclusive of the until day
  while (start < end) {
    const stop = Math.min(start + maxDays * DAY_MS, end);
    out.push([new Date(start).toISOString(), new Date(stop).toISOString()]);
    start = stop;
  }
  return out;
}

async function getPaged(path, baseParams) {
  // Walk pagination (has_more / next_page) for one query window.
  const rows = [];
  let page = null;
  for (let guard = 0; guard < 1000; guard++) {
    const params = new URLSearchParams(baseParams);
    if (page) params.set("page", page);
    const url = `${API_BASE}${path}?${params.toString()}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        die(
          `Anthropic Admin API returned ${res.status}. This usually means the account is an INDIVIDUAL account (the Admin API requires an Organization) or the key is not an admin key. Body: ${body.slice(0, 300)}`
        );
      }
      die(`Anthropic Admin API ${res.status} on ${path}: ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    for (const bucket of json.data ?? []) {
      for (const result of bucket.results ?? []) {
        rows.push({ bucket, result });
      }
    }
    if (json.has_more && json.next_page) page = json.next_page;
    else break;
  }
  return rows;
}

// Tolerant token extraction — field names vary across API versions, so we read
// every plausible alias and sum cache-creation TTL splits.
function tokensFromResult(r) {
  const num = (v) => (typeof v === "number" ? v : 0);
  let cacheCreate = num(r.cache_creation_input_tokens);
  if (r.cache_creation && typeof r.cache_creation === "object") {
    for (const v of Object.values(r.cache_creation)) cacheCreate += num(v);
  }
  return {
    input: num(r.uncached_input_tokens) || num(r.input_tokens),
    output: num(r.output_tokens),
    cacheRead: num(r.cache_read_input_tokens),
    cacheCreate,
  };
}

async function main() {
  console.log(`\nAnthropic usage backfill`);
  console.log(`  range : ${SINCE} → ${UNTIL}`);
  console.log(`  mode  : ${DRY_RUN ? "DRY RUN (no DB writes)" : "WRITE to model_usage"}\n`);

  // 1) USAGE API → tokens per (day, model)
  const perDayModel = new Map(); // key `${day}|${model}` -> token totals
  for (const [start, end] of windows(SINCE, UNTIL)) {
    const rows = await getPaged("/usage_report/messages", {
      starting_at: start,
      ending_at: end,
      bucket_width: "1d",
      "group_by[]": "model",
    });
    for (const { bucket, result } of rows) {
      const day = isoDay(bucket.starting_at);
      const model = result.model || "unknown";
      const key = `${day}|${model}`;
      const acc = perDayModel.get(key) || { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
      const t = tokensFromResult(result);
      acc.input += t.input;
      acc.output += t.output;
      acc.cacheRead += t.cacheRead;
      acc.cacheCreate += t.cacheCreate;
      perDayModel.set(key, acc);
    }
  }

  if (perDayModel.size === 0) {
    console.log("No usage rows returned for this range. Nothing to backfill.");
    console.log("(If you expected data: check the date range, and that the key's org actually made these calls.)\n");
    return;
  }

  // Build synthetic rows + tally for the summary.
  const rowsToInsert = [];
  const byModel = new Map();
  let computedTotal = 0;
  for (const [key, t] of perDayModel) {
    const [day, model] = key.split("|");
    const cost = computeCost(model, t);
    computedTotal += cost;
    rowsToInsert.push({ day, model, t, cost });
    const m = byModel.get(model) || { calls: 0, input: 0, output: 0, cost: 0 };
    m.calls += 1; // 1 synthetic row per day; not a true call count
    m.input += t.input + t.cacheRead + t.cacheCreate;
    m.output += t.output;
    m.cost += cost;
    byModel.set(model, m);
  }

  console.log("By model (token-computed, matches dashboard pricing):");
  for (const [model, m] of [...byModel].sort((a, b) => b[1].cost - a[1].cost)) {
    console.log(
      `  ${model.padEnd(28)} in=${String(m.input).padStart(10)} out=${String(m.output).padStart(9)}  $${m.cost.toFixed(4)}`
    );
  }
  console.log(`  ${"TOTAL".padEnd(28)} ${" ".repeat(25)} $${computedTotal.toFixed(4)}`);
  console.log(`  (${rowsToInsert.length} synthetic day×model rows)\n`);

  // 2) COST API → billed USD, as a reconciliation check only (not written).
  try {
    let billedTotal = 0;
    let sawCost = false;
    for (const [start, end] of windows(SINCE, UNTIL)) {
      const rows = await getPaged("/cost_report", {
        starting_at: start,
        ending_at: end,
        "group_by[]": "description",
      });
      for (const { result } of rows) {
        const raw = result.amount ?? result.cost ?? null;
        if (raw == null) continue;
        sawCost = true;
        // Cost API reports amounts as decimal strings; treat as USD.
        billedTotal += parseFloat(String(raw)) || 0;
      }
    }
    if (sawCost) {
      const drift = computedTotal === 0 ? 0 : ((billedTotal - computedTotal) / computedTotal) * 100;
      console.log("Reconciliation vs Anthropic Cost API (billing truth):");
      console.log(`  our computed total : $${computedTotal.toFixed(4)}`);
      console.log(`  Anthropic billed   : $${billedTotal.toFixed(4)}`);
      console.log(`  drift              : ${drift.toFixed(1)}%`);
      if (Math.abs(drift) > 15)
        console.log(`  ⚠ drift > 15% — Cost API amount units may differ (cents vs USD) or pricing is stale; verify before trusting.`);
      console.log("");
    }
  } catch (e) {
    console.log(`(Cost API reconciliation skipped: ${e?.message || e})\n`);
  }

  if (DRY_RUN) {
    console.log("DRY RUN — no rows written. Re-run without --dry-run to insert.\n");
    return;
  }

  // 3) Write to model_usage. Idempotent: clear prior backfill rows first so
  //    re-running never double-counts. Scoped strictly to source='backfill'.
  const sql = neon(DB_URL);
  const deleted = await sql`DELETE FROM model_usage WHERE source = 'backfill' RETURNING id`;
  if (deleted.length) console.log(`Cleared ${deleted.length} prior backfill rows.`);

  let inserted = 0;
  for (const { day, model, t, cost } of rowsToInsert) {
    await sql`
      INSERT INTO model_usage (
        created_at, task_type, model, source,
        input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
        cost_usd, success
      ) VALUES (
        ${`${day}T12:00:00Z`}, 'backfill', ${model}, 'backfill',
        ${t.input}, ${t.output}, ${t.cacheRead}, ${t.cacheCreate},
        ${cost}, TRUE
      )
    `;
    inserted += 1;
  }
  console.log(`✅ Inserted ${inserted} backfill rows into model_usage (task_type='backfill', source='backfill').`);
  console.log(`   They appear under task "backfill" / source "backfill" on the dashboard — filter them out to see live-only data.\n`);
}

main().catch((e) => die(e?.stack || String(e)));
