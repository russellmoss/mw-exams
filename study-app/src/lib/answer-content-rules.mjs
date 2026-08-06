// answer-content-rules.mjs — content validation of a MODEL ANSWER against its question + answer key.
//
// The model answer had exactly one gate before this file: word count (lib/answer-length.ts). Nothing
// checked that the prose actually answers the question — an exemplar could discuss three of four
// wines (the max_tokens truncation failure loses the TAIL, silently), never name a wine's actual
// grape or origin, or carry "Source needed" placeholders, and it still served. Those are precisely
// the defects a candidate notices instantly and loses trust over.
//
// Same architecture as question-rules.mjs (and imports its normalizers): deterministic, key-stage,
// plain .mjs so the node-invoked audit script and the TS app share one copy. Severity contract
// matches the question rules — "hard" means the answer is broken as an exemplar (quarantine-worthy);
// "soft" is review-pane visibility only.
//
// Matching philosophy: an exemplar is written WITH the identities known, so the correct variety and
// origin should appear somewhere in the prose. The checks test for ABSENCE of the right answer, never
// for presence of wrong ones — funnelling ("Gamay was considered and rejected") legitimately names
// many wrong varieties, so presence proves nothing.

import { norm, normStem, canonVariety, canonCountry, VARIETY_SYNONYMS } from "./question-rules.mjs";

// ── Body extraction ────────────────────────────────────────────────────────────────────────────────

// Strip the parts of a stored model_answer that are not answer prose: YAML frontmatter (the mock-
// answer format opens with `---\nyear: ...`), and the "**Sources consulted**" citation block that
// buildCitationBlock appends after generation. Both would defeat the checks — the frontmatter can
// name the wines ("wines: [1, 2]") and the citations always end in a well-formed line, masking a
// truncated answer.
export function answerBody(answerText) {
  let body = (answerText || "").toString();
  body = body.replace(/^﻿?\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const cite = body.search(/\n\s*\*{0,2}Sources consulted\*{0,2}/i);
  if (cite >= 0) body = body.slice(0, cite);
  // Drop a trailing horizontal rule left behind once the citation block is gone.
  body = body.replace(/\n\s*-{3,}\s*$/g, "");
  return body.trim();
}

const countWords = (body) =>
  body
    // Headers and bold wine labels are structure, not prose — same reasoning as countAnswerBodyWords.
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

// ── Wine-number coverage ───────────────────────────────────────────────────────────────────────────

// Which wine slots does the prose reference? Handles "Wine 3", "Wines 1-4" / "Wines 1–4" /
// "wines 1 to 4" (ranges), "Wines 1 and 2" / "wines 2, 3" (pairs), and collective forms
// ("both wines", "all four wines", "the two wines") which count as every slot.
export function mentionedWineSlots(body, wineCount) {
  const text = norm(body);
  const slots = new Set();
  if (/\b(?:both|all(?: \w+)?|the (?:two|three|four|five|six)) wines\b/.test(text)) {
    for (let i = 1; i <= wineCount; i++) slots.add(i);
  }
  const re = /\bwines?\s*#?\s*(\d{1,2})(?:\s*(?:(-|to|through)|and|,|&)\s*(\d{1,2}))?/g;
  for (const m of text.matchAll(re)) {
    const a = Number(m[1]);
    const b = m[3] ? Number(m[3]) : null;
    if (a >= 1 && a <= 12) slots.add(a);
    if (b !== null && b >= 1 && b <= 12) {
      if (m[2] && b > a) for (let i = a; i <= b; i++) slots.add(i);
      else slots.add(b);
    }
  }
  return slots;
}

// ── Identity needles ───────────────────────────────────────────────────────────────────────────────

// Region words that carry no identity on their own — "Valley" must not make "Barossa Valley" match an
// answer that only says "Napa Valley".
const REGION_STOPWORDS = new Set([
  "valley", "hills", "hill", "coast", "coastal", "river", "mountains", "mountain", "island",
  "islands", "county", "region", "district", "zone", "area", "upper", "lower", "north", "south",
  "east", "west", "central", "grand", "premier", "cru", "village", "villages", "appellation",
  "the", "and", "of", "de", "del", "della", "di", "da", "do", "la", "le", "les", "el", "los",
  "aoc", "aop", "doc", "docg", "doca", "dop", "igt", "igp", "ava", "gi", "pdo", "pgi", "wo",
]);

const regionTokens = (region) =>
  norm(region)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !REGION_STOPWORDS.has(t));

// Reverse synonym index: canonical grape -> every label that means it. "Pinot Noir" in the key must
// match an answer that says "Spätburgunder", and vice versa.
let _synonymsByCanon = null;
function synonymsByCanon() {
  if (_synonymsByCanon) return _synonymsByCanon;
  _synonymsByCanon = new Map();
  for (const [label, canon] of Object.entries(VARIETY_SYNONYMS)) {
    if (!_synonymsByCanon.has(canon)) _synonymsByCanon.set(canon, []);
    _synonymsByCanon.get(canon).push(label);
  }
  return _synonymsByCanon;
}

