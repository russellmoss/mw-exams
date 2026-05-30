// sync-empirical-knowledge.mjs — the shared core that grows mw_exam_empirical_knowledge.md
// from the feedback ledger (Phase 2 of empirical_knowledge_doc_plan.md).
//
// WHAT IT DOES
//   Reads the current knowledge doc + resolved feedback from Neon, asks Claude (latest Opus) what
//   each feedback item teaches about the MW exam, and applies the result as deterministic OPERATIONS
//   (append cited entries, supersede contradicted ones, append a §6 ledger row, add a changelog
//   line). Existing content is never rewritten except a single targeted status flip on supersede.
//   Everything written is `status: live` (no human gate) but every entry must be cited.
//
// MODES
//   --mode incremental --analysis-id N   process exactly one resolved feedback item (its
//        feedback_analyses.id). This is the zero-latency path called from auto-feedback.yml.
//        (ANALYSIS_ID env var also works.)
//   --mode consolidate                    process every resolved feedback item not yet in the cursor
//        (catch-up). Used by the weekly cron and the manual command.
//
// FLAGS
//   --commit     git add + commit + push the doc & cursor straight to master (workflows pass this).
//                Default OFF so local runs are safe.
//   --dry-run    print the ops Claude proposed and exit without writing anything.
//
// ENV: DATABASE_URL, ANTHROPIC_API_KEY (falls back to study-app/.env.local).
// Run from anywhere; paths are resolved relative to this file.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");
const DOC_PATH = path.join(REPO_ROOT, "mw_exam_empirical_knowledge.md");
const CURSOR_PATH = path.join(REPO_ROOT, "data", "empirical_sync_state.json");
const ENV_LOCAL = path.join(__dirname, "../.env.local");

// ---------- config / args ----------
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const DRY_RUN = flag("dry-run");
const DO_COMMIT = flag("commit");
let MODE = opt("mode") || (process.env.ANALYSIS_ID ? "incremental" : "consolidate");
const ANALYSIS_ID = Number(opt("analysis-id") || process.env.ANALYSIS_ID || 0) || null;
if (MODE === "incremental" && !ANALYSIS_ID) {
  console.error("sync: --mode incremental requires --analysis-id N (or ANALYSIS_ID env).");
  process.exit(1);
}

// ---------- env ----------
function loadEnv() {
  let url = process.env.DATABASE_URL;
  let key = process.env.ANTHROPIC_API_KEY;
  if ((!url || !key) && existsSync(ENV_LOCAL)) {
    const raw = readFileSync(ENV_LOCAL, "utf8");
    const grab = (k) => raw.match(new RegExp(`${k}\\s*=\\s*"?([^"\\n\\r]+)"?`))?.[1]?.trim();
    url = url || grab("DATABASE_URL");
    key = key || grab("ANTHROPIC_API_KEY");
  }
  if (!url) throw new Error("DATABASE_URL not set (env or study-app/.env.local).");
  if (!key) throw new Error("ANTHROPIC_API_KEY not set (env or study-app/.env.local).");
  return { url, key };
}

async function getLatestOpus(apiKey) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=20", {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const opus = (data.data || [])
        .filter((m) => m.id.includes("opus"))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (opus.length) return opus[0].id;
    }
  } catch {}
  return "claude-opus-4-8"; // known-good fallback (latest Opus at time of writing)
}

// ---------- cursor ----------
function loadCursor() {
  if (existsSync(CURSOR_PATH)) {
    try {
      return JSON.parse(readFileSync(CURSOR_PATH, "utf8"));
    } catch {}
  }
  return { lastSyncAt: null, lastReviewedAt: null, processedAttemptIds: [] };
}

// ---------- doc parsing / mutation ----------
const today = () => new Date().toISOString().slice(0, 10);
const ekId = (n) => `EK-${String(n).padStart(4, "0")}`;

