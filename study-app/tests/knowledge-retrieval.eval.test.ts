// Unit 5 — retrieval eval over the frozen production corpus.
//
// WHAT THIS IS FOR. Retrieval fails quietly. Nothing throws when the French lexical arm stops matching,
// or when a prompt tweak drops the sparkling passages two slots and a generic fermentation passage
// takes their place. The answers just get a bit worse, and nobody notices for a month. So this file
// asserts on things that are cheap to check and expensive to lose.
//
// THREE KINDS OF CHECK, deliberately different in strictness:
//
//  1. COVERAGE (hard assertions). For a query whose subject the corpus demonstrably covers, at least N
//     of the top-6 must be on-topic. These fail the suite.
//
//  2. CROSS-LINGUAL REACHABILITY (hard assertions). The single most fragile thing in the stack. The
//     English lexical arm scores 0 against 5,200 French UMC chunks; if the concept map in lexicon.ts
//     regresses, or someone "simplifies" retrieve.ts back to one lexical arm, French and German
//     content silently becomes dense-only. Measured once, asserted forever.
//
//  3. SLOT OCCUPANCY / DISPLACEMENT (reported, not asserted). Borrowed from the source system's
//     eval/register.ts, which makes the right argument: WHICH PUBLISHER WON EACH SLOT is an objective
//     fact, whereas classifying a passage's "quality" from its text is a heuristic that rots. MMR at
//     lambda=0.7 structurally advantages a source with a distinct register — it can win a slot
//     BECAUSE it is unlike what is already chosen — so corpus or prompt changes are not
//     register-neutral by default and nothing else would catch the drift. A diff here is not a bug;
//     it means a human should look.
//
// Needs DATABASE_URL and VOYAGE_API_KEY; skips cleanly without them so `npm test` stays green in CI
// and for anyone without credentials.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { retrieveKnowledge, type RetrievedPassage } from "../src/lib/knowledge/retrieve";
import { shouldRetrieve } from "../src/lib/knowledge/context";
import { buildLexicalQueries } from "../src/lib/knowledge/lexicon";

const HAVE_ENV = !!process.env.DATABASE_URL && !!process.env.VOYAGE_API_KEY;
const BASELINE = join(__dirname, "fixtures", "kb-retrieval-baseline.json");

interface Golden {
  name: string;
  query: string;
  /** At least `minOnTopic` of the top-6 must carry one of these topics. */
  topics?: string[];
  minOnTopic?: number;
  /** At least one passage must come from this publisher (cross-lingual reachability). */
  requirePublisher?: string;
  /** At least one passage must be in this language. */
  requireLanguage?: string;
}

