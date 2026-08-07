// answer-content-rules.test.ts — content validation of model answers against the answer key.
//
// Until 2026-08-05 the model answer had exactly one gate: word count. An answer could silently drop
// a wine (the documented max_tokens tail truncation), never name a wine's actual grape or origin,
// or ship "Source needed" placeholders, and nothing downstream noticed. These tests pin the
// deterministic content rules and — as importantly — pin what must NOT fire: funnelling prose names
// many WRONG varieties on purpose ("Gamay was considered and rejected"), so every check tests for
// absence of the right answer, never presence of wrong ones.
import { describe, it, expect } from "vitest";
import {
  applyAnswerContentRules,
  answerBody,
  mentionedWineSlots,
  stemWineNumberOffset,
} from "../src/lib/answer-content-rules.mjs";
import { validateQuestion } from "../src/lib/question-validator";

type Wine = { slot: number; varieties: string[]; region: string; country: string; is_blend?: boolean };

const PINOT_FLIGHT: Wine[] = [
  { slot: 1, varieties: ["pinot noir"], region: "Willamette Valley", country: "USA" },
  { slot: 2, varieties: ["pinot noir"], region: "Gevrey-Chambertin", country: "France" },
];

const STEM = `Wines 1 and 2 are made from the same single grape variety and are from different countries.

For both wines:
a) Identify the grape variety. (10 marks)

For each wine:
b) Identify the region of origin as closely as possible. (2 x 13 marks)
c) Comment on the style and quality of each wine. (2 x 7 marks)`;

// Realistic in-shape answer, modelled on a real banked exemplar (gen_p2_F7_1785894009187).
const GOOD_ANSWER = `---
year: 2026
paper: 2
---

# Mock Answer

## a) Grape Variety (10 marks)

Pinot Noir. Both are translucent ruby, ruling out Cabernet Sauvignon and Syrah. Gamay was weighed but
eliminated by the greater tannin structure; Nebbiolo is ruled out by the coarse drying tannin it
shows in youth, absent here. Red cherry, pomegranate and violet over fine-grained tannin and high but
refined acidity complete the picture and confirm the call decisively for both wines in this flight.

## b) Region of Origin (2 x 13 marks)

**Wine 1 — Willamette Valley, Oregon.** Deeper ruby, black cherry and coffee with a rounded mid-palate:
riper than any cool European benchmark, yet the acidity stays fresh, which argues against Central
Otago. The loam and woodsmoke savouriness point to Willamette rather than Sonoma.

**Wine 2 — Gevrey-Chambertin, Côte de Nuits.** Paler ruby, tart cherry and graphite bite. Taut acidity
over silky but concentrated tannin places this in Burgundy. Vosne-Romanée was weighed and rejected:
this is more savoury and firmer-backed, the dark mineral grip of Gevrey.

## c) Style and Quality (2 x 7 marks)

Wine 1 is a winemaker-shaped wine of very good quality; drink now to 2030. Wine 2 inverts the balance:
terroir speaking directly, outstanding Village quality; drink 2025 to 2035.

---

**Sources consulted** — tier-1 references behind the production points above.

- [AWRI — some unrelated PDF](https://example.com/x.pdf)`;

describe("a well-formed answer passes clean", () => {
  it("no violations on the realistic exemplar", () => {
    expect(
      applyAnswerContentRules({ questionText: STEM, answerText: GOOD_ANSWER, wines: PINOT_FLIGHT })
    ).toEqual([]);
  });

  it("funnelling's wrong-variety mentions never fire anything", () => {
    // GOOD_ANSWER names Cabernet Sauvignon, Syrah, Gamay and Nebbiolo — all wrong on purpose.
    const v = applyAnswerContentRules({ questionText: STEM, answerText: GOOD_ANSWER, wines: PINOT_FLIGHT });
    expect(v.map((x) => x.rule)).toEqual([]);
  });

  it("no answer at all -> nothing to validate (serve layer's concern, not a defect)", () => {
    expect(applyAnswerContentRules({ questionText: STEM, answerText: "", wines: PINOT_FLIGHT })).toEqual([]);
  });
});

