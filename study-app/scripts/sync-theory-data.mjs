// sync-theory-data.mjs — prebuild step. Projects the repo-root theory corpus into a compact
// grading index at study-app/public/data/theory-grading-index.json, so the live grading route
// reads exactly the same rubrics the offline pipeline produced.
//
// Why a projection rather than a straight copy: theory_rubrics.json carries the full extraction
// record (every quote, provenance, extraction notes) at ~320KB. The grader needs the marking
// content and the examiners' quotes — which are the most persuasive thing we can show a
// candidate — but not the audit trail. This trims to what the prompt actually uses.
//
// Idempotent and fail-closed: a build without its authoritative corpus must not deploy a Theory
// surface that silently returns no questions.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parseDocument } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "..", "data", "theory");
const dstDir = join(here, "..", "public", "data");
const dst = join(dstDir, "theory-grading-index.json");
const studyDst = join(here, "..", "src", "data", "theory-study-index.json");

const rubricsPath = join(srcDir, "theory_rubrics.json");
const questionsPath = join(srcDir, "theory_questions.json");
const temporalPath = join(srcDir, "rubric_temporal.json");

if (!existsSync(rubricsPath) || !existsSync(questionsPath)) {
  throw new Error("sync-theory-data: authoritative theory rubric/question corpus is missing");
}
if (!existsSync(temporalPath)) {
  throw new Error(
    "sync-theory-data: rubric_temporal.json is required — run python scripts/build_rubric_temporal.py"
  );
}

const rubrics = JSON.parse(readFileSync(rubricsPath, "utf-8"));
const questions = JSON.parse(readFileSync(questionsPath, "utf-8"));
const temporalLedger = JSON.parse(readFileSync(temporalPath, "utf-8"));
const byId = new Map(questions.map((q) => [q.id, q]));
const temporalById = new Map(temporalLedger.questions.map((q) => [q.id, q]));

// Model answers are optional context. The index records only whether one exists; the route
// does not send it to the grader, because grading against a model answer is exactly the
// failure mode this system was built to avoid (a theory question admits many valid answers).
let answerIds = new Set();
const answersPath = join(srcDir, "theory_answers_index.json");
if (existsSync(answersPath)) {
  answerIds = new Set(JSON.parse(readFileSync(answersPath, "utf-8")).map((a) => a.id));
}

const PAPER_TITLES = {
  1: "Viticulture",
  2: "Vinification and pre-bottling procedures",
  3: "Handling of wine",
  4: "The business of wine",
  5: "Contemporary issues",
};

