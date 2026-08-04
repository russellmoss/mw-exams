// novelty-structural-window.test.ts — guards the CALIBRATION of the strict-mode structural rule.
//
// The rule fires on same family + same flight size + a stem-shape Jaccard of 0.7, and it ran against
// the full 30-question recent window. Measured against the 112 family-tagged real questions, that
// rejects 10.7% of AUTHENTIC IMW questions — and the collisions are genuine examiner behaviour, not
// defects (2018_p1_q3 vs 2017_p1_q2, F1/2 wines, score a Jaccard of 1.00: an identical structural
// signature in consecutive years).
//
// Same shape of bug as the opener rule, and the same fix: the threshold is defensible, the window was
// not. Plain Fill-the-Bank batches run in STRICT mode (targeted mode only engages when a family is
// pinned), so this rule sits on the main path for growing the bank.
//
// The fixture is committed so this stays hermetic — the family tags live in the corpus DB, and a unit
// test must not need a database.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  validateNoveltyAgainstLatest,
  stemStructureSignature,
  STRUCTURAL_REPEAT_WINDOW,
} from "../src/lib/question-engine";

type Row = { qid: string; family: string; flightSize: number; text: string };
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "corpus-structural.json");
const corpus: Row[] = JSON.parse(readFileSync(FIXTURE, "utf8"));

const jaccard = (a: Set<string>, b: Set<string>): number => {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
};

// Mirrors the rule in validateNoveltyAgainstLatest.
function realCorpusRejectionRate(window: number): number {
  const sigs = corpus.map((r) => stemStructureSignature(r.text));
  let rejected = 0;
  for (let i = 0; i < corpus.length; i++) {
    for (let j = Math.max(0, i - window); j < i; j++) {
      if (
        corpus[i].family === corpus[j].family &&
        corpus[i].flightSize === corpus[j].flightSize &&
        sigs[i].size >= 4 &&
        sigs[j].size >= 4 &&
        jaccard(sigs[i], sigs[j]) >= 0.7
      ) {
        rejected++;
        break;
      }
    }
  }
  return rejected / corpus.length;
}

describe("structural rule stays calibrated against the real corpus", () => {
  it("has a corpus fixture to measure against", () => {
    expect(corpus.length).toBeGreaterThan(100);
  });

  it("rejects no more than 6% of authentic IMW questions at the shipped window", () => {
    // 2.7% is the pairwise floor; 6% leaves headroom for corpus growth without letting the window
    // silently widen back out to the 10.7% it was shipping.
    expect(realCorpusRejectionRate(STRUCTURAL_REPEAT_WINDOW)).toBeLessThanOrEqual(0.06);
  });

  it("documents what the full window cost — roughly double", () => {
    // Regression witness: widening the window fails the test above, and this says what it bought.
    expect(realCorpusRejectionRate(30)).toBeGreaterThan(realCorpusRejectionRate(STRUCTURAL_REPEAT_WINDOW) * 1.8);
  });
});

// ── the window is actually applied ────────────────────────────────────────────────────────────────
// Same family, same flight size, same stem template, entirely different wines — the exact shape the
// rule fires on. Wines differ so nothing else in strict mode can trip.
const STEM_A =
  "Wines 1 to 3 are from the same region of origin, but made from different single grape varieties.\na) Identify the region of origin (15 marks)\nb) Identify the grape variety and comment on quality (3 x 15 marks)\nc) Comment on the age and vintage (3 x 5 marks)";
const STEM_B =
  "Wines 1 to 3 are from the same region of origin, but made from different single grape varieties.\na) Name the region of origin (15 marks)\nb) Name the grape variety and assess quality (3 x 15 marks)\nc) Assess the age and vintage (3 x 5 marks)";

const w = (n: number, t: string) => ({ slot: n, fullText: t });
const FLIGHT_1 = [
  w(1, "Domaine Leflaive, Puligny-Montrachet, 2019. Burgundy, France. (13.0%)"),
  w(2, "Trimbach, Riesling Cuvée Frédéric Emile, 2016. Alsace, France. (12.5%)"),
  w(3, "Weingut Keller, Riesling GG, 2020. Rheinhessen, Germany. (12.5%)"),
];
const FLIGHT_2 = [
  w(1, "Kumeu River, Maté's Vineyard Chardonnay, 2021. Auckland, New Zealand. (14.0%)"),
  w(2, "Tyrrell's, Vat 1 Semillon, 2017. Hunter Valley, Australia. (11.0%)"),
  w(3, "Álvaro Palacios, Les Terrasses, 2019. Priorat, Spain. (14.5%)"),
];

const cand = (text: string, wines: typeof FLIGHT_1) =>
  ({ family: "F2", questionText: text, wines }) as Parameters<typeof validateNoveltyAgainstLatest>[0];
const prev = (text: string, wines: typeof FLIGHT_1) =>
  ({ family: "F2", question_text: text, wines }) as NonNullable<
    Parameters<typeof validateNoveltyAgainstLatest>[1]
  >;

// Distinct family, wines and shape, so filler can never trip any rule itself.
const filler = (n: number) =>
  prev(`Wine ${n} stands alone; assess its commercial standing in market ${n}.`, [
    w(1, `Producer ${n}, Cuvée ${n}, 2020. Region ${n}, Country ${n}. (13.0%)`),
    w(2, `Producer ${n}b, Cuvée ${n}b, 2019. Region ${n}b, Country ${n}b. (13.5%)`),
    w(3, `Producer ${n}c, Cuvée ${n}c, 2018. Region ${n}c, Country ${n}c. (13.5%)`),
  ]);

describe("structural repeat window is enforced", () => {
  it("blocks a structural repeat inside the window", () => {
    const r = validateNoveltyAgainstLatest(cand(STEM_A, FLIGHT_1), null, [prev(STEM_B, FLIGHT_2)]);
    expect(r.valid).toBe(false);
    expect(r.violations.join(" ")).toMatch(/structural template/i);
  });

  it("allows the same structure once it has fallen outside the window", () => {
    const recents = [
      ...Array.from({ length: STRUCTURAL_REPEAT_WINDOW }, (_, k) => filler(k + 1)),
      prev(STEM_B, FLIGHT_2),
    ];
    const r = validateNoveltyAgainstLatest(cand(STEM_A, FLIGHT_1), null, recents);
    expect(r.valid).toBe(true);
  });

  it("still blocks an exact wine-set repeat at any depth", () => {
    // The windowless rules must be unaffected by this change.
    const recents = [
      ...Array.from({ length: STRUCTURAL_REPEAT_WINDOW + 4 }, (_, k) => filler(k + 1)),
      prev("A completely different framing of an unrelated question.", FLIGHT_1),
    ];
    const r = validateNoveltyAgainstLatest(cand("Another unrelated framing entirely.", FLIGHT_1), null, recents);
    expect(r.valid).toBe(false);
  });
});