function varietyNeedles(varieties) {
  const needles = new Set();
  for (const v of varieties || []) {
    const canon = canonVariety(v);
    if (!canon || canon === "unknown") continue;
    needles.add(canon);
    needles.add(norm(v));
    for (const syn of synonymsByCanon().get(canon) || []) needles.add(syn);
  }
  needles.delete("");
  return [...needles];
}

function originNeedles(region, country) {
  const needles = new Set(regionTokens(region));
  const c = norm(country);
  if (c) {
    needles.add(c);
    needles.add(canonCountry(c));
    if (canonCountry(c) === "usa") {
      needles.add("united states");
      needles.add("america");
    }
  }
  needles.delete("");
  return [...needles];
}

// ── What does the stem actually ask? ───────────────────────────────────────────────────────────────
//
// Some MW stems deliberately direct the candidate AWAY from identification ("Identify the method of
// production…; comment on style, quality and commercial position") — for those, an exemplar that
// never names the grape or origin is CORRECT, and the identity checks must not fire. Calibration
// caught exactly this: a Nyetimber + Prosecco method-of-production flight hard-flagged because the
// answer (rightly) argued traditional method vs Charmat instead of naming West Sussex and Glera.
// The asking-verbs matter: that stem contains "identify", but of the METHOD, not the wine.

const askedForVariety = (stem) =>
  /grape variet|identify the (?:grape|variet)|what (?:is|are) (?:the|these|each) wines?\b|identify (?:the|each|these|both|all \w+) wines?\b/.test(stem);

const askedForOrigin = (stem) =>
  /region of origin|country of origin|place of origin|origin as closely|identify the (?:region|country|origin|appellation)|countr(?:y|ies) and region|what (?:is|are) (?:the|these|each) wines?\b|identify (?:the|each|these|both|all \w+) wines?\b/.test(stem);

// ── Placeholder / role-play tells ──────────────────────────────────────────────────────────────────