const index = rubrics
  .map((r) => {
    const q = byId.get(r.id);
    if (!q) return null;
    const temporal = temporalById.get(r.id);
    if (!temporal) throw new Error(`sync-theory-data: no temporal classification for ${r.id}`);
    const requirements = r.required_elements ?? [];
    if (temporal.requirements.length !== requirements.length) {
      throw new Error(
        `sync-theory-data: ${r.id} has ${requirements.length} rubric requirements but ` +
          `${temporal.requirements.length} temporal rows`
      );
    }
    const requirement = (element, index) => {
      const classification = temporal.requirements[index];
      if (
        classification.index !== index ||
        classification.element !== element.element ||
        classification.weight !== element.weight
      ) {
        throw new Error(`sync-theory-data: temporal identity drift at ${r.id} requirement ${index}`);
      }
      return {
        element: element.element,
        quote: element.quote,
        temporalClass: classification.temporal_class,
        temporalRationale: classification.rationale,
        temporalSource: classification.source ?? null,
      };
    };
    return {
      id: r.id,
      year: r.year,
      paper: r.paper,
      question: r.question,
      section: r.section,
      domain: r.domain,
      paperTitle: PAPER_TITLES[r.paper] ?? null,
      questionText: q.text,
      // --- marking content ---
      commandWord: r.command_word ?? null,
      commandWordDemand: r.command_word_demand ?? null,
      definitionsRequired: (r.definitions_required ?? []).map((d) => ({
        term: d.term,
        quote: d.quote,
      })),
      coreRequirements: requirements
        .map(requirement)
        .filter((e, index) => requirements[index].weight === "core"),
      differentiators: requirements
        .map(requirement)
        .filter((e, index) => requirements[index].weight === "differentiator"),
      creditSignals: (r.credit_signals ?? []).map((s) => ({ signal: s.signal, quote: s.quote })),
      penaltySignals: (r.penalty_signals ?? []).map((s) => ({ signal: s.signal, quote: s.quote })),
      scopeTraps: (r.scope_traps ?? []).map((t) => ({ trap: t.trap, quote: t.quote })),
      examplesExpected: r.examples_expected ?? null,
      performanceNote: r.performance_note ?? null,
      // --- provenance, surfaced to the grader and the candidate ---
      evidenceQuality: r.evidence_quality ?? null,
      sourceReport: r.source_report ?? null,
      textSource: r.text_source ?? "pdf_text_layer",
      hasModelAnswer: answerIds.has(r.id),
      exAnte: temporal.ex_ante,
      temporalAsOf: temporalLedger.as_of,
      temporalRefresh: temporalLedger.refresh,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.year - b.year || a.paper - b.paper || a.question - b.question);

mkdirSync(dstDir, { recursive: true });
writeFileSync(dst, JSON.stringify(index), "utf-8");

// The study payload stays server-only. Publishing this JSON directly would bypass the authenticated
// answer endpoint and would make the API contract meaningless. The route statically imports the
// generated file so Next includes it in the server bundle.
const answersRoot = join(here, "..", "..", "outputs", "theory_answers");
const claimsPath = join(srcDir, "claim_verification.json");
if (!existsSync(answersRoot) || !existsSync(claimsPath) || !existsSync(answersPath)) {
  throw new Error("sync-theory-data: model answers, answer index, and claim ledger are required");
}

const answerIndex = JSON.parse(readFileSync(answersPath, "utf-8"));
const claimLedger = JSON.parse(readFileSync(claimsPath, "utf-8"));
const claimsByAnswer = new Map();
for (const claim of claimLedger.rows ?? []) {
  const rows = claimsByAnswer.get(claim.answer_id) ?? [];
  rows.push(claim);
  claimsByAnswer.set(claim.answer_id, rows);
}
const rubricIndexById = new Map(index.map((rubric) => [rubric.id, rubric]));

function splitAnswerMarkdown(raw, path) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) throw new Error(`sync-theory-data: malformed answer frontmatter at ${path}`);
  const document = parseDocument(match[1], { uniqueKeys: false });
  if (document.errors.length) {
    throw new Error(`sync-theory-data: invalid answer frontmatter at ${path}: ${document.errors[0]}`);
  }
  return { frontmatter: document.toJS(), body: match[2].trim() };
}

function findClaimMatch(body, candidate) {
  const exactOffset = body.toLocaleLowerCase("en").indexOf(candidate.toLocaleLowerCase("en"));
  if (exactOffset >= 0) return body.slice(exactOffset, exactOffset + candidate.length);

  const tokenise = (value) =>
    [...value.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({
      value: match[0].toLocaleLowerCase("en"),
      start: match.index,
      end: match.index + match[0].length,
    }));
  const bodyTokens = tokenise(body);
  const claimTokens = tokenise(candidate);
  let best = { bodyStart: 0, length: 0 };
  for (let bodyIndex = 0; bodyIndex < bodyTokens.length; bodyIndex += 1) {
    for (let claimIndex = 0; claimIndex < claimTokens.length; claimIndex += 1) {
      let length = 0;
      while (
        bodyIndex + length < bodyTokens.length &&
        claimIndex + length < claimTokens.length &&
        bodyTokens[bodyIndex + length].value === claimTokens[claimIndex + length].value
      ) {
        length += 1;
      }
      if (length > best.length) best = { bodyStart: bodyIndex, length };
    }
  }
  if (best.length < 4) return null;
  const first = bodyTokens[best.bodyStart];
  const last = bodyTokens[best.bodyStart + best.length - 1];
  return body.slice(first.start, last.end);
}

