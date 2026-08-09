#!/usr/bin/env node
/**
 * hedge-variety-asks.mjs — retire the singular "Identify the grape variety" ask from any question
 * whose in-scope wines include a blend.
 *
 * The bin Mike kept hitting in review: a sub-part reads "a) Identify the grape variety. (10 marks)"
 * while one of the wines the part addresses is a Bordeaux blend, a Châteauneuf, a Rioja, a Champagne
 * or a Douro field blend. The singular asks the candidate for one grape and there isn't one. The IMW's
 * own wording for this case is the hedge — "grape variety or varieties", printed in the real papers as
 * "variety(ies)" (2018 P2 Q1) and "variety/ies" (2023 P3 Q1) — so the fix is to write what the exam
 * writes, not to invent a phrasing.
 *
 * Two rewrites, both onto real past-paper wordings:
 *   ASK   "Identify the grape variety"            → "Identify the grape variety or varieties"
 *   STEM  "the same single grape variety"         → "the same single, or predominant, grape variety"
 *         (four real stems use this exact hedge: 2015 P2 Q2, 2022 P2 Q5, 2025 P2 Q1 and Q3)
 *
 * SCOPING is the whole game. "For each wine 1-3: a) Identify the grape variety" over a flight whose
 * wine 4 is a blend is CORRECT — 2022 P2 Q1 is exactly that shape, and rewriting it would break a real
 * paper. So each lettered part is bound to the addressee line above it, that line's slot references are
 * parsed, and the blend test runs only over the slots the part actually addresses.
 *
 * Three things are deliberately left alone:
 *   - `hist_*` questions. They are verbatim IMW papers; `source/MW_Practical_Papers_Compilation.md` is
 *     authoritative and never paraphrased. Any hist row that trips the check is REPORTED, not edited.
 *   - Qualified asks — "the principal/predominant/primary/dominant grape variety". Those already
 *     concede the blend and are a real exam ask ("Name the dominant grape variety", 2017 P3 Q4).
 *   - Asks already hedged in any of the corpus's four spellings.
 *
 * Usage:
 *   node scripts/hedge-variety-asks.mjs            # dry run, writes a report, changes nothing
 *   node scripts/hedge-variety-asks.mjs --apply    # writes the changes
 *   node scripts/hedge-variety-asks.mjs --all      # include non-servable (binned/retired) rows too
 */

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";
import { RED_GRAPE_INDICATORS, WHITE_GRAPE_INDICATORS } from "../src/lib/question-rules.mjs";