// Chosen to sit inside the corpus's demonstrated coverage. Fortified/oxidative is deliberately absent
// from the coverage cases — the corpus has 5 chunks on it and the gate suppresses those questions
// entirely (see the gate suite at the bottom).
const GOLDEN: Golden[] = [
  {
    name: "traditional-method sparkling",
    query: "How was this sparkling wine made? Explain the second fermentation in bottle, lees autolysis and disgorgement.",
    topics: ["sparkling"],
    minOnTopic: 2,
    requirePublisher: "Union des Maisons de Champagne",
    requireLanguage: "fr",
  },
  {
    name: "dosage and sweetness in sparkling",
    query: "Discuss the dosage regime and how the final sweetness of this sparkling wine was set.",
    topics: ["sparkling"],
    minOnTopic: 1,
  },
  {
    name: "malolactic fermentation",
    query: "Was malolactic fermentation used, and what does it contribute to texture and acidity?",
    topics: ["malolactic", "fermentation", "white-vinification"],
    minOnTopic: 2,
  },
  {
    name: "lees ageing and texture",
    query: "Account for the texture of this white wine with reference to lees contact and bâtonnage.",
    topics: ["white-vinification", "lees-ageing", "oak-ageing", "fermentation"],
    minOnTopic: 2,
  },
  {
    name: "oak maturation",
    query: "Comment on the oak regime: barrel size, age of wood and length of maturation.",
    topics: ["oak-ageing", "white-vinification", "red-extraction"],
    minOnTopic: 1,
  },
  {
    name: "red extraction",
    query: "What explains the tannin structure and colour of this red? Discuss cap management and maceration length.",
    topics: ["red-extraction", "red-vinification"],
    minOnTopic: 2,
  },
  {
    name: "whole bunch and carbonic",
    query: "Was whole bunch fermentation or carbonic maceration used in the production of this red?",
    topics: ["red-extraction", "fermentation", "red-vinification"],
    minOnTopic: 1,
  },
  {
    name: "fermentation temperature in aromatic whites",
    // `malolactic` belongs in this list. The topic slugs are free-form classifier output, not a
    // vocabulary designed for these assertions, and MLF is a fermentation decision that bears
    // directly on a white's aromatic profile. Widening here is not the "rationalise the regression"
    // move the source system's eval warns about — the passages ARE on subject; my slug list was
    // simply narrower than the classifier's.
    query: "How did fermentation temperature and yeast choice shape the aromatic profile of this white?",
    topics: ["fermentation", "white-vinification", "yeast-fermentation", "malolactic"],
    minOnTopic: 2,
  },
  {
    // Sweetness WITHOUT botrytis: arrested fermentation, Süssreserve, RS management. This is covered —
    // the German institutes write about it — and stays retrievable. The botrytis case that used to sit
    // here moved to the gate suite: see the F4 note in context.ts.
    name: "sweetness by arrested fermentation",
    query: "Explain the mechanism by which residual sugar was retained — arrested fermentation or Süssreserve?",
    topics: ["sweet-wine", "fermentation", "white-vinification", "stabilisation"],
    minOnTopic: 1,
  },
  {
    name: "reduction and struck match",
    query: "Account for the struck-match reductive character and how the winemaker managed sulfur and oxygen.",
    topics: ["faults", "white-vinification", "stabilisation"],
    minOnTopic: 1,
  },
  {
    name: "brettanomyces and volatile acidity",
    query: "Is this wine showing brettanomyces or volatile acidity, and what winemaking allowed it?",
    topics: ["faults"],
    minOnTopic: 2,
  },
  {
    name: "fining filtration stabilisation",
    query: "Discuss fining, filtration and tartrate stabilisation before bottling.",
    topics: ["stabilisation"],
    minOnTopic: 2,
  },
  // --- fortified corpus (added by scripts/kb-fortified-build.mjs) -------------------------------
  // These are the queries that used to be SUPPRESSED outright, and before that returned Champagne
  // mousse studies. requirePublisher is the point of each: it is not enough that something comes
  // back, it must come back from the body that regulates the wine.
  {
    name: "sherry solera and biological ageing",
    query: "Explain the criaderas and solera system and how biological ageing under flor differs from oxidative ageing.",
    topics: ["fortified"],
    minOnTopic: 4,
    requirePublisher: "Consejo Regulador DO Jerez-Xérès-Sherry",
  },
  {
    name: "sherry fortification levels",
    query: "To what alcohol is a fino fortified compared with an oloroso, and why does that decide the ageing style?",
    topics: ["fortified"],
    minOnTopic: 4,
  },
  {
    name: "port fortification and benefício",
    query: "How is Port fortified? Discuss the timing of the aguardente addition and how it sets residual sugar.",
    topics: ["fortified"],
    minOnTopic: 3,
  },
  {
    name: "madeira estufagem and canteiro",
    query: "Explain estufagem and canteiro ageing in Madeira and their effect on the finished wine.",
    topics: ["fortified"],
    minOnTopic: 3,
  },
  {
    name: "vin doux naturel mutage",
    query: "Describe mutage in the production of a vin doux naturel such as Banyuls or Rivesaltes.",
    topics: ["fortified"],
    minOnTopic: 2,
  },
  // --- botrytis / noble rot (added by --group botrytis) -----------------------------------------
  // The hardest regression to guard in the whole suite. Before the noble-rot corpus these queries
  // returned bunch-rot disease control from viticulture institutes — real, tier-1 and exactly
  // backwards. requirePublisher on the INAO entry is the check that legal text, not agronomy, wins.
  {
    name: "sauternes noble rot harvest",
    query: "Explain how this Sauternes was made: the role of Botrytis cinerea, tries successives and the concentration of the must.",
    topics: ["sweet-wine"],
    minOnTopic: 4,
    requirePublisher: "INAO — cahiers des charges (Sauternes, Coteaux du Layon, Alsace VT/SGN)",
  },
  {
    name: "noble rot berry chemistry",
    query: "What does noble rot do to the berry — glycerol, gluconic acid, and how does it differ from grey rot?",
    topics: ["sweet-wine"],
    minOnTopic: 3,
  },
  {
    name: "tokaji aszu production",
    query: "Describe the production of Tokaji Aszú, including the aszú berries, the base wine and residual sugar.",
    topics: ["sweet-wine"],
    minOnTopic: 2,
  },
  {
    name: "Alsace SGN and vendanges tardives",
    query: "Explain the difference between vendanges tardives and sélection de grains nobles in Alsace.",
    topics: ["sweet-wine"],
    minOnTopic: 2,
  },
  {
    name: "German white production (language reach)",
    query: "How was this German Riesling produced — must handling, fermentation and residual sugar?",
    requireLanguage: "de",
  },
  {
    name: "Champagne pressing and taille (language reach)",
    query: "Discuss the pressing regime, the cuvée and taille fractions and reserve wine use.",
    requirePublisher: "Union des Maisons de Champagne",
  },
];

