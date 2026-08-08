// question-validator.test.ts — the "stem must not pre-announce the discriminator" hard rule.
//
// Admin-reviewer bin cluster (cross-paper, 11 bins): stems that state the contrast, the quality gap
// or the ageing regime outright hand the candidate the deduction they should make from the glass, and
// get binned "too easy" / "not exam-realistic". The rule scans the STEM ONLY (sub-questions may name
// a mechanism to *comment on*), hard-rejects any banned phrase, and caps stem length at 40 words. The
// neutral framings the exam genuinely uses are whitelisted so they never trip the scan.
import { describe, it, expect } from "vitest";
import {
  partTaskRepertoireViolations,
  stemPreannouncesDiscriminator,
  validateQuestion,
} from "../src/lib/question-validator";
import { sweetnessOutOfPaperViolations } from "../src/lib/question-rules.mjs";
import type { AuditWine } from "../src/lib/question-validator";

describe("stemPreannouncesDiscriminator — one banned phrase per fixture rejects", () => {
  it.each([
    ["different approach(es) (to|in)", "The two wines took a different approach to fermentation."],
    ["contrasting production", "These wines show contrasting production techniques."],
    ["very different route", "Each wine arrived by a very different route in the winery."],
    ["handled (very) differently", "The wines were handled very differently in the cellar."],
    ["made using (a) different", "Each wine was made using a different maturation vessel."],
    ["different official quality categories", "The wines belong to different official quality categories."],
    ["biological ageing", "Wine 1 undergoes biological ageing under a veil of flor."],
    ["oxidative ageing", "Wine 2 undergoes oxidative ageing in a wooden cask."],
    ["lees contact", "Wine 1 has had extended lees contact before bottling."],
    ["exposure to oxygen", "Wine 2 has had significant exposure to oxygen in maturation."],
    ["residual sugar ... by", "The wine's residual sugar has been achieved by stopping the fermentation."],
  ])("rejects: %s", (_label, stem) => {
    const v = stemPreannouncesDiscriminator(stem);
    expect(v.some((x) => x.rule === "stem-preannounces-discriminator" && x.severity === "hard")).toBe(true);
  });
});

describe("stemPreannouncesDiscriminator — stem length cap", () => {
  it("rejects a 42-word stem", () => {
    const stem = Array.from({ length: 42 }, (_, i) => `word${i + 1}`).join(" ") + ".";
    const v = stemPreannouncesDiscriminator(stem);
    expect(v.some((x) => x.rule === "stem-too-wordy" && x.severity === "hard")).toBe(true);
  });

  it("passes a 40-word stem (boundary)", () => {
    const stem = Array.from({ length: 40 }, (_, i) => `word${i + 1}`).join(" ") + ".";
    expect(stemPreannouncesDiscriminator(stem)).toEqual([]);
  });
});

describe("stemPreannouncesDiscriminator — clean stems pass", () => {
  it("passes the neutral factual frame 'Wines 1 to 4 are from four different countries.'", () => {
    expect(stemPreannouncesDiscriminator("Wines 1 to 4 are from four different countries.")).toEqual([]);
  });

  it("passes whitelisted framings ('both have residual sugar', 'from the same country')", () => {
    expect(
      stemPreannouncesDiscriminator("Wines 1 and 2 both have residual sugar and come from the same country.")
    ).toEqual([]);
    expect(
      stemPreannouncesDiscriminator("Wines 1 and 2 are made from the same single grape variety.")
    ).toEqual([]);
  });

  it("scans the stem only — a banned phrase inside a sub-question does not fire", () => {
    const q =
      "Wines 1 and 2 are from the same country.\n\n" +
      "b) Compare the method of production, with reference to biological ageing. (2 x 10 marks)";
    expect(stemPreannouncesDiscriminator(q)).toEqual([]);
  });
});

// ── part-task-repertoire — fixtures built verbatim from the three binned questions ────────────────
// (bin_fix_proposals id 8: gen_p3_F7_1785964017240, gen_p3_F2_1785964017222, gen_p2_F2_1785968458385)

const sparklingWine = (slot: number, style: string): AuditWine => ({
  slot,
  varieties: [],
  region: "",
  style,
  style_category: "Sparkling",
});