function maxEkId(text) {
  let max = 0;
  for (const m of text.matchAll(/^### EK-(\d+) /gm)) max = Math.max(max, Number(m[1]));
  return max;
}

function existingEntriesIndex(text) {
  // light index for Claude's dedup awareness: id + title
  const out = [];
  for (const m of text.matchAll(/^### (EK-\d+) · (.+)$/gm)) out.push({ id: m[1], title: m[2].trim() });
  return out;
}

function sectionRange(lines, n) {
  const start = lines.findIndex((l) => new RegExp(`^## §${n} `).test(l));
  if (start < 0) throw new Error(`section §${n} not found in doc`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## §\d+ /.test(lines[i])) { end = i; break; }
  }
  return [start, end];
}

function appendEntryToSection(lines, n, blockLines) {
  const [start, end] = sectionRange(lines, n);
  let ip = end;
  while (ip > start && lines[ip - 1].trim() === "") ip--;
  if (ip > start && lines[ip - 1].trim() === "---") {
    ip--;
    while (ip > start && lines[ip - 1].trim() === "") ip--;
  }
  lines.splice(ip, 0, "", ...blockLines);
}

function appendLedgerRow(lines, rowText) {
  const [s, e] = sectionRange(lines, 6);
  let hdr = -1;
  for (let i = s; i < e; i++) if (/^\|\s*attempt\s*\|/.test(lines[i])) { hdr = i; break; }
  if (hdr < 0) throw new Error("§6 ledger table header not found");
  let last = hdr + 1; // the |---|---| separator row
  while (last + 1 < e && lines[last + 1].startsWith("|")) last++;
  lines.splice(last + 1, 0, rowText);
}

function supersedeEntry(lines, id, byId) {
  const idx = lines.findIndex((l) => new RegExp(`^### ${id} `).test(l));
  if (idx < 0) return false;
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^### /.test(lines[i]) || /^## /.test(lines[i])) break;
    if (/\*\*status:\*\*\s*live/.test(lines[i])) {
      lines[i] = lines[i].replace(/\*\*status:\*\*\s*live/, "**status:** superseded") + ` (superseded by ${byId})`;
      return true;
    }
  }
  return false;
}

function addChangelog(lines, line) {
  const idx = lines.findIndex((l) => /^\*\*Changelog\*\*/.test(l));
  if (idx < 0) throw new Error("Changelog marker not found in §0");
  lines.splice(idx + 1, 0, line);
}

function entryBlock(e) {
  const b = [
    `### ${e.id} · ${e.title}`,
    `- **tier:** ${e.tier} · **status:** live`,
    `- **evidence:** ${(e.evidence || []).join("; ")}`,
  ];
  if (e.supersedes) b.push(`- **supersedes:** ${e.supersedes}`);
  b.push(`- **claim:** ${e.claim}`);
  return b;
}

// ---------- DB ----------
async function fetchItems(sql, cursor) {
  const cols = `
    ua.id AS attempt_id, ua.question_id, ua.feedback_status, ua.feedback_decided_by,
    ua.feedback_admin_note, ua.feedback_reviewed_at, ua.user_feedback,
    gq.paper, gq.family, gq.question_text, gq.wines,
    fa.id AS analysis_id, fa.recommendation, fa.thread, fa.apply_status, fa.commit_sha`;
  if (MODE === "incremental") {
    return await sql`
      SELECT ${sql.unsafe(cols)}
      FROM feedback_analyses fa
      JOIN user_attempts ua ON ua.id = fa.attempt_id
      LEFT JOIN generated_questions gq ON gq.question_id = ua.question_id
      WHERE fa.id = ${ANALYSIS_ID}`;
  }
  const rows = await sql`
    SELECT ${sql.unsafe(cols)}
    FROM user_attempts ua
    LEFT JOIN generated_questions gq ON gq.question_id = ua.question_id
    LEFT JOIN feedback_analyses fa ON fa.id = ua.auto_analysis_id
    WHERE ua.feedback_status IS NOT NULL
      AND length(trim(coalesce(ua.user_feedback, ''))) > 0
    ORDER BY ua.id`;
  const seen = new Set(cursor.processedAttemptIds || []);
  return rows.filter((r) => !seen.has(r.attempt_id));
}

function shapeItem(r) {
  const parse = (x) => (typeof x === "string" ? safeJson(x) : x);
  let threadText = "";
  const thread = parse(r.thread);
  if (Array.isArray(thread)) {
    threadText = thread.map((t) => `${t.role || "?"}: ${t.content || ""}`).join("\n").slice(0, 2500);
  }
  const wines = parse(r.wines);
  return {
    attemptId: r.attempt_id,
    analysisId: r.analysis_id || null,
    questionId: r.question_id,
    paper: r.paper,
    family: r.family,
    verdict: r.feedback_status,
    decidedBy: r.feedback_decided_by,
    adminNote: r.feedback_admin_note,
    reviewedAt: r.feedback_reviewed_at,
    userFeedback: r.user_feedback,
    questionText: r.question_text,
    wines: Array.isArray(wines) ? wines.map((w) => w.fullText || w.full_text || "").filter(Boolean) : [],
    recommendation: r.recommendation || null,
    applyStatus: r.apply_status || null,
    commitSha: r.commit_sha || null,
    analysisThread: threadText,
  };
}
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

// ---------- Claude ----------
const SYSTEM_PROMPT = `You maintain mw_exam_empirical_knowledge.md, a living, evidence-cited knowledge base about the Institute of Masters of Wine PRACTICAL (blind tasting) exam: how it is structured/created, how examiners grade and think, what wines/qualities/styles appear by paper, the rules for generating questions/answers, and a catalog of app bugs.

You are given the CURRENT document and one or more newly-resolved user FEEDBACK items from the app's feedback ledger. For each item, decide what (if anything) it teaches that is TRUE or VERY DIRECTIONALLY CORRECT about the EXAM (or, for app/operational facts, about the system), and emit deterministic OPERATIONS that will be applied to the doc by code.

RULES (non-negotiable):
- Output STRICT JSON only — no prose, no markdown fences.
- Everything you assert must be CITED. Cite the feedback as "ledger: attempt #<attemptId> / analysis #<analysisId> (<verdict>)" (omit "/ analysis #N" if analysisId is null). You may also cite corpus/artifact evidence already referenced in the doc.
- DEDUPE: if an item is already fully covered by an existing entry, add NO new entry — just reference that entry's id in the ledger row's ekRefs. Skim the provided entry index.
- SUPERSEDE on contradiction: if an item shows an existing entry is now wrong, add a corrected entry and list the old id under "supersede".
- TIER (content-signal confidence, NOT review status): STRONG SIGNAL | PLAUSIBLE | CURVEBALL. Use PROCESS for app/operational facts (these go in section 7). Partial-accept feedback is usually PLAUSIBLE. Genuine-but-corpus-overruled rejections often still teach a positive fact (e.g. "this wine type DOES appear") — capture that as the claim.
- SECTION routing: 1 structure/creation · 2 examiner mindset/grading philosophy · 3 answer grading guidelines · 4 wine/price/style distribution by paper · 5 question-generation rules · 6 (ledger only — handled for you) · 7 app bug catalog (PROCESS) · 9 open questions/hypotheses (use CURVEBALL when the evidence is thin/uncited-beyond-one-opinion).
- NEVER invent. If a finding cannot be cited beyond a single opinion, route it to section 9 as an open hypothesis.
- IGNORE pure UI/cosmetic/test/junk feedback (e.g. "make buttons pink", obviously-false claims): no entry; in the ledger row set ekRefs to [] and put a short reason in "taught".
- Keep claims tight and decisive (1-4 sentences), in the doc's voice. Titles are short.
- Use temporary ids "NEW-1", "NEW-2", ... for entries you create; reference them in ekRefs/supersede. Code assigns real EK ids.

JSON SCHEMA:
{
  "items": [
    {
      "attemptId": <int>,
      "newEntries": [
        { "tempId": "NEW-1", "section": <int 1-9 except 6>, "tier": "STRONG SIGNAL|PLAUSIBLE|CURVEBALL|PROCESS",
          "title": "<short>", "evidence": ["ledger: attempt #.. (verdict)", ...], "claim": "<text>",
          "supersedes": null | "EK-0033" }
      ],
      "supersede": [ { "id": "EK-0033", "byTempId": "NEW-1" } ],
      "ledgerRow": { "attempt": <int>, "analysis": <int|null>, "paperFamily": "P2/F3",
        "verdict": "accept|partial|reject", "decided": "auto|manual",
        "taught": "<one phrase: what it taught, or why skipped>", "ekRefs": ["NEW-1" or "EK-0042" ...] }
    }
  ]
}`;

async function askClaude(client, model, docText, items) {
  const entryIndex = existingEntriesIndex(docText)
    .map((e) => `${e.id}: ${e.title}`)
    .join("\n");
  const userMsg = [
    "## CURRENT DOCUMENT",
    docText,
    "",
    "## EXISTING ENTRY INDEX (id: title) — for dedup/supersede",
    entryIndex,
    "",
    "## NEW FEEDBACK ITEMS (resolve each into operations)",
    JSON.stringify(items, null, 2),
    "",
    "Return STRICT JSON per the schema. One ledgerRow per feedback item.",
  ].join("\n");

  const message = await client.messages.create({
    model,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMsg }],
  });
  const text = message.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const json = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error("Claude did not return valid JSON:\n" + text.slice(0, 1200));
  }
  return { parsed, usage: message.usage, model };
}

