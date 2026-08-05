import { describe, it, expect } from "vitest";
import { normalizeSources, describeSource } from "@/lib/wine-bank-lookup";
import { normalizeCitations, looksLikeTechSheet } from "@/lib/wine-enrichment";

/**
 * Wine enrichment now gathers evidence in tiers (technical sheet -> named critic -> open web) and
 * records WHICH document supports WHICH grid field. These tests pin the three places that can
 * silently lie about provenance:
 *
 *  - sources: hundreds of banked rows still store bare URL strings, so both shapes must read back
 *    identically or old wines appear to have no sources at all.
 *  - citations: the model emits document NUMBERS. An out-of-range number would render as a
 *    confident link to nothing, which is worse than admitting a field was inferred.
 *  - tech-sheet detection: gets it wrong in the expensive direction (a wasted advanced extract) or
 *    the lossy one (falling back to 400-char snippets when the real document was available).
 */

describe("normalizeSources — legacy and typed rows read alike", () => {
  it("upgrades bare URL strings to web-tier sources", () => {
    expect(normalizeSources(["https://vinous.com/x", "https://foo.test/y"])).toEqual([
      { url: "https://vinous.com/x", type: "web" },
      { url: "https://foo.test/y", type: "web" },
    ]);
  });

  it("preserves typed sources and defaults an unknown type to web", () => {
    const out = normalizeSources([
      { url: "https://a.test/ts.pdf", type: "tech_sheet", publisher: "Elite Wines" },
      { url: "https://b.test/r", type: "nonsense", author: "Neal Martin", publisher: "Vinous" },
    ]);
    expect(out[0]).toMatchObject({ type: "tech_sheet", publisher: "Elite Wines" });
    expect(out[1]).toMatchObject({ type: "web", author: "Neal Martin" });
  });

  it("drops entries with no usable url, and tolerates non-arrays", () => {
    expect(normalizeSources([{ publisher: "Vinous" }, "", "   "])).toEqual([]);
    expect(normalizeSources(null)).toEqual([]);
    expect(normalizeSources(undefined)).toEqual([]);
    expect(normalizeSources("https://not-an-array.test")).toEqual([]);
  });
});

describe("describeSource — human-readable attribution", () => {
  it("labels a tech sheet as such", () => {
    expect(describeSource({ url: "https://a.test/x.pdf", type: "tech_sheet", publisher: "Elite Wines" }))
      .toBe("Tech sheet — Elite Wines");
  });

  it("puts the author before the publisher for a signed critic note", () => {
    expect(describeSource({ url: "https://vinous.com/x", type: "critic", publisher: "Vinous", author: "Neal Martin" }))
      .toBe("Neal Martin, Vinous");
  });

  it("falls back to a bare hostname when nothing is attributed", () => {
    expect(describeSource({ url: "https://www.example.com/a/b", type: "web" })).toBe("example.com");
  });
});

describe("normalizeCitations — document numbers must resolve", () => {
  it("converts 1-based document numbers to 0-based source indices", () => {
    expect(normalizeCitations({ color: [1], nose_descriptors: [1, 3] }, 3))
      .toEqual({ color: [0], nose_descriptors: [0, 2] });
  });

  it("drops references to documents that were never supplied", () => {
    // Three docs were given; [7] and [0] cannot refer to any of them.
    expect(normalizeCitations({ color: [7], palate_acid: [0], palate_body: [2] }, 3))
      .toEqual({ color: [], palate_acid: [], palate_body: [1] });
  });

  it("keeps an empty array — an inferred field must stay visible, not vanish", () => {
    expect(normalizeCitations({ palate_tannin: [] }, 2)).toEqual({ palate_tannin: [] });
  });

  it("dedupes repeated references and ignores metadata keys", () => {
    expect(normalizeCitations({ color: [1, 1, 2], sources: [1], inferred_fields: [1] }, 2))
      .toEqual({ color: [0, 1] });
  });

  it("returns an empty map for junk rather than throwing", () => {
    expect(normalizeCitations(null, 3)).toEqual({});
    expect(normalizeCitations("nope", 3)).toEqual({});
    expect(normalizeCitations({ color: "1" }, 3)).toEqual({ color: [] });
  });
});

describe("looksLikeTechSheet — what earns a paid full extract", () => {
  it("accepts PDFs, including with a query string or fragment", () => {
    expect(looksLikeTechSheet({ url: "https://a.test/Mouton-21-TS.pdf", title: "" })).toBe(true);
    expect(looksLikeTechSheet({ url: "https://a.test/x.pdf?v=2", title: "" })).toBe(true);
    expect(looksLikeTechSheet({ url: "https://a.test/x.PDF#page=1", title: "" })).toBe(true);
  });

  it("accepts HTML tech sheets identified by url or title", () => {
    expect(looksLikeTechSheet({ url: "https://importer.test/tech-sheet/wine", title: "" })).toBe(true);
    expect(looksLikeTechSheet({ url: "https://d.test/x", title: "Fiche Technique 2021" })).toBe(true);
    expect(looksLikeTechSheet({ url: "https://d.test/x", title: "Chablis fact sheet" })).toBe(true);
  });

  it("rejects ordinary review and shop pages", () => {
    expect(looksLikeTechSheet({ url: "https://vinous.com/wines/123", title: "Tondonia 2012" })).toBe(false);
    expect(looksLikeTechSheet({ url: "https://shop.test/product/x", title: "Buy now" })).toBe(false);
  });
});
