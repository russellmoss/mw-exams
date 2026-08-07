// Tier-1 source policy for the Coach's web search.
//
// THE PROBLEM. An MW candidate asking "what's happening with Bordeaux en primeur pricing" or "what
// does the OIV say about dealcoholised wine" needs an answer from somewhere that could be cited in
// an exam answer. An open web search returns Reddit threads, merchant marketing copy and blogs that
// paraphrase a paraphrase. Wrong facts learned confidently are worse than no answer.
//
// THE MECHANISM. Tavily's `include_domains` restricts the search at the API, so a non-listed domain
// is not filtered out after the fact — it is never returned. That makes the tier-1 rule structural
// rather than something the model is asked to respect. The lists below ARE the policy; extending
// them is a deliberate editorial act.
//
// WHAT COUNTS AS TIER 1 HERE. Three kinds of source, matching how the MW exam actually expects
// evidence to be used:
//   • the body that MAKES the rule (INAO, OIV, the Consejos, the IVDP) — authoritative by definition
//   • the institute that DID the research (AWRI, IVES, the university programmes)
//   • trade press and market analysts with named editorial standards (JancisRobinson, Decanter,
//     Vinous, Meininger, IWSR, Rabobank) — the sources the examiners' own reports cite
// Everything else is out, including wine retail, aggregators, user-generated ratings and blogs.

export type SourceClass = "regulatory" | "research" | "trade" | "market";

/**
 * Regulators, appellation authorities and standards bodies. The last word on what is permitted,
 * what a term legally means, and what a cahier des charges requires.
 */
const REGULATORY = [
  "oiv.int",
  "inao.gouv.fr",
  "agriculture.gouv.fr",
  "eur-lex.europa.eu",
  "ec.europa.eu",
  "ttb.gov",
  "ivdp.pt",
  "sherry.wine",
  "riojawine.com",
  "consorziobrunello.it",
  "politicheagricole.it",
  "wineaustralia.com",
  "nzwine.com",
  "wosa.co.za",
  "winesofportugal.com",
  "champagne.fr",
];

/** Institutes and university programmes — the primary literature on viticulture and enology. */
const RESEARCH = [
  "awri.com.au",
  "ives-openscience.eu",
  "oiv.int",
  "extension.oregonstate.edu",
  "wine.wsu.edu",
  "grapes.extension.org",
  "ucanr.edu",
  "ucdavis.edu",
  "inrae.fr",
  "vignevin.com",
  "hochschule-geisenheim.de",
  "ncbi.nlm.nih.gov",
  "mdpi.com",
  "frontiersin.org",
];

/** Trade press with named editorial standards. The register the examiners themselves quote. */
const TRADE = [
  "jancisrobinson.com",
  "decanter.com",
  "vinous.com",
  "thedrinksbusiness.com",
  "harpers.co.uk",
  "meininger.de",
  "winebusiness.com",
  "sevenfiftydaily.com",
  "winespectator.com",
  "mastersofwine.org",
  "wsetglobal.com",
];

/** Market and business analysis — the evidence base for Paper 4 and contemporary-issues answers. */
const MARKET = [
  "iwsr.com",
  "rabobank.com",
  "wineintelligence.com",
  "oiv.int",
  "wineaustralia.com",
  "winebusiness.com",
  "thedrinksbusiness.com",
  "meininger.de",
  // SVB's annual State of the US Wine Industry report is a standard citation for US market answers.
  "svb.com",
];

const BY_CLASS: Record<SourceClass, string[]> = {
  regulatory: REGULATORY,
  research: RESEARCH,
  trade: TRADE,
  market: MARKET,
};

/**
 * LAST RESORT ONLY — searched when tier 1 returns nothing at all.
 *
 * Wikipedia is not a citable source for an MW answer and is deliberately absent from every class
 * above. But a candidate asking about an obscure grape, a small appellation or a historical episode
 * that the regulators and trade press simply have not written about is better served by a sourced
 * encyclopaedia entry, clearly labelled as such, than by the model's unattributed recollection —
 * which is the only other thing on offer at that point. The label is the point: results from here
 * come back marked as fallback so the answer says where it came from and what that is worth.
 */
const FALLBACK = ["wikipedia.org", "en.wikipedia.org"];

/**
 * Never searched, at any tier, for any question.
 *
 * Written down rather than merely omitted. An absence is invisible and drifts — someone adding a
 * "general" class later would have no signal that these were excluded on purpose. User-generated
 * ratings, forums and retail listings are exactly the material an MW answer must not rest on, and
 * `assertNeverSearched` makes including one a test failure rather than an editorial slip.
 */
export const NEVER_SEARCHED = [
  "reddit.com",
  "vivino.com",
  "cellartracker.com",
  "wine-searcher.com",
  "quora.com",
  "medium.com",
  "wordpress.com",
  "blogspot.com",
  "substack.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "totalwine.com",
  "wine.com",
];

/**
 * Domains for a search.
 *
 * Deduplicated and capped: Tavily degrades with very long include lists, and a blended search across
 * every class would dilute the query rather than broaden it usefully. Callers pass the classes that
 * match the question; the default blend is deliberately narrow.
 */
export function domainsFor(classes: SourceClass[] | undefined): string[] {
  const chosen = classes?.length ? classes : (["trade", "regulatory"] as SourceClass[]);
  const seen = new Set<string>();
  for (const c of chosen) for (const d of BY_CLASS[c] ?? []) seen.add(d);
  return [...seen].slice(0, 40);
}

/** Human-readable provenance for a result URL, so a citation names the body rather than a bare link. */
export function publisherFor(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const [cls, list] of Object.entries(BY_CLASS)) {
      if (list.some((d) => host === d || host.endsWith(`.${d}`))) return `${host} (${cls})`;
    }
    return host;
  } catch {
    return null;
  }
}

/** The fallback tier's domains. Only ever passed after a tier-1 search came back empty. */
export function fallbackDomains(): string[] {
  return [...FALLBACK];
}

/**
 * Defence in depth against the ban list.
 *
 * `include_domains` should already make a banned result impossible, so this filter ought to be dead
 * code — which is exactly why it is here. If Tavily ever changes how the parameter behaves, the
 * silent failure mode is a Reddit thread quoted to a candidate as sourced fact.
 */
export function isBannedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return NEVER_SEARCHED.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return true; // unparseable — drop it
  }
}

export const ALL_TIER1_DOMAINS = [...new Set([...REGULATORY, ...RESEARCH, ...TRADE, ...MARKET])];

/** Everything the Coach may ever cite, tier 1 plus the labelled fallback. Used by the citation guard. */
export const ALL_CITABLE_DOMAINS = [...new Set([...ALL_TIER1_DOMAINS, ...FALLBACK])];
