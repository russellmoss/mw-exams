import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_CITABLE_DOMAINS,
  ALL_TIER1_DOMAINS,
  NEVER_SEARCHED,
  domainsFor,
  fallbackDomains,
  isBannedUrl,
  publisherFor,
} from "@/lib/coach/sources";
import { webCitationGuard } from "@/lib/coach/guards";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The tier-1 rule is only real if it is enforced at the API. These assertions exist because the
// alternative — a prompt asking the model to prefer good sources — fails silently, and the candidate
// cannot tell a Decanter fact from a Reddit one once it is in prose.

describe("tier-1 source policy", () => {
  it("never admits a banned domain at ANY tier", () => {
    // The four the user named explicitly, plus the rest of the user-generated/retail class. Banned
    // means banned — not down-ranked, and not available as a fallback either.
    for (const b of ["reddit.com", "vivino.com", "cellartracker.com", "wine-searcher.com"]) {
      expect(NEVER_SEARCHED, `${b} must be on the ban list`).toContain(b);
    }
    for (const b of NEVER_SEARCHED) {
      expect(ALL_CITABLE_DOMAINS, `${b} must never be searchable`).not.toContain(b);
    }
  });

  it("keeps Wikipedia out of tier 1 but available as a labelled fallback", () => {
    // It is not citable in an MW answer, so it must never sit alongside the AWRI or the INAO — but
    // for an obscure grape with no tier-1 coverage it beats unattributed recollection.
    expect(ALL_TIER1_DOMAINS).not.toContain("wikipedia.org");
    expect(fallbackDomains()).toContain("wikipedia.org");
    expect(ALL_CITABLE_DOMAINS).toContain("wikipedia.org");
  });

  it("drops a banned URL even if one somehow comes back", () => {
    // include_domains should make this unreachable; the filter exists in case that ever changes.
    expect(isBannedUrl("https://www.reddit.com/r/wine/x")).toBe(true);
    expect(isBannedUrl("https://old.reddit.com/r/wine/x")).toBe(true);
    expect(isBannedUrl("https://www.wine-searcher.com/find/x")).toBe(true);
    expect(isBannedUrl("https://www.decanter.com/x")).toBe(false);
    expect(isBannedUrl("https://en.wikipedia.org/wiki/Savagnin")).toBe(false);
    expect(isBannedUrl("garbage")).toBe(true);
  });

  it("covers all four evidence classes a candidate needs", () => {
    expect(domainsFor(["regulatory"])).toContain("inao.gouv.fr");
    expect(domainsFor(["research"])).toContain("awri.com.au");
    expect(domainsFor(["trade"])).toContain("jancisrobinson.com");
    expect(domainsFor(["market"])).toContain("iwsr.com");
  });

  it("defaults to a narrow blend rather than everything", () => {
    const def = domainsFor(undefined);
    expect(def.length).toBeGreaterThan(0);
    expect(def.length).toBeLessThan(ALL_TIER1_DOMAINS.length);
  });

  it("caps the domain list so the query is not diluted", () => {
    expect(domainsFor(["regulatory", "research", "trade", "market"]).length).toBeLessThanOrEqual(40);
  });

  it("names the publisher behind a result URL", () => {
    expect(publisherFor("https://www.jancisrobinson.com/articles/x")).toMatch(/jancisrobinson\.com/);
    expect(publisherFor("https://www.awri.com.au/x")).toMatch(/research/);
    expect(publisherFor("not a url")).toBeNull();
  });
});

describe("web search routing", () => {
  const src = fs.readFileSync(path.join(appDir, "src/lib/coach/tools/web-tools.ts"), "utf8");

  it("restricts the search at the API rather than filtering afterwards", () => {
    expect(src).toMatch(/includeDomains/);
    expect(src).toMatch(/domainsFor\(/);
  });

  it("redirects production-technique questions to the curated corpus", () => {
    // The KB is better evidence for how wine is made, and this is a refusal rather than a
    // preference — the model does not get to choose the weaker source.
    expect(src).toMatch(/PRODUCTION_TECHNIQUE\.test\(query\)/);
    expect(src).toMatch(/redirected: true/);
    expect(src).toMatch(/search_winemaking_science/);
  });

  it("lets a rules-or-market question through even when it names a technique", () => {
    // "malolactic fermentation regulations in Chablis" is a web question; the override exists so the
    // redirect does not swallow it.
    expect(src).toMatch(/OVERRIDES_KB/);
  });

  it("falls back to Wikipedia ONCE, and never to the open web", () => {
    expect(src).toMatch(/fallbackDomains\(\)/);
    expect(src).toMatch(/sourceTier: tier/);
    // A search with no include_domains at all would be the open web — the thing the policy exists
    // to prevent. Both passes must constrain the domain list.
    expect(src).not.toMatch(/includeDomains:\s*undefined/);
    expect(src).not.toMatch(/include_domains:\s*\[\]/);
  });

  it("labels a fallback result so it cannot pass as authoritative", () => {
    expect(src).toMatch(/FALLBACK RESULTS/);
    expect(src).toMatch(/NOT citable/);
  });

  it("still reports a genuinely empty result rather than inventing one", () => {
    expect(src).toMatch(/matched: 0/);
    expect(src).toMatch(/do not fall/i);
  });

  it("filters banned URLs defensively after the search", () => {
    expect(src).toMatch(/isBannedUrl/);
  });
});

describe("web citation guard", () => {
  it("corrects a web-sourced reply with no attribution", () => {
    const r = webCitationGuard("Bordeaux en primeur volumes fell sharply this year.", ["search_wine_web"]);
    expect(r.code).toBe("uncited_web_claim");
  });

  it("accepts a bare URL", () => {
    const r = webCitationGuard("See https://www.decanter.com/x for the figures.", ["search_wine_web"]);
    expect(r.code).toBeNull();
  });

  it("accepts the publisher named in prose", () => {
    const r = webCitationGuard("Per jancisrobinson.com, the release was delayed.", ["search_wine_web"]);
    expect(r.code).toBeNull();
  });

  it("stays quiet when no web search happened", () => {
    expect(webCitationGuard("Chablis is in northern Burgundy.", ["query_corpus"]).code).toBeNull();
  });
});