const APPLY = process.argv.includes("--apply");
const ALL = process.argv.includes("--all");

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  for (const f of [".env.local", ".env"]) {
    const p = path.resolve(process.cwd(), f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set (looked in env, .env.local, .env)");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

// ── Blend detection ────────────────────────────────────────────────────────────────────────────────

const norm = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Appellations that are multi-variety by convention. Used ONLY as a fallback for slots the answer key
 * could not resolve — a keyed slot is judged on its keyed varieties, never on its label, so a keyed
 * monovarietal from a blending region (a 100% Syrah Côtes du Rhône) is not dragged in by its address.
 * The first five are the validator's own MULTI_VARIETY_APPELLATIONS (question-validator.ts); the rest
 * extend it with categories that are mandatory blends or near-universally blended.
 */
const BLEND_APPELLATIONS = [
  { name: "Châteauneuf-du-Pape", re: /chateauneuf[- ]du[- ]pape/ },
  { name: "Port", re: /\bport\b(?!\s*phillip)|\bporto\b/ },
  { name: "Rioja", re: /\brioja\b/ },
  { name: "Bordeaux", re: /\bbordeaux\b|\bmedoc\b|\bmargaux\b|\bpauillac\b|saint[- ]julien|saint[- ]estephe|pessac|\bgraves\b|saint[- ]emilion|\bpomerol\b|\bsauternes\b|\bbarsac\b/ },
  { name: "Chianti", re: /\bchianti\b/ },
  { name: "Champagne", re: /\bchampagne\b/ },
  { name: "Cava", re: /\bcava\b/ },
  { name: "Douro", re: /\bdouro\b/ },
  { name: "Southern Rhône", re: /cotes du rhone|gigondas|vacqueyras|\brasteau\b|\blirac\b|\btavel\b/ },
  { name: "Valpolicella / Amarone", re: /valpolicella|amarone|\bripasso\b|recioto/ },
  { name: "Priorat / Montsant", re: /\bpriorat\b|\bmontsant\b/ },
  { name: "Languedoc blend", re: /\bcorbieres\b|\bminervois\b|\bfaugeres\b|\bfitou\b|pic saint[- ]loup|\bbandol\b/ },
  { name: "Provence rosé blend", re: /cotes de provence|\bprovence\b/ },
  { name: "Madeira", re: /\bmadeira\b/ },
  { name: "Vin Santo", re: /vin santo/ },
  { name: "Ribera del Duero", re: /ribera del duero/ },
];

/**
 * A VARIETAL LABEL overrides the appellation fallback. "Domaine de la Mordorée, Rasteau Grenache Noir"
 * sits in a blending appellation but the label names one grape, and hedging it would contradict a
 * perfectly true "same single grape variety" stem next to a Navarra Garnacha. The exemption applies to
 * the appellation fallback ONLY — a slot the answer key calls a blend stays a blend.
 */
function labelNamesOneGrape(fullText) {
  const t = norm(fullText);
  const hits = new Set();
  for (const re of [RED_GRAPE_INDICATORS, WHITE_GRAPE_INDICATORS]) {
    const g = new RegExp(re.source, "gi");
    let m;
    while ((m = g.exec(t)) !== null) hits.add(m[0].replace(/\s+/g, " "));
  }
  return hits.size === 1;
}

/** Why this slot reads as a blend, or null. Keyed varieties win; the label is the fallback. */
function blendReason(keyed, fullText) {
  if (keyed) {
    if (keyed.is_blend === true) return "keyed as a blend";
    if ((keyed.varieties?.length || 0) >= 2)
      return `keyed varieties: ${keyed.varieties.join("/")}`;
    // A key that resolved a single variety is TRUSTED — do not second-guess it from the label.
    if ((keyed.varieties?.length || 0) === 1) return null;
  }
  if (labelNamesOneGrape(fullText)) return null;
  const hay = norm(fullText);
  const hit = BLEND_APPELLATIONS.find((a) => a.re.test(hay));
  return hit ? `${hit.name} is a multi-variety appellation` : null;
}

// ── Part scoping ───────────────────────────────────────────────────────────────────────────────────

const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

/** An addressee line: "For each wine:", "For wines 1-3:", "For both wines:", "With reference to…". */
function isAddressee(line) {
  return /^\s*(?:for\b|with reference to\b|considering\b|in respect of\b)[^\n]*:\s*$/i.test(line);
}

/**
 * The slots an addressee line addresses, or null for "all of them". Handles the three forms the corpus
 * uses: a range ("wines 1-3"), a list ("wines 1, 2 and 4" / "wines 1 and 2") and a singleton ("wine 4").
 */
function slotsInAddressee(line, allSlots) {
  const l = line.toLowerCase();
  const range = l.match(/wines?\s*(\d+)\s*(?:-|–|—|\s+to\s+)\s*(\d+)/);
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
    return allSlots.filter((s) => s >= a && s <= b);
  }
  const listMatch = l.match(/wines?\s*((?:\d+\s*(?:,|and|&)\s*)+\d+)/);
  if (listMatch) {
    const nums = (listMatch[1].match(/\d+/g) || []).map(Number);
    return allSlots.filter((s) => nums.includes(s));
  }
  const single = l.match(/\bwine\s+(\d+)\b/);
  if (single) return allSlots.filter((s) => s === Number(single[1]));
  // "For both wines" / "For all four wines" / "For each wine" — the whole flight.
  return null;
}

/** Split a question into { addresseeSlots, startIndex, endIndex } spans, one per lettered sub-part. */
function partSpans(text, allSlots) {
  const spans = [];
  let scope = null; // null = whole flight
  let offset = 0;
  let current = null;
  for (const line of text.split("\n")) {
    const start = offset;
    offset += line.length + 1;
    if (isAddressee(line)) {
      if (current) {
        current.end = start;
        spans.push(current);
        current = null;
      }
      scope = slotsInAddressee(line, allSlots);
      continue;
    }
    if (/^\s*[a-z]\)\s*/.test(line)) {
      if (current) {
        current.end = start;
        spans.push(current);
      }
      current = { start, end: offset, slots: scope };
      continue;
    }
    if (current) current.end = offset;
  }
  if (current) spans.push(current);
  return spans;
}

// ── The rewrite ────────────────────────────────────────────────────────────────────────────────────

