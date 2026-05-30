// sync-tasting-lexicon.mjs — project src/lib/prompts/tasting-lexicon.json (CANONICAL) into:
//   1. the Neon `tasting_lexicon` table (delete-all + insert-all, so it can never drift), and
//   2. outputs/heuristics/tasting_lexicon.md (the mock-answer-writer agent's reference doc).
//
// The JSON is the single source of truth. Run this whenever the JSON changes. It does NOT touch git
// and triggers no Vercel deploy.
//
//   node study-app/scripts/sync-tasting-lexicon.mjs            # write the MD + rebuild the table
//   node study-app/scripts/sync-tasting-lexicon.mjs --dry-run  # write the MD only, skip the DB
//
// ENV: DATABASE_URL (falls back to study-app/.env.local). If no DB URL is available, the MD is still
// written and the DB step is skipped with a warning.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");
const JSON_PATH = path.join(__dirname, "../src/lib/prompts/tasting-lexicon.json");
const MD_PATH = path.join(REPO_ROOT, "outputs/heuristics/tasting_lexicon.md");
const ENV_LOCAL = path.join(__dirname, "../.env.local");
const DRY_RUN = process.argv.includes("--dry-run");

function loadDbUrl() {
  let url = process.env.DATABASE_URL;
  if (!url && existsSync(ENV_LOCAL)) {
    const raw = readFileSync(ENV_LOCAL, "utf8");
    url = raw.match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)?.[1]?.trim();
  }
  return url || null;
}

const lex = JSON.parse(readFileSync(JSON_PATH, "utf8"));

// ---- flatten to rows ----
const rows = [];
for (const [category, terms] of Object.entries(lex.dimensions)) {
  terms.forEach((term, i) => rows.push({ group_kind: "dimension", category, term, sort_order: i }));
}
for (const [category, terms] of Object.entries(lex.rhetoric)) {
  terms.forEach((term, i) => rows.push({ group_kind: "rhetoric", category, term, sort_order: i }));
}

// ---- 1. regenerate the agent reference markdown ----
const RHET_LABELS = {
  POSITIVES: "POSITIVES — quality, positive register",
  NEGATIVES: "NEGATIVES — quality, negative register",
  SUGGESTS: "SUGGESTS — inference verbs (evidence is suggestive, not proven)",
  PROVES: "PROVES — confirmation verbs (evidence is conclusive)",
  ODDS_AND_SODS: "ODDS & SODS — connective nouns",
};
let md = `# MW Tasting Lexicon (reference for the mock-answer-writer)

> Generated from \`study-app/src/lib/prompts/tasting-lexicon.json\` by \`scripts/sync-tasting-lexicon.mjs\`.
> Do not edit by hand — edit the JSON and re-run the sync.

Use this as a **register palette**, not a checklist: pick precise, examiner-grade descriptors and vary
them across dimensions. Precision beats density — examiners penalise word-salad.

## Descriptor palette by dimension
`;
for (const [dim, terms] of Object.entries(lex.dimensions)) {
  md += `\n- **${dim}**: ${terms.join(", ")}`;
}
md += `\n\n## Rhetorical register\n`;
for (const [cat, terms] of Object.entries(lex.rhetoric)) {
  md += `\n- **${RHET_LABELS[cat] || cat}**: ${terms.join(", ")}`;
}
md += `\n\n## The deductive rule (mirror the funnelling principle)
Match the verb to the strength of the evidence. Use an **inference verb** (SUGGESTS list) when the
evidence implies but does not prove a call ("high acid + low alcohol *suggests* a cool climate");
reserve a **confirmation verb** (PROVES list) for conclusive evidence ("marked petrol *confirms*
mature Riesling"). Never write "X confirms Y" for a likely-but-unproven call — that is over-claiming.
`;

if (!existsSync(path.dirname(MD_PATH))) mkdirSync(path.dirname(MD_PATH), { recursive: true });
writeFileSync(MD_PATH, md, "utf8");
console.log(`Wrote ${path.relative(REPO_ROOT, MD_PATH)} (${rows.length} terms).`);

// ---- 2. rebuild the Neon table ----
if (DRY_RUN) {
  console.log(`[dry-run] would upsert ${rows.length} rows into tasting_lexicon. Skipping DB.`);
  process.exit(0);
}
const dbUrl = loadDbUrl();
if (!dbUrl) {
  console.warn("DATABASE_URL not set (env or study-app/.env.local) — wrote the MD, skipped the DB step.");
  process.exit(0);
}
const sql = neon(dbUrl);
await sql`DELETE FROM tasting_lexicon`;
for (const r of rows) {
  await sql`
    INSERT INTO tasting_lexicon (group_kind, category, term, sort_order, active)
    VALUES (${r.group_kind}, ${r.category}, ${r.term}, ${r.sort_order}, TRUE)
    ON CONFLICT (category, term) DO UPDATE SET
      group_kind = EXCLUDED.group_kind, sort_order = EXCLUDED.sort_order, active = TRUE`;
}
const [{ count }] = await sql`SELECT count(*)::int AS count FROM tasting_lexicon`;
console.log(`Rebuilt tasting_lexicon: ${count} rows.`);