const studyIndex = answerIndex.map((entry) => {
  const answerPath = join(here, "..", "..", entry.path);
  if (!existsSync(answerPath)) throw new Error(`sync-theory-data: missing model answer ${entry.path}`);
  const { frontmatter, body } = splitAnswerMarkdown(readFileSync(answerPath, "utf-8"), entry.path);
  const rubric = rubricIndexById.get(entry.id);
  if (!rubric) throw new Error(`sync-theory-data: answer ${entry.id} has no rubric`);
  const requirementKey = (value) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const quoteByRequirement = new Map(
    [...rubric.coreRequirements, ...rubric.differentiators].map((requirement) => [
      requirementKey(requirement.element),
      requirement,
    ])
  );
  const coversCore = (frontmatter.covers_core ?? []).map((coverage) => {
    const coverageKey = requirementKey(coverage.requirement);
    const exactRequirement = quoteByRequirement.get(coverageKey);
    const prefixMatches = [...quoteByRequirement.entries()]
      .filter(([key]) => key.startsWith(coverageKey) || coverageKey.startsWith(key))
      .map(([, requirement]) => requirement);
    const matchedRequirement = exactRequirement ?? (prefixMatches.length === 1 ? prefixMatches[0] : null);
    if (!matchedRequirement) {
      throw new Error(
        `sync-theory-data: ${entry.id} coverage requirement does not match its rubric: ${coverage.requirement}`
      );
    }
    return {
      requirement: matchedRequirement.element,
      section: coverage.where,
      examinerQuote: matchedRequirement.quote,
    };
  });
  const claims = (claimsByAnswer.get(entry.id) ?? []).map((claim, index) => {
    const candidateTexts = [claim.corrected_claim, claim.claim].filter(Boolean);
    let matchText = null;
    for (const candidate of candidateTexts) {
      const match = findClaimMatch(body, candidate);
      if (match) {
        matchText = match;
        break;
      }
    }
    const verified = /^VERIFIED/.test(claim.verdict) && claim.source?.tier === 1;
    return {
      index: index + 1,
      claimId: claim.claim_id,
      claim: claim.claim,
      matchText,
      status: claim.time_sensitive ? "time_sensitive" : verified ? "verified" : "unsourced",
      verdict: claim.verdict,
      confidence: claim.confidence,
      timeSensitive: Boolean(claim.time_sensitive),
      examYear: entry.year,
      source: claim.source
        ? {
            kind: claim.source.kind,
            publisher: claim.source.publisher,
            tier: claim.source.tier,
            ref: claim.source.ref,
            quote: claim.source.quote,
          }
        : null,
      note: claim.note || null,
    };
  });
  return {
    id: entry.id,
    year: entry.year,
    paper: entry.paper,
    question: entry.question,
    questionText: rubric.questionText,
    generated: frontmatter.generated ?? null,
    body,
    coversCore,
    claims,
  };
});
if (studyIndex.length !== index.length) {
  throw new Error(
    `sync-theory-data: ${studyIndex.length} model answers for ${index.length} rubric-backed questions`
  );
}
mkdirSync(dirname(studyDst), { recursive: true });
writeFileSync(studyDst, JSON.stringify(studyIndex), "utf-8");

const years = [...new Set(index.map((r) => r.year))].sort();
const kb = Math.round(JSON.stringify(index).length / 1024);
console.log(
  `sync-theory-data: ${index.length} rubric-backed questions (${years.join(", ")}) -> grading + authenticated study payload (${kb}KB grading)`
);