const COMMAND_RE = /\b(?:identif|nam(?:e|ing)|stat(?:e|ing)|specif)/i;
/** Qualifiers that already concede a blend, plus stem words that are not an ask. */
const QUALIFIED_RE = /\b(?:single|same|principal|predominant|predominantly|primary|main|dominant|common|shared|that|this|each|its|the same)\s+(?:grape\s+)?$/i;
/** Already hedged, in any of the corpus's spellings. */
const HEDGED_AHEAD_RE = /^\s*(?:\(?(?:or|and)\s+varieties|\(ies\)|\/ies|\(s\))/i;

/**
 * Rewrite the unhedged singular variety ask inside one sub-part. Returns the new text (or the original).
 * Only fires when the part carries an identification command, so "…considering reasons for not blending
 * the variety used for this wine" (2022 P2 Q1b) is untouched.
 */
function hedgePart(partText) {
  if (!COMMAND_RE.test(partText)) return partText;
  let out = "";
  let last = 0;
  const re = /\b(grape\s+)?variety\b/gi;
  let m;
  while ((m = re.exec(partText)) !== null) {
    const before = partText.slice(0, m.index);
    const after = partText.slice(m.index + m[0].length);
    // The command must come BEFORE the word — "Identify the grape variety", not "…blending the variety".
    if (!COMMAND_RE.test(before)) continue;
    if (QUALIFIED_RE.test(before)) continue;
    if (HEDGED_AHEAD_RE.test(after)) continue;
    out += partText.slice(last, m.index + m[0].length) + " or varieties";
    last = m.index + m[0].length;
  }
  return out ? out + partText.slice(last) : partText;
}

/**
 * The preamble hedge: a bare "single grape variety" CLAIM standing over a blend. Both replacements are
 * the exam's own hedge — 2025 P2 Q1 prints "the same single grape variety or predominant grape variety"
 * over a Grenache/Syrah/Carignan blend. A stem that already says "predominantly … grape variety" has
 * conceded the point and is left alone.
 */
function hedgeStem(preamble) {
  if (/\bpredominant/i.test(preamble)) return preamble;
  return preamble
    .replace(/\bthe same single grape variety\b/gi, "the same single, or predominant, grape variety")
    .replace(
      /\ba different,?\s+single grape variety\b/gi,
      "a different, single or predominant, grape variety"
    );
}

/**
 * Apply both rewrites to one printed question. `blendSlots` is the set of slots that read as blends.
 * Returns { text, askParts: string[], stemChanged: boolean }.
 */
function rewriteQuestion(text, allSlots, blendSlots) {
  const spans = partSpans(text, allSlots);
  const edits = [];
  const askParts = [];
  for (const span of spans) {
    const inScope = span.slots === null ? allSlots : span.slots;
    if (!inScope.some((s) => blendSlots.has(s))) continue;
    const before = text.slice(span.start, span.end);
    const after = hedgePart(before);
    if (after !== before) {
      edits.push({ start: span.start, end: span.end, after });
      askParts.push(before.trim().split("\n")[0]);
    }
  }
  let out = text;
  for (const e of edits.slice().reverse()) out = out.slice(0, e.start) + e.after + out.slice(e.end);

  // The stem hedge applies to the preamble only — everything before the first addressee/lettered line.
  const firstPart = spans.length ? spans[0].start : out.length;
  const preambleEnd = out.slice(0, firstPart).search(/\n\s*(?:for\b|with reference to\b)[^\n]*:\s*$/im);
  const cut = preambleEnd >= 0 ? preambleEnd : firstPart;
  const head = out.slice(0, cut);
  // A "same single grape variety" stem is only wrong if a blend sits in the flight it describes.
  const headNew = blendSlots.size > 0 ? hedgeStem(head) : head;
  const stemChanged = headNew !== head;
  if (stemChanged) out = headNew + out.slice(cut);

  return { text: out, askParts, stemChanged };
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────────────

const servableClause = ALL
  ? ""
  : `AND g.review_state = 'kept' AND g.is_retired IS NOT TRUE AND g.invalid_reasons IS NULL`;

const rows = await sql.query(`
  SELECT g.question_id, g.paper, g.family, g.scope, g.review_state, g.is_retired,
         (g.invalid_reasons IS NOT NULL) AS invalid,
         g.question_text, g.stem_guided, g.stem_exam_real, g.stem_blind,
         g.wines, k.ground_truth
  FROM generated_questions g
  LEFT JOIN stem_answer_keys k USING (question_id)
  WHERE g.question_text ~* 'variety'
  ${servableClause}
  ORDER BY g.paper, g.question_id
`);

const changes = [];
const histFlags = [];

for (const r of rows) {
  const wines = Array.isArray(r.wines) ? r.wines : [];
  if (!wines.length) continue;
  const allSlots = wines.map((w) => Number(w.slot)).filter(Number.isFinite).sort((a, b) => a - b);
  const keyBySlot = new Map();
  for (const g of Array.isArray(r.ground_truth) ? r.ground_truth : [])
    if (g && typeof g.slot === "number") keyBySlot.set(g.slot, g);

  const blendSlots = new Set();
  const why = [];
  for (const w of wines) {
    const slot = Number(w.slot);
    const reason = blendReason(keyBySlot.get(slot), w.fullText || "");
    if (reason) {
      blendSlots.add(slot);
      why.push(`wine ${slot}: ${reason}`);
    }
  }
  if (!blendSlots.size) continue;

  const cols = {};
  let askParts = [];
  let stemChanged = false;
  for (const col of ["question_text", "stem_guided", "stem_exam_real", "stem_blind"]) {
    const src = r[col];
    if (!src) continue;
    const res = rewriteQuestion(src, allSlots, blendSlots);
    if (res.text !== src) {
      cols[col] = res.text;
      if (col === "question_text") {
        askParts = res.askParts;
        stemChanged = res.stemChanged;
      } else if (!askParts.length) {
        askParts = res.askParts;
        stemChanged = stemChanged || res.stemChanged;
      }
    }
  }
  if (!Object.keys(cols).length) continue;

  const record = {
    question_id: r.question_id,
    paper: r.paper,
    family: r.family,
    servable: r.review_state === "kept" && !r.is_retired && !r.invalid && r.scope === "pool",
    blend_evidence: why,
    ask_parts: askParts,
    stem_hedged: stemChanged,
    columns: Object.keys(cols),
    before: r.question_text,
    after: cols.question_text || r.question_text,
    _cols: cols,
  };

  if (r.question_id.startsWith("hist_")) histFlags.push(record);
  else changes.push(record);
}

const stamp = new Date().toISOString().slice(0, 10);
const reportDir = path.resolve(process.cwd(), "..", "outputs", "question_fixes");
fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, `variety-hedge-${stamp}.md`);

const lines = [
  `# Singular variety ask over a blended flight — ${APPLY ? "applied" : "dry run"} ${stamp}`,
  "",
  `Scanned **${rows.length}** questions${ALL ? " (all rows)" : " (servable rows only)"}.`,
  `Generated questions rewritten: **${changes.length}** (${changes.filter((c) => c.servable).length} servable).`,
  `Historical (\`hist_*\`) questions flagged but NOT edited: **${histFlags.length}**.`,
  "",
];
for (const c of changes) {
  lines.push(`## ${c.question_id} — P${c.paper} ${c.family}${c.servable ? "" : " *(not servable)*"}`);
  lines.push(`- blend evidence: ${c.blend_evidence.join("; ")}`);
  if (c.ask_parts.length) lines.push(`- ask rewritten: ${c.ask_parts.map((p) => `\`${p}\``).join(", ")}`);
  if (c.stem_hedged) lines.push(`- stem hedged to "same single, or predominant, grape variety"`);
  lines.push(`- columns: ${c.columns.join(", ")}`);
  lines.push("", "```diff", ...diffLines(c.before, c.after), "```", "");
}
if (histFlags.length) {
  lines.push("## Historical questions flagged (verbatim IMW text — left alone)", "");
  for (const h of histFlags) {
    lines.push(`- \`${h.question_id}\` — ${h.ask_parts.join(" / ") || "(stem only)"} — ${h.blend_evidence.join("; ")}`);
  }
}

