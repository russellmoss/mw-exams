// Backfill wine_bank.price_band (migration 041) — the Live Tasting budget gate.
//
// classifyWine() now emits a price_band on every NEW insert; this fills the existing rows.
// Bands: value (<~$20) | premium ($20-50) | super_premium ($50-150) | icon (>$150), judged
// from the producer/appellation's market position — no web calls, one Haiku batch prompt per
// 25 wines. A row whose band can't be judged is left NULL (it simply never becomes a Live
// Tasting candidate; a later re-run can fill it).
//
// Idempotent: only rows with price_band IS NULL are touched; re-running converges.
//
// Usage (from repo root):
//   node study-app/scripts/backfill-price-bands.mjs         # apply
//   node study-app/scripts/backfill-price-bands.mjs --dry   # classify + print, no writes

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

function loadEnv() {
  try {
    const raw = readFileSync(join(REPO_ROOT, "study-app", ".env.local"), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch { /* rely on ambient env (CI) */ }
}
loadEnv();

const DRY = process.argv.includes("--dry");
const BANDS = new Set(["value", "premium", "super_premium", "icon"]);
const BATCH = 25;
const MODEL = "claude-haiku-4-5-20251001";

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const rows = await sql`
    SELECT id, producer, wine_name, country, region
    FROM wine_bank WHERE price_band IS NULL ORDER BY id
  `;
  console.log(`${rows.length} wine_bank rows need a price_band${DRY ? " (dry run)" : ""}`);

  let written = 0, skipped = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const list = batch.map((r, j) =>
      `${j + 1}. ${r.producer} ${r.wine_name || ""} — ${r.region || "?"}, ${r.country || "?"}`).join("\n");

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: `For each numbered wine, judge typical CURRENT retail price for a 750ml bottle (any recent vintage) from the producer/appellation's market position. Output one JSON object mapping the number to a band, no prose:
{"1":"premium","2":"icon",...}
Bands: "value" = under ~$20/€20. "premium" = ~$20-50 (most classic exam benchmarks). "super_premium" = ~$50-150 (top crus, vintage Champagne). "icon" = over ~$150. Use "" ONLY if the wine is genuinely unjudgeable (nonsense entry).`,
      messages: [{ role: "user", content: list }],
    });

    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    let bands = {};
    try {
      bands = JSON.parse((text.match(/\{[\s\S]*\}/) || ["{}"])[0]);
    } catch {
      console.error(`  batch ${i / BATCH + 1}: unparseable response, skipping`);
      skipped += batch.length;
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const band = bands[String(j + 1)];
      if (!BANDS.has(band)) { skipped++; continue; }
      if (!DRY) {
        await sql`UPDATE wine_bank SET price_band = ${band} WHERE id = ${batch[j].id} AND price_band IS NULL`;
      } else {
        console.log(`  ${batch[j].id} -> ${band}`);
      }
      written++;
    }
    console.log(`  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(rows.length / BATCH)}: ${written} banded, ${skipped} skipped so far`);
  }
  console.log(`Done. ${written} rows ${DRY ? "would be" : ""} banded, ${skipped} left NULL.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
