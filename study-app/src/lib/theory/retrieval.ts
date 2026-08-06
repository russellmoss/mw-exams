import { neon } from "@neondatabase/serverless";
import { retrieveKnowledge, type RetrievedPassage } from "@/lib/knowledge/retrieve";
import { logTavilyUsage } from "@/lib/usage-log";
import type { TheoryRubric } from "./rubric";

export type TheoryRetrievalRoute = "kb" | "web" | "none";
export type TheoryRetrievalStatus = "available" | "unavailable" | "error";

export interface TheorySourcePassage {
  kind: "kb" | "web";
  publisher: string;
  title: string | null;
  url: string;
  publishedAt: string | null;
  tier: 1;
  text: string;
}

export interface TheoryRetrievalResult {
  questionId: string;
  route: TheoryRetrievalRoute;
  status: TheoryRetrievalStatus;
  reason: string;
  query: string | null;
  checkedAt: string;
  dateBucket: string;
  fromCache: boolean;
  factualChecking: "evidence_only" | "abstain";
  notice: string;
  passages: TheorySourcePassage[];
  citations: Array<{ publisher: string; title: string | null; url: string; publishedAt: string | null }>;
}

export interface TheoryRetrievalPlan {
  route: TheoryRetrievalRoute;
  reason: string;
  query: string | null;
}

export const TIER_ONE_WEB_DOMAINS = [
  "oiv.int",
  "ec.europa.eu",
  "eur-lex.europa.eu",
  "who.int",
  "iarc.who.int",
  "ttb.gov",
  "usda.gov",
  "gov.uk",
  "eurostat.ec.europa.eu",
  "inao.gouv.fr",
  "champagne.fr",
  "sherry.wine",
  "ivdp.pt",
  "riojawine.com",
  "wineaustralia.com",
  "nzwine.com",
  "wosa.co.za",
  "awri.com.au",
  "ives-openscience.eu",
  "inrae.fr",
  "cornell.edu",
  "oregonstate.edu",
  "wsu.edu",
  "ucdavis.edu",
  // Company primary sources for corporate facts.
  "lvmh.com",
  "treasurywineestates.com",
  "constellationbrands.com",
  "pernod-ricard.com",
  "diageo.com",
] as const;

const WEB_INTENT =
  /\bmarket|commercial|consumer|sales?|trade|export|import|statistic|share|ownership|company|corporate|business|brand|profit|margin|price|investment|distribution|retail|on-trade|off-trade|health|cancer|government|policy|guideline|legislation|mandatory|social media|artificial intelligence|\bAI\b/i;
const APPELLATION_LAW_INTENT =
  /\bappellation|permitted variet|authori[sz]ed variet|ageing minimum|yield limit|cahier|disciplinare|DOCG?|AOC|PDO|reglamento|Barolo|Rioja|Prosecco|Champagne|Chablis|Brunello|Chianti|Amarone|Sancerre|Vouvray\b/i;
const PHYSIOLOGY_INTENT =
  /\bvine physiology|photosynth|temperature (?:threshold|cutoff|affect)|growing degree|soil pH|nutrient uptake|stomata|respiration|budburst|flowering|transpiration\b/i;
const KB_INTENT =
  /\bSO2|sulphur dioxide|sulfur dioxide|ferment|vinif|bottl|filtrat|stabili[sz]|fining|malolactic|oxygen|microb|yeast|bacteria|oak|barrel|maturation|canopy|rootstock|irrigation|disease|pest|viticultur|trial|lees|tannin|colour management|extraction|fortif|solera|botrytis|appassimento\b/i;

function rubricText(rubric: TheoryRubric): string {
  return [
    rubric.questionText,
    ...rubric.coreRequirements.map((item) => item.element),
    ...rubric.differentiators.map((item) => item.element),
    ...rubric.creditSignals.map((item) => item.signal),
  ].join(" ");
}

