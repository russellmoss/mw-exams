// Import the S1A practical wines (data/s1a_exams.json) into the wine_bank table.
//
// The S1A corpus (2015-2026, 132 wines) is a difficulty-calibrated sibling of the
// stage-two corpus: same examiner panel, one step easier. Banking these wines gives
// question generation a broader pool of examiner-vetted, S1A-tier picks.
//
// Follows the same identity pipeline as scripts/backfill_wine_bank.mjs: each wine's
// verbatim full_text is classified with the SAME prompt wine-enrichment.ts uses
// (producer / wine_name / country / region / grapes / style_category), keyed with the
// same slugId, then inserted with the same conservative ON CONFLICT merge the
// enrichment path uses (never clobbers an existing row's profile or classification).
//
// Usage (from repo root):
//   node study-app/scripts/import_s1a_wine_bank.mjs plan    # classify, dedupe, write proposal; NO db writes
//   node study-app/scripts/import_s1a_wine_bank.mjs apply   # insert the reviewed proposal
//
// plan  -> data/s1a_wine_bank_proposal.json
// apply -> INSERT ... ON CONFLICT (id) DO UPDATE (fill-empty-only merge), source='s1a_import'

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url)); // study-app/scripts
const REPO_ROOT = join(__dirname, "..", "..");
const DATA_DIR = join(REPO_ROOT, "data");
const CORPUS_PATH = join(DATA_DIR, "s1a_exams.json");
const PROPOSAL_PATH = join(DATA_DIR, "s1a_wine_bank_proposal.json");

function loadEnv() {
  try {
    const raw = readFileSync(join(REPO_ROOT, "study-app", ".env.local"), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch { /* env may be provided externally */ }
}
loadEnv();

const MODEL = "claude-sonnet-4-6";
const STYLE_CATEGORIES = "still_dry, still_off_dry, still_sweet, sparkling, fortified, oxidative, orange, rose";

// Same contract as backfill_wine_bank.mjs / wine-enrichment.ts.
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

function slugId(country, region, producer, wineName) {
  const part = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return [part(country), part(region), part(producer), part(wineName)].filter(Boolean).join("_").slice(0, 120);
}

async function classifyText(fullText) {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: CLASSIFY_SYSTEM,
    messages: [{ role: "user", content: `Wine reference: ${fullText}` }],
  });
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`No JSON for "${fullText.slice(0, 60)}": ${text.slice(0, 120)}`);
  const o = JSON.parse(m[0]);
  const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : "");
  return {
    producer: str(o.producer),
    wine_name: str(o.wine_name),
    country: str(o.country),
    region: str(o.region),
    grape_varieties: Array.isArray(o.grape_varieties)
      ? o.grape_varieties.filter((g) => typeof g === "string" && g.trim()).map((g) => g.trim())
      : [],
    style_category: str(o.style_category) || "still_dry",
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

function corpusWines() {
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8"));
  const wines = [];
  for (const yearEntry of corpus.years) {
    for (const w of yearEntry.wines) {
      if (w.dry_note) continue; // 2021 disclosed dry-note wines have no producer — not bankable identities
      wines.push({ ref: `${yearEntry.year}_s1a_w${w.slot}`, full_text: w.full_text });
    }
  }
  return wines;
}

async function plan() {
  const wines = corpusWines();
  console.log(`S1A corpus: ${wines.length} bankable wines (dry-note slots skipped)`);

  const existingIds = new Set((await sql`SELECT id FROM wine_bank`).map((r) => r.id));
  console.log(`wine_bank currently has ${existingIds.size} rows`);

  let done = 0;
  const classified = await mapLimit(wines, 6, async (w) => {
    const c = await classifyText(w.full_text);
    done++;
    if (done % 20 === 0) console.log(`classified ${done}/${wines.length}`);
    return { ...w, ...c, id: slugId(c.country, c.region, c.producer, c.wine_name) };
  });

  // Dedupe within the S1A set (the same wine recurs across years) — keep one insert, all refs.
  const byId = new Map();
  for (const c of classified) {
    if (!byId.has(c.id)) byId.set(c.id, { ...c, refs: [c.ref] });
    else byId.get(c.id).refs.push(c.ref);
  }

  const inserts = [];
  const alreadyBanked = [];
  for (const c of byId.values()) {
    const row = {
      id: c.id, producer: c.producer, wine_name: c.wine_name, country: c.country, region: c.region,
      grape_varieties: c.grape_varieties, style_category: c.style_category, refs: c.refs, full_text: c.full_text,
    };
    (existingIds.has(c.id) ? alreadyBanked : inserts).push(row);
  }

  const proposal = {
    generatedAt: new Date().toISOString(), model: MODEL,
    corpus: wines.length, unique: byId.size, inserts, alreadyBanked,
  };
  writeFileSync(PROPOSAL_PATH, JSON.stringify(proposal, null, 2));

  const byStyle = {};
  for (const u of inserts) byStyle[u.style_category] = (byStyle[u.style_category] || 0) + 1;
  console.log(`\nProposal -> ${PROPOSAL_PATH}`);
  console.log(`${wines.length} corpus wines -> ${byId.size} unique -> ${inserts.length} new inserts, ${alreadyBanked.length} already banked (id match)`);
  console.log(`New-insert style distribution:`, byStyle);
  console.log(`\nAlready banked (will still get the ON CONFLICT fill-empty merge on apply):`);
  for (const a of alreadyBanked) console.log(`  ${a.id}  (${a.refs.join(", ")})`);
  console.log(`\nSample inserts:`);
  for (const u of inserts.slice(0, 10)) console.log(`  [${u.style_category}] ${u.id}  <- ${u.refs.join(", ")}`);
}

async function apply() {
  const proposal = JSON.parse(readFileSync(PROPOSAL_PATH, "utf-8"));
  const rows = [...proposal.inserts, ...proposal.alreadyBanked];
  console.log(`Applying: ${proposal.inserts.length} inserts + ${proposal.alreadyBanked.length} fill-empty merges`);
  let n = 0;
  for (const u of rows) {
    await sql`
      INSERT INTO wine_bank (id, producer, wine_name, country, region, grape_varieties, style_category, tasting_profile, source)
      VALUES (${u.id}, ${u.producer}, ${u.wine_name}, ${u.country}, ${u.region}, ${JSON.stringify(u.grape_varieties)}, ${u.style_category}, ${null}, ${"s1a_import"})
      ON CONFLICT (id) DO UPDATE SET
        grape_varieties = CASE
          WHEN wine_bank.grape_varieties IS NULL OR wine_bank.grape_varieties = '[]'::jsonb
          THEN EXCLUDED.grape_varieties ELSE wine_bank.grape_varieties END,
        style_category = COALESCE(NULLIF(wine_bank.style_category, ''), EXCLUDED.style_category),
        updated_at = now()
    `;
    n++;
    if (n % 25 === 0) console.log(`applied ${n}/${rows.length}`);
  }
  const [count] = await sql`SELECT count(*)::int AS n FROM wine_bank`;
  console.log(`Done: ${n} rows applied. wine_bank now has ${count.n} rows.`);
}

const mode = process.argv[2];
if (mode === "plan") await plan();
else if (mode === "apply") await apply();
else {
  console.error("Usage: node study-app/scripts/import_s1a_wine_bank.mjs [plan|apply]");
  process.exit(1);
}
