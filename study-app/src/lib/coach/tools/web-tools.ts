// Tier-1 web search.
//
// This is the Coach's only route to information that is not in the corpus or the frozen KB — current
// vintages, market data, regulation that changed last year, contemporary issues. It exists because
// an MW candidate asking about en primeur pricing or the OIV's position on dealcoholisation needs an
// answer they could defend in an exam, and an open web search does not provide one.
//
// THE TIER-1 RULE IS ENFORCED AT THE API, NOT IN THE PROMPT. Every query passes `include_domains`
// (see sources.ts), so a blog or a forum is not down-ranked — it is never returned. That matters
// more than it sounds: a prompt instruction to "prefer authoritative sources" is advice the model
// can lose track of eight turns into a conversation, and the failure is silent.
//
// KB FIRST FOR VITICULTURE AND ENOLOGY. The frozen corpus (6,700 chunks from AWRI, INAO, IVES, the
// university programmes) is better evidence for how wine is made than anything a web search returns,
// because it was curated once and is citable by publisher and section. So a production-technique
// question routed here is REFUSED and redirected, rather than answered from the web — enforced in
// the tool, not left to the model's judgement about which tool it feels like using.

import { searchTavily, isTavilyQuotaExhausted } from "@/lib/wine-enrichment";
import type { CoachTool } from "../types";
import { domainsFor, fallbackDomains, isBannedUrl, publisherFor, type SourceClass } from "../sources";

/**
 * Questions the frozen KB answers better than the web.
 *
 * Kept deliberately narrow — it is a redirect, not a filter, and a false positive costs the
 * candidate an answer. It fires on unmistakably production-technique wording, and only when the
 * question is not also about rules, markets or current events (a query about "malolactic
 * fermentation regulations in Chablis" belongs on the web; "what does malolactic fermentation do to
 * texture" belongs in the KB).
 */
const PRODUCTION_TECHNIQUE =
  /\b(malolactic|m[aá]lolactique|lees|b[aâ]tonnage|autolysis|autolytic|flor|solera|botrytis|noble rot|fermentation temperature|cold soak|carbonic|whole bunch|whole cluster|extended maceration|p[ié]geage|remontage|chaptalis|acidification|fining|filtration|sulphur dioxide|sulfur dioxide|SO2|brettanomyces|volatile acidity|reduction|oxidative handling|barrel fermentation|toast level|canopy management|veraison|water stress|rootstock|clonal selection|phylloxera|downy mildew|powdery mildew|botryticide)\b/i;

const OVERRIDES_KB = /\b(law|legal|regulation|regulator|permitted|allowed|banned|price|pricing|market|export|import|tariff|consumer|trend|sales|202[4-9]|vintage report|climate policy)\b/i;