describe("answerBody strips non-prose", () => {
  it("removes YAML frontmatter and the Sources consulted block", () => {
    const body = answerBody(GOOD_ANSWER);
    expect(body).not.toContain("year: 2026");
    expect(body).not.toContain("Sources consulted");
    expect(body).toContain("Pinot Noir");
  });
});

describe("mentionedWineSlots", () => {
  it.each([
    ["Wine 1 shows X. Wine 2 shows Y.", 4, [1, 2]],
    ["Wines 1-4 share a variety.", 4, [1, 2, 3, 4]],
    ["Wines 1 and 3 are riper.", 4, [1, 3]],
    ["wines 2, 3 differ.", 4, [2, 3]],
    // Collective forms count as EVERY slot in the flight — deliberately conservative, so a
    // thematic answer opening "both wines…" is never hard-flagged as missing a wine.
    ["Both wines are dry.", 2, [1, 2]],
    ["All four wines are fortified.", 4, [1, 2, 3, 4]],
  ])("%s -> %j", (text, wineCount, expected) => {
    expect([...mentionedWineSlots(text, wineCount)].sort()).toEqual(expected);
  });
});

describe("AC2 — wine coverage (the tail-truncation signature)", () => {
  it("hard-flags an answer that references some wines but never the last", () => {
    const truncated = GOOD_ANSWER
      .replace(/\*\*Wine 2[\s\S]*?Gevrey\.\n/, "")
      .replace(/Wine 2 inverts[\s\S]*?2035\./, "")
      // A collective phrase counts as covering every wine (see mentionedWineSlots), so the
      // truncation fixture must lose it too — as a real tail-cut answer that never had one would.
      .replace(/for both wines in this flight/, "for this flight");
    const v = applyAnswerContentRules({ questionText: STEM, answerText: truncated, wines: PINOT_FLIGHT });
    expect(v.some((x) => x.rule === "answer-missing-wine" && x.severity === "hard")).toBe(true);
  });

  // 2026-08-07: a paper's fourth flight is stemmed "Wines 9 to 12", its key holds slots 1-4, and the
  // answer follows the stem — so slot-based coverage read three complete Live Tasting answers as
  // having lost every wine. The stem's own numbering is the reference frame.
  describe("stem-numbered flights (paper position, not slot 1)", () => {
    it.each([
      ["Wines 9 to 12 are from the same region of origin.", 4, 8],
      ["Wines 5-6 are labelled as different single grape varieties.", 2, 4],
      ["Wines 5-6, 7-8, 9-10 and 11-12 are pairs.", 8, 4],
      // Mark notation lands in the same position as a wine number once punctuation is flattened
      // ("…shaped each wine. (4 x 7 marks)" -> "wine 4 x 7 marks") and must not join the window.
      [
        "Wines 9 to 12 are from the same region of origin.\n\nFor each wine:\na) Identify the grape variety. (4 x 8 marks)\nc) Comment on the decisions that have shaped each wine. (4 x 7 marks)",
        4,
        8,
      ],
      // No shift to recover: 1-based stems, and windows that don't match the flight size.
      ["Wines 1 to 4 are all made from the same single grape variety.", 4, 0],
      ["Wines 9 to 12 are from the same region of origin.", 3, 0],
      ["Wines 1 and 2 are from the same region. Both wines have residual sugar.", 2, 0],
      ["For each wine: identify the origin.", 4, 0],
    ])("%s (%i wines) -> offset %i", (stem, wineCount, expected) => {
      expect(stemWineNumberOffset(stem, wineCount)).toBe(expected);
    });

    const RIOJA_LADDER: Wine[] = [1, 2, 3, 4].map((slot) => ({
      slot,
      varieties: ["tempranillo"],
      region: "Rioja",
      country: "Spain",
    }));
    const LADDER_STEM =
      "Wines 9 to 12 are from the same region of origin and are presented at different quality and price levels.\n\nFor each wine:\na) Identify the grape variety and origin as closely as possible. (4 x 8 marks)";
    // Prose modelled on gen_p2_F7_1786105820437, one of the three flights this quarantined.
    const ladderAnswer = (labels: number[]) =>
      `## a) Grape variety and origin\n\nAll four are Tempranillo-dominant reds from Rioja, Spain, sharing a red-fruited cherry core, dusty tannin and medium-plus acidity. Sangiovese was considered on the sour-cherry register and rejected on tannin texture.\n\n` +
      labels
        .map(
          (n) =>
            `**Wine ${n}** — Rioja Tempranillo, ${"ruby with cedar, red cherry and American-oak coconut, medium tannin, long finish. ".repeat(
              4
            )}`
        )
        .join("\n\n");

    it("does not flag an answer that uses the stem's numbering throughout", () => {
      const v = applyAnswerContentRules({
        questionText: LADDER_STEM,
        answerText: ladderAnswer([9, 10, 11, 12]),
        wines: RIOJA_LADDER,
      });
      expect(v.filter((x) => x.rule.startsWith("answer-missing-wine"))).toEqual([]);
    });

    it("still catches a truncated tail under the stem's numbering", () => {
      const v = applyAnswerContentRules({
        questionText: LADDER_STEM,
        answerText: ladderAnswer([9, 10, 11]),
        wines: RIOJA_LADDER,
      });
      const hit = v.find((x) => x.rule === "answer-missing-wine");
      expect(hit?.severity).toBe("hard");
      // Reported in the numbering the reader sees in the stem, with the slot for the key.
      expect(hit?.detail).toContain("Wine 12 (slot 4)");
    });
  });

  it("soft-flags (only) a thematic answer with no wine numbers at all", () => {
    const thematic = `## a) Variety\n\n${"Both bottles show pale ruby translucence and red fruit. ".repeat(20)}`;
    const v = applyAnswerContentRules({
      questionText: STEM,
      answerText: thematic,
      wines: PINOT_FLIGHT.map((w) => ({ ...w, varieties: [], region: "", country: "" })),
    });
    const cov = v.filter((x) => x.rule.startsWith("answer-missing-wine") || x.rule === "answer-no-wine-structure");
    expect(cov).toHaveLength(1);
    expect(cov[0].severity).toBe("soft");
  });
});

