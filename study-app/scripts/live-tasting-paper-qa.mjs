// Live Tasting FULL-PAPER validation loop (Phase D3 — user-1 requirement 2026-08-06).
//
// "Building full papers and ensuring they meet all of our rules/EK and align with the corpus
// such that they would be actually representative of real exams."
//
// Three layers, run against PRODUCTION as the seeded E2E user:
//   1. STRUCTURE — create a real paper (half, pick-for-me) and chain generation; verify the
//      composition contract (validateComposition's rules re-checked here from the DB row) and
//      every flight's EK-level invariants: scope='live-tasting', validated key, not quarantined,
//      marks = wines x 25, stem leaks nothing (word-boundary probe).
//   2. CROSS-FLIGHT — no wine repeats across the paper's flights.
//   3. REPRESENTATIVENESS — an LLM judge reads the generated paper NEXT TO two real papers from
//      data/exams.json and verdicts: would this pass as a real MW paper (question mix, stem
//      style, mark structures, flight shapes)?
//
// Cleanup deletes the paper + flights + questions; the availability cache stays warm.
// Env: BASE_URL, DATABASE_URL, ANTHROPIC_API_KEY, LT_E2E_PASSWORD.
// Usage: node study-app/scripts/live-tasting-paper-qa.mjs [--paper 1|2|3]

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import bcrypt from "bcryptjs";
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
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch { /* CI provides env */ }
}
loadEnv();

const BASE_URL = process.env.BASE_URL || "https://study-app-blond-nine.vercel.app";
// Own user, NOT the e2e job's: both jobs run in parallel in the weekly workflow and each
// starts with a cleanup of its user's rows — sharing one user let the e2e job delete this
// job's paper mid-run (observed on the first re-judge attempt, 2026-08-06).
const E2E_EMAIL = "live-tasting-paper-qa@bwc.test";
const E2E_PASSWORD = process.env.LT_E2E_PASSWORD;
for (const k of ["LT_E2E_PASSWORD", "DATABASE_URL", "ANTHROPIC_API_KEY"]) {
  if (!process.env[k]) { console.error(`${k} is required`); process.exit(1); }
}

const sql = neon(process.env.DATABASE_URL);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

let cookie = "";
async function api(path, opts = {}) {
  return fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", cookie, ...(opts.headers || {}) },
  });
}

async function readSse(res) {
  const text = await res.text();
  const out = { result: null, error: null };
  for (const frame of text.split("\n\n")) {
    const line = frame.split("\n").find((l) => l.startsWith("data: "));
    if (!line || line === "data: [DONE]") continue;
    try {
      const evt = JSON.parse(line.slice(6));
      if (evt.type === "result") out.result = evt.data;
      if (evt.type === "error") out.error = evt.message;
    } catch { /* keepalive */ }
  }
  return out;
}

const fold = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const GENERIC = new Set(["wine", "wines", "domaine", "chateau", "estate", "estates", "cellars",
  "cellar", "weingut", "bodega", "bodegas", "vineyard", "vineyards", "winery", "vintners", "family", "clos"]);