export const searchWineWeb: CoachTool = {
  name: "search_wine_web",
  kind: "read",
  description:
    "Search a curated set of TIER-1 wine sources on the live web: regulators and appellation " +
    "authorities (OIV, INAO, the Consejos, IVDP), research institutes (AWRI, IVES, the university " +
    "programmes), trade press with named editorial standards (JancisRobinson, Decanter, Vinous, " +
    "Meininger, The Drinks Business) and market analysts (IWSR, Rabobank, Wine Intelligence, SVB). " +
    "The search is restricted at the API, so forums, user ratings and retail listings cannot be " +
    "returned at all. If tier-1 has nothing, it falls back once to Wikipedia and marks the result " +
    "`sourceTier: \"fallback\"` — treat that as a starting point to verify, never as a citable fact. " +
    "Use it for current or changing information: recent vintages, market and business questions, " +
    "contemporary issues, regulation that may have moved, a producer or region you need current " +
    "detail on. " +
    "Do NOT use it for how wine is MADE — fermentation, lees, flor, botrytis, canopy management and " +
    "the like are better answered from search_winemaking_science, which is a curated corpus with " +
    "citable publishers. " +
    "ALWAYS cite what you use: name the publisher and give the URL. An uncited web claim is worth " +
    "less to a candidate than saying you do not know.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "A specific question. Include the region/producer/year." },
      sources: {
        type: "array",
        items: { type: "string", enum: ["regulatory", "research", "trade", "market"] },
        description:
          "Which classes to search. 'regulatory' for law and appellation rules, 'research' for " +
          "science, 'trade' for wine press, 'market' for business and consumer data. " +
          "Defaults to trade + regulatory.",
      },
      maxResults: { type: "integer", description: "Default 6, max 10." },
    },
    required: ["query"],
  },
  async run(ctx, input) {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    if (!query) return { error: "query is required." };

    // The KB redirect. Refusing here rather than describing the preference in the prompt is the
    // difference between a rule and a suggestion.
    if (PRODUCTION_TECHNIQUE.test(query) && !OVERRIDES_KB.test(query)) {
      return {
        redirected: true,
        error:
          "That's a production-technique question, so use search_winemaking_science instead — it " +
          "searches a curated corpus (AWRI, INAO, IVES, Champagne's UMC, the Sherry Consejo, the " +
          "university programmes) that is better evidence than the open web and is citable by " +
          "publisher and section. Come back here only if that corpus has nothing and the question " +
          "genuinely turns on something current.",
      };
    }

    if (await isTavilyQuotaExhausted()) {
      return {
        error:
          "Web search is unavailable right now (quota). Say so rather than answering from memory — " +
          "the whole point of this tool is that the answer is sourced.",
      };
    }

    const sources = Array.isArray(input.sources)
      ? ((input.sources as unknown[]).filter(
          (s): s is SourceClass =>
            s === "regulatory" || s === "research" || s === "trade" || s === "market"
        ) as SourceClass[])
      : undefined;
    const maxResults = Math.min(10, Math.max(1, typeof input.maxResults === "number" ? input.maxResults : 6));
    const includeDomains = domainsFor(sources);

    try {
      let results = await searchTavily(
        query,
        { source: "user", userId: ctx.userId },
        { includeDomains, maxResults, taskType: "coach_web_search" }
      );

      // ONE fallback pass, and only on a genuinely empty tier-1 result. An obscure grape or a small
      // appellation that the regulators and trade press have not written about is better served by a
      // labelled encyclopaedia entry than by unattributed recollection — which is the only other
      // thing available at that point. Note this never widens to the open web: the fallback list is
      // Wikipedia alone, and the ban list still applies.
      let tier: "tier1" | "fallback" = "tier1";
      if (!results.length) {
        results = await searchTavily(
          query,
          { source: "user", userId: ctx.userId },
          { includeDomains: fallbackDomains(), maxResults, taskType: "coach_web_search_fallback" }
        );
        tier = "fallback";
      }

      // Defence in depth — include_domains should make this impossible.
      results = results.filter((r) => !isBannedUrl(r.url));

      if (!results.length) {
        return {
          matched: 0,
          searchedClasses: sources ?? ["trade", "regulatory"],
          note:
            "Nothing matched in the tier-1 sources or the fallback. Tell the candidate that plainly " +
            "— do not fall back to general recollection and present it as sourced. Rephrasing, or " +
            "trying a different source class, is worth one more attempt.",
        };
      }

      return {
        matched: results.length,
        sourceTier: tier,
        citationRequirement:
          tier === "tier1"
            ? "Cite the publisher and URL for anything you take from these. Uncited, they are worthless."
            : "FALLBACK RESULTS — tier-1 sources had nothing. This is Wikipedia, which is NOT citable " +
              "in an MW answer. Say explicitly that you could not find it in an authoritative source, " +
              "give it as a starting point rather than as fact, and tell the candidate to verify it " +
              "before using it.",
        results: results.map((r) => ({
          title: r.title,
          url: r.url,
          publisher: publisherFor(r.url),
          excerpt: r.content?.slice(0, 1500) ?? "",
        })),
      };
    } catch (err) {
      console.error("[coach] tier-1 web search failed:", err);
      return { error: "Web search failed. Say so rather than answering from memory." };
    }
  },
};