describe("AC3/AC4 — identity against the key", () => {
  it("hard-flags when a wine's variety AND origin never appear", () => {
    // Key says wine 2 is Rioja Tempranillo; the answer only ever discusses Pinot geographies.
    // (Tempranillo, not Syrah: GOOD_ANSWER's funnelling names Syrah as a rule-out, and a variety
    // mentioned ANYWHERE counts — the absence test is deliberately conservative, with the missing
    // per-wine section caught by AC2 instead.)
    const wines: Wine[] = [
      PINOT_FLIGHT[0],
      { slot: 2, varieties: ["tempranillo"], region: "Rioja", country: "Spain" },
    ];
    const answer = GOOD_ANSWER.replace(/Gevrey-Chambertin|Côte de Nuits|Burgundy|Vosne-Romanée|Gevrey/g, "elsewhere");
    const v = applyAnswerContentRules({ questionText: STEM, answerText: answer, wines });
    const hard = v.filter((x) => x.rule === "answer-misses-identity");
    expect(hard).toHaveLength(1);
    expect(hard[0].detail).toContain("Wine 2");
    expect(hard[0].severity).toBe("hard");
  });

  it("accepts a synonym for the key's variety (Spätburgunder === Pinot Noir)", () => {
    const answer = GOOD_ANSWER.replace(/Pinot Noir/g, "Spätburgunder");
    const v = applyAnswerContentRules({ questionText: STEM, answerText: answer, wines: PINOT_FLIGHT });
    expect(v.filter((x) => x.rule === "answer-misses-identity")).toEqual([]);
  });

  it("soft-flags a non-blend whose variety is absent though its origin is named", () => {
    const wines: Wine[] = [
      { slot: 1, varieties: ["chenin blanc"], region: "Savennières", country: "France" },
      { slot: 2, varieties: ["treixadura"], region: "Ribeiro", country: "Spain" },
    ];
    const answer = `## a)\n\n**Wine 1 — Savennières.** ${"Waxy quince and lanolin over racy acid. ".repeat(10)}\n\n**Wine 2 — Ribeiro, Galicia.** ${"Treixadura-led, floral orange blossom and bay leaf. ".repeat(10)}`;
    const v = applyAnswerContentRules({
      questionText: "For each wine: a) Identify the grape variety and the region of origin as closely as possible.",
      answerText: answer,
      wines,
    });
    const partial = v.filter((x) => x.rule === "answer-identity-partial");
    expect(partial).toHaveLength(1);
    expect(partial[0].detail).toContain("Wine 1");
    expect(partial[0].detail).toContain("chenin blanc");
    expect(partial[0].severity).toBe("soft");
  });

  it("never fires when the stem directs AWAY from identification (method/style-only)", () => {
    // Real false positive from calibration (gen_p3_F6): a Nyetimber + Prosecco method-of-production
    // stem — "identify" appears, but of the METHOD, not the wine. The exemplar rightly argues
    // traditional method vs Charmat and never names West Sussex or Glera.
    const methodStem = `Wines 1 and 2 are from different countries.

a) Identify the method of production for each wine, with particular reference to the production of bubbles. (2 x 10 marks)
b) Comment on the style, quality, and commercial position of each wine. (2 x 15 marks)`;
    const wines: Wine[] = [
      { slot: 1, varieties: ["chardonnay", "pinot noir"], region: "West Sussex", country: "England", is_blend: true },
      { slot: 2, varieties: ["glera"], region: "Valdobbiadene, Veneto", country: "Italy" },
    ];
    const answer = `## a) Method of production\n\n**Wine 1 — traditional method.** ${"Fine persistent bead from a slow second fermentation in bottle; tiraged with sucrose and yeast. ".repeat(6)}\n\n**Wine 2 — tank method.** ${"Frothy mousse and preserved primary fruit indicate Charmat production in pressurised tanks. ".repeat(6)}\n\n## b) Style and quality\n\nWine 1 is taut and autolytic; Wine 2 fresh and floral. Both are well made.`;
    const v = applyAnswerContentRules({ questionText: methodStem, answerText: answer, wines });
    expect(v.filter((x) => x.rule === "answer-misses-identity" || x.rule === "answer-identity-partial")).toEqual([]);
  });

  it("a blend is exempt on the variety side (Champagne argued from the appellation)", () => {
    const wines: Wine[] = [
      { slot: 1, varieties: ["chardonnay", "pinot noir"], region: "Champagne", country: "France", is_blend: true },
      { slot: 2, varieties: ["syrah"], region: "Barossa Valley", country: "Australia" },
    ];
    const answer = `## a)\n\n**Wine 1 — Champagne, France.** ${"Fine persistent bead, brioche and beeswax autolysis. ".repeat(10)}\n\n**Wine 2 — Barossa Shiraz.** ${"Dark plum, chocolate, seasoned American oak. ".repeat(10)}`;
    const v = applyAnswerContentRules({
      questionText: "For each wine: a) Identify the grape variety and the region of origin as closely as possible.",
      answerText: answer,
      wines,
    });
    expect(v.filter((x) => x.rule === "answer-identity-partial")).toEqual([]);
  });
});

