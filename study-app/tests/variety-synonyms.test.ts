// variety-synonyms.test.ts — the one shared variety synonym table.
//
// The Fill-the-Bank pilot banked a question whose stem promised three DIFFERENT grape varieties over
// an Alsace Pinot Noir, a Cannonau di Sardegna and a Campo de Borja Garnacha. Cannonau and Garnacha
// are both Grenache, so the question was unanswerable as framed. The generation-stage check passed it
// because no synonym table knew "cannonau"; the answer-key resolver, with a richer lexicon, caught it
// only afterwards.
//
// Root cause was three tables that had drifted apart (question-rules, question-engine, stem-scoring)
// plus a fourth copy in data/variety_lexicon.json. These tests pin the merge: the specific defect, the
// end-to-end rule, and — most importantly — that the JSON lexicon can never silently drift again.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  VARIETY_SYNONYMS,
  canonVariety,
  detectPrimaryVariety,
  applyQuestionRules,
  winesFromText,
} from "../src/lib/question-rules.mjs";

describe("the pilot defect", () => {
  it("reads Cannonau and Garnacha as the same grape", () => {
    expect(canonVariety("Cannonau")).toBe("grenache");
    expect(canonVariety("Garnacha")).toBe("grenache");
    expect(canonVariety("Grenache")).toBe("grenache");
  });

  it("detects both off a real label", () => {
    expect(detectPrimaryVariety("Sella & Mosca, Cannonau di Sardegna Riserva, 2020. Sardinia DOC, Italy. (14.5%)")).toBe(
      "grenache"
    );
    expect(detectPrimaryVariety("Bodegas Alto Moncayo, Garnacha, 2020. Campo de Borja DO, Spain. (15.0%)")).toBe(
      "grenache"
    );
  });

  it("now fails the exact flight that was banked", () => {
    const wines = winesFromText([
      { slot: 1, fullText: "Domaine Weinbach, Clos des Capucins, Pinot Noir, 2022. Alsace AOC, France. (13.0%)" },
      { slot: 2, fullText: "Sella & Mosca, Cannonau di Sardegna Riserva, 2020. Sardinia DOC, Italy. (14.5%)" },
      { slot: 3, fullText: "Bodegas Alto Moncayo, Garnacha, 2020. Campo de Borja DO, Spain. (15.0%)" },
    ]);
    const violations = applyQuestionRules({
      paper: 2,
      questionText:
        "Wines 1 to 3 are from three different countries and are each made from a different, single grape variety.",
      wines,
    });
    const hard = violations.filter((v) => v.severity === "hard");
    expect(hard.map((v) => v.rule)).toContain("distinct-variety");
  });
});

describe("synonyms that used to disagree between tables", () => {
  // Each pair was known to ONE of the three former copies but not the others.
  it.each([
    ["Monastrell", "Mourvèdre"],
    ["Mataro", "Mourvèdre"],
    ["Pinot Grigio", "Pinot Gris"],
    ["Grauburgunder", "Pinot Gris"],
    ["Tinta Roriz", "Tempranillo"],
    ["Aragonez", "Tempranillo"],
    ["Lemberger", "Blaufränkisch"],
    ["Shiraz", "Syrah"],
    ["Primitivo", "Zinfandel"],
    ["Viura", "Macabeo"],
    ["Muscadet", "Melon de Bourgogne"],
    // 2026-08-05 audit noise: the key resolver emits "Grenache Noir" verbatim off some labels, and
    // a correct same-variety Grenache flight audited as two varieties.
    ["Grenache Noir", "Grenache"],
  ])("%s === %s", (a, b) => {
    expect(canonVariety(a)).toBe(canonVariety(b));
  });

  it("no longer flags a same-variety flight keyed as grenache + grenache noir", () => {
    const violations = applyQuestionRules({
      paper: 3,
      questionText: "Wines 1-2 are fortified wines made from the same grape variety.",
      wines: [
        { slot: 1, varieties: ["grenache"], region: "Banyuls", country: "France" },
        { slot: 2, varieties: ["grenache noir"], region: "Maury", country: "France" },
      ],
    });
    expect(violations.filter((v) => v.rule === "same-variety")).toEqual([]);
  });

  it("keeps genuinely different grapes apart", () => {
    const distinct = ["Grenache", "Syrah", "Mourvèdre", "Tempranillo", "Sangiovese", "Nebbiolo", "Pinot Noir"];
    const canon = distinct.map(canonVariety);
    expect(new Set(canon).size).toBe(distinct.length);
  });
});

describe("data/variety_lexicon.json stays in sync", () => {
  // The answer-key resolver reads the JSON; generation reads the .mjs. Them disagreeing IS the bug
  // class above, so this asserts the JSON is a superset with matching canonical targets.
  const lexicon = JSON.parse(
    readFileSync(join(process.cwd(), "..", "data", "variety_lexicon.json"), "utf8")
  ) as { varieties: string[]; synonyms: Record<string, string> };

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

  it("carries every synonym the generation table knows, to the same canonical grape", () => {
    for (const [label, canon] of Object.entries(VARIETY_SYNONYMS)) {
      expect(lexicon.synonyms[label], `lexicon is missing "${label}"`).toBeDefined();
      expect(norm(lexicon.synonyms[label]), `"${label}" disagrees between the two tables`).toBe(norm(canon));
    }
  });

  it("resolves every canonical target to a known variety", () => {
    const known = new Set(lexicon.varieties.map(norm));
    for (const canon of new Set(Object.values(lexicon.synonyms))) {
      expect(known.has(norm(canon)), `"${canon}" is a synonym target but not a listed variety`).toBe(true);
    }
  });
});

// ── Detection gaps found by auditing banked questions ────────────────────────────────────────────
// Both are DETECTION failures, not rule failures: the rule was correct and simply had nothing to
// compare, because the grape was never read off the label.
describe("accented labels resolve", () => {
  // The indicator regexes are ASCII but real labels are accented, and only lower-casing was applied.
  // Every accented grape read as "unknown", so the diversity rules silently skipped those wines.
  it.each([
    ["Jurtschitsch Sonnhalde Grüner Veltliner, 2022. Kamptal, Austria.", "gruner"],
    ["Château Climens, Barsac, 2016. Sémillon.", "semillon"],
  ])("%s", (label, expected) => {
    expect(detectPrimaryVariety(label)).toBe(expected);
  });
});
