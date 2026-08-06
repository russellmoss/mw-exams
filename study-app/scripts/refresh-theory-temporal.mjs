/**
 * Unattended six-month Theory temporal review.
 *
 * One official-source search is performed per temporally scoped question, then Sonnet classifies
 * every requirement under a deliberately asymmetric policy. A requirement can become superseded
 * only by selecting a dated tier-1 result and quoting it exactly. Any malformed response, network
 * failure, missing secret, or unsupported supersession aborts the run before the ledger is written.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const theoryDir = join(root, "data", "theory");
const rubricPath = join(theoryDir, "theory_rubrics.json");
const temporalPath = join(theoryDir, "rubric_temporal.json");
const overridesPath = join(theoryDir, "rubric_temporal_overrides.json");

export const OFFICIAL_DOMAINS = [
  "oiv.int", "ec.europa.eu", "eur-lex.europa.eu", "who.int", "iarc.who.int", "ttb.gov",
  "usda.gov", "gov.uk", "eurostat.ec.europa.eu", "inao.gouv.fr", "champagne.fr",
  "sherry.wine", "ivdp.pt", "riojawine.com", "wineaustralia.com", "nzwine.com",
  "wosa.co.za", "awri.com.au", "ives-openscience.eu", "inrae.fr", "cornell.edu",
  "oregonstate.edu", "wsu.edu", "ucdavis.edu", "lvmh.com", "treasurywineestates.com",
  "constellationbrands.com", "pernod-ricard.com", "diageo.com",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function isOfficialUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      OFFICIAL_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`)) ||
      host.endsWith(".gov") || host.endsWith(".gov.au") || host.endsWith(".govt.nz") ||
      host.endsWith(".edu") || host.endsWith(".ac.uk")
    );
  } catch {
    return false;
  }
}

function addSixMonths(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 6);
  return date.toISOString().slice(0, 10);
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Temporal reviewer returned no JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

async function searchOfficialSources(question, tavilyKey, asOf) {
  const requirements = question.requirements.map((requirement) => requirement.element).join("; ");
  const query = `${question.questionText} ${requirements} current official regulation market policy ${asOf}`;
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tavilyKey}` },
    body: JSON.stringify({
      query,
      max_results: 6,
      search_depth: "advanced",
      include_domains: OFFICIAL_DOMAINS,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Tavily failed for ${question.id}: HTTP ${response.status}`);
  const payload = await response.json();
  return (payload.results ?? [])
    .filter((result) => result.url && result.content && isOfficialUrl(result.url))
    .map((result, index) => ({
      index,
      publisher: new URL(result.url).hostname.replace(/^www\./, ""),
      title: result.title || new URL(result.url).hostname,
      url: result.url,
      publishedAt: result.published_date || null,
      content: result.content.slice(0, 2400),
    }));
}

function reviewSystemPrompt(asOf) {
  return `You maintain the temporal grading policy for the MW Theory exam. Today is ${asOf}.

Classify every supplied examiner-derived requirement:
- evergreen: the structural/stable demand applies unchanged.
- year_bound: the demand applies, but a current-reality substitute may discharge dated examples.
- superseded: the demand itself is no longer meaningful because current reality removed it.

Hard rules:
1. Currency can add credit and can never excuse a missing requirement.
2. Prefer year_bound whenever facts merely changed. A dated example changing is NOT supersession.
3. Use superseded only when one supplied official source directly proves the underlying demand was
   invalidated. Set source_index and copy a short exact quote from that source.
4. If sources are absent, silent, undated, indirect, or ambiguous, superseded is forbidden.
5. Examiners' command words, structure, argument, definitions, breadth, and evaluation demands are
   never superseded.
6. Return JSON only: {"questions":[{"id":"...","requirements":[{"index":0,
   "temporal_class":"evergreen|year_bound|superseded","rationale":"...",
   "source_index":null,"quote":null}]}]}`;
}

export function validateReviewBatch(batch, response) {
  if (!response || !Array.isArray(response.questions)) {
    throw new Error("Temporal reviewer response.questions must be an array");
  }
  const responseById = new Map(response.questions.map((question) => [question.id, question]));
  if (responseById.size !== batch.length) throw new Error("Temporal reviewer question coverage drift");

  const decisions = [];
  for (const question of batch) {
    const reviewed = responseById.get(question.id);
    if (!reviewed || !Array.isArray(reviewed.requirements)) {
      throw new Error(`${question.id}: missing requirement decisions`);
    }
    if (reviewed.requirements.length !== question.requirements.length) {
      throw new Error(`${question.id}: requirement decision count drift`);
    }
    const byIndex = new Map(reviewed.requirements.map((requirement) => [requirement.index, requirement]));
    for (const requirement of question.requirements) {
      const decision = byIndex.get(requirement.index);
      if (!decision || !["evergreen", "year_bound", "superseded"].includes(decision.temporal_class)) {
        throw new Error(`${question.id}#r${requirement.index}: invalid temporal class`);
      }
      if (typeof decision.rationale !== "string" || decision.rationale.trim().length < 12) {
        throw new Error(`${question.id}#r${requirement.index}: missing rationale`);
      }
      let source = null;
      if (decision.temporal_class === "superseded") {
        const retrieved = question.sources[decision.source_index];
        if (!retrieved || !retrieved.publishedAt || !isOfficialUrl(retrieved.url)) {
          throw new Error(`${question.id}#r${requirement.index}: superseded lacks dated tier-1 evidence`);
        }
        if (
          typeof decision.quote !== "string" ||
          decision.quote.trim().length < 12 ||
          !retrieved.content.includes(decision.quote.trim())
        ) {
          throw new Error(`${question.id}#r${requirement.index}: superseded quote is not verbatim evidence`);
        }
        source = {
          publisher: retrieved.publisher,
          title: retrieved.title,
          url: retrieved.url,
          published_at: retrieved.publishedAt,
          quote: decision.quote.trim(),
          tier: 1,
        };
      }
      decisions.push({
        questionId: question.id,
        index: requirement.index,
        temporalClass: decision.temporal_class,
        rationale: decision.rationale.trim(),
        source,
      });
    }
  }
  return decisions;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function run() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!anthropicKey || !tavilyKey) {
    throw new Error("ANTHROPIC_API_KEY and TAVILY_API_KEY are required; temporal refresh will not degrade silently");
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const rubrics = readJson(rubricPath);
  const temporal = readJson(temporalPath);
  const previousOverrides = readJson(overridesPath);
  const rubricById = new Map(rubrics.map((rubric) => [rubric.id, rubric]));
  const retainedScope = new Set(previousOverrides.automated_review_question_ids ?? []);
  const candidates = temporal.questions
    .filter((question) =>
      !question.ex_ante && (
        question.time_sensitive_claims.length > 0 ||
        question.requirements.some((requirement) => requirement.temporal_class === "year_bound") ||
        retainedScope.has(question.id)
      )
    )
    .map((question) => ({
      id: question.id,
      questionText: rubricById.get(question.id)?.question_text,
      requirements: question.requirements.map((requirement) => ({
        index: requirement.index,
        element: requirement.element,
        currentClass: requirement.temporal_class,
      })),
    }));
  if (!candidates.length) throw new Error("Temporal refresh found no scoped questions");

  console.log(`Temporal refresh ${asOf}: retrieving official evidence for ${candidates.length} questions`);
  const withSources = await mapWithConcurrency(candidates, 4, async (question) => ({
    ...question,
    sources: await searchOfficialSources(question, tavilyKey, asOf),
  }));

  const client = new Anthropic({ apiKey: anthropicKey });
  const decisions = [];
  for (let offset = 0; offset < withSources.length; offset += 4) {
    const batch = withSources.slice(offset, offset + 4);
    const message = await client.messages.create({
      model: process.env.THEORY_TEMPORAL_MODEL || "claude-sonnet-4-6",
      max_tokens: 7000,
      temperature: 0,
      system: reviewSystemPrompt(asOf),
      messages: [{ role: "user", content: JSON.stringify({ questions: batch }) }],
    });
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    decisions.push(...validateReviewBatch(batch, extractJson(text)));
    console.log(`Reviewed ${Math.min(offset + batch.length, withSources.length)}/${withSources.length}`);
  }

  const requirementOverrides = {};
  for (const decision of decisions) {
    requirementOverrides[`${decision.questionId}#r${decision.index}`] = {
      temporal_class: decision.temporalClass,
      rationale: decision.rationale,
      ...(decision.source ? { source: decision.source } : {}),
    };
  }
  const next = {
    as_of: asOf,
    refresh: {
      owner: "automated_system",
      cadence: "P6M",
      status: "scheduled",
      schedule: "6 February and 6 August at 06:00 UTC",
      next_due: addSixMonths(asOf),
      human_approval_required: false,
    },
    ex_ante: previousOverrides.ex_ante,
    automated_review_question_ids: candidates.map((question) => question.id).sort(),
    requirements: requirementOverrides,
  };
  writeFileSync(overridesPath, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  console.log(`Wrote ${decisions.length} validated requirement decisions; next due ${next.refresh.next_due}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