const results = new Map<string, RetrievedPassage[]>();

describe.skipIf(!HAVE_ENV)("knowledge retrieval eval", () => {
  beforeAll(async () => {
    // Sequential on purpose: each query is a Voyage call plus several DB round trips, and a burst of
    // 14 buys nothing but rate-limit risk in a suite that runs rarely.
    for (const g of GOLDEN) {
      results.set(g.name, await retrieveKnowledge({ query: g.query, topK: 6 }));
    }
  }, 180_000);

  it("returns a full result set for every golden query", () => {
    for (const g of GOLDEN) {
      expect(results.get(g.name)!.length, `${g.name} returned nothing`).toBeGreaterThan(0);
    }
  });

  it.each(GOLDEN.filter((g) => g.topics))("$name — on-topic coverage", (g) => {
    const passages = results.get(g.name)!;
    const hits = passages.filter((p) => p.topic && g.topics!.includes(p.topic));
    expect(
      hits.length,
      `expected >=${g.minOnTopic} of top-${passages.length} in [${g.topics!.join("|")}], ` +
        `got ${hits.length}: ${passages.map((p) => p.topic ?? "-").join(", ")}`,
    ).toBeGreaterThanOrEqual(g.minOnTopic ?? 1);
  });

  it.each(GOLDEN.filter((g) => g.requirePublisher || g.requireLanguage))(
    "$name — cross-lingual reachability",
    (g) => {
      const passages = results.get(g.name)!;
      if (g.requirePublisher) {
        expect(
          passages.some((p) => p.publisher === g.requirePublisher),
          `no passage from ${g.requirePublisher}; got ${[...new Set(passages.map((p) => p.publisher))].join(", ")}`,
        ).toBe(true);
      }
      if (g.requireLanguage) {
        expect(
          passages.some((p) => p.language === g.requireLanguage),
          `no ${g.requireLanguage} passage; got ${passages.map((p) => p.language).join(", ")}`,
        ).toBe(true);
      }
    },
  );

  it("every retrieved passage carries a resolvable citation and a dated provenance", () => {
    for (const [name, passages] of results) {
      for (const p of passages) {
        expect(p.canonicalUrl, `${name}: passage without a URL`).toMatch(/^https?:\/\//);
        expect(["published", "last-modified", "unknown"]).toContain(p.dateSource);
      }
    }
  });

  // Reported, not asserted — see header. A diff means look, not fail.
  it("records slot occupancy and reports displacement against the baseline", () => {
    const observed: Record<string, string[]> = {};
    for (const g of GOLDEN) observed[g.name] = results.get(g.name)!.map((p) => p.publisher);

    if (!existsSync(BASELINE)) {
      mkdirSync(dirname(BASELINE), { recursive: true });
      writeFileSync(BASELINE, JSON.stringify(observed, null, 2));
      console.log(`[kb-eval] wrote new slot-occupancy baseline -> ${BASELINE}`);
      return;
    }

    const baseline = JSON.parse(readFileSync(BASELINE, "utf-8")) as Record<string, string[]>;
    const moved: string[] = [];
    for (const g of GOLDEN) {
      const before = baseline[g.name];
      const after = observed[g.name];
      if (!before) {
        moved.push(`${g.name}: NEW query, no baseline`);
        continue;
      }
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        moved.push(`${g.name}\n    before: ${before.join(" | ")}\n    after:  ${after.join(" | ")}`);
      }
    }
    if (moved.length) {
      console.log(`\n[kb-eval] SLOT OCCUPANCY MOVED in ${moved.length}/${GOLDEN.length} queries:\n  ${moved.join("\n  ")}\n`);
      console.log(`[kb-eval] If intended, delete ${BASELINE} and re-run to re-baseline.`);
    } else {
      console.log(`[kb-eval] slot occupancy unchanged across all ${GOLDEN.length} queries.`);
    }
    expect(true).toBe(true);
  });
});