export function buildTheoryRetrievalPlan(rubric: TheoryRubric): TheoryRetrievalPlan {
  const text = rubricText(rubric);
  const query = [
    rubric.questionText,
    ...rubric.coreRequirements.slice(0, 3).map((item) => item.element),
  ].join(" ");

  // Commercial and public-policy semantics win over an appellation name. A Prosecco market
  // question needs current OIV/trade evidence, not its production specification.
  if (WEB_INTENT.test(text)) {
    return { route: "web", reason: "current market, policy, health, trade, or corporate facts", query };
  }
  if (APPELLATION_LAW_INTENT.test(text)) {
    return { route: "kb", reason: "appellation law covered by the curated KB", query };
  }
  // The measured corpus does not cover textbook vine physiology. Abstention is better than six
  // authoritative but irrelevant trial passages.
  if (rubric.paper === 1 && PHYSIOLOGY_INTENT.test(text)) {
    return { route: "none", reason: "textbook vine physiology has no dependable tier-1 coverage", query: null };
  }
  if (KB_INTENT.test(text)) {
    return { route: "kb", reason: "production, enology, viticulture trial, or handling evidence", query };
  }
  return { route: "none", reason: "no fact domain with dependable tier-1 coverage", query: null };
}

export interface TheoryRetrievalDeps {
  retrieveKb: (query: string) => Promise<RetrievedPassage[]>;
  searchWeb: (query: string, tavilyKey: string, questionId: string) => Promise<TheorySourcePassage[]>;
  cacheGet: (questionId: string, dateBucket: string) => Promise<TheoryRetrievalResult | null>;
  cachePut: (result: TheoryRetrievalResult) => Promise<void>;
  now: () => Date;
}

async function defaultCacheGet(
  questionId: string,
  dateBucket: string
): Promise<TheoryRetrievalResult | null> {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT retrieval FROM theory_retrieval_cache
      WHERE question_id = ${questionId} AND date_bucket = ${dateBucket}`;
    const value = rows[0]?.retrieval;
    if (!value) return null;
    return (typeof value === "string" ? JSON.parse(value) : value) as TheoryRetrievalResult;
  } catch (error) {
    console.error("[theory retrieval] cache read failed:", error);
    return null;
  }
}

async function defaultCachePut(result: TheoryRetrievalResult): Promise<void> {
  if (result.status !== "available") return;
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      INSERT INTO theory_retrieval_cache (question_id, date_bucket, retrieval)
      VALUES (${result.questionId}, ${result.dateBucket}, ${JSON.stringify({ ...result, fromCache: false })}::jsonb)
      ON CONFLICT (question_id, date_bucket) DO UPDATE SET
        retrieval = EXCLUDED.retrieval,
        created_at = NOW()`;
  } catch (error) {
    console.error("[theory retrieval] cache write failed:", error);
  }
}

async function defaultWebSearch(
  query: string,
  tavilyKey: string,
  questionId: string
): Promise<TheorySourcePassage[]> {
  let success = false;
  let resultsCount = 0;
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tavilyKey}` },
      body: JSON.stringify({
        query,
        max_results: 6,
        search_depth: "advanced",
        include_domains: TIER_ONE_WEB_DOMAINS,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Tavily HTTP ${response.status}`);
    const data = (await response.json()) as {
      results?: Array<{ url?: string; title?: string; content?: string; published_date?: string }>;
    };
    const allowed = new Set<string>(TIER_ONE_WEB_DOMAINS);
    const rows = (data.results ?? []).filter((row) => {
      if (!row.url || !row.content) return false;
      try {
        const host = new URL(row.url).hostname.toLowerCase();
        return [...allowed].some((domain) => host === domain || host.endsWith(`.${domain}`));
      } catch {
        return false;
      }
    });
    success = true;
    resultsCount = rows.length;
    return rows.map((row) => ({
      kind: "web",
      publisher: new URL(row.url!).hostname.replace(/^www\./, ""),
      title: row.title || null,
      url: row.url!,
      publishedAt: row.published_date || null,
      tier: 1,
      text: row.content!.slice(0, 1800),
    }));
  } finally {
    void logTavilyUsage({
      taskType: "theory_factcheck",
      query,
      resultsCount,
      credits: 2,
      questionId,
      success,
    });
  }
}

const DEFAULT_DEPS: TheoryRetrievalDeps = {
  retrieveKb: (query) => retrieveKnowledge({ query, topK: 6 }),
  searchWeb: defaultWebSearch,
  cacheGet: defaultCacheGet,
  cachePut: defaultCachePut,
  now: () => new Date(),
};