describe("AC5 — sub-part coverage", () => {
  it("soft-flags a lettered answer that skips one sub-part", () => {
    const answer = GOOD_ANSWER.replace(/## c\) Style and Quality \(2 x 7 marks\)/, "## More thoughts");
    const v = applyAnswerContentRules({ questionText: STEM, answerText: answer, wines: PINOT_FLIGHT });
    const sub = v.filter((x) => x.rule === "answer-subpart-coverage");
    expect(sub).toHaveLength(1);
    expect(sub[0].detail).toContain("c)");
    expect(sub[0].severity).toBe("soft");
  });

  it("does NOT flag a merged heading — '## a) Region … and b) Grape variety' addresses b)", () => {
    // Real case (gen_p1_F2_1779913929557): the regenerated answer merged two sub-parts into one
    // heading and the line-start-only regex read b) as skipped.
    const merged = GOOD_ANSWER
      .replace(/## a\) Grape Variety \(10 marks\)/, "## a) Grape Variety (10 marks) and b) Region of Origin (2 x 13 marks)")
      .replace(/## b\) Region of Origin \(2 x 13 marks\)\n/, "");
    const v = applyAnswerContentRules({ questionText: STEM, answerText: merged, wines: PINOT_FLIGHT });
    expect(v.filter((x) => x.rule === "answer-subpart-coverage")).toEqual([]);
  });

  it("does NOT flag an answer organised without letter labels at all", () => {
    // Per-wine headings, no a)/b)/c) anywhere — calibration found this on ~15% of the bank, all
    // otherwise-fine answers. Structure variance is not missing content.
    const unlabelled = GOOD_ANSWER
      .replace(/## a\) Grape Variety \(10 marks\)/, "## Grape Variety")
      .replace(/## b\) Region of Origin \(2 x 13 marks\)/, "## Region of Origin")
      .replace(/## c\) Style and Quality \(2 x 7 marks\)/, "## Style and Quality");
    const v = applyAnswerContentRules({ questionText: STEM, answerText: unlabelled, wines: PINOT_FLIGHT });
    expect(v.filter((x) => x.rule === "answer-subpart-coverage")).toEqual([]);
  });
});

describe("AC1/AC6/AC7 — stubs, placeholders, truncation", () => {
  it("hard-flags a too-short answer", () => {
    const v = applyAnswerContentRules({
      questionText: STEM,
      answerText: "Wine 1 is Pinot Noir from Willamette. Wine 2 is Gevrey-Chambertin.",
      wines: PINOT_FLIGHT,
    });
    expect(v.some((x) => x.rule === "answer-too-short" && x.severity === "hard")).toBe(true);
  });

  it("hard-flags a Source needed placeholder", () => {
    const v = applyAnswerContentRules({
      questionText: STEM,
      answerText: GOOD_ANSWER.replace("drink 2025 to 2035.", "drink 2025 to 2035 (Source needed)."),
      wines: PINOT_FLIGHT,
    });
    expect(v.some((x) => x.rule === "answer-placeholder" && x.severity === "hard")).toBe(true);
  });

  it("hard-flags the historical tool-role-play failure", () => {
    const v = applyAnswerContentRules({
      questionText: STEM,
      answerText: `I'll load the necessary files and wine research data before writing the answer.\n\n${GOOD_ANSWER}`,
      wines: PINOT_FLIGHT,
    });
    expect(v.some((x) => x.rule === "answer-placeholder")).toBe(true);
  });

  it("soft-flags an answer cut mid-sentence", () => {
    const cut = answerBody(GOOD_ANSWER).replace(/terroir speaking directly[\s\S]*$/, "terroir speaking directly, and the");
    const v = applyAnswerContentRules({ questionText: STEM, answerText: cut, wines: PINOT_FLIGHT });
    expect(v.some((x) => x.rule === "answer-truncated" && x.severity === "soft")).toBe(true);
  });
});

describe("integration through validateQuestion", () => {
  const base = {
    questionId: "q1",
    paper: 2,
    family: "F1",
    questionText: STEM,
    totalMarks: 50,
    wines: PINOT_FLIGHT.map((w) => ({ ...w })),
  };

  it("without modelAnswer the verdict is unchanged (question rules only)", () => {
    const res = validateQuestion(base);
    expect(res.violations.filter((v) => v.rule.startsWith("answer-"))).toEqual([]);
  });

  it("with a broken answer the combined verdict goes hard", () => {
    const res = validateQuestion({ ...base, modelAnswer: "Pinot noir. Fin. (Source needed)" });
    expect(res.ok).toBe(false);
    expect(res.violations.some((v) => v.rule === "answer-too-short")).toBe(true);
    expect(res.violations.some((v) => v.rule === "answer-placeholder")).toBe(true);
  });

  it("with the good answer the combined verdict stays clean", () => {
    const res = validateQuestion({ ...base, modelAnswer: GOOD_ANSWER });
    expect(res.violations.filter((v) => v.rule.startsWith("answer-"))).toEqual([]);
  });
});
