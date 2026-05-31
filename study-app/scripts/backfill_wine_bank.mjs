// One-off backfill for the wine_bank table.
//
// Why: the question-generation pipeline inserted every wine with no style_category
// (DB default 'still_dry'), no grape_varieties, and frequently mangled identity fields
// (producer="R", country="2012", etc.) because the old regex parser broke on anything
// that wasn't exactly "Producer, Name. Region, Country". This re-derives clean identity
// + grape varieties + style classification for every existing row, using the SAME
// classification prompt the fixed pipeline (wine-enrichment.ts) now uses.
//
// Usage (from repo root):
//   node scripts/backfill_wine_bank.mjs plan    # classify all rows, write backup + proposal, NO db writes
//   node scripts/backfill_wine_bank.mjs apply    # apply the reviewed proposal to the DB
//
// plan  -> data/wine_bank_backup_<ts>.json (raw rows) + data/wine_bank_backfill_proposal.json
// apply -> reads the proposal, updates rows (re-keying ids) and merges duplicates.

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url)); // study-app/scripts
const REPO_ROOT = join(__dirname, "..", "..");
const DATA_DIR = join(REPO_ROOT, "data");
const PROPOSAL_PATH = join(DATA_DIR, "wine_bank_backfill_proposal.json");

// --- env: load study-app/.env.local (ANTHROPIC_API_KEY, DATABASE_URL) ---
function loadEnv() {
  const envPath = join(REPO_ROOT, "study-app", ".env.local");
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}
loadEnv();

const MODEL = "claude-sonnet-4-6";
const STYLE_CATEGORIES = "still_dry, still_off_dry, still_sweet, sparkling, fortified, oxidative, orange, rose";

const CLASSIFY_SYSTEM = `You identify a wine from a single reference string (which may have its fields jumbled or mislabeled — reconstruct the real wine). Output exactly one JSON object, no prose, no code fences:
{"producer":"...","wine_name":"...","country":"...","region":"...","grape_varieties":["..."],"style_category":"..."}

Rules:
- producer: the estate/house only, e.g. "Domaine Leflaive", "Billecart-Salmon", "Nyetimber", "López de Heredia". Never a year or a region.
- wine_name: the cuvée/bottling without the producer and without the vintage year, e.g. "Mâcon-Verzé", "Blanc de Blancs Grand Cru", "Viña Tondonia Gran Reserva". Empty string if there is none.
- country: the country of origin, e.g. "France", "England", "Spain". Never a year.
- region: the wine region, e.g. "Burgundy", "Champagne", "Mosel", "Rioja", "West Sussex". Never a year.
- grape_varieties: the grape(s). If not stated, infer the standard variety/blend for the appellation. Use standard names, e.g. ["Chardonnay"], ["Grenache","Syrah","Mourvèdre"], ["Tempranillo","Garnacha","Graciano","Mazuelo"].
- style_category: exactly one of: ${STYLE_CATEGORIES}.
  - sparkling: Champagne, Crémant, Cava, Prosecco, Sekt, Trentodoc, traditional-method / any fizzy wine.
  - fortified: Port, Sherry, Madeira, Rutherglen/liqueur Muscat, Vin Doux Naturel.
  - still_sweet: Sauternes, Tokaji Aszú, Beerenauslese/Trockenbeerenauslese, Icewine/Eiswein, Vin Santo, passito (Ben Ryé), Quarts de Chaume, Vin de Constance, Vin de Paille, late-harvest dessert wines.
  - still_off_dry: fruity Kabinett/Spätlese and other clearly off-dry (not fully sweet) styles.
  - oxidative: Vin Jaune, oxidative/sous-voile Jura whites, biologically/deliberately oxidative styles.
  - rose / orange: as appropriate.
  - still_dry: everything else (the default for dry still whites and reds, including a Grosses Gewächs / GG).`;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sql = neon(process.env.DATABASE_URL);

// Includes wine_name so different cuvées from the same producer/region don't collide onto one id.
function slugId(country, region, producer, wineName) {
  const part = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return [part(country), part(region), part(producer), part(wineName)].filter(Boolean).join("_").slice(0, 120);
}