async function main() {
  const startedAt = new Date();
  const argIdx = process.argv.indexOf("--paper");
  const week = Math.floor(Date.now() / (7 * 24 * 3600_000));
  const paperNo = argIdx > -1 ? Number(process.argv[argIdx + 1]) : ((week + 1) % 3) + 1;
  console.log(`Paper QA vs ${BASE_URL} — Paper ${paperNo}, half (6 wines), pick-for-me`);

  // Seed + login (same machine user as the E2E; cleanup resets it).
  const hash = bcrypt.hashSync(E2E_PASSWORD, 10);
  const u = await sql`
    INSERT INTO users (email, name, password_hash, is_admin, is_active, live_city, live_country, live_budget_amount, live_budget_currency)
    VALUES (${E2E_EMAIL}, 'Live Tasting Paper QA', ${hash}, true, true, 'New Hope, Pennsylvania', 'United States', 40, 'USD')
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = true, is_admin = true
    RETURNING id`;
  const userId = u[0].id;
  // Clear leftovers from crashed runs.
  await cleanup(userId, true);

  const login = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }) });
  check("login", login.ok, `status ${login.status}`);
  const setCookie = login.headers.getSetCookie?.() ?? [login.headers.get("set-cookie")].filter(Boolean);
  cookie = setCookie.map((c) => c.split(";")[0]).join("; ");

  // 1. Create the paper.
  const createRes = await api("/api/live-tasting/paper", {
    method: "POST",
    body: JSON.stringify({ paper: paperNo, size: "half", mode: "pick-for-me", pacing: "flight-by-flight", totalBudget: 180 }),
  });
  const created = await createRes.json().catch(() => ({}));
  check("paper create", createRes.ok && created.paperId, created.error || created.paperId);
  if (!created.paperId) return finish(startedAt, paperNo);
  const paperId = created.paperId;

  // Composition contract, from the DB row (families are deliberately hidden from the API).
  const prow = (await sql`SELECT composition FROM live_tasting_papers WHERE id = ${paperId}`)[0];
  const comp = typeof prow.composition === "string" ? JSON.parse(prow.composition) : prow.composition;
  const totalWines = comp.reduce((s, c) => s + c.flightSize, 0);
  check("composition: 6 wines in 2-4-wine flights", totalWines === 6 && comp.every((c) => c.flightSize >= 2 && c.flightSize <= 4),
    comp.map((c) => `${c.family}x${c.flightSize}`).join(" "));
  check("composition: F1/F2 anchor (P1/P2)", paperNo === 3 || comp.some((c) => c.family === "F1" || c.family === "F2"));

  // 2. Chain generation.
  for (let i = 0; i < comp.length + 1; i++) {
    const res = await api(`/api/live-tasting/paper/${paperId}/next`, { method: "POST" });
    if (!res.ok) { check(`flight generation call ${i + 1}`, false, `status ${res.status}`); break; }
    const sse = await readSse(res);
    if (sse.error) { check(`flight generation call ${i + 1}`, false, sse.error); break; }
    if (sse.result?.done) break;
  }
  const flights = await sql`
    SELECT s.id, s.paper_position, s.question_id, q.question_text, q.total_marks, q.wines, q.scope, q.invalid_reasons, k.validated
    FROM live_tasting_sessions s
    JOIN generated_questions q ON q.question_id = s.question_id
    LEFT JOIN stem_answer_keys k ON k.question_id = s.question_id
    WHERE s.paper_id = ${paperId} ORDER BY s.paper_position`;
  check("all flights generated", flights.length === comp.length, `${flights.length}/${comp.length}`);

  // 3. Per-flight EK/DB invariants + cross-flight dedup.
  const seenWines = new Set();
  let dupes = 0;
  for (const f of flights) {
    const wines = typeof f.wines === "string" ? JSON.parse(f.wines) : f.wines;
    const label = `Q${f.paper_position}`;
    check(`${label}: scope + key + not quarantined`, f.scope === "live-tasting" && f.validated === true && f.invalid_reasons == null);
    check(`${label}: marks = wines x 25`, f.total_marks === wines.length * 25, `${f.total_marks} vs ${wines.length * 25}`);
    const stem = ` ${fold(f.question_text)} `;
    const leaks = [];
    for (const w of wines) {
      for (const tok of fold(w.fullText.split(",")[0]).replace(/[^a-z ]/g, " ").split(/\s+/)
        .filter((t) => t.length >= 4 && !GENERIC.has(t))) {
        if (new RegExp(`\\b${tok}\\b`).test(stem)) leaks.push(tok);
      }
      const wkey = fold(w.fullText).slice(0, 60);
      if (seenWines.has(wkey)) dupes++;
      seenWines.add(wkey);
    }
    check(`${label}: stem leaks nothing`, leaks.length === 0, leaks.join(",") || "clean");
  }
  check("cross-flight: no wine repeats", dupes === 0, `${dupes} repeats`);

  // 4. Representativeness judge: the generated paper NEXT TO two real corpus papers.
  const exams = JSON.parse(readFileSync(join(REPO_ROOT, "data", "exams.json"), "utf-8"));
  const realPapers = [];
  for (const y of exams.slice(-4)) {
    const p = y.papers.find((pp) => pp.paper === paperNo);
    if (p && realPapers.length < 2) {
      realPapers.push(`REAL ${y.year} PAPER ${paperNo}:\n` + p.questions.map((q, i) => `Q${i + 1} (${(q.wines || []).length} wines): ${q.text}`).join("\n"));
    }
  }
  const genText = flights.map((f) => `Q${f.paper_position}: ${f.question_text}`).join("\n\n");
  const judgeRaw = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: `You are a Master of Wine examiner auditing a GENERATED practice paper against real IMW papers. This generated paper is HALF-SIZE (6 wines instead of 12) by design — judge proportional realism, not total length. Answer one JSON object only:
{"stem_style_authentic": true/false, "question_mix_realistic": true/false, "mark_structures_authentic": true/false, "would_pass_as_real": true/false, "notes": "one sentence per false"}`,
    messages: [{ role: "user", content: `GENERATED (half) PAPER ${paperNo}:\n${genText}\n\n${realPapers.join("\n\n")}` }],
  });
  const judgeText = judgeRaw.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    const judge = JSON.parse(judgeText.match(/\{[\s\S]*\}/)[0]);
    for (const k of ["stem_style_authentic", "question_mix_realistic", "mark_structures_authentic", "would_pass_as_real"]) {
      check(`judge ${k}`, judge[k] === true, judge[k] === true ? "" : judge.notes);
    }
  } catch {
    check("judge parse", false, judgeText.slice(0, 120));
  }

  await cleanup(userId, false);
  finish(startedAt, paperNo);
}

