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

const { buildQuestionGenerationPrompt, buildProducerExclusionBlock } = await import("../src/lib/prompts/question-generation-prompt.ts");
const { getApprovedWinePool, buildApprovedPoolBlock } = await import("../src/lib/approved-wine-pool.ts");
const { buildModelAnswerPrompt, parseModelAnswerSections, modelAnswerMaxTokens, modelAnswerEffort } = await import("../src/lib/prompts/model-answer-prompt.ts");
const { enrichWineProfiles } = await import("../src/lib/wine-enrichment.ts");
const { saveGeneratedQuestion, getQuestionsByFilter, getRecentGeneratedQuestions, getProducerTally, getRecentProducerKeys } = await import("../src/lib/db.ts");
const { validateQuestion } = await import("../src/lib/question-validator.ts");
const { normalizeMarkAllocation, buildGenerationProducerExclusion, PRODUCER_RECENT_WINDOW, bankedServeRejection } = await import("../src/lib/question-engine.ts");
// The mark expander the validator itself reads through — the repair tier must count marks the same
// way the gate does, or it "fixes" a question into a different failure.
const { expandMarkTokens } = await import("../src/lib/question-rules.mjs");
// Model choice goes through the SAME A/B selector the app uses (see the note at OPUS below).
const { selectModel, resolveTierModel } = await import("../src/lib/model-selector.ts");
const { logClaudeUsage } = await import("../src/lib/usage-log.ts");
// (model-resolver is not imported here any more — selectModel resolves the opus tier through it.)
const { buildKeyForRow, upsertKey } = await import("./build-stem-answer-keys.mjs");
const { checkWineReferenceShape, checkStemShape } = await import("../src/lib/question-rules.mjs");
// The reviewer-loop closures (2026-08-09). A replacement for a reviewer-rejected question now (a)
// carries the validated complaint in its prompt, (b) gets the same bin-lessons block every live
// generation gets, and (c) inherits its predecessor's review votes as superseded rows so the
// reviewer sees it as the answer to their complaint, not an anonymous new card. main() adds (d):
// a question whose rule PR is still in flight is deferred, because regenerating it tonight would
// validate the replacement under the OLD rules.
const { getBinLessonsBlock } = await import("../src/lib/bin-lessons.ts");
const { carryReviewsForward } = await import("../src/lib/question-review.ts");
const { feedbackQuarantineEntries, attemptIdsFromEntries, buildComplaintBlock, targetSkipReason } = await import("./remediation-complaint.mjs");