describe("partTaskRepertoireViolations", () => {
  it("rejects the 'how the bubbles were created' rider (gen_p3_F7_1785964017240)", () => {
    const v = partTaskRepertoireViolations({
      questionId: "t-bubbles",
      paper: 3,
      family: "F7",
      questionText:
        "Wines 1-4 are all sparkling wines from four different countries.\n\nFor each wine:\n\n" +
        "a) Identify the country and region of origin as closely as possible. (4 x 7 marks)\n\n" +
        "b) Comment on the key production decisions evident in the wine, including how the bubbles were created. (4 x 8 marks)\n\n" +
        "c) Assess the quality within the context of sparkling wine globally, citing any relevant official quality designation. (4 x 5 marks)\n\n" +
        "d) Comment on the commercial position of the wine. (4 x 5 marks)",
      wines: [1, 2, 3, 4].map((s) => sparklingWine(s, "Sparkling")),
    });
    const hits = v.filter((x) => x.rule === "part-task-repertoire");
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("hard");
    expect(hits[0].detail).toContain("how the bubbles were created");
    // The bubbles rider is the ONLY fault: asking origin without asking the variety is not one.
    expect(v).toHaveLength(1);
  });

  it("rejects the free-standing 'role of autolysis and dosage' part c (gen_p3_F2_1785964017222)", () => {
    const v = partTaskRepertoireViolations({
      questionId: "t-autolysis",
      paper: 3,
      family: "F2",
      questionText:
        "Wines 1 and 2 are from the same country.\n\nWith reference to both wines:\n" +
        "a) Identify the country and the regions of origin as closely as possible. (2 x 8 marks)\n\n" +
        "b) Compare the key winemaking decisions evident in each wine. (2 x 5 marks)\n\n" +
        "c) Comment on the role of autolysis and dosage in each wine. (2 x 4 marks)\n\n" +
        "d) Comment on the style and quality of each wine. (2 x 5 marks)\n\n" +
        "e) Comment on the commercial position of each wine. (2 x 3 marks)",
      wines: [sparklingWine(1, "Champagne"), sparklingWine(2, "Traditional-method sparkling")],
    });
    const hits = v.filter((x) => x.rule === "part-task-repertoire");
    expect(hits).toHaveLength(1);
    expect(hits[0].detail).toContain("part c");
    expect(hits[0].detail).toContain("role of autolysis and dosage");
  });

  // The `missing-variety-id-part` arm was REMOVED 2026-08-07: it fired on 27 of the 82 modern
  // (2018-2026) real questions, which is what EK-0154 had already recorded. Origin-only identification
  // is a standard IMW shape, so a flight that never asks for the grape variety must pass clean. These
  // fixtures are the real papers, verbatim in structure, so the arm cannot be reintroduced silently.
  it.each([
    [
      "2023 P2 Q1 — origin only, four wines",
      "Wines 1-4 are all from the same country.\n\nFor each wine:\n" +
        "a) Identify the origin as closely as possible. (4 x 10 marks)\n" +
        "b) Comment on quality, maturity and capacity to age. (4 x 10 marks)\n" +
        "c) Comment on the method of production. (4 x 5 marks)",
      4,
    ],
    [
      "2024 P1 Q3 — origin only, three blends",
      "Wines 10-12 are from the same country and are all blends.\n\nFor each wine:\n" +
        "a) Identify the origin as closely as possible. (3 x 8 marks)\n" +
        "b) Comment on the method of production with reference to the use of oak. (3 x 7 marks)\n" +
        "c) Comment on style, quality, and commercial position. (3 x 10 marks)",
      3,
    ],
    [
      "2021 P1 Q1 — 'variety/ies used', no the word 'grape'",
      "Wines 1-4 all come from the same country.\n\nFor each wine:\n" +
        "a) Identify the origin and variety/ies used. (4 x 10 marks)\n" +
        "b) Comment on quality and maturity. (4 x 10 marks)\n" +
        "c) Comment on the method of production. (4 x 5 marks)",
      4,
    ],
  ])("passes the real origin-only shape: %s", (_label, questionText, wineCount) => {
    const v = partTaskRepertoireViolations({
      questionId: "t-origin-only",
      paper: 2,
      family: "F2",
      questionText,
      wines: Array.from({ length: wineCount as number }, (_, i) => ({
        slot: i + 1,
        varieties: ["Tempranillo"],
        region: "Rioja",
        country: "Spain",
        style: "Red",
      })),
    });
    expect(v).toEqual([]);
  });

  it("passes the canonical template (guard against over-rejection)", () => {
    const v = partTaskRepertoireViolations({
      questionId: "t-canonical",
      paper: 1,
      family: "F1",
      questionText:
        "Wines 1 and 2 are from two different countries.\n\nFor each wine:\n" +
        "a) Identify the grape variety and region of origin as closely as possible. (2 x 8 marks)\n" +
        "b) Comment on the style and the key winemaking decisions behind each wine. (2 x 9 marks)\n" +
        "c) Discuss the role of yeast in shaping the wine. (2 x 4 marks)\n" +
        "d) Assess quality, maturity and commercial position. (2 x 8 marks)",
      wines: [
        { slot: 1, varieties: ["Chardonnay"], region: "Chablis", country: "France", style: "White" },
        { slot: 2, varieties: ["Chardonnay"], region: "Margaret River", country: "Australia", style: "White" },
      ],
    });
    expect(v).toEqual([]);
  });
});