// ---------- apply ----------
export function applyOps(docText, ops, mode) {
  const lines = docText.split("\n");
  let nextId = maxEkId(docText) + 1;
  const tempMap = {}; // NEW-1 -> EK-0073
  const created = [];

  // First pass: assign EK ids to all new entries (query order preserved).
  for (const item of ops.items || []) {
    for (const e of item.newEntries || []) {
      const id = ekId(nextId++);
      tempMap[e.tempId] = id;
      created.push({ ...e, id });
    }
  }
  const resolveRef = (ref) => (ref && ref.startsWith("NEW-") ? tempMap[ref] || ref : ref);

  // Apply new entries (resolve supersedes refs in the entry itself).
  for (const e of created) {
    appendEntryToSection(lines, e.section, entryBlock({ ...e, supersedes: e.supersedes ? resolveRef(e.supersedes) : null }));
  }

  // Apply supersede status flips.
  for (const item of ops.items || []) {
    for (const s of item.supersede || []) {
      const by = resolveRef(s.byTempId) || s.byId || "a newer entry";
      supersedeEntry(lines, s.id, by);
    }
  }

  // Apply §6 ledger rows.
  for (const item of ops.items || []) {
    const lr = item.ledgerRow;
    if (!lr) continue;
    const refs = (lr.ekRefs || []).map(resolveRef).filter(Boolean).join(", ") || "—";
    const analysis = lr.analysis == null ? "—" : lr.analysis;
    const row = `| ${lr.attempt} | ${analysis} | ${lr.paperFamily || "—"} | ${lr.verdict || "—"} | ${lr.decided || "—"} | ${(lr.taught || "").replace(/\|/g, "/")} | ${refs} |`;
    appendLedgerRow(lines, row);
  }

  // Changelog line.
  const counts = created.length;
  const itemCount = (ops.items || []).length;
  const summary = `${mode}: ${itemCount} feedback item(s) processed → ${counts} new entr${counts === 1 ? "y" : "ies"}` +
    (created.length ? ` (${created.map((c) => c.id).join(", ")})` : "");
  addChangelog(lines, `- **${today()} — ${summary}.**`);

  return { text: lines.join("\n"), created, summary };
}

