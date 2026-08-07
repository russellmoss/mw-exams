// remediate-questions.mjs — Phase D: replace quarantined questions with valid regenerations.
//
// Selector (see main()): stem_answer_keys.validated=false, OR generated_questions.invalid_reasons,
// OR a wines[] entry that holds the generator's reasoning instead of a wine reference.
//
// For every quarantined question, regenerate a
// fresh question for the SAME paper×family through the hardened generation pipeline, gate it on the
// ACCURATE validator (question-validator.ts against the resolved answer key) AND the key builder's
// §2b validation, retry until valid, build its model answer, then archive the old row so it leaves
// the live pool. This fully closes CF-1: the 6 invalid questions are replaced by valid ones.
//
// Run FROM study-app/, THROUGH the ts-loader — this script imports .ts modules whose own imports are
// extensionless, which plain `node` cannot resolve (it dies on prompts/funnelling before doing any
// work). The header used to say plain `node` and that invocation has never worked from here:
//
//   node --import ./scripts/ts-loader.mjs scripts/remediate-questions.mjs           (dry run)
//   node --import ./scripts/ts-loader.mjs scripts/remediate-questions.mjs --apply   (commit)
//   ... --limit=N   cap the number of questions remediated (smoke-test a couple first)
//
// Note a dry run still SPENDS: it regenerates and verifies, it just doesn't commit or archive.
//
// Reads DATABASE_URL + ANTHROPIC_API_KEY from env or .env.local, plus TAVILY_API_KEY (wine
// enrichment) and VOYAGE_API_KEY (the model answer's knowledge context — fails soft without it).

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { neon } from "@neondatabase/serverless";
import Anthropic from "@anthropic-ai/sdk";

// --- env bootstrap (imported libs read process.env.DATABASE_URL / ANTHROPIC_API_KEY) ---
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = (() => {
  try { return readFileSync(join(ROOT, ".env.local"), "utf8"); } catch { return ""; }
})();
const envVal = (k) =>
  process.env[k] || (ENV.match(new RegExp(k + '\\s*=\\s*"?([^"\\n\\r]+)"?'))?.[1]?.trim() ?? "");
process.env.DATABASE_URL = envVal("DATABASE_URL");
process.env.ANTHROPIC_API_KEY = envVal("ANTHROPIC_API_KEY");
process.env.TAVILY_API_KEY = process.env.TAVILY_API_KEY || envVal("TAVILY_API_KEY");
const APIKEY = process.env.ANTHROPIC_API_KEY;
if (!process.env.DATABASE_URL || !APIKEY) {
  console.error("Missing DATABASE_URL or ANTHROPIC_API_KEY (env or .env.local).");
  process.exit(1);
}

const { buildQuestionGenerationPrompt } = await import("../src/lib/prompts/question-generation-prompt.ts");
const { buildModelAnswerPrompt, parseModelAnswerSections, modelAnswerMaxTokens, modelAnswerEffort } = await import("../src/lib/prompts/model-answer-prompt.ts");
const { enrichWineProfiles } = await import("../src/lib/wine-enrichment.ts");
const { saveGeneratedQuestion, getQuestionsByFilter, getRecentGeneratedQuestions } = await import("../src/lib/db.ts");
const { validateQuestion } = await import("../src/lib/question-validator.ts");
const { normalizeMarkAllocation } = await import("../src/lib/question-engine.ts");
const { getLatestOpus } = await import("../src/lib/model-resolver.ts");
const { buildKeyForRow, upsertKey } = await import("./build-stem-answer-keys.mjs");
const { checkWineReferenceShape } = await import("../src/lib/question-rules.mjs");

const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes("--apply");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || Infinity;
const MAX_ATTEMPTS = 6;

const FAMILY_LABELS = {
  F1: "Same Variety", F2: "Same Origin", F3: "Blend Logic", F4: "Mixed Breadth",
  F5: "Method / Production", F6: "Style Mechanism", F7: "Quality Hierarchy",
};