function diffLines(a, b) {
  const A = a.split("\n");
  const B = b.split("\n");
  const out = [];
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if (A[i] === B[i]) continue;
    if (A[i] !== undefined) out.push(`- ${A[i]}`);
    if (B[i] !== undefined) out.push(`+ ${B[i]}`);
  }
  return out;
}

fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
console.log(`report → ${reportPath}`);
console.log(
  `${changes.length} generated question(s) to rewrite (${changes.filter((c) => c.servable).length} servable); ${histFlags.length} hist_* flagged, untouched.`
);

if (!APPLY) {
  console.log("dry run — nothing written. Re-run with --apply.");
  process.exit(0);
}

let n = 0;
for (const c of changes) {
  const cols = c._cols;
  await sql.query(
    `UPDATE generated_questions SET
       question_text  = COALESCE($2, question_text),
       stem_guided    = COALESCE($3, stem_guided),
       stem_exam_real = COALESCE($4, stem_exam_real),
       stem_blind     = COALESCE($5, stem_blind)
     WHERE question_id = $1`,
    [
      c.question_id,
      cols.question_text ?? null,
      cols.stem_guided ?? null,
      cols.stem_exam_real ?? null,
      cols.stem_blind ?? null,
    ]
  );
  n++;
}
console.log(`applied to ${n} question(s).`);