// R11 — residual sugar is a Paper 3 device (feedback fa_65, 2026-08-07). Corpus measurement over
// data/exams.json (2011-2026, 162 questions): all twelve stems naming residual sugar or sweetness are
// Paper 3, none are P1/P2 — while eleven Paper 1 WINES in those years carry residual sugar. So the
// wine is allowed and the stem is not, which is exactly what these fixtures pin.
describe("sweetnessOutOfPaperViolations — RS declared or marked outside Paper 3", () => {
  // The reported question: gen_p1_F6_1779997829060, served three times before this rule existed.
  const REPORTED_P1 =
    "Wines 1 and 2 are from the same region. Both wines have residual sugar.\n\n" +
    "a) Identify the region of origin. (4 marks)\n" +
    "b) For each wine, identify the grape variety and comment on the method of production, with particular reference to how the residual sugar was achieved. (2 x 5 marks)\n" +
    "c) Compare and contrast the style and quality of the two wines. (20 marks)";

  it.each([
    ["the reported P1 stem (premise + mechanism)", 1, REPORTED_P1],
    ["premise only", 1, "Wines 1 to 3 all have residual sugar.\n\na) Identify the grape variety. (3 x 10 marks)"],
    ["sweet-wines premise in P2", 2, "Wines 1 and 2 are sweet wines from the same country. (2 x 25 marks)"],
    [
      "mechanism ask only",
      1,
      "Wines 1 and 2 are from the same region.\n\na) Comment on the method of production, explaining how the sweetness was achieved. (2 x 12 marks)",
    ],
    [
      "analytic readout",
      1,
      "Wines 1 and 2 are from the same country.\n\na) State the level of residual sugar. (2 x 2 marks)\nb) Identify the grape variety. (2 x 10 marks)",
    ],
  ])("hard-flags %s", (_label, paper, questionText) => {
    const v = sweetnessOutOfPaperViolations(paper, questionText);
    expect(v.map((x) => `${x.rule}:${x.severity}`)).toEqual(["sweetness-out-of-paper:hard"]);
  });

  it("soft-flags a broader part that merely name-checks residual sugar", () => {
    const v = sweetnessOutOfPaperViolations(
      1,
      "Wines 1 to 4 are all made from the same single grape variety.\n\n" +
        "a) Comment on the winemaking decisions that shaped each wine, with particular reference to the handling of residual sugar, acidity and vessel choice. (4 x 15 marks)"
    );
    expect(v.map((x) => `${x.rule}:${x.severity}`)).toEqual(["sweetness-reference-out-of-paper:soft"]);
  });

  it.each([
    // Paper 3 owns this device — the rule must never fire there.
    [3, "Wines 8 to 12 all have residual sugar.\n\na) State the level of residual sugar. (5 x 2 marks)"],
    [3, "Wines 1 and 2 are sweet wines.\n\na) State how the sweetness has been achieved. (2 x 10 marks)"],
    // A sweet WINE in a P1 flight with a stem that doesn't mention sugar: the shape the corpus uses.
    [
      1,
      "Wines 1 to 4 are all made from the same single grape variety.\n\na) Identify the country and region of origin as closely as possible. (4 x 10 marks)\nb) Comment on the quality and state of maturity. (4 x 15 marks)",
    ],
    // "Sweet" as a flavour descriptor is not a sugar claim.
    [2, "Wines 1 and 2 both show sweet spice from oak. (2 x 25 marks)"],
  ])("does not fire for P%i: %s", (paper, questionText) => {
    expect(sweetnessOutOfPaperViolations(paper, questionText)).toEqual([]);
  });

  it("is wired into validateQuestion for P1 and stays silent for P3", () => {
    const p1 = validateQuestion({ questionId: "rs1", paper: 1, family: "F6", questionText: REPORTED_P1, wines: [] });
    expect(p1.ok).toBe(false);
    expect(p1.violations.some((x) => x.rule === "sweetness-out-of-paper" && x.severity === "hard")).toBe(true);

    const p3 = validateQuestion({
      questionId: "rs2",
      paper: 3,
      family: "F6",
      questionText: REPORTED_P1.replace("Wines 1 and 2", "Wines 8 and 9"),
      wines: [],
    });
    expect(p3.violations.some((x) => x.rule.startsWith("sweetness-"))).toBe(false);
  });
});

