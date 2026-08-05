// novelty-opener-window.test.ts — guards the CALIBRATION of the targeted-mode opener rule.
//
// TARGETED_MAX_OPENER_SIMILARITY (0.9) was calibrated pairwise: 3.6% of real same-concept pairs in
// data/exams.json exceed it. The rule was then applied against the full 30-question recent window,
// and a per-pair rate compounds when you run it 30 times per candidate — so it rejected ~17% of
// AUTHENTIC IMW questions and became the single biggest generation blocker in production (98
// rejections in 8 hours vs 40 for the next novelty rule).
//
// The threshold is fine; the WINDOW was the bug. These tests pin both halves so neither can drift:
// the real-corpus rejection rate must stay near what the threshold was designed for, and the window
// must actually be applied.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  validateNoveltyAgainstLatest,
  stemOpenerTokens,
  TARGETED_MAX_OPENER_SIMILARITY,
  TARGETED_OPENER_WINDOW,
} from "../src/lib/question-engine";

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "exams.json");

function realQuestionTexts(): string[] {
  const out: string[] = [];
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === "object") {
      const rec = o as Record<string, unknown>;
      if (typeof rec.text === "string") out.push(rec.text);
      Object.values(rec).forEach(walk);
    }
  };
  walk(JSON.parse(readFileSync(CORPUS, "utf8")));
  return out;
}

const jaccard = (a: Set<string>, b: Set<string>): number => {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
};

// "Would the opener rule reject this real question, comparing against the previous `window`?"
function realCorpusRejectionRate(window: number): number {
  const toks = realQuestionTexts().map(stemOpenerTokens);
  let rejected = 0;
  for (let i = 0; i < toks.length; i++) {
    for (let j = Math.max(0, i - window); j < i; j++) {
      if (jaccard(toks[i], toks[j]) >= TARGETED_MAX_OPENER_SIMILARITY) {
        rejected++;
        break;
      }
    }
  }
  return rejected / toks.length;
}

describe.skipIf(!existsSync(CORPUS))("opener rule stays calibrated against the real corpus", () => {
  it("rejects no more than 7% of authentic IMW questions at the shipped window", () => {
    const rate = realCorpusRejectionRate(TARGETED_OPENER_WINDOW);
    // 3.6% is what the threshold was calibrated for pairwise; the ceiling leaves headroom for corpus
    // growth without letting the window silently widen back out.
    //
    // Raised 6% -> 7% when the 2026 papers were added (153 -> 161 questions, 9 -> 10 rejections,
    // 5.88% -> 6.21%). Window and threshold are UNCHANGED; the rate moved because the corpus grew by
    // a year containing one more instance of a pattern it already exhibited nine times. Every one of
    // the 10 rejections is the IMW reusing an opener framing between adjacent questions of the same
    // paper, varying only the wine numbers — e.g. 2026 P1: "Wines 1-6 are from the same single grape
    // variety and come from five different countries" then "Wines 7-9 are from the same single
    // variety and come from three different countries". The generator is deliberately held to a
    // higher variety bar than the real exam, so these stay rejections by design.
    //
    // If this fails again, do NOT just raise the number — first confirm the new rejections are the
    // same same-paper-adjacent-framing shape and that TARGETED_OPENER_WINDOW has not moved. The
    // regression witness below is what actually guards the window.
    expect(rate).toBeLessThanOrEqual(0.07);
  });

  it("documents why the window matters — 30 would reject roughly three times as many", () => {
    // Not a requirement, a regression witness: if someone widens the window back to 30 the first
    // test fails, and this one explains what they traded away.
    expect(realCorpusRejectionRate(30)).toBeGreaterThan(realCorpusRejectionRate(TARGETED_OPENER_WINDOW) * 2);
  });
});