function kbPassage(passage: RetrievedPassage): TheorySourcePassage {
  if (passage.tier !== 1) {
    throw new Error(`Theory retrieval received non-tier-1 KB passage ${passage.chunkId}`);
  }
  return {
    kind: "kb",
    publisher: passage.publisher,
    title: passage.canonicalTitle,
    url: passage.canonicalUrl,
    publishedAt: passage.publishedAt?.toISOString() ?? null,
    tier: 1,
    text: passage.text,
  };
}

function resultWithPassages(
  rubric: TheoryRubric,
  plan: TheoryRetrievalPlan,
  checkedAt: string,
  dateBucket: string,
  passages: TheorySourcePassage[]
): TheoryRetrievalResult {
  const available = passages.length > 0;
  return {
    questionId: rubric.id,
    route: plan.route,
    status: available ? "available" : "unavailable",
    reason: plan.reason,
    query: plan.query,
    checkedAt,
    dateBucket,
    fromCache: false,
    factualChecking: available ? "evidence_only" : "abstain",
    notice: available
      ? "Tier-1 evidence was retrieved. It may refute a claim, but silence never confirms error or lowers the band."
      : "No tier-1 evidence adjudicated the factual claims. Factual checking abstained; structure was graded normally.",
    passages,
    citations: passages.map(({ publisher, title, url, publishedAt }) => ({
      publisher,
      title,
      url,
      publishedAt,
    })),
  };
}

export async function getTheoryRetrieval(
  rubric: TheoryRubric,
  options: { tavilyKey?: string | null; tavilyKeyError?: string | null } = {},
  deps: TheoryRetrievalDeps = DEFAULT_DEPS
): Promise<TheoryRetrievalResult> {
  const plan = buildTheoryRetrievalPlan(rubric);
  const now = deps.now();
  const checkedAt = now.toISOString();
  const dateBucket = checkedAt.slice(0, 10);

  if (plan.route === "none") {
    return resultWithPassages(rubric, plan, checkedAt, dateBucket, []);
  }
  if (plan.route === "web" && options.tavilyKeyError) {
    return {
      ...resultWithPassages(rubric, plan, checkedAt, dateBucket, []),
      status: "error",
      notice: `Tavily key lookup failed (${options.tavilyKeyError}). Web fact-checking abstained; structure was graded normally.`,
    };
  }
  // A2: per-user BYOK. Even a shared cache must not silently turn fact checking on for a user who
  // has no Tavily key; the response has to disclose the abstention.
  if (plan.route === "web" && !options.tavilyKey) {
    return {
      ...resultWithPassages(rubric, plan, checkedAt, dateBucket, []),
      notice:
        "No Tavily key is configured for this user. Web fact-checking abstained; structure was graded normally.",
    };
  }

  const cached = await deps.cacheGet(rubric.id, dateBucket);
  if (cached && cached.route === plan.route && cached.query === plan.query) {
    return { ...cached, fromCache: true };
  }

  try {
    const passages =
      plan.route === "kb"
        ? (await deps.retrieveKb(plan.query!)).filter((passage) => passage.tier === 1).map(kbPassage)
        : await deps.searchWeb(plan.query!, options.tavilyKey!, rubric.id);
    const result = resultWithPassages(rubric, plan, checkedAt, dateBucket, passages);
    await deps.cachePut(result);
    return result;
  } catch (error) {
    return {
      ...resultWithPassages(rubric, plan, checkedAt, dateBucket, []),
      status: "error",
      notice: `Factual retrieval failed (${error instanceof Error ? error.message : "unknown error"}). Factual checking abstained; structure was graded normally.`,
    };
  }
}

export function buildTheoryCitationBlock(result: TheoryRetrievalResult): string {
  if (!result.citations.length) return `Fact-checking: ${result.notice}`;
  return [
    "### Fact-check sources",
    ...result.citations.map(
      (source) =>
        `- [${source.title || source.publisher}](${source.url})${source.publishedAt ? ` — ${source.publishedAt.slice(0, 10)}` : " — date unknown"}`
    ),
  ].join("\n");
}
