// Live Tasting agentic E2E self-test (live_tasting_plan.md §9.2).
//
// Exercises the REAL pipeline against the REAL world — live Tavily searches, live generation,
// live grading — as a dedicated seeded test user in the pilot market (New Hope, Pennsylvania),
// then asserts the invariants no unit test can see:
//
//   1. session creation blocks on a validated key; scope='live-tasting'; not quarantined
//   2. the pre-reveal payload leaks no wine identity (redaction probe, machine-checked)
//   3. every slot has stockists incl. the wine-searcher fallback; stockist links are ALIVE
//   4. the partner share flow stamps 'partner', a self-reveal downgrades to 'self'
//   5. an LLM judge audits archetype coherence / blind-safety / stockist plausibility / budget
//   6. grading DISCRIMINATES: a competent note outscores a plausible-but-wrong one
//   7. one-shot semantics: second grade 409s; share page 404s after grading
//
// Cleanup: all sessions/attempts/questions created here are deleted at the end (memory rule: no
// real-user test pollution). The retail_availability cache rows are deliberately KEPT — a warm
// cache for the pilot market is a feature, not pollution.
//
// Env: BASE_URL (default prod), DATABASE_URL, ANTHROPIC_API_KEY, LT_E2E_PASSWORD (required).
// Usage: node study-app/scripts/live-tasting-e2e.mjs [--paper 1|2|3]

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
const E2E_EMAIL = "live-tasting-e2e@bwc.test";
const E2E_PASSWORD = process.env.LT_E2E_PASSWORD;
const CITY = "New Hope, Pennsylvania";
const COUNTRY = "United States";
const BUDGET = 40;

if (!E2E_PASSWORD) { console.error("LT_E2E_PASSWORD is required"); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required"); process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY is required"); process.exit(1); }

const sql = neon(process.env.DATABASE_URL);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const results = [];
let judgeNotes = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function warn(name, detail) {
  results.push({ name, ok: true, detail: `WARN: ${detail}` });
  console.log(`WARN  ${name} — ${detail}`);
}

// ── plumbing ────────────────────────────────────────────────────────────────────────────────────

let cookie = "";
async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", cookie, ...(opts.headers || {}) },
  });
  return res;
}

async function readSse(res, { onStatus } = {}) {
  const text = await res.text();
  const out = { result: null, error: null, textDeltas: "", statuses: [] };
  for (const frame of text.split("\n\n")) {
    const line = frame.split("\n").find((l) => l.startsWith("data: "));
    if (!line || line === "data: [DONE]") continue;
    try {
      const evt = JSON.parse(line.slice(6));
      if (evt.type === "status") { out.statuses.push(evt.label); onStatus?.(evt.label); }
      if (evt.type === "result") out.result = evt.data;
      if (evt.type === "error") out.error = evt.message;
      if (evt.error) out.error = evt.error;
      if (evt.t) out.textDeltas += evt.t;
      if (evt.enriched) out.enriched = evt.enriched;
    } catch { /* keepalive/comment frames */ }
  }
  return out;
}

async function llm(system, user, maxTokens = 1500) {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

// ── seed + cleanup ──────────────────────────────────────────────────────────────────────────────

async function seedUser() {
  const hash = bcrypt.hashSync(E2E_PASSWORD, 10);
  const rows = await sql`
    INSERT INTO users (email, name, password_hash, is_admin, is_active,
                       live_city, live_country, live_budget_amount, live_budget_currency)
    VALUES (${E2E_EMAIL}, 'Live Tasting E2E', ${hash}, true, true, ${CITY}, ${COUNTRY}, ${BUDGET}, 'USD')
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash, is_active = true, is_admin = true,
      live_city = EXCLUDED.live_city, live_country = EXCLUDED.live_country,
      live_budget_amount = EXCLUDED.live_budget_amount, live_budget_currency = EXCLUDED.live_budget_currency
    RETURNING id
  `;
  return rows[0].id;
}

async function cleanup(userId) {
  const sessions = await sql`SELECT id, question_id, attempt_id FROM live_tasting_sessions WHERE user_id = ${userId}`;
  const qids = sessions.map((s) => s.question_id).filter(Boolean);
  await sql`DELETE FROM live_tasting_sessions WHERE user_id = ${userId}`;
  await sql`DELETE FROM user_attempts WHERE user_id = ${userId}`;
  await sql`DELETE FROM question_views WHERE user_id = ${userId}`;
  for (const qid of qids) {
    await sql`DELETE FROM stem_answer_keys WHERE question_id = ${qid}`;
    await sql`DELETE FROM bank_wine_producer WHERE item_id = ${qid}`;
    await sql`DELETE FROM generated_questions WHERE question_id = ${qid}`;
  }
  return { sessions: sessions.length, questions: qids.length };
}

// ── the flow ────────────────────────────────────────────────────────────────────────────────────

async function login() {
  const res = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
  });
  check("login", res.ok, `status ${res.status}`);
  const setCookie = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")].filter(Boolean);
  cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
}