async function cleanup(userId, silent) {
  const papers = await sql`SELECT id FROM live_tasting_papers WHERE user_id = ${userId}`;
  const sessions = await sql`SELECT id, question_id FROM live_tasting_sessions WHERE user_id = ${userId}`;
  await sql`DELETE FROM live_tasting_sessions WHERE user_id = ${userId}`;
  for (const p of papers) await sql`DELETE FROM live_tasting_papers WHERE id = ${p.id}`;
  await sql`DELETE FROM user_attempts WHERE user_id = ${userId}`;
  await sql`DELETE FROM question_views WHERE user_id = ${userId}`;
  for (const s of sessions) {
    if (!s.question_id) continue;
    await sql`DELETE FROM stem_answer_keys WHERE question_id = ${s.question_id}`;
    await sql`DELETE FROM bank_wine_producer WHERE item_id = ${s.question_id}`;
    await sql`DELETE FROM generated_questions WHERE question_id = ${s.question_id}`;
  }
  if (!silent) check("cleanup", true, `${papers.length} papers, ${sessions.length} flights removed; cache kept warm`);
}

function finish(startedAt, paperNo) {
  const failed = results.filter((r) => !r.ok);
  const date = startedAt.toISOString().slice(0, 10);
  const dir = join(REPO_ROOT, "outputs", "live_tasting_paper_qa");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${date}.md`), [
    `# Live Tasting Paper QA — ${date} (Paper ${paperNo}, half)`,
    ``,
    `Result: **${failed.length === 0 ? "PASS" : `FAIL (${failed.length})`}** — ${results.length} checks`,
    ``,
    `| Check | Result | Detail |`,
    `|---|---|---|`,
    ...results.map((r) => `| ${r.name} | ${r.ok ? "✅" : "❌"} | ${(r.detail || "").replace(/\|/g, "/")} |`),
  ].join("\n"));
  console.log(failed.length === 0 ? "ALL PAPER-QA CHECKS PASSED" : `${failed.length} CHECKS FAILED`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