// --- parser (mirrors get-question/route.ts parseGeneratedQuestion) ---
function sanitizeSubcategory(value) {
  return value
    .replace(/^Subcategory:\s*/i, "")
    .replace(/\s*\((?:[^)]*(?:Italy|France|Spain|Portugal|Germany|Austria|Greece|Hungary|Australia|Argentina|Chile|Canada|California|United States|USA|South Africa|New Zealand)[^)]*)\)/gi, "")
    .replace(/\b(?:Italy|Italian|France|French|Spain|Spanish|Portugal|Portuguese|Germany|German|Austria|Austrian|Greece|Greek|Hungary|Hungarian|Australia|Australian|Argentina|Argentinian|Chile|Chilean|Canada|Canadian|California|Californian|United States|USA|South Africa|South African|New Zealand)\b/gi, "")
    .replace(/\s{2,}/g, " ").replace(/\s+([,;:])/g, "$1").replace(/[,\s]+$/g, "").trim();
}

function parseGenerated(text, paper, family) {
  try {
    const questionMatch = text.match(/## Question\s*\n([\s\S]*?)(?=\n## Wines|\n## Metadata)/i);
    let questionText = questionMatch ? questionMatch[1].trim() : "";
    const winesMatch = text.match(/## Wines\s*\n([\s\S]*?)(?=\n## Wine Appearance|\n## Metadata|\n## |$)/i);
    const wines = [];
    if (winesMatch) {
      for (const line of winesMatch[1].split("\n").filter((l) => /^\d+\./.test(l.trim()))) {
        const m = line.trim().match(/^(\d+)\.\s+(.*)/);
        if (m) wines.push({ slot: parseInt(m[1]), fullText: m[2].trim() });
      }
    }
    const appearanceMatch = text.match(/## Wine Appearance\s*\n([\s\S]*?)(?=\n## Metadata|\n## |$)/i);
    if (appearanceMatch) {
      for (const line of appearanceMatch[1].split("\n").filter((l) => /^\d+\./.test(l.trim()))) {
        const m = line.trim().match(/^(\d+)\.\s+(.*)/);
        if (m) { const w = wines.find((x) => x.slot === parseInt(m[1])); if (w) w.appearance = m[2].trim(); }
      }
    }
    const familyMatch = text.match(/Family:\s*(F\d)/i);
    const subcatMatch = text.match(/Subcategory:\s*(.*)/i);
    const parsedFamily = familyMatch ? familyMatch[1] : family;
    // Repair the mark allocation before totalling, exactly as the live engine does (EK-0041). This
    // parser is a mirror of the get-question route's, and it had drifted: without the repair the
    // model's mark arithmetic is rejected on nearly every attempt (an observed run burned all 6
    // retries emitting 40,40,40,40,40,90 against a target of 50), so remediation could never
    // converge for a reason that has nothing to do with the question's content.
    const repairedText = normalizeMarkAllocation(questionText, wines.length);
    questionText = repairedText;
    let totalMarks = 0;
    for (const m of repairedText.matchAll(/\((\d+)\s*[x×]\s*(\d+)\s*marks?\)/gi)) totalMarks += parseInt(m[1]) * parseInt(m[2]);
    for (const m of repairedText.matchAll(/\((\d+)\s*marks?\)/gi)) totalMarks += parseInt(m[1]);
    if (!totalMarks) totalMarks = wines.length * 25;
    if (!questionText || wines.length === 0) return null;
    // A slot holding the generator's reasoning ("… — wait, excluded. Let me correct.") rather than a
    // wine is not a lesser question, it is a broken one: enrichment would Tavily-search the paragraph
    // and bank it as a producer. Reject the whole draft so the retry loop tries again.
    for (const w of wines) {
      const shape = checkWineReferenceShape(w.fullText);
      if (!shape.ok) {
        console.warn(`    wine ${w.slot} is not a wine reference (${shape.problem})`);
        return null;
      }
    }
    const stemCountMatch = questionText.match(/wines\s+1\s+(?:to|–|-)\s+(\d+)/i);
    if (stemCountMatch && wines.length < parseInt(stemCountMatch[1])) return null;
    return {
      family: parsedFamily,
      familyLabel: FAMILY_LABELS[parsedFamily] || "Unknown",
      subcategory: sanitizeSubcategory(subcatMatch ? subcatMatch[1].trim() : ""),
      questionText, wines, totalMarks,
    };
  } catch { return null; }
}

const client = new Anthropic({ apiKey: APIKEY });
let OPUS = "claude-sonnet-4-6";
try { OPUS = await getLatestOpus(APIKEY); } catch { /* fall back to sonnet */ }

// Sizing comes from the ONE shared helper (prompts/model-answer-prompt.ts), which carries the
// evidence. It was hard-coded here — first 2000, then 8000 — and hard-coding is what let this script
// drift below the live engine: at 2000, 12 of 17 remediated questions landed in the live pool with NO
// model answer at all, and genModelAnswer's `catch` never fired because nothing threw, the response
// simply came back short.
async function callModel(model, system, user, cachedPrefix) {
  const maxTokens = modelAnswerMaxTokens(model);
  const msg = await client.messages.create(
    {
      model,
      max_tokens: maxTokens,
      ...modelAnswerEffort(model),
      // Cached corpus prefix (prompts/model-answer-prompt.ts) when the caller has one.
      system: cachedPrefix
        ? [
            { type: "text", text: cachedPrefix, cache_control: { type: "ephemeral" } },
            { type: "text", text: system },
          ]
        : system,
      messages: [{ role: "user", content: user }],
    },
    // The timeout has to be able to cover maxTokens or it converts a truncation into a lost call. At
    // Opus's ~50-80 tok/s a full 16k-token answer runs 200-320s, so the previous 90s ceiling could not
    // have completed one — and with maxRetries: 2 a slow answer cost three timeouts and still failed.
    // This is an offline script with nobody waiting, so it gets the room; the interactive route relies
    // on the SDK's own default instead.
    { timeout: 360_000, maxRetries: 2 }
  );
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  if (msg.stop_reason === "max_tokens") {
    console.warn(`    ⚠ response hit max_tokens (${maxTokens}) — output may be truncated`);
  }
  return text;
}

// Returns the FOUR parsed sections, not one blob.
//
// This used to be `extractSection(text, "Model Answer", "Proposed Annotation") || text`, and that
// `|| text` is a documented defect that had already been fixed in question-engine.ts and
// regen-model-answers.mjs — this script was simply missed, which is the offline/production drift both
// of those files carry warnings about. When the heading did not match exactly, the fallback stored the
// ENTIRE response — all four sections plus any preamble — in model_answer, while leaving
// proposed_annotation / reasoning_trace / study_diagram_assist NULL.
//
// It is not hypothetical: the first two questions remediated in this session landed at 7,785 and
// 9,462 characters against a ~430-word target, each containing every section's heading, and each
// with the model's own `actual_word_count: 428` in the frontmatter — i.e. the ANSWER was on target
// and the bloat was purely the un-split remainder. Raising max_tokens made the blob bigger.
async function genModelAnswer(questionText, wines, paper, wineProfiles) {
  try {
    const p = buildModelAnswerPrompt(questionText, wines, paper, undefined, undefined, wineProfiles);
    const text = await callModel(OPUS, p.system, p.user, p.cachedPrefix);
    const s = parseModelAnswerSections(text);
    // An empty answer is a silent failure: the caller skips the save and the replacement lands in
    // the live pool with no model answer, having archived the question it replaced. Say so loudly.
    if (!s.modelAnswer || !s.modelAnswer.trim()) {
      console.warn("    ⚠ model-answer came back EMPTY — replacement will have no model answer");
      return null;
    }
    return s;
  } catch (e) {
    console.warn("    model-answer generation failed:", e.message);
    return null;
  }
}

// Regenerate ONE valid replacement for a quarantined question. Returns {newId, key, audit} or null.
async function remediateOne(old, existingWines, latest) {
  const paper = old.paper, family = old.family;
  const prompt = await buildQuestionGenerationPrompt(paper, family, existingWines, latest);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const model = attempt === 1 ? OPUS : "claude-sonnet-4-6";
    let text;
    try { text = await callModel(model, prompt.system, prompt.user, prompt.cachedPrefix); }
    catch (e) { console.warn(`    attempt ${attempt}: model error ${e.message}`); continue; }

    const cand = parseGenerated(text, paper, family);
    if (!cand) { console.warn(`    attempt ${attempt}: parse failed`); continue; }

    const newId = `gen_p${paper}_${family}_${Date.now()}`;
    await saveGeneratedQuestion({
      questionId: newId, paper, family: cand.family, familyLabel: cand.familyLabel,
      subcategory: cand.subcategory, questionText: cand.questionText, wines: cand.wines,
      totalMarks: cand.totalMarks,
      metadata: { generatedOnTheFly: true, remediation: true, replaces: old.question_id },
    });
    try { await enrichWineProfiles(newId, cand.wines, APIKEY); }
    catch (e) { console.warn(`    attempt ${attempt}: enrich error ${e.message}`); }

    const row = (await sql`
      SELECT question_id, paper, family, question_text, wines, wine_profiles
      FROM generated_questions WHERE question_id = ${newId}`)[0];
    if (!row || !row.wine_profiles) {
      console.warn(`    attempt ${attempt}: no wine_profiles after enrich — rejecting`);
      await rejectCandidate(newId, ["enrichment produced no profiles"]);
      continue;
    }
    const key = buildKeyForRow(row);
    // Zip the raw label onto each resolved key wine so the shape rule runs here too — the key builder
    // discards the original string, and parseGenerated's check above only sees this attempt's draft.
    const bySlot = new Map(cand.wines.map((w) => [w.slot, w.fullText]));
    const audit = validateQuestion({
      questionId: newId, paper, family: cand.family,
      questionText: cand.questionText, totalMarks: cand.totalMarks,
      wines: (key.ground || []).map((w) => (bySlot.has(w.slot) ? { ...w, fullText: bySlot.get(w.slot) } : w)),
    });
    const hard = audit.violations.filter((v) => v.severity === "hard");

    if (audit.ok && key.ok) {
      console.log(`    attempt ${attempt}: ✓ VALID (${cand.wines.length} wines)`);
      // Carry the enriched profiles out to genModelAnswer — they are already in hand from the
      // enrich + read above, and the exemplar must be written against the same researched evidence
      // the candidate's tasting notes are built from.
      return { newId, cand, key, audit, wineProfiles: row.wine_profiles };
    }
    console.warn(`    attempt ${attempt}: invalid — keyProblems=[${key.problems.join("; ")}] hard=[${hard.map((v) => v.rule).join(",")}]`);
    await rejectCandidate(newId, [...key.problems, ...hard.map((v) => `${v.rule}: ${v.detail}`)]);
  }
  return null;
}

// Mark a failed candidate row archived so it never enters the pool or the audit.
async function rejectCandidate(id, reasons) {
  await sql`
    UPDATE generated_questions
    SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"archived":true,"remediation_failed":true}'::jsonb,
        invalid_reasons = ${JSON.stringify(reasons.map((r) => ({ rule: "remediation-reject", severity: "hard", detail: r })))}::jsonb
    WHERE question_id = ${id}`;
}

async function main() {
  // Two independent quarantine signals, both of which keep a question out of the live pool:
  //   - stem_answer_keys.validated = false  (the answer key itself could not be resolved)
  //   - generated_questions.invalid_reasons (validator/feedback flag; gates getEligibleBankedQuestions)
  // The second was previously not remediated at all, which stranded 44 admin-approved questions —
  // 30 of them on the `marks` rule alone (total_marks != flight_size x 25, always an OVER-allocation;
  // the historical corpus never overshoots). Those are real defects, not cosmetic, so they are
  // regenerated through the same hardened path rather than patched in place.
  const flagged = await sql`
    SELECT g.question_id, g.paper, g.family
    FROM generated_questions g LEFT JOIN stem_answer_keys k USING (question_id)
    WHERE (k.validated = false OR g.invalid_reasons IS NOT NULL)
      AND (g.metadata->>'archived') IS DISTINCT FROM 'true'
    ORDER BY g.paper, g.family`;

  // Third quarantine signal: a wines[] entry that isn't a wine at all but the generator's own
  // deliberation ("Chambers Rosewood — wait, excluded. Let me correct.", a 601-char paragraph weighing
  // up Amontillados, a truncated "The Sadie Family Wines, Pof"). These are invisible to BOTH signals
  // above — the answer-key resolver happily keys a paragraph mentioning "Amontillado" and "Spain" as
  // Palomino/Jerez/Spain — so they are detected here directly from the raw label. The rule itself lives
  // in question-rules.mjs; audit-questions.mjs applies the same one and will flag these into
  // invalid_reasons, but this scan does not depend on the audit having been run first.
  const live = await sql`
    SELECT question_id, paper, family, wines
    FROM generated_questions
    WHERE (metadata->>'archived') IS DISTINCT FROM 'true'
    ORDER BY paper, family`;
  const malformed = [];
  for (const r of live) {
    const ws = typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
    const bad = (Array.isArray(ws) ? ws : []).filter((w) => !checkWineReferenceShape(w.fullText).ok);
    if (bad.length) malformed.push({ question_id: r.question_id, paper: r.paper, family: r.family, bad });
  }
  if (malformed.length) {
    console.log(`Malformed wine references found in ${malformed.length} live question(s):`);
    for (const m of malformed)
      for (const w of m.bad)
        console.log(`  ${m.question_id} slot ${w.slot}: ${JSON.stringify(String(w.fullText).slice(0, 90))}`);
    console.log("");
  }

  const seen = new Set(flagged.map((r) => r.question_id));
  const bad = [...flagged, ...malformed.filter((m) => !seen.has(m.question_id)).map(({ bad: _bad, ...r }) => r)];
  const targets = Number.isFinite(LIMIT) ? bad.slice(0, LIMIT) : bad;
  console.log(`Remediating ${targets.length}/${bad.length} quarantined question(s). apply=${APPLY}\n`);

  const recent = await getRecentGeneratedQuestions(5);
  const latest = recent[0]
    ? { questionText: recent[0].question_text,
        wines: typeof recent[0].wines === "string" ? JSON.parse(recent[0].wines) : recent[0].wines,
        paper: recent[0].paper, family: recent[0].family }
    : null;

  const results = [];
  for (const old of targets) {
    console.log(`▶ ${old.question_id} (P${old.paper} ${old.family})`);
    // Dedup against existing wines for this paper so the replacement is novel.
    const existing = [];
    for (const q of await getQuestionsByFilter(old.paper)) {
      const ws = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
      for (const w of ws) existing.push(w.fullText);
    }
    const res = await remediateOne(old, existing, latest);
    if (!res) { console.log(`  ✗ FAILED to regenerate a valid replacement\n`); results.push({ old: old.question_id, ok: false }); continue; }

    if (APPLY) {
      await upsertKey(res.newId, res.key); // validated=true
      const ma = await genModelAnswer(res.cand.questionText, res.cand.wines, old.paper, res.wineProfiles);
      if (ma) await saveGeneratedQuestion({
        questionId: res.newId, paper: old.paper, family: res.cand.family, familyLabel: res.cand.familyLabel,
        subcategory: res.cand.subcategory, questionText: res.cand.questionText, wines: res.cand.wines,
        totalMarks: res.cand.totalMarks,
        // All four sections, not just the answer — leaving the other three unsaved is what left
        // proposed_annotation / reasoning_trace / study_diagram_assist NULL on every remediated row.
        modelAnswer: ma.modelAnswer,
        proposedAnnotation: ma.proposedAnnotation || undefined,
        reasoningTrace: ma.reasoningTrace || undefined,
        studyDiagramAssist: ma.studyDiagramAssist || undefined,
      });
      // Archive the old row (keeps history; leaves the live pool + audit/build scope).
      await sql`
        UPDATE generated_questions
        SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ archived: true, replaced_by: res.newId })}::jsonb
        WHERE question_id = ${old.question_id}`;
      console.log(`  ✓ ${old.question_id} → ${res.newId} (key validated, model_answer=${ma ? "yes" : "no"}, old archived)\n`);
    } else {
      // Dry run: leave the candidate row archived so it doesn't pollute the pool.
      await rejectCandidate(res.newId, ["dry-run candidate (not committed)"]);
      console.log(`  ✓ would replace ${old.question_id} → ${res.newId} (dry run; candidate archived)\n`);
    }
    results.push({ old: old.question_id, new: res.newId, ok: true });
  }

  console.log("──────── REMEDIATION SUMMARY ────────");
  for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.old}${r.new ? " → " + r.new : ""}`);
  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${okCount}/${results.length} regenerated valid.${APPLY ? " Committed + old rows archived." : " (dry run — pass --apply to commit)"}`);
}

await main();
console.log("done.");