// ── the window is actually applied ────────────────────────────────────────────────────────────────
const WINES_A = [
  { slot: 1, fullText: "Château Batailley, Pauillac, 2016. Bordeaux, France. (13.5%)" },
  { slot: 2, fullText: "Felton Road, Bannockburn Pinot Noir, 2021. Central Otago, New Zealand. (14.0%)" },
];
const WINES_B = [
  { slot: 1, fullText: "Penfolds St Henri Shiraz, 2018. South Australia, Australia. (14.5%)" },
  { slot: 2, fullText: "Klein Constantia, Cabernet Sauvignon, 2019. Constantia, South Africa. (14.0%)" },
];
const WINES_C = [
  { slot: 1, fullText: "Produttori del Barbaresco, Barbaresco, 2019. Piedmont, Italy. (14.0%)" },
  { slot: 2, fullText: "Catena Zapata, Adrianna Vineyard Malbec, 2019. Mendoza, Argentina. (14.0%)" },
];

// stemOpenerTokens reads only the FIRST LINE, so these share an opener while the full stems differ.
// They must differ: an identical full stem trips the exact-stem rule, which is windowless by design
// and would mask whether the opener window is doing anything.
const OPENER_LINE = "Wines 1 and 2 are from the same region and made from the same single grape variety.";
const OPENER = `${OPENER_LINE}\na) Identify the grape variety and region of origin. (2 x 10 marks)`;
const OPENER_ALT = `${OPENER_LINE}\na) Name the variety and its origin as closely as possible. (2 x 12 marks)`;
// Same concept, deliberately different wording — must never trip the rule.
const REPHRASED =
  "Both of these bottles share one origin and one variety; compare them.\na) State the variety. (2 x 10 marks)";

const cand = (questionText: string, wines: typeof WINES_A) =>
  ({ family: "F1", questionText, wines }) as Parameters<typeof validateNoveltyAgainstLatest>[0];
// NonNullable: parameter 1 is `… | null`, which would make an array of these unassignable to the
// recentQuestions parameter.
const prev = (questionText: string, wines: typeof WINES_A) =>
  ({ family: "F1", question_text: questionText, wines }) as NonNullable<
    Parameters<typeof validateNoveltyAgainstLatest>[1]
  >;

// Filler with distinct wines AND distinct framing, so only the opener rule is in play.
const filler = (n: number) =>
  prev(`Wine ${n} is a varietal example; assess its origin and standing in market number ${n}.`, [
    { slot: 1, fullText: `Producer ${n}, Cuvée ${n}, 2020. Region ${n}, Country ${n}. (13.0%)` },
    { slot: 2, fullText: `Producer ${n}b, Cuvée ${n}b, 2019. Region ${n}b, Country ${n}b. (13.5%)` },
  ]);

describe("targeted opener window is enforced", () => {
  it("blocks a near-verbatim opener inside the window", () => {
    const recents = [prev(OPENER_ALT, WINES_B), filler(1), filler(2)];
    const r = validateNoveltyAgainstLatest(cand(OPENER, WINES_A), null, recents, { targeted: true });
    expect(r.valid).toBe(false);
    expect(r.violations.join(" ")).toMatch(/framing sentence/i);
  });

  it("allows the same opener once it has fallen outside the window", () => {
    // The colliding question sits at index TARGETED_OPENER_WINDOW — one past the cutoff.
    const recents = [
      ...Array.from({ length: TARGETED_OPENER_WINDOW }, (_, k) => filler(k + 1)),
      prev(OPENER_ALT, WINES_B),
    ];
    const r = validateNoveltyAgainstLatest(cand(OPENER, WINES_A), null, recents, { targeted: true });
    expect(r.valid).toBe(true);
  });

  it("still blocks an exact wine-set repeat at any depth, window notwithstanding", () => {
    const recents = [
      ...Array.from({ length: TARGETED_OPENER_WINDOW + 3 }, (_, k) => filler(k + 1)),
      prev(REPHRASED, WINES_A),
    ];
    const r = validateNoveltyAgainstLatest(cand(REPHRASED, WINES_A), null, recents, { targeted: true });
    expect(r.valid).toBe(false);
  });

  it("does not fire on a genuinely rephrased opener even adjacent", () => {
    const recents = [prev(OPENER_ALT, WINES_B), filler(1)];
    const r = validateNoveltyAgainstLatest(cand(REPHRASED, WINES_C), null, recents, { targeted: true });
    expect(r.valid).toBe(true);
  });
});