const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes("--apply");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || Infinity;
// --repair-only: attempt the cheap in-place repair and NEVER fall through to regeneration.
//
// This is the right first pass over a backlog. Repair costs at most one small Sonnet edit and often
// nothing; regeneration costs a generation, a wine enrichment, a key build and a model answer. Running
// repair-only across everything first means the expensive pass afterwards only sees questions that
// genuinely need a new flight — and the count it reports is the honest size of that set.
const REPAIR_ONLY = process.argv.includes("--repair-only");
// --only=id1,id2,… : restrict the run to specific question ids. The targeted-batch path — "regen the
// questions the reviewer rejected today" — which --limit cannot express, because --limit just takes
// the first N flagged rows in paper/family order regardless of why they were flagged. Ids not in the
// quarantined set are reported and skipped, never guessed at.
const ONLY = new Set(
  ((process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "")
    .split(",").map((s) => s.trim()).filter(Boolean)
);
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
    // Reject a stem that is the model reasoning about its own marks rather than asking a question.
    // Checked BEFORE the mark repair and before anything is saved: normalizeMarkAllocation cannot
    // remove prose, and downstream this draft would otherwise buy a full wine enrichment before the
    // validator threw 380 part-task-repertoire violations at it. Same guard as the wine slots below,
    // one field over. See checkStemShape.
    const stemShape = checkStemShape(questionText);
    if (!stemShape.ok) {
      console.warn(`    ${stemShape.problem}`);
      return null;
    }
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

// MODEL CHOICE FOLLOWS THE APP'S A/B, IT DOES NOT SET ITS OWN.
//
// This script used to open on Opus for generation and pin Opus for every model answer, while the live
// bank is built by question_generation at SONNET 100% and answers run a 50/50 opus/sonnet split. So
// remediation was paying roughly seven times the per-attempt rate to produce questions the bank
// otherwise makes with Sonnet — and diverging from whatever the A/B is tuned to, silently, because
// nothing here read it. Routing both through selectModel makes the replacement come from the same
// distribution as the thing it replaces, which is also the only honest basis for calling it "as
// accurate": validity here is enforced by the validator gate, not by the model tier.
//
// Measured on the batch that ran the old way: 18 questions took 17 rejected attempts.
const GEN = await selectModel("question_generation", APIKEY, "sonnet");
const ANSWER = await selectModel("model_answer", APIKEY, "opus");
// The escalation target, pinned past the A/B: the point of attempt 3 is to be a DIFFERENT and larger
// model than attempts 1-2, which a split could otherwise resolve back to the same one.
const ESCALATED = await resolveTierModel("opus", APIKEY);
console.log(`models: generation=${GEN.model} (attempts 1-2) → ${ESCALATED} (3+)  answer=${ANSWER.model}`);

// Sizing comes from the ONE shared helper (prompts/model-answer-prompt.ts), which carries the
// evidence. It was hard-coded here — first 2000, then 8000 — and hard-coding is what let this script
// drift below the live engine: at 2000, 12 of 17 remediated questions landed in the live pool with NO
// model answer at all, and genModelAnswer's `catch` never fired because nothing threw, the response
// simply came back short.
async function callModel(model, system, user, cachedPrefix, taskType = "question_generation") {
  const maxTokens = modelAnswerMaxTokens(model);
  const t0 = Date.now();
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
  // EVERY CALL IS LOGGED. This script spent real money invisibly: callModel talked to the SDK
  // directly, so its generations and model answers never reached model_usage and neither the Cost
  // dashboard nor /optimize-costs could see them — only the wine enrichment, which goes through the
  // app's own lib, ever showed up. That was tolerable for a hand-run script and is not for a nightly
  // job. Best-effort: a logging failure must never lose the work the call just paid for.
  try {
    await logClaudeUsage(
      { taskType, model, source: "server", userId: null, attemptId: null, abGroup: null },
      msg.usage,
      { latencyMs: Date.now() - t0 }
    );
  } catch (e) {
    console.warn(`    usage log failed (non-fatal): ${e.message}`);
  }
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
    const text = await callModel(ANSWER.model, p.system, p.user, p.cachedPrefix, "model_answer");
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

// One batched query for the whole night's targets: the latest analysis per attempt, with the
// feedback text the analysis actually ran on (the snapshot; live column for pre-009 rows).
// apply_status/pr_url ride along for the in-flight-PR gate in main().
async function fetchAnalysesByAttempt(attemptIds) {
  if (attemptIds.length === 0) return new Map();
  const rows = await sql`
    /* theory-mode-guard: all-modes -- keyed lookup by attempt ids already stamped into
       feedback-question quarantine flags, not an aggregate; the complaint's words matter whatever
       mode it arrived through, and theory attempts never quarantine bank questions. */
    SELECT DISTINCT ON (fa.attempt_id)
      fa.attempt_id, fa.recommendation, fa.apply_status, fa.pr_url,
      COALESCE(fa.analyzed_feedback, a.user_feedback) AS feedback_text
    FROM feedback_analyses fa
    JOIN user_attempts a ON a.id = fa.attempt_id
    WHERE fa.attempt_id = ANY(${attemptIds})
    ORDER BY fa.attempt_id, fa.updated_at DESC`;
  return new Map(rows.map((r) => [Number(r.attempt_id), r]));
}

// Regenerate ONE valid replacement for a quarantined question. Returns {newId, key, audit} or null.
// `complaint` is {entries, analyses} from main() when the quarantine came from a reviewer, else null.
async function remediateOne(old, existingWines, latest, complaint) {
  const paper = old.paper, family = old.family;
  const prompt = await buildQuestionGenerationPrompt(paper, family, existingWines, latest);

  // TELL THE GENERATOR WHICH PRODUCERS ARE BANNED, exactly as question-engine does after building the
  // same prompt. Without this the exclusion existed only as validateProducerExclusion REJECTING the
  // finished draft, so remediation kept reaching for the houses the reviewer has already banned and
  // paying for it: the first live run drew Domaine Weinbach — a standing reviewer exclusion — on two
  // separate questions, and each rejected attempt costs a full generation AND the Tavily enrichment
  // that ran before validation (it even filed the banned wine into wine_bank on the way through).
  // A retry is not free here, and this is a scheduled job now.
  try {
    const [tally, recentProducers] = await Promise.all([
      getProducerTally(paper, { includeRetiredEvidence: true }),
      getRecentProducerKeys(paper, PRODUCER_RECENT_WINDOW),
    ]);
    const excluded = buildGenerationProducerExclusion(tally.rows, recentProducers);
    if (excluded.length > 0) {
      prompt.system += buildProducerExclusionBlock(excluded.map((p) => p.display));
      console.log(`    excluding ${excluded.length} producer(s) in the prompt`);
    }
  } catch (e) {
    // Degrade to no exclusion rather than to a failed remediation — the validator still rejects a
    // banned producer, so the worst case is the retry loop we had before.
    console.warn(`    producer-exclusion fetch failed (non-fatal): ${e.message}`);
  }

  // THE APPROVED WINE POOL, which this path needs more than any other.
  //
  // question-engine appends it inside generateFreshQuestion; remediation assembles its own prompt and
  // would silently have missed it — the same class of drift that left this script generating on Opus
  // while the bank was built on Sonnet, and generating without the producer ban directly above.
  //
  // It matters most HERE. Remediated questions are the worst cohort in the bank: measured over the
  // reviewer's 497 votes, questions this script regenerated were rejected 42.0% of the time against
  // 35.9% for the originals they replaced. Regeneration has been making the bank slightly worse, and
  // the pool is the first change that targets why — the wine choices, not the question shape.
  try {
    const pool = await getApprovedWinePool(paper);
    if (pool.wines.length > 0) {
      prompt.system += buildApprovedPoolBlock(pool);
      console.log(`    offering ${pool.wines.length} examiner-approved wines`);
    }
  } catch (e) {
    console.warn(`    wine-pool fetch failed (non-fatal): ${e.message}`);
  }

  // The bin-lessons block, exactly as the live engine appends it (question-engine.ts,
  // generateFreshQuestion). Without it, the one path that exists to REPLACE rejected questions ran
  // with less accumulated feedback than an ordinary "New question" click. Non-fatal by the same
  // contract as the live path: getBinLessonsBlock returns "" when the toggle is off or empty.
  try {
    prompt.system += await getBinLessonsBlock();
  } catch (e) {
    console.warn(`    bin-lessons block failed (non-fatal): ${e.message}`);
  }

  // The validated complaint itself. Rules can only constrain what got codified; this constrains the
  // regeneration on what the reviewer actually said, which for Kind:question accepts and cohort
  // retirements is the ONLY signal that exists.
  const complaintBlock = buildComplaintBlock(complaint);
  if (complaintBlock) {
    prompt.system += complaintBlock;
    console.log(`    complaint context in prompt (${complaint.entries.length} quarantine entry(ies), ${complaint.analyses.length} analysis(es))`);
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // ESCALATE ON FAILURE — cheap first, then the bigger model when cheap cannot converge.
    //
    // This has now been wrong in both directions. It opened on Opus and dropped to Sonnet on retry,
    // which paid the premium on the easy majority and the cheap tier on the hard residue — backwards.
    // Setting every attempt to Sonnet then went too far: measured over the drain, half of Sonnet's
    // rejected drafts were its own mark arithmetic narrated into the stem ("f must be divisible by
    // 3"), against one in ten on the Opus-first batch, and the average violation count per rejected
    // draft went from 16 to 159.
    //
    // So: two attempts on the A/B tier, then Opus. Most questions never reach the third attempt (the
    // repair pass and the drain's successes both converged well inside it), and the ones that do are
    // the constrained residue where the premium actually buys convergence rather than a nicer wine.
    const model = attempt <= 2 ? GEN.model : ESCALATED;
    let text;
    try { text = await callModel(model, prompt.system, prompt.user, prompt.cachedPrefix); }
    catch (e) { console.warn(`    attempt ${attempt}: model error ${e.message}`); continue; }

    const cand = parseGenerated(text, paper, family);
    if (!cand) { console.warn(`    attempt ${attempt}: parse failed`); continue; }

    const newId = `gen_p${paper}_${family}_${Date.now()}`;
    // PENDING, NOT APPROVED — a regeneration goes to the review queue, never straight to a candidate.
    //
    // This path used to take the table default (status='approved' → review_state='kept'), so every
    // replacement entered the servable pool with nobody having read it. That is not a theoretical
    // risk: the overnight run of 2026-08-09/10 put 195 regenerated questions into the pool, and of
    // the 45 the expert reviewer reached, he rejected 44 — a 98% reject rate against 30-43% for the
    // cohorts generated before it. 77 of the survivors were still servable and unread.
    //
    // The measurement was already on the wall before that run: #174 recorded regenerations being
    // rejected 42.0% of the time against 35.9% for the originals they replaced. Regeneration output
    // is the LEAST trustworthy content in the bank, and it was the only content that skipped review.
    //
    // 'pending' keeps the loop closing — the row still replaces its predecessor and still appears in
    // the admin review queue — while getEligibleBankedQuestions (which requires review_state='kept')
    // will not serve it until a human keeps it. Repairs are unaffected: tryRepair edits the existing
    // row in place, preserving a flight a reviewer may already have approved.
    await saveGeneratedQuestion({
      questionId: newId, paper, family: cand.family, familyLabel: cand.familyLabel,
      subcategory: cand.subcategory, questionText: cand.questionText, wines: cand.wines,
      totalMarks: cand.totalMarks, status: "pending",
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

// ── TIER 1: REPAIR IN PLACE ───────────────────────────────────────────────────────────────────────
//
// A third of the quarantined backlog is not a bad question. Measured over the 264 live quarantined
// rows on 2026-08-09: 78 of them (30%) are flagged ONLY for mark arithmetic or sub-part shape —
// MARKS_BELOW_FLOOR (56), id-mark-allocation (24), pooled-block-marked-per-wine (24),
// shared-variety-marked-per-wine (16), pooled-block-per-wine-task (10). The wines are fine. The
// defect is "(2 x 3 marks)" where the floor is five, or asking the variety per-wine when the stem
// says the flight shares one.
//
// Regenerating those throws away a flight a reviewer may already have approved and rolls the dice on
// a fresh one they then have to re-review — so repair is not merely cheaper here, it is MORE accurate.
// It also costs a rounding error against a regeneration: no wine enrichment, no key rebuild, no model
// answer, and often no model call at all.
//
// TWO STEPS, CHEAPEST FIRST, AND THE VALIDATOR DECIDES:
//   1. normalizeMarkAllocation — free, deterministic, already used by the generation path. Fixes a
//      wrong TOTAL by nudging one part, and refuses rather than half-fix.
//   2. one small Sonnet edit, given the question and its actual violations, told to change as little
//      as possible. Covers below-floor, over-cap and the block-shape rules in one mechanism, which is
//      three bespoke deterministic repairers I would otherwise have to write and defend.
//
// Neither is trusted. A repair ships ONLY if the result passes the same validateQuestion + serve gate
// the regeneration path must pass, with the EXISTING model answer in scope — so if a mark change
// invalidates the answer, the repair fails and the question falls through to regeneration. Nothing
// here can put a question back that the audit would immediately quarantine again.
async function tryRepair(old) {
  const row = (await sql`
    SELECT question_id, paper, family, question_text, wines, wine_profiles, model_answer, total_marks, invalid_reasons
    FROM generated_questions WHERE question_id = ${old.question_id}`)[0];
  if (!row) return null;
  // A feedback-question quarantine encodes a REVIEWER'S judgment, which the validator cannot
  // re-derive — the same reason audit-questions.mjs --apply preserves this rule when it clears stale
  // flags. The "already clean" shortcut below trusts the validator to decide a flag is stale, so a
  // question flagged by a reviewer would sail through it unchanged, complaint unaddressed, and
  // return to service. Regeneration is the only exit for these.
  const flaggedReasons = typeof row.invalid_reasons === "string" ? JSON.parse(row.invalid_reasons) : row.invalid_reasons;
  if (Array.isArray(flaggedReasons) && flaggedReasons.some((r) => r && r.rule === "feedback-question")) {
    console.warn(`    repair: feedback-question quarantine — a reviewer's complaint, not a validator flag; regeneration only`);
    return null;
  }
  const wines = typeof row.wines === "string" ? JSON.parse(row.wines) : row.wines;
  const wineCount = Array.isArray(wines) ? wines.length : 0;
  if (!wineCount) return null; // no flight to keep — regeneration is the only option
  // buildKeyForRow reads wine_profiles per slot; an unenriched row has nothing to key against, and
  // enriching it here would be most of a regeneration's cost anyway. Let it fall through.
  if (!row.wine_profiles) return null;

  const key = buildKeyForRow(row);
  if (!key.ok) return null; // the key itself is broken; a stem edit cannot fix that
  const bySlot = new Map(wines.map((w) => [w.slot, w.fullText]));
  const keyed = (key.ground || []).map((w) => (bySlot.has(w.slot) ? { ...w, fullText: bySlot.get(w.slot) } : w));

  const check = (text) => {
    const marks = expandMarkTokens(text, wineCount).total;
    const audit = validateQuestion({
      questionId: row.question_id, paper: row.paper, family: row.family,
      questionText: text, totalMarks: marks, wines: keyed,
      modelAnswer: row.model_answer || undefined,
    });
    const gate = bankedServeRejection({ ...row, question_text: text, total_marks: marks });
    return { ok: audit.ok && !gate, marks, audit, gate };
  };

  // Nothing to do if it is already clean — the flag is stale and the audit's own clearing pass owns it.
  const before = check(row.question_text);
  if (before.ok) return { text: row.question_text, marks: before.marks, how: "already clean" };

  const candidates = [];
  const normalized = normalizeMarkAllocation(row.question_text, wineCount);
  if (normalized !== row.question_text) candidates.push(["normalizeMarkAllocation", normalized]);

  for (const [how, text] of candidates) {
    const r = check(text);
    if (r.ok) return { text, marks: r.marks, how };
  }

  // Step 2. One Sonnet call. The violations are handed over verbatim: the model is fixing THIS list,
  // not looking for something to improve. Editing the wines is forbidden — they are keyed, enriched
  // and (for a reviewer-approved flight) the part worth keeping.
  const violations = before.audit.violations
    .filter((v) => v.severity === "hard")
    .map((v) => `- ${v.rule}: ${v.detail}`)
    .concat(before.gate ? [`- serve-gate: ${before.gate}`] : [])
    .join("\n");
  const system =
    "You repair the MARK ALLOCATION and SUB-PART STRUCTURE of an MW practical exam question. " +
    "You make the SMALLEST edit that clears the listed violations and change nothing else.\n\n" +
    "HARD RULES:\n" +
    "- Never change the wines, the number of wines, or what the stem claims about them.\n" +
    `- Marks must total exactly ${wineCount * 25} (${wineCount} wines x 25).\n` +
    "- Every written sub-part is worth at least 5 marks per wine. Only a literal 'state the residual " +
    "sugar in g/L' or 'state the alcohol in % abv' readout may be 2-4.\n" +
    "- A single identification sub-part is never worth more than 10 marks per wine.\n" +
    "- If the stem says the wines share one grape variety, ask the variety ONCE flight-wide with a " +
    "flat mark under 'With reference to all wines:', not per wine.\n" +
    "- Keep the stem's wording, length and sub-part order. You are re-pricing and re-scoping parts, " +
    "not rewriting the question: edits that inflate the text are rejected outright.\n" +
    "- Output ONLY the corrected question text. No preamble, no explanation, no code fences.";
  const user =
    `Question (${wineCount} wines, Paper ${row.paper}):\n\n${row.question_text}\n\n` +
    `Violations to clear:\n${violations}\n\nOutput the corrected question text now.`;

  let edited;
  try {
    edited = (await callModel("claude-sonnet-4-6", system, user)).trim();
  } catch (e) {
    console.warn(`    repair: model error ${e.message}`);
    return null;
  }
  // A model that "repairs" by rewriting the question has not repaired anything. The flight itself is
  // safe by construction — the wines live in their own column and commitRepair never touches it — so
  // what needs guarding is the STEM: its claims about those wines, and its scale.
  //
  // Scale is checked here (a repair that halves or doubles the text is a rewrite, whatever it clears);
  // the claims are checked by validateQuestion below, which cross-checks stem facts against the KEYED
  // ground truth and so catches "same variety" being quietly relaxed to make the marks work.
  //
  // The first version of this guard asserted each wine's label still appeared in the edited text.
  // That could never pass: an MW stem does not name its wines, it refers to them by slot ("Wines 3-6
  // are made from the same single grape variety"). It rejected every repair on the first dry run.
  const ratio = edited.length / row.question_text.length;
  if (!edited || ratio < 0.5 || ratio > 2) {
    console.warn(`    repair: edit changed the stem's length by ${Math.round(ratio * 100)}% — rejecting as a rewrite`);
    return null;
  }
  // THE MODEL FIXES THE SHAPE; THE NORMALIZER FIXES THE ARITHMETIC. On the first dry run every single
  // Sonnet edit cleared the structural violation and then missed the total — 70 where 75 was needed,
  // 78, 59, 97, 81, 85. Asking a language model to re-split a dozen sub-parts so they sum to exactly
  // 25 x wines is asking the wrong tool; normalizeMarkAllocation does it deterministically and refuses
  // rather than half-fix. Try the raw edit first (it may already be exact), then the snapped version.
  for (const [how, text] of [["sonnet edit", edited], ["sonnet edit + normalize", normalizeMarkAllocation(edited, wineCount)]]) {
    const r = check(text);
    if (r.ok) return { text, marks: r.marks, how };
  }
  const after = check(normalizeMarkAllocation(edited, wineCount));
  // Deduped: part-task-repertoire can emit a violation per part per wine and has been seen returning
  // 150 identical entries, which turns one failed repair into an unreadable log.
  const stillBad = [...new Set(after.audit.violations.filter((v) => v.severity === "hard").map((v) => v.rule))];
  console.warn(`    repair: still invalid — ${after.gate || stillBad.join(",") || "unknown"}`);
  return null;
}

// Commit a repair: the row keeps its id, its wines, its key and its model answer. Only the stem, the
// mark total and the quarantine flag change — which is why this needs no archive and no replacement.
async function commitRepair(questionId, repaired) {
  await sql`
    UPDATE generated_questions
    SET question_text = ${repaired.text},
        total_marks = ${repaired.marks},
        invalid_reasons = NULL,
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ repaired_at: new Date().toISOString(), repaired_by: repaired.how })}::jsonb
    WHERE question_id = ${questionId}`;
  await sql`
    UPDATE stem_answer_keys SET validated = true, invalid_reasons = NULL
    WHERE question_id = ${questionId} AND invalid_reasons IS NOT NULL`;
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
    SELECT g.question_id, g.paper, g.family, g.invalid_reasons
    FROM generated_questions g LEFT JOIN stem_answer_keys k USING (question_id)
    WHERE (k.validated = false OR g.invalid_reasons IS NOT NULL)
      AND (g.metadata->>'archived') IS DISTINCT FROM 'true'
      -- Never remediate a historical import: remediation rewrites the question, and these carry a
      -- verbatim past-paper stem. Re-import instead (import-historical-stems.mjs --only=<qid> --redo).
      AND (g.metadata->>'source') IS DISTINCT FROM 'historical_stem'
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
      AND (metadata->>'source') IS DISTINCT FROM 'historical_stem'
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
  let bad = [...flagged, ...malformed.filter((m) => !seen.has(m.question_id)).map(({ bad: _bad, ...r }) => r)];

  if (ONLY.size) {
    const scoped = bad.filter((r) => ONLY.has(r.question_id));
    const found = new Set(scoped.map((r) => r.question_id));
    const missing = [...ONLY].filter((id) => !found.has(id));
    if (missing.length) {
      console.warn(`--only: ${missing.length} id(s) not in the quarantined set (already remediated, archived, or never flagged):`);
      for (const id of missing) console.warn(`  ${id}`);
      console.warn("");
    }
    bad = scoped;
  }

  // Reviewer-quarantined rows get their complaint resolved back to the analysis it came from, and
  // rows whose rule PR is still in flight are deferred to a later night: the whole point of that PR
  // is a validator/generation rule the replacement must be held to, and regenerating before it
  // merges validates the replacement under the OLD rules — the flagged defect could sail straight
  // back into the pool tonight and cost a second regeneration when the nightly audit re-flags it.
  // 'dispatched'/'pr_opened' is apply-change.ts's own definition of in-flight; 'pr_closed' (rejected
  // without merging) and 'quarantined' (Kind:question, no code change) proceed — for those the
  // complaint block in the prompt is the only correction there will ever be.
  const entriesByQ = new Map(bad.map((r) => [r.question_id, feedbackQuarantineEntries(r.invalid_reasons)]));
  const analysesByAttempt = await fetchAnalysesByAttempt(
    [...new Set(bad.flatMap((r) => attemptIdsFromEntries(entriesByQ.get(r.question_id))))]
  );
  const contexts = new Map();
  const deferredForPr = [];
  const actionable = [];
  for (const r of bad) {
    const entries = entriesByQ.get(r.question_id) || [];
    const linked = attemptIdsFromEntries(entries).map((id) => analysesByAttempt.get(id)).filter(Boolean);
    const inflight = linked.find((a) => a.apply_status === "dispatched" || a.apply_status === "pr_opened");
    if (inflight) {
      deferredForPr.push({ question_id: r.question_id, pr: inflight.pr_url || `analysis for attempt ${inflight.attempt_id} (${inflight.apply_status})` });
      continue;
    }
    if (entries.length > 0) contexts.set(r.question_id, { entries, analyses: linked });
    actionable.push(r);
  }
  if (deferredForPr.length) {
    console.log(`Deferring ${deferredForPr.length} question(s) whose rule PR is still in flight (would regenerate under the OLD rules):`);
    for (const d of deferredForPr) console.log(`  ${d.question_id} — ${d.pr}`);
    console.log("");
  }

  const targets = Number.isFinite(LIMIT) ? actionable.slice(0, LIMIT) : actionable;
  console.log(`Remediating ${targets.length}/${actionable.length} quarantined question(s) (${bad.length} flagged, ${deferredForPr.length} awaiting a rule PR). apply=${APPLY}\n`);

  const recent = await getRecentGeneratedQuestions(5);
  const latest = recent[0]
    ? { questionText: recent[0].question_text,
        wines: typeof recent[0].wines === "string" ? JSON.parse(recent[0].wines) : recent[0].wines,
        paper: recent[0].paper, family: recent[0].family }
    : null;

  const results = [];
  let repairedCount = 0;
  for (const old of targets) {
    console.log(`▶ ${old.question_id} (P${old.paper} ${old.family})`);

    // RE-READ BEFORE SPENDING. The targets were selected once, minutes-to-an-hour ago, and another
    // remediator may have processed this row since — the nightly workflow and a hand-run --only
    // batch raced exactly this way on 2026-08-09, both regenerating gen_p1_F2_1786306298953 and
    // leaving two live replacements for one predecessor. If the row is now archived or no longer
    // flagged, the other runner won; skip it rather than duplicate its work. (targetSkipReason
    // documents the decision, including why a flag-clean malformed-wines target still proceeds.)
    const fresh = (await sql`
      SELECT g.invalid_reasons, g.metadata->>'archived' AS archived, g.wines, k.validated
      FROM generated_questions g LEFT JOIN stem_answer_keys k USING (question_id)
      WHERE g.question_id = ${old.question_id}`)[0];
    const staleReason = targetSkipReason(fresh);
    if (staleReason) {
      console.log(`  – SKIPPED (${staleReason}) — another runner got here first\n`);
      results.push({ old: old.question_id, ok: false, skipped: true });
      continue;
    }

    // TIER 1 FIRST, ALWAYS. Cheapest sufficient fix wins, and the validator decides whether it was
    // sufficient — so this can never be the reason a broken question returns to service. A question
    // whose wines are fine and whose marks are merely mis-split keeps its flight, its key, its model
    // answer, its id and any review history attached to that id.
    const repaired = await tryRepair(old);
    if (repaired) {
      if (APPLY) await commitRepair(old.question_id, repaired);
      repairedCount++;
      console.log(`  ✓ REPAIRED in place (${repaired.how}, ${repaired.marks} marks)${APPLY ? "" : " [dry run]"}\n`);
      results.push({ old: old.question_id, ok: true, repaired: true });
      continue;
    }
    if (REPAIR_ONLY) {
      console.log(`  – not repairable in place; left for the regeneration pass\n`);
      results.push({ old: old.question_id, ok: false, deferred: true });
      continue;
    }

    // Dedup against existing wines for this paper so the replacement is novel.
    const existing = [];
    for (const q of await getQuestionsByFilter(old.paper)) {
      const ws = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
      for (const w of ws) existing.push(w.fullText);
    }
    const complaint = contexts.get(old.question_id) || null;
    const res = await remediateOne(old, existing, latest, complaint);
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
      // Same mechanism as the wine-swap repair path: the predecessor's votes are copied across as
      // superseded rows, so the reviewer who rejected it sees this replacement as the answer to
      // their complaint rather than an anonymous new card. Without this, the human check on "did
      // the fix take" silently existed for role-ruling repairs and not for reviewer rejections.
      try {
        const carryReason = complaint?.entries?.[0]
          ? `Regenerated by remediation after a validated complaint — ${complaint.entries[0].detail.slice(0, 300)}`
          : `Regenerated by remediation — replaces ${old.question_id}`;
        const carried = await carryReviewsForward(old.question_id, res.newId, carryReason);
        if (carried > 0) console.log(`    carried ${carried} review vote(s) forward onto ${res.newId}`);
      } catch (e) {
        console.warn(`    carryReviewsForward failed (non-fatal): ${e.message}`);
      }
      console.log(`  ✓ ${old.question_id} → ${res.newId} (key validated, model_answer=${ma ? "yes" : "no"}, old archived)\n`);
    } else {
      // Dry run: leave the candidate row archived so it doesn't pollute the pool.
      await rejectCandidate(res.newId, ["dry-run candidate (not committed)"]);
      console.log(`  ✓ would replace ${old.question_id} → ${res.newId} (dry run; candidate archived)\n`);
    }
    results.push({ old: old.question_id, new: res.newId, ok: true });
  }

  console.log("──────── REMEDIATION SUMMARY ────────");
  for (const r of results)
    console.log(
      `  ${r.ok ? "✓" : r.deferred || r.skipped ? "–" : "✗"} ${r.old}` +
        `${r.repaired ? " (repaired in place)" : r.new ? " → " + r.new : r.deferred ? " (deferred to regeneration)" : r.skipped ? " (skipped — another runner got there first)" : ""}`
    );
  const okCount = results.filter((r) => r.ok).length;
  const deferred = results.filter((r) => r.deferred).length;
  const skipped = results.filter((r) => r.skipped).length;
  console.log(
    `\n${okCount}/${results.length} fixed — ${repairedCount} repaired in place, ${okCount - repairedCount} regenerated` +
      `${deferred ? `, ${deferred} deferred to the regeneration pass` : ""}` +
      `${skipped ? `, ${skipped} skipped (handled by another runner)` : ""}` +
      `${deferredForPr.length ? `, ${deferredForPr.length} awaiting a rule PR` : ""}.` +
      `${APPLY ? " Committed." : " (dry run — pass --apply to commit)"}`
  );
}

await main();
console.log("done.");