async function createSession(paper) {
  const res = await api("/api/live-tasting", {
    method: "POST",
    body: JSON.stringify({ paper, flightSize: 2 }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    check(`p${paper} create`, false, body.error || `status ${res.status}`);
    return null;
  }
  const sse = await readSse(res, { onStatus: (l) => console.log(`   … ${l}`) });
  if (sse.error || !sse.result?.sessionId) {
    check(`p${paper} create`, false, sse.error || "no sessionId in stream");
    return null;
  }
  check(`p${paper} create`, true, sse.result.sessionId);
  return sse.result.sessionId;
}

async function dbSession(sessionId) {
  const rows = await sql`SELECT * FROM live_tasting_sessions WHERE id = ${sessionId}`;
  return rows[0] ?? null;
}

async function dbWines(questionId) {
  const rows = await sql`SELECT question_text, wines, model_answer, scope, invalid_reasons FROM generated_questions WHERE question_id = ${questionId}`;
  const q = rows[0];
  if (!q) return null;
  return { ...q, wines: typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines };
}

function fold(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

async function runSession(paper, label) {
  const sessionId = await createSession(paper);
  if (!sessionId) return null;
  const session = await dbSession(sessionId);
  const q = await dbWines(session.question_id);

  // 1. Invariants the pipeline promised. The key is awaited at create time; the model answer
  // and audit land ASYNC (awaitKeyOnly) — poll up to 3 minutes before judging them missing.
  check(`${label}: question scope`, q?.scope === "live-tasting", `scope=${q?.scope}`);
  const keyRows = await sql`SELECT validated FROM stem_answer_keys WHERE question_id = ${session.question_id}`;
  check(`${label}: key exists+validated`, keyRows[0]?.validated === true);
  let qFresh = q;
  for (let i = 0; i < 18 && (qFresh?.model_answer?.length ?? 0) <= 100; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    qFresh = await dbWines(session.question_id);
  }
  check(`${label}: model answer lands (async)`, (qFresh?.model_answer?.length ?? 0) > 100);
  check(
    `${label}: not quarantined (post-audit)`,
    qFresh && qFresh.invalid_reasons == null,
    qFresh?.invalid_reasons ? JSON.stringify(qFresh.invalid_reasons).slice(0, 400) : ""
  );

  // 2. Redaction probe on the pre-reveal payload.
  const detailRes = await api(`/api/live-tasting/${sessionId}`);
  const detail = await detailRes.json();
  const payload = fold(JSON.stringify(detail));
  const leaks = [];
  for (const w of q.wines) {
    const producer = fold(w.fullText.split(",")[0]).replace(/[^a-z ]/g, " ").trim().split(/\s+/)
      .filter((t) => t.length >= 4);
    for (const tok of producer) if (payload.includes(tok)) leaks.push(tok);
  }
  check(`${label}: pre-reveal redaction`, leaks.length === 0 && !detail.reveal, leaks.join(",") || "clean");
  check(`${label}: stem present pre-reveal`, (detail.question?.questionText?.length ?? 0) > 50);

  // 3. Partner share FIRST (so the badge order partner → self is observable).
  const shareRes = await api(`/api/live-tasting/${sessionId}/share`, { method: "POST" });
  const share = await shareRes.json();
  check(`${label}: share mint`, shareRes.ok && share.url?.includes("/shop/"));
  if (share.url) {
    const shopRes = await fetch(share.url, { headers: { cookie: "" } }); // no auth
    const shopHtml = await shopRes.text();
    const firstProducer = fold(q.wines[0].fullText.split(",")[0]);
    check(`${label}: shop page serves wines no-auth`, shopRes.ok && fold(shopHtml).includes(firstProducer.split(" ")[0]));
    check(`${label}: shop page hides the question`, !fold(shopHtml).includes(fold(q.question_text.slice(0, 60))));
    const after = await api(`/api/live-tasting/${sessionId}`).then((r) => r.json());
    check(`${label}: badge=partner after token use`, after.blindIntegrity === "partner", after.blindIntegrity);
  }

  // 4. Self-reveal → stockists + downgrade.
  const shopListRes = await api(`/api/live-tasting/${sessionId}/shopping`, { method: "POST" });
  const shopList = await shopListRes.json();
  const slots = shopList.availability?.slots ?? [];
  check(`${label}: reveal returns slots`, slots.length === 2);
  check(`${label}: every slot has stockists`, slots.every((s) => (s.stockists?.length ?? 0) >= 1));
  check(`${label}: wine-searcher fallback present`, slots.every((s) => s.stockists?.some((x) => x.url?.includes("wine-searcher.com"))));
  const afterReveal = await api(`/api/live-tasting/${sessionId}`).then((r) => r.json());
  check(`${label}: badge downgrades to self`, afterReveal.blindIntegrity === "self", afterReveal.blindIntegrity);

  // 5. Link liveness — the feature's #1 credibility risk.
  let dead = [];
  for (const s of slots) {
    for (const st of (s.stockists ?? []).slice(0, 4)) {
      try {
        let r = await fetch(st.url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(12000) });
        if (r.status === 405 || r.status === 403) r = await fetch(st.url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(12000) });
        if (r.status === 404 || r.status >= 500) dead.push(`${st.url} (${r.status})`);
      } catch { dead.push(`${st.url} (unreachable)`); }
    }
  }
  check(`${label}: stockist links alive`, dead.length === 0, dead.slice(0, 3).join(" | ") || `all checked`);

  // 6. LLM judge — the audit no assertion can express.
  const judgeRaw = await llm(
    `You are auditing an auto-generated Master of Wine practice flight for a user in ${CITY}, ${COUNTRY} with a $${BUDGET}/bottle budget. Answer with one JSON object only:
{"archetype_coherent": true/false, "blind_safe": true/false, "stockists_plausible": true/false, "budget_sane": true/false, "notes": "one sentence per false verdict"}
- archetype_coherent: is this a coherent MW-style flight (a real pedagogical contrast, not an inventory accident)?
- blind_safe: judge the QUESTION STEM TEXT ALONE. The WINES list below is shown to YOU for context only — the candidate never sees it, so its producer names do NOT make the stem unsafe. Fail this ONLY if the stem text itself contains a producer or cuvée name.
- stockists_plausible: are these real merchants that plausibly serve that user (PLCB "Fine Wine & Good Spirits", Bucks County / Lambertville NJ / Philadelphia-area shops, national US mail order = plausible; a shop on another continent = not)?
- budget_sane: do the listed prices (where present) respect the budget? A slot marked overBudget:true was explicitly flagged to the user as "cheapest confirmed option, over budget" after affordable alternatives were exhausted — that honesty is SANE (pass), not a violation. Fail only an UNFLAGGED over-budget slot.`,
    `QUESTION STEM:\n${q.question_text}\n\nWINES:\n${q.wines.map((w) => `${w.slot}. ${w.fullText}`).join("\n")}\n\nSTOCKISTS:\n${JSON.stringify(slots.map((s) => ({ slot: s.slot, overBudget: !!s.overBudget, stockists: (s.stockists ?? []).map((x) => ({ name: x.name, kind: x.kind, price: x.price })) })), null, 1)}`
  );
  try {
    const judge = JSON.parse(judgeRaw.match(/\{[\s\S]*\}/)[0]);
    for (const k of ["archetype_coherent", "blind_safe", "stockists_plausible", "budget_sane"]) {
      check(`${label}: judge ${k}`, judge[k] === true, judge[k] === true ? "" : judge.notes);
    }
    judgeNotes.push(`${label}: ${judgeRaw.slice(0, 400)}`);
  } catch {
    warn(`${label}: judge parse`, "unparseable judge output");
  }

  return { sessionId, session, q, shareUrl: share.url };
}

async function gradeSession(ctx, answerStyle, label) {
  const { sessionId, q } = ctx;
  const answer = await llm(
    answerStyle === "good"
      ? `You are a competent MW candidate who tasted these exact wines blind and deduced them correctly. Write a realistic exam answer (500-700 words) to the question, per wine, matching the printed sub-questions: correct variety and origin with evidence-based funnelling, sound quality/maturity/commercial reasoning. Do not mention that you know the answer.`
      : `You are a struggling MW candidate. Write a plausible-sounding but WRONG exam answer (400-600 words): confidently misidentify each wine's variety AND origin (pick plausible but incorrect calls), with vague generic tasting notes, weak structure reasoning, and no funnelling. Stay realistic — no jokes.`,
    `QUESTION:\n${q.question_text}\n\nTHE ACTUAL WINES (for your information only):\n${q.wines.map((w) => `${w.slot}. ${w.fullText}`).join("\n")}`,
    2000
  );
  const res = await api(`/api/live-tasting/${sessionId}/grade`, {
    method: "POST",
    body: JSON.stringify({ userAnswer: answer, inputMethod: "typed" }),
  });
  if (!res.ok) {
    check(`${label}: grade`, false, `status ${res.status}`);
    return null;
  }
  const sse = await readSse(res);
  check(`${label}: grade stream completes`, !sse.error && (sse.enriched || sse.textDeltas).length > 200, sse.error || "");
  const after = await dbSession(sessionId);
  check(`${label}: graded_at stamped`, after.graded_at != null);
  const attempt = after.attempt_id
    ? (await sql`SELECT pass_estimate, marks_estimate, answer_feedback FROM user_attempts WHERE id = ${after.attempt_id}`)[0]
    : null;
  check(`${label}: feedback persisted server-side`, (attempt?.answer_feedback?.length ?? 0) > 200);
  const fb = attempt?.answer_feedback || "";
  const ri = fb.search(/result/i);
  const feedbackSnippet = ri >= 0 ? fb.slice(Math.max(0, ri - 20), ri + 120).replace(/
/g, " ") : fb.slice(0, 140).replace(/
/g, " ");
  return { pass: attempt?.pass_estimate ?? null, marks: attempt?.marks_estimate ?? null, feedbackSnippet };
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date();
  const paperArg = process.argv.indexOf("--paper");
  // Rotate papers across runs so every paper gets covered without tripling each run's spend.
  const week = Math.floor(Date.now() / (7 * 24 * 3600_000));
  const paper = paperArg > -1 ? Number(process.argv[paperArg + 1]) : (week % 3) + 1;
  console.log(`Live Tasting E2E vs ${BASE_URL} — paper ${paper}, market ${CITY}`);

  const userId = await seedUser();
  const pre = await cleanup(userId); // clear leftovers from a crashed prior run (also resets the daily rate limit)
  if (pre.sessions) console.log(`(cleaned up ${pre.sessions} leftover sessions)`);
  await login();

  let good = null, bad = null;
  const ctxA = await runSession(paper, "A");
  if (ctxA) {
    good = await gradeSession(ctxA, "good", "A/good");

    // One-shot semantics + share death, on the graded session.
    const again = await api(`/api/live-tasting/${ctxA.sessionId}/grade`, {
      method: "POST",
      body: JSON.stringify({ userAnswer: "second submit", inputMethod: "typed" }),
    });
    check("A: second grade rejected", again.status === 409, `status ${again.status}`);
    if (ctxA.shareUrl) {
      const deadShare = await fetch(ctxA.shareUrl);
      check("A: share page 404s after grading", deadShare.status === 404, `status ${deadShare.status}`);
    }
    const revealed = await api(`/api/live-tasting/${ctxA.sessionId}`).then((r) => r.json());
    check("A: post-grade payload reveals wines", (revealed.reveal?.wines?.length ?? 0) === 2);
  }

  const ctxB = await runSession(paper, "B");
  if (ctxB) bad = await gradeSession(ctxB, "bad", "B/bad");

  // Grading discrimination — the only regression test the grader itself has.
  if (good && bad) {
    const rank = (p) => ({ PASS: 2, BORDERLINE: 1, FAIL: 0 })[(p || "").toUpperCase()] ?? null;
    const g = rank(good.pass), b = rank(bad.pass);
    const num = (m) => { const x = (m || "").match(/\d+/); return x ? Number(x[0]) : null; };
    const gm = num(good.marks), bm = num(bad.marks);
    if (g != null && b != null && g !== b) {
      check("grading discriminates (verdict)", g > b, `good=${good.pass} bad=${bad.pass}`);
    } else if (gm != null && bm != null) {
      check("grading discriminates (marks)", gm > bm, `good=${gm} bad=${bm}`);
    } else {
      warn("grading discrimination", `unparseable estimates: good=${good.pass}/${good.marks} bad=${bad.pass}/${bad.marks}` +
        ` | good feedback around 'Result': ${(good.feedbackSnippet || "n/a")}`);
    }
  }

  const post = await cleanup(userId);
  check("cleanup", true, `${post.sessions} sessions, ${post.questions} questions removed; availability cache kept warm`);

  // Report.
  const failed = results.filter((r) => !r.ok);
  const date = startedAt.toISOString().slice(0, 10);
  const reportDir = join(REPO_ROOT, "outputs", "live_tasting_e2e");
  mkdirSync(reportDir, { recursive: true });
  const report = [
    `# Live Tasting E2E — ${date}`,
    ``,
    `- Target: ${BASE_URL}`,
    `- Paper: ${paper} · Market: ${CITY}, ${COUNTRY} · Budget: $${BUDGET}`,
    `- Result: **${failed.length === 0 ? "PASS" : `FAIL (${failed.length})`}** — ${results.length} checks`,
    ``,
    `| Check | Result | Detail |`,
    `|---|---|---|`,
    ...results.map((r) => `| ${r.name} | ${r.ok ? "✅" : "❌"} | ${(r.detail || "").replace(/\|/g, "/")} |`),
    ``,
    `## Judge notes`,
    ...judgeNotes.map((n) => `- ${n}`),
  ].join("\n");
  writeFileSync(join(reportDir, `${date}.md`), report);
  console.log(`\nReport: outputs/live_tasting_e2e/${date}.md`);
  console.log(failed.length === 0 ? "ALL CHECKS PASSED" : `${failed.length} CHECKS FAILED`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