describe("validateQuestion wiring", () => {
  it("marks a pre-announcing stem as not ok", () => {
    const res = validateQuestion({
      questionId: "t1",
      paper: 1,
      family: "F5",
      questionText: "The wines were handled very differently in the cellar.",
      wines: [],
    });
    expect(res.ok).toBe(false);
    expect(res.violations.some((x) => x.rule === "stem-preannounces-discriminator")).toBe(true);
  });

  it("marks an off-repertoire part task as not ok", () => {
    const res = validateQuestion({
      questionId: "t2",
      paper: 3,
      family: "F7",
      questionText:
        "Wines 1 and 2 are from the same country.\n\n" +
        "a) Identify the country and region of origin as closely as possible. (2 x 8 marks)\n" +
        "b) Explain how the bubbles were created in each wine. (2 x 9 marks)",
      wines: [],
    });
    expect(res.ok).toBe(false);
    expect(res.violations.some((x) => x.rule === "part-task-repertoire")).toBe(true);
  });
});

// ── part-task-repertoire, recalibrated 2026-08-08 ────────────────────────────────────────────────
//
// The rule rejected 30 of the 160 real IMW questions (19%) while rejecting only 13 of 782 generated
// ones (1.7%) — it fired on the exam eleven times more often than on our own output. Three causes,
// all fixed below: a label parser that invented parts, a clause splitter that broke on "e.g.", and a
// repertoire missing tasks the exam sets constantly. It is now 0% on the real corpus and still
// catches every mechanism rider it was built for (the two bin fixtures above).
describe("partTaskRepertoireViolations — tasks the real exam sets", () => {
  const plainWines: AuditWine[] = [
    { slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany" },
    { slot: 2, varieties: ["Riesling"], region: "Clare Valley", country: "Australia" },
  ];
  const ask = (parts: string) =>
    partTaskRepertoireViolations({
      questionId: "t",
      paper: 1,
      family: "F1",
      questionText: `Wines 1 and 2 are made from the same grape variety.\n\nFor each wine:\n\n${parts}`,
      totalMarks: 50,
      wines: plainWines,
    }).filter((v) => v.rule === "part-task-repertoire");

  it.each([
    // The largest gap: nine clauses across eight real questions, and the registry had no vintage entry.
    ["identify the vintage (2015 P1 Q1)", "a) Identify the vintage. (2 x 10 marks)"],
    ["with reasons (2014 P2 Q2)", "a) Identify the vintage, giving reasons for your conclusion. (2 x 10 marks)"],
    ["consider the likely vintage (2017 P3 Q5)", "a) Consider the likely vintage. (2 x 10 marks)"],
    ["comment on the age/vintage (2011 P1 Q1)", "a) Comment on the age/vintage of each wine and its potential to develop further. (2 x 10 marks)"],
    // Commercial, as the exam actually phrases it — as a question about a person, not a "position".
    ["to whom would it appeal (2012 P3 Q2)", "a) To whom is this wine most likely to appeal, and why? (2 x 10 marks)"],
    ["who would buy it (2017 P3 Q6)", "a) Who would buy this wine? (2 x 10 marks)"],
    ["how would you sell it (2016 P2 Q5)", "a) How would you sell this wine to a potential customer? (2 x 10 marks)"],
    ["which area of the trade (2017 P1 Q3)", "a) In which area of the trade would this wine be most successful? (2 x 10 marks)"],
    ["which markets (2022 P1 Q3)", "a) Consider which markets this wine would be successful in. (2 x 10 marks)"],
    ["market potential (2022 P2 Q4)", "a) Compare and contrast market potential. (2 x 10 marks)"],
    // Interrogative and non-imperative openings for winemaking.
    ["what are the techniques (2019 P1 Q2)", "a) What are the key winemaking techniques used in the wine's production? (2 x 10 marks)"],
    ["highlight the techniques (2017 P3 Q1)", "a) Highlight the key winemaking techniques used. (2 x 10 marks)"],
    ["what has the winemaker done (2018 P2 Q1)", "a) What has the winemaker done to maximise quality during the winemaking process? (2 x 10 marks)"],
    ["sense of place (2017 P1 Q4)", "a) Consider how the winemaker has sought to retain the wine's sense of place. (2 x 10 marks)"],
    ["comment in detail on (adverb slot)", "a) Comment in detail on the method of production. (2 x 10 marks)"],
    // Other real shapes.
    ["quality via 'consider' (2013 P1 Q5)", "a) Consider quality and style with reference to winemaking. (2 x 10 marks)"],
    ["tick box (2015 P3 Q3)", "a) Place a tick in the appropriate box for the residual sugar. (2 x 10 marks)"],
    ["divide into pairs (2014 P1 Q3)", "a) Divide the wines into their respective pairs by country. (2 x 10 marks)"],
    ["how long it will keep", "a) Assess the maturity, including how long the wine will keep. (2 x 10 marks)"],
    ["when it reaches its peak", "a) Assess maturity, including how long each is likely to improve and when it will reach its peak. (2 x 10 marks)"],
    ["draw on evidence", "a) Identify the grape variety. Draw on evidence from all three wines to support your answer. (2 x 10 marks)"],
    ["verbless analytic readout", "a) The level of residual sugar in grammes per litre. (2 x 10 marks)"],
  ])("accepts %s", (_label, parts) => {
    expect(ask(parts)).toEqual([]);
  });

  it("accepts a negative DIRECTION — it steers effort, it does not set a task (2019 P1 Q3)", () => {
    expect(
      ask("a) Discuss the wine's style and quality. Do not spend time thinking about the wine's specific origin. (2 x 10 marks)")
    ).toEqual([]);
  });

  it("still rejects an invented mechanism rider — the rule keeps its teeth", () => {
    const v = ask("a) Comment on the key production decisions evident in the wine, including how the bubbles were created. (2 x 10 marks)");
    expect(v).toHaveLength(1);
    expect(v[0].detail).toContain("how the bubbles were created");
  });
});

describe("part parsing — two bugs that invented parts and fragments", () => {
  const wines: AuditWine[] = [{ slot: 1, varieties: ["Chardonnay"], region: "Chablis", country: "France" }];
  const run = (questionText: string) =>
    partTaskRepertoireViolations({ questionId: "t", paper: 1, family: "F1", questionText, totalMarks: 50, wines })
      .filter((v) => v.rule === "part-task-repertoire");

  it("does not read a part label out of 'origin(s)' (2016 P1 Q2)", () => {
    // `[^a-z0-9]` before the letter matched the "(" of "origin(s)", inventing a part "s" whose text
    // was " as closely as possible" — a fragment that matches no task, so a real question failed.
    expect(run("a) Identify the grape variety and origin(s) as closely as possible. (16 marks)")).toEqual([]);
  });

  it("does not read a part label out of '(g/l)' (2017 P3 Q3)", () => {
    expect(run("a) State the level of residual sugar (g/l) and level of alcohol (%). (2 x 4 marks)")).toEqual([]);
  });

  it("still reads a genuine '(a)' label", () => {
    const v = run("(a) Comment on the key production decisions evident in the wine, including how the bubbles were created. (10 marks)");
    expect(v).toHaveLength(1);
  });

  it("does not split a sentence at 'e.g.'", () => {
    // "State the approximate dosage category (e.g. Brut Nature, Brut, Demi-Sec)" was torn into three
    // clauses, and the orphan "brut nature brut demi sec" was rejected for setting no task.
    expect(run("a) State the approximate dosage category (e.g. Brut Nature, Brut, Demi-Sec). (4 x 7 marks)")).toEqual([]);
  });

  it("treats 'For each of the four wines' as scaffolding, not a task", () => {
    expect(run("a) Identify the region of origin as closely as possible.\nFor each of the four wines\nb) Discuss quality. (4 x 8 marks)")).toEqual([]);
  });
});