async function classifyRow(row) {
  // Feed every signal we have; fields may be jumbled, so include the id tokens too.
  const ref = `producer="${row.producer}" wine_name="${row.wine_name}" region="${row.region}" country="${row.country}" (id tokens: ${String(row.id).replace(/_/g, " ")})`;
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: CLASSIFY_SYSTEM,
    messages: [{ role: "user", content: `Wine reference: ${ref}` }],
  });
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`No JSON for ${row.id}: ${text.slice(0, 120)}`);
  const o = JSON.parse(m[0]);
  const str = (v, fb) => (typeof v === "string" && v.trim() ? v.trim() : fb);
  return {
    producer: str(o.producer, row.producer),
    wine_name: str(o.wine_name, row.wine_name),
    country: str(o.country, row.country),
    region: str(o.region, row.region),
    grape_varieties: Array.isArray(o.grape_varieties)
      ? o.grape_varieties.filter((g) => typeof g === "string" && g.trim()).map((g) => g.trim())
      : [],
    style_category: str(o.style_category, "still_dry"),
  };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function plan() {
  const rows = await sql`SELECT * FROM wine_bank ORDER BY id`;
  // backup
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(DATA_DIR, `wine_bank_backup_${ts}.json`);
  writeFileSync(backupPath, JSON.stringify(rows, null, 2));
  console.log(`Backed up ${rows.length} rows -> ${backupPath}`);

  let done = 0;
  const classified = await mapLimit(rows, 6, async (row) => {
    const c = await classifyRow(row);
    done++;
    if (done % 10 === 0) console.log(`classified ${done}/${rows.length}`);
    return { oldId: row.id, old: { producer: row.producer, wine_name: row.wine_name, country: row.country, region: row.region }, ...c, newId: slugId(c.country, c.region, c.producer, c.wine_name), hadTastingProfile: !!row.tasting_profile, source: row.source };
  });

  // group by newId to detect duplicates that should merge
  const groups = new Map();
  for (const c of classified) {
    if (!groups.has(c.newId)) groups.set(c.newId, []);
    groups.get(c.newId).push(c);
  }
  const updates = [];
  const deletes = [];
  for (const [newId, group] of groups) {
    // canonical = prefer one that has a tasting_profile, then tavily over llm, else first
    group.sort((a, b) => (Number(b.hadTastingProfile) - Number(a.hadTastingProfile)) || String(a.oldId).localeCompare(String(b.oldId)));
    const canonical = group[0];
    updates.push({ oldId: canonical.oldId, newId, producer: canonical.producer, wine_name: canonical.wine_name, country: canonical.country, region: canonical.region, grape_varieties: canonical.grape_varieties, style_category: canonical.style_category });
    for (const dup of group.slice(1)) deletes.push({ oldId: dup.oldId, mergedInto: newId });
  }

  const proposal = { generatedAt: ts, backup: backupPath, model: MODEL, total: rows.length, updates, deletes, classified };
  writeFileSync(PROPOSAL_PATH, JSON.stringify(proposal, null, 2));

  // summary
  const byStyle = {};
  for (const u of updates) byStyle[u.style_category] = (byStyle[u.style_category] || 0) + 1;
  console.log(`\nProposal written -> ${PROPOSAL_PATH}`);
  console.log(`Rows: ${rows.length} -> ${updates.length} kept, ${deletes.length} merged/deleted`);
  console.log(`Style distribution (kept rows):`, byStyle);
  console.log(`\nNon-still_dry reclassifications:`);
  for (const u of updates.filter((u) => u.style_category !== "still_dry")) {
    console.log(`  [${u.style_category}] ${u.producer} — ${u.wine_name} (${u.region}, ${u.country})`);
  }
  console.log(`\nMerged duplicates:`);
  for (const d of deletes) console.log(`  ${d.oldId}  ->  ${d.mergedInto}`);
}

async function apply() {
  const proposal = JSON.parse(readFileSync(PROPOSAL_PATH, "utf-8"));
  console.log(`Applying proposal from ${proposal.generatedAt}: ${proposal.updates.length} updates, ${proposal.deletes.length} deletes`);

  // Delete duplicates first so re-keying an update onto a freed id can't collide.
  for (const d of proposal.deletes) {
    await sql`DELETE FROM wine_bank WHERE id = ${d.oldId}`;
  }
  let n = 0;
  for (const u of proposal.updates) {
    await sql`
      UPDATE wine_bank SET
        id = ${u.newId},
        producer = ${u.producer},
        wine_name = ${u.wine_name},
        country = ${u.country},
        region = ${u.region},
        grape_varieties = ${JSON.stringify(u.grape_varieties)},
        style_category = ${u.style_category},
        updated_at = now()
      WHERE id = ${u.oldId}
    `;
    n++;
    if (n % 20 === 0) console.log(`updated ${n}/${proposal.updates.length}`);
  }
  console.log(`Done: ${proposal.deletes.length} deleted, ${n} updated.`);
}

const mode = process.argv[2];
if (mode === "plan") await plan();
else if (mode === "apply") await apply();
else {
  console.error("Usage: node scripts/backfill_wine_bank.mjs [plan|apply]");
  process.exit(1);
}