// Each is impossible in a finished exemplar. "I'll load the necessary files" + fabricated function-
// call blocks are the documented 29,000-character failure (see model-answer-prompt.ts); "Source
// needed" / TBD are the unresolved-research defect class from the mock-answer corpus regeneration.
const PLACEHOLDER_MARKERS = [
  { re: /source needed/i, why: '"Source needed" placeholder' },
  { re: /\btbd\b/i, why: "a TBD placeholder" },
  { re: /\[(?:insert|todo|placeholder)/i, why: "an [insert/TODO] placeholder" },
  { re: /<function_calls>|<antml/i, why: "a fabricated tool-call block" },
  { re: /\bi(?:'|’| wi)ll load\b/i, why: 'tool role-play ("I\'ll load…")' },
];

// ── The rules ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Validate a model answer's CONTENT against the question and the resolved answer key.
 * @param {{ questionText: string, answerText: string,
 *           wines: Array<{ slot: number, varieties?: string[], region?: string, country?: string,
 *                          is_blend?: boolean }> }} input
 * @returns {Array<{ rule: string, severity: "hard"|"soft", detail: string }>}
 * Returns [] when there is no answer to validate — a missing answer is the serve layer's concern
 * (getUnansweredQuestions already requires one), not a defect of the answer.
 */
export function applyAnswerContentRules({ questionText, answerText, wines }) {
  const v = [];
  const body = answerBody(answerText);
  if (!body) return v;
  const wineList = wines || [];
  const textNorm = norm(body);

  // AC1 — length floor (hard). The smallest real flight is 2 wines = 50 marks, whose mark-
  // proportional band bottoms out around 225 words; under 100 words of prose is not an answer to any
  // question in this corpus, whatever the length gate stamped.
  const words = countWords(body);
  if (words < 100)
    v.push({
      rule: "answer-too-short",
      severity: "hard",
      detail: `model answer body is ${words} words — below any plausible band for a ${wineList.length}-wine flight`,
    });

  // AC2 — wine coverage. The known truncation mode loses the TAIL: "Wine 4" vanishes while 1-3
  // survive, and the candidate reads a confident answer that silently ignores a wine they tasted.
  // Partial coverage (some slots referenced, others never) is that signature -> hard. ZERO wine-number
  // references in a multi-wine flight just means the answer is organised thematically -> soft.
  if (wineList.length >= 2) {
    const mentioned = mentionedWineSlots(body, wineList.length);
    if (mentioned.size > 0) {
      const missing = wineList.map((w) => w.slot).filter((s) => !mentioned.has(s));
      if (missing.length > 0)
        v.push({
          rule: "answer-missing-wine",
          severity: "hard",
          detail: `model answer references some wines but never Wine ${missing.join(", Wine ")} — the tail of the answer is likely truncated`,
        });
    } else {
      v.push({
        rule: "answer-no-wine-structure",
        severity: "soft",
        detail: "multi-wine flight but the model answer never references any wine by number",
      });
    }
  }

  // AC3/AC4 — identity. The exemplar knows the identities; when the stem ASKS for them, the correct
  // call must be in the prose. Gated per side on what the stem asks — a method/style-only stem
  // legitimately produces an answer that names neither grape nor origin.
  const stem = normStem(questionText || "");
  const wantVariety = askedForVariety(stem);
  const wantOrigin = askedForOrigin(stem);
  for (const w of wineList) {
    if (!wantVariety && !wantOrigin) break;
    const vNeedles = wantVariety ? varietyNeedles(w.varieties) : [];
    const oNeedles = wantOrigin ? originNeedles(w.region, w.country) : [];
    const varietyHit = vNeedles.some((n) => textNorm.includes(n));
    const originHit = oNeedles.some((n) => textNorm.includes(n));

    // AC3 (hard): NEITHER the grape NOR the origin ever appears though the stem asked — the answer
    // never identifies this wine at all. Skipped when the key gave us nothing to look for.
    if (vNeedles.length + oNeedles.length > 0 && !varietyHit && !originHit)
      v.push({
        rule: "answer-misses-identity",
        severity: "hard",
        detail: `model answer never names Wine ${w.slot}'s variety (${(w.varieties || []).join("/") || "?"}) OR its origin (${[w.region, w.country].filter(Boolean).join(", ") || "?"})`,
      });
    // AC4 (soft): one asked-for side present, the other absent. A blend is exempt on the variety
    // side — a Port or Champagne exemplar may legitimately argue from the appellation without
    // listing grapes.
    else if (vNeedles.length > 0 && !varietyHit && !w.is_blend)
      v.push({
        rule: "answer-identity-partial",
        severity: "soft",
        detail: `model answer names Wine ${w.slot}'s origin but never its variety (${(w.varieties || []).join("/")})`,
      });
    else if (oNeedles.length > 0 && !originHit && (varietyHit || !wantVariety))
      v.push({
        rule: "answer-identity-partial",
        severity: "soft",
        detail: `model answer names Wine ${w.slot}'s variety but never its origin (${[w.region, w.country].filter(Boolean).join(", ")})`,
      });
  }

  // AC5 — sub-part coverage (soft). Stems letter their sub-questions ("a) Identify…") and most
  // generated answers heading-match them ("## a) Grape Variety"). Same partial-signature logic as
  // AC2: SOME letters present with others absent means a lettered answer skipped a sub-part (or
  // truncated mid-package) -> flag. ZERO letters means the answer is organised without letter labels
  // (per-wine headings) — structure variance, not missing content; calibration showed that pattern
  // on ~15% of the bank, all of them otherwise-fine answers, so it must not flag.
  const stemLetters = [...new Set([...(questionText || "").matchAll(/(?:^|\n)\s*\(?([a-f])\)\s+/g)].map((m) => m[1]))];
  if (stemLetters.length >= 2) {
    const hasLetter = (letter) =>
      new RegExp(`(?:^|\\n)[#*\\s>]*\\(?${letter}\\)|\\(${letter}\\)`, "i").test(body);
    const missingLetters = stemLetters.filter((l) => !hasLetter(l));
    if (missingLetters.length > 0 && missingLetters.length < stemLetters.length)
      v.push({
        rule: "answer-subpart-coverage",
        severity: "soft",
        detail: `stem has sub-parts ${stemLetters.map((l) => `${l})`).join(" ")} but the model answer never addresses ${missingLetters.map((l) => `${l})`).join(", ")}`,
      });
  }

  // AC6 — placeholders / tool role-play (hard). Impossible in a finished exemplar; see markers.
  for (const m of PLACEHOLDER_MARKERS) {
    if (m.re.test(body)) {
      v.push({ rule: "answer-placeholder", severity: "hard", detail: `model answer contains ${m.why}` });
      break;
    }
  }

  // AC7 — truncated ending (soft). After the citation block is stripped, a finished answer ends on
  // sentence punctuation (or a closing emphasis/paren). Ending on a bare word or comma is the
  // max_tokens cut. Soft because lists and stylistic fragments exist; AC2 carries the hard signal.
  const lines = body.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const last = lines[lines.length - 1]?.trim() ?? "";
  if (last && !/^#/.test(last) && !/[.!?…:)\]"'*—–-]$/.test(last))
    v.push({
      rule: "answer-truncated",
      severity: "soft",
      detail: `model answer ends mid-sentence: "…${last.slice(-60)}"`,
    });

  return v;
}