// ---------- git ----------
function gitCommit(summary) {
  const run = (a) => execFileSync("git", a, { cwd: REPO_ROOT, stdio: "pipe" }).toString().trim();
  run(["add", "mw_exam_empirical_knowledge.md", "data/empirical_sync_state.json"]);
  const status = run(["status", "--porcelain", "mw_exam_empirical_knowledge.md", "data/empirical_sync_state.json"]);
  if (!status) { console.log("sync: nothing staged; skipping commit."); return; }
  run([
    "-c", "user.name=empirical-sync",
    "-c", "user.email=empirical-sync@users.noreply.github.com",
    "commit", "-m", `chore(knowledge): ${summary} [skip ci]`,
  ]);
  // Push to master; if another concurrent run pushed first, rebase on origin/master and retry once.
  // (Doc commits are content-only: the [skip ci] message + the vercel.json ignoreCommand mean Vercel
  // skips them, and no GitHub workflow triggers on push — so this never builds or deploys.)
  try {
    run(["push", "origin", "HEAD:master"]);
  } catch {
    console.log("sync: push rejected (concurrent update?); rebasing on origin/master and retrying…");
    run(["pull", "--rebase", "origin", "master"]);
    run(["push", "origin", "HEAD:master"]);
  }
  console.log("sync: committed + pushed to master.");
}

// ---------- main ----------
async function main() {
  const { url, key } = loadEnv();
  const sql = neon(url);
  const cursor = loadCursor();

  const rows = await fetchItems(sql, cursor);
  if (!rows.length) {
    console.log(`sync (${MODE}): no new feedback to process. Nothing to do.`);
    return;
  }
  const items = rows.map(shapeItem);
  console.log(`sync (${MODE}): ${items.length} feedback item(s): ${items.map((i) => "#" + i.attemptId).join(", ")}`);

  const docText = readFileSync(DOC_PATH, "utf8");
  const client = new Anthropic({ apiKey: key });
  const model = await getLatestOpus(key);
  console.log(`sync: asking ${model} …`);
  const { parsed, usage } = await askClaude(client, model, docText, items);
  console.log(`sync: model usage in=${usage?.input_tokens} out=${usage?.output_tokens}`);

  const { text, created, summary } = applyOps(docText, parsed, MODE);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: proposed operations ---");
    console.log(JSON.stringify(parsed, null, 2));
    console.log(`\n${created.length} new entries would be added: ${created.map((c) => c.id + " §" + c.section).join(", ")}`);
    console.log("(no files written)");
    return;
  }

  // advance cursor
  const processed = new Set(cursor.processedAttemptIds || []);
  for (const i of items) processed.add(i.attemptId);
  const reviewedTimes = items.map((i) => i.reviewedAt).filter(Boolean).sort();
  const newCursor = {
    lastSyncAt: new Date().toISOString(),
    lastReviewedAt: reviewedTimes.length ? reviewedTimes[reviewedTimes.length - 1] : cursor.lastReviewedAt,
    processedAttemptIds: [...processed].sort((a, b) => a - b),
  };

  writeFileSync(DOC_PATH, text);
  writeFileSync(CURSOR_PATH, JSON.stringify(newCursor, null, 2) + "\n");
  console.log(`sync: wrote ${created.length} new entries. ${summary}`);

  if (DO_COMMIT) gitCommit(summary);
  else console.log("sync: --commit not set; doc updated locally, not pushed.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error("sync: FAILED —", e.message);
    process.exit(1);
  });
}
