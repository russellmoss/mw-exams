import { describe, it, expect } from "vitest";
import { buildLexicalQueries, allTerms } from "../src/lib/knowledge/lexicon";
import { dateOf } from "../src/lib/knowledge/retrieve";
import { assessPassageAge, summarizeCorpusAge } from "../src/lib/knowledge/passage-age";

// These tests guard the piece of retrieval that is easiest to break silently. A regression here does
// not throw and does not fail a smoke test — it just quietly stops returning the French and German
// half of the corpus, which is the half that made importing it worthwhile.

describe("buildLexicalQueries", () => {
  it("always emits an english arm carrying the raw query", () => {
    const arms = buildLexicalQueries("how was this wine made");
    expect(arms[0].tsConfig).toBe("english");
    expect(arms[0].query).toContain("how was this wine made");
  });

  it("emits ONLY the english arm when no production concept matches", () => {
    // Firing a French arm with no French terms in it returns noise ranked by nothing. A missing arm
    // is cheaper than a misleading one.
    const arms = buildLexicalQueries("what is the commercial positioning of this wine");
    expect(arms).toHaveLength(1);
    expect(arms[0].tsConfig).toBe("english");
  });

  it("translates sparkling terms into the languages UMC and WBI are written in", () => {
    const arms = buildLexicalQueries("describe the disgorgement and dosage regime");
    const byConfig = Object.fromEntries(arms.map((a) => [a.tsConfig, a.query]));

    // This is the measured failure the whole language layer exists to fix: an english-config query
    // scores 0 hits against 5,200 French UMC chunks; these terms score 347.
    expect(byConfig.french).toContain("dégorgement");
    expect(byConfig.french).toContain("liqueur d'expédition");
    expect(byConfig.german).toContain("Degorgieren");
    expect(byConfig.spanish).toContain("degüelle");
  });

  it("fires from a non-English term in the query too", () => {
    const arms = buildLexicalQueries("was the bâtonnage aggressive?");
    const configs = arms.map((a) => a.tsConfig);
    expect(configs).toContain("french");
    // and pulls the English term back in for the english arm
    expect(arms[0].query).toContain("lees stirring");
  });

  it("joins multi-term language arms with websearch_to_tsquery's OR", () => {
    const arms = buildLexicalQueries("malolactic fermentation and lees ageing");
    const french = arms.find((a) => a.tsConfig === "french")!;
    expect(french.query).toMatch(/ OR /);
    expect(french.query).toContain("fermentation malolactique");
    expect(french.query).toContain("lies");
  });

  it("builds an Italian arm for disciplinare vocabulary", () => {
    // Italian shipped 451 chunks before this file knew the language existed. The arm must exist and
    // must carry real terms of art, not just be present and empty.
    const arms = buildLexicalQueries("ageing in oak and maceration");
    const italian = arms.find((a) => a.tsConfig === "italian");
    expect(italian, "no italian arm").toBeTruthy();
    expect(italian!.query).toContain("affinamento");
    expect(italian!.query).toContain("rovere");
  });

  it("does not leak region or variety vocabulary into the map", () => {
    // Retrieval is gated to production questions; terms that pull regional passages defeat the gate.
    const terms = allTerms("english").join(" ").toLowerCase();
    for (const banned of ["burgundy", "barossa", "chardonnay", "riesling", "rioja", "napa"]) {
      expect(terms).not.toContain(banned);
    }
  });
});

describe("dateOf", () => {
  it("prefers a declared publication date", () => {
    const r = dateOf({ published_at: "2019-04-01T00:00:00Z", sitemap_lastmod: "2026-01-01T00:00:00Z" });
    expect(r.dateSource).toBe("published");
    expect(r.publishedAt?.getUTCFullYear()).toBe(2019);
  });

  it("falls back to sitemap lastmod but LABELS it, never passing it off as published", () => {
    // A lastmod is when the page was touched. Collapsing the two lets a 2009 document present as new.
    const r = dateOf({ published_at: null, sitemap_lastmod: "2026-01-01T00:00:00Z" });
    expect(r.dateSource).toBe("last-modified");
  });

  it("reports unknown when neither exists", () => {
    expect(dateOf({ published_at: null, sitemap_lastmod: null }).dateSource).toBe("unknown");
  });
});

describe("assessPassageAge", () => {
  const now = new Date("2026-08-02T00:00:00Z");

  it("treats enology fundamentals under 10 years as current", () => {
    expect(assessPassageAge(new Date("2020-01-01T00:00:00Z"), now).level).toBe("current");
  });

  it("warns about regulation and prevailing practice, not spray intervals", () => {
    const a = assessPassageAge(new Date("2001-01-01T00:00:00Z"), now);
    expect(a.level).toBe("stale");
    expect(a.warning).toMatch(/PERMITTED|regulation|market/i);
    // The source system's pesticide framing would be incoherent in an exam answer.
    expect(a.warning).not.toMatch(/re-entry|pesticide|spray/i);
  });

  it("warns on an undated passage rather than treating it as fresh", () => {
    const a = assessPassageAge(null, now);
    expect(a.level).toBe("unknown");
    expect(a.warning).toBeTruthy();
  });

  it("says nothing when every passage is current", () => {
    expect(summarizeCorpusAge([assessPassageAge(new Date("2024-01-01T00:00:00Z"), now)])).toBeNull();
  });
});
