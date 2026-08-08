// sync-ek-table.mjs — project mw_exam_empirical_knowledge.md into the Neon `empirical_knowledge`
// table (a derived, queryable mirror the feedback-analysis agent reads at runtime).
//
// The markdown is CANONICAL. This rebuilds the table FROM the doc (delete-all + insert-all), so the
// two can never drift: run it whenever the doc changes. It does NOT write the doc and does NOT touch
// git — it only refreshes the table, with no Vercel deploy involved.
//
//   node study-app/scripts/sync-ek-table.mjs            # rebuild the table from the doc
//   node study-app/scripts/sync-ek-table.mjs --dry-run  # parse + print counts, write nothing
//
// ENV: DATABASE_URL (falls back to study-app/.env.local).

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");
const DOC_PATH = path.join(REPO_ROOT, "mw_exam_empirical_knowledge.md");
const ENV_LOCAL = path.join(__dirname, "../.env.local");
const DRY_RUN = process.argv.includes("--dry-run");

function loadDbUrl() {
  let url = process.env.DATABASE_URL;
  if (!url && existsSync(ENV_LOCAL)) {
    const raw = readFileSync(ENV_LOCAL, "utf8");
    url = raw.match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)?.[1]?.trim();
  }
  if (!url) throw new Error("DATABASE_URL not set (env or study-app/.env.local).");
  return url;
}

// Only tag a paper when the entry unambiguously references exactly one (P1/P2/P3 or "Paper N").
// Conservative on purpose: a general rule with no/multiple paper refs stays NULL = always included.
function detectPaper(text) {
  const papers = new Set();
  for (const m of text.matchAll(/\bP([123])\b/g)) papers.add(Number(m[1]));
  for (const m of text.matchAll(/\bPaper\s+([123])\b/gi)) papers.add(Number(m[1]));
  return papers.size === 1 ? [...papers][0] : null;
}

function parseDoc(md) {
  const lines = md.split("\n");
  const entries = [];
  let section = null;
  let cur = null;
  const flush = () => { if (cur) { entries.push(cur); cur = null; } };

  for (const line of lines) {
    const sec = line.match(/^##\s*§([0-9.]+)/);
    if (sec) { flush(); section = Number(sec[1].split(".")[0]); continue; }
    const ek = line.match(/^###\s*(EK-\d{4})\s*·\s*(.+?)\s*$/);
    if (ek) {
      flush();
      cur = { ek_id: ek[1], section: section ?? 0, title: ek[2], tier: null, status: "live", evidence: null, claim: "", superseded_by: null, _claimOpen: false };
      continue;
    }
    if (!cur) continue;
    const tierM = line.match(/^-\s*\*\*tier:\*\*\s*([^·]+?)\s*·\s*\*\*status:\*\*\s*(.+?)\s*$/i);
    if (tierM) {
      cur.tier = tierM[1].trim();
      const statusRaw = tierM[2].trim();
      cur.status = /superseded/i.test(statusRaw) ? "superseded" : "live";
      const by = statusRaw.match(/superseded by (EK-\d{4})/i);
      if (by) cur.superseded_by = by[1];
      cur._claimOpen = false;
      continue;
    }
    const evM = line.match(/^-\s*\*\*evidence:\*\*\s*(.+?)\s*$/i);
    if (evM) { cur.evidence = evM[1].trim(); cur._claimOpen = false; continue; }
    const supM = line.match(/^-\s*\*\*supersedes:\*\*\s*(.+?)\s*$/i);
    if (supM) { cur._claimOpen = false; continue; }
    const claimM = line.match(/^-\s*\*\*claim:\*\*\s*(.*)$/i);
    if (claimM) { cur.claim = claimM[1].trim(); cur._claimOpen = true; continue; }
    // continuation of a multi-line claim (indented wrap lines)
    if (cur._claimOpen && line.trim() && !/^-\s*\*\*/.test(line) && !/^#{1,3}\s/.test(line) && line.trim() !== "---") {
      cur.claim += " " + line.trim();
    }
  }
  flush();

  for (const e of entries) {
    e.paper = detectPaper(`${e.title} ${e.claim}`);
    delete e._claimOpen;
  }
  return entries;
}

// A duplicate `ek_id` used to be invisible: the INSERT below is ON CONFLICT DO UPDATE, so of two
// entries sharing an id only the LATER heading reached the table and the earlier one vanished without
// a word — the mirror read 163 rows against 166 parsed entries for a day, and the entry the generation
// rules depend on (sparkling is blocked on Paper 1 entirely) was one of the three that disappeared.
// The agent queries the table, not the doc, so nothing downstream could notice. Fail instead: a red
// ek-table-sync run is recoverable, a silently-thinner knowledge base is not.
function assertUniqueIds(entries) {
  const seen = new Map();
  for (const e of entries) {
    if (!seen.has(e.ek_id)) seen.set(e.ek_id, []);
    seen.get(e.ek_id).push(e);
  }
  const dupes = [...seen.entries()].filter(([, es]) => es.length > 1);
  if (!dupes.length) return;
  console.error(`ek-table: FATAL — ${dupes.length} duplicate ek_id(s) in mw_exam_empirical_knowledge.md.`);
  for (const [id, es] of dupes) {
    console.error(`  ${id} used ${es.length}×:`);
    for (const e of es) console.error(`    §${e.section} · ${e.title}`);
  }
  console.error(
    "ek-table: renumber all but one of each pair to a fresh id (and update every cross-reference).\n" +
      "ek-table: NOTHING was written — the table still holds the previous sync."
  );
  process.exit(1);
}

async function main() {
  if (!existsSync(DOC_PATH)) throw new Error(`doc not found: ${DOC_PATH}`);
  const entries = parseDoc(readFileSync(DOC_PATH, "utf8"));
  assertUniqueIds(entries);
  const bySection = {};
  for (const e of entries) bySection[e.section] = (bySection[e.section] || 0) + 1;
  console.log(`ek-table: parsed ${entries.length} entries; by section:`, bySection);
  console.log(`ek-table: paper-tagged: ${entries.filter((e) => e.paper).length}; superseded: ${entries.filter((e) => e.status === "superseded").length}`);

  if (DRY_RUN) { console.log("ek-table: --dry-run, nothing written."); return; }

  const sql = neon(loadDbUrl());
  // Rebuild the projection: clear, then insert all. (Small table; CI runs single-threaded.)
  await sql`DELETE FROM empirical_knowledge`;
  for (const e of entries) {
    await sql`
      INSERT INTO empirical_knowledge (ek_id, section, tier, status, title, claim, evidence, paper, superseded_by, updated_at)
      VALUES (${e.ek_id}, ${e.section}, ${e.tier}, ${e.status}, ${e.title}, ${e.claim}, ${e.evidence}, ${e.paper}, ${e.superseded_by}, NOW())
      ON CONFLICT (ek_id) DO UPDATE SET
        section = EXCLUDED.section, tier = EXCLUDED.tier, status = EXCLUDED.status,
        title = EXCLUDED.title, claim = EXCLUDED.claim, evidence = EXCLUDED.evidence,
        paper = EXCLUDED.paper, superseded_by = EXCLUDED.superseded_by, updated_at = NOW()
    `;
  }
  console.log(`ek-table: wrote ${entries.length} rows to empirical_knowledge.`);
}

main().catch((e) => { console.error("ek-table: FAILED —", e.message); process.exit(1); });