// These need no credentials — pure functions — so they always run.
describe("retrieval gate", () => {
  const CASES: [string | null, string, boolean][] = [
    ["F5", "Comment on the method of production of each wine.", true],
    ["F6", "Explain the mechanism by which sweetness was achieved.", true],
    [null, "How was this sparkling wine made?", true],
    [null, "Discuss the winemaking and maturation of Wines 4-6.", true],
    ["F1", "Identify the variety and country of origin.", false],
    ["F2", "Identify the region of origin as precisely as possible.", false],
    [null, "Assess the commercial appeal and likely retail price.", false],
    // FLIPPED once the fortified corpus landed. These asserted `false` while the corpus held 5 sherry
    // chunks; it now holds 267, so suppressing them would be withholding real coverage. The
    // assertions are kept rather than deleted — they are the regression guard proving the gate
    // actually reopened.
    ["F5", "Comment on the method of production of these fortified wines.", true],
    ["F5", "Explain the oxidative character of Wine 9 and how it was achieved.", true],
    [null, "Wine 11 is a Sherry. Describe how it was made.", true],
    [null, "Discuss the production of this vin jaune.", true],
    [null, "Explain the solera and criaderas system used for this wine.", true],
    [null, "How was this Tawny Port aged?", true],
    [null, "Discuss estufagem in the production of this Madeira.", true],
    // FLIPPED once the noble-rot corpus landed (462 chunks). These asserted `false` while the corpus
    // framed botrytis as a disease 3:1; it now favours noble rot 4:1. Kept rather than deleted — they
    // are the regression guard proving the gate reopened.
    ["F5", "Explain how the sweetness of this botrytis-affected wine was achieved.", true],
    [null, "Describe the production of this Sauternes.", true],
    [null, "How was this Trockenbeerenauslese made?", true],
    [null, "Discuss the tries successives used to harvest this wine.", true],
    [null, "Explain the aszú berries used for this Tokaji.", true],
    // ...but sweetness WITHOUT botrytis is covered and must still retrieve.
    ["F6", "Explain the mechanism by which residual sugar was retained in this Riesling.", true],
  ];

  it.each(CASES)("family=%s %s -> %s", (family, questionText, want) => {
    expect(shouldRetrieve({ questionText, family }).retrieve).toBe(want);
  });

  it("builds a French lexical arm for Champagne vocabulary", () => {
    const arms = buildLexicalQueries("second fermentation, riddling and disgorgement");
    expect(arms.map((a) => a.tsConfig)).toContain("french");
    expect(arms.find((a) => a.tsConfig === "french")!.query).toContain("dégorgement");
  });
});
