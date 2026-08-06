// citation-rules.test.ts — the relevance gate on "Sources consulted" citation blocks.
//
// Every fixture below is a REAL observed failure from the banked corpus (2026-08-05): annual-report
// PDFs and documents about entirely different wines were listed under model answers, because the
// citation block took the top retrieved documents with no topical check.
import { describe, it, expect } from "vitest";
import { citationDropReason, filterCitationDocs, parseCitationBlock } from "../src/lib/citation-rules.mjs";

const LOIRE_CTX =
  "For each wine identify the grape variety and region. Domaine des Baumard, Savennières Clos du Papillon, 2020. Loire Valley, France. Emilio Rojo, Ribeiro Blanco, 2022. Galicia, Spain.";

describe("junk documents are dropped everywhere", () => {
  it.each([
    [
      "WBI annual report by URL path",
      { publisher: "WBI Freiburg", title: "Staatliches Weinbauinstitut", url: "https://wbi.example/Jahresberichte%20bis%202009/Jahresbericht%20WBI%201995.pdf" },
    ],
    [
      "ICVV memoria",
      { publisher: "ICVV", title: "1. Presentación y objetivos 2. Estructura y personal", url: "https://icvv.example/memoria-2010-2011.pdf" },
    ],
  ])("%s", (_label, doc) => {
    expect(citationDropReason(doc, LOIRE_CTX)).toBeTruthy();
  });
});

describe("topical pins", () => {
  const BAROSSA_DOC = {
    publisher: "AWRI",
    title: "Identifying objective measures for Barossa Valley Shiraz grapes",
    url: "https://awri.example/s2133.pdf",
  };
  const FORTIFIED_DOC = {
    publisher: "PMC",
    title: "The Flavor Chemistry of Fortified Wines — A Comprehensive Approach",
    url: "https://pmc.example/PMC8229606",
  };

  it("drops a Barossa Shiraz doc under a Loire flight", () => {
    expect(citationDropReason(BAROSSA_DOC, LOIRE_CTX)).toMatch(/syrah|barossa/i);
  });

  it("keeps the same doc under a Shiraz flight (Shiraz≡Syrah via canon)", () => {
    const ctx = "Wines 1-2 are Syrah. Penfolds, Syrah, 2020. Barossa Valley, Australia.";
    expect(citationDropReason(BAROSSA_DOC, ctx)).toBeNull();
  });

  it("drops fortified chemistry under a still Pinot flight, keeps it under a Port flight", () => {
    const pinot = "Wines 1-2 are Pinot Noir. Fourrier, Gevrey-Chambertin, 2020. Burgundy, France.";
    const port = "Wine 1 is fortified. Graham's LBV Port 2018. Douro Valley, Portugal.";
    expect(citationDropReason(FORTIFIED_DOC, pinot)).toBeTruthy();
    expect(citationDropReason(FORTIFIED_DOC, port)).toBeNull();
  });

  it("a generic production title always passes", () => {
    const doc = { publisher: "AWRI", title: "Malolactic fermentation — a review of practice", url: "https://x/mlf" };
    expect(citationDropReason(doc, LOIRE_CTX)).toBeNull();
  });

  it("a shared style vouches for a foreign region — Champagne autolysis doc kept under a Cava flight", () => {
    const doc = { publisher: "UMC", title: "Champagne — lees autolysis and mousse development", url: "https://umc.example/autolysis" };
    const cava = "Wine 1 is a traditional method sparkling wine. Juvé & Camps, Gran Reserva Brut Nature, 2019. Penedès, Spain.";
    expect(citationDropReason(doc, cava)).toBeNull();
    // …but under a still red flight the style pin drops it before the region pin matters.
    const still = "Wine 1 is Tempranillo. Muga, Reserva, 2019. Rioja, Spain.";
    expect(citationDropReason(doc, still)).toBeTruthy();
  });

  it("an INAO Sauternes cahier keeps under a Sauternes flight, drops under sparkling", () => {
    const doc = { publisher: "INAO", title: "cahiers des charges (Sauternes, Coteaux du Layon, Alsace VT/SGN)", url: "https://inao.example/x.pdf" };
    const sauternes = "Château Rieussec, Sauternes, 2016. Bordeaux, France.";
    const sparkling = "Pol Roger, Brut Réserve, NV. Champagne, France. Peter Lehmann Sparkling Shiraz 2018. Barossa Valley, Australia.";
    expect(citationDropReason(doc, sauternes)).toBeNull();
    expect(citationDropReason(doc, sparkling)).toBeTruthy();
  });
});

describe("filterCitationDocs + parseCitationBlock round trip", () => {
  it("parses the stored block shape and filters it", () => {
    const answer = `Some answer prose about Savennières Chenin.

---

**Sources consulted** — tier-1 references behind the production and appellation points above.

- [AWRI — Identifying objective measures for Barossa Valley Shiraz grapes](https://awri.example/s2133.pdf)
- [IFV — Lees ageing in white winemaking](https://ifv.example/lees)
`;
    const parsed = parseCitationBlock(answer);
    expect(parsed).not.toBeNull();
    expect(parsed!.docs).toHaveLength(2);
    const { kept, dropped } = filterCitationDocs(parsed!.docs, LOIRE_CTX);
    expect(kept.map((d) => d.url)).toEqual(["https://ifv.example/lees"]);
    expect(dropped).toHaveLength(1);
  });

  it("returns null when there is no citation block", () => {
    expect(parseCitationBlock("Just an answer with no sources.")).toBeNull();
  });
});
