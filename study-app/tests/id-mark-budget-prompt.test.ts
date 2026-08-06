// id-mark-budget-prompt.test.ts — the generation prompt must carry the identification mark budget.
//
// Bin-fix proposal 9 (cross-paper, 3 reasoned bins): the id-mark-allocation validator already
// rejects identification parts over the 10-mark cap — its message is quoted verbatim in two of the
// bins — yet the generator kept emitting them, twice with a byte-identical stem. Each rejection
// costs a full redraft, so the fix belongs upstream: the prompt must state the budget explicitly,
// with worked legal AND illegal examples, since paraphrase alone ("8 marks standard") was not
// sticking. Like generation-prompt-wine-list.test.ts, these assert intent, not phrasing — the
// wording can be reworked, but deleting the budget block cannot pass silently.
import { describe, it, expect, beforeAll } from "vitest";
import { buildQuestionGenerationPrompt } from "../src/lib/prompts/question-generation-prompt";

// The budget must hold wherever the sections live, so assert against the whole prompt.
let full: string;

beforeAll(async () => {
  // Paper 1 / F1 takes no DB-dependent branch, so this builds offline.
  const prompt = await buildQuestionGenerationPrompt(1, "F1", [
    "Domaine Vacheron Sancerre Blanc, 2022. Loire, France. (13%)",
  ]);
  full = `${prompt.system}\n${prompt.user}`;
});

const budget = () => {
  // Anchor on the section header — the historical-examples caveat cross-references the same name.
  const start = full.indexOf("## IDENTIFICATION MARK BUDGET");
  expect(start, "the IDENTIFICATION MARK BUDGET block is gone from the prompt").toBeGreaterThan(-1);
  return full.slice(start, start + 3000);
};

describe("the identification mark budget block", () => {
  it("states the 10-mark per-part cap and the per-wine multiplier semantics", () => {
    const block = budget();
    expect(block).toMatch(/more than 10 marks/i);
    expect(block).toMatch(/multiplier/i);
    expect(block).toMatch(/4 x 10 marks/i);
  });

  it("forbids bundling multiple origin attributes into one sub-part and says to split", () => {
    const block = budget();
    expect(block).toMatch(/bundle/i);
    expect(block).toMatch(/split/i);
  });

  it("routes shared attributes flight-wide and varying attributes per-wine", () => {
    const block = budget();
    expect(block).toMatch(/shared/i);
    expect(block).toMatch(/varies|varying/i);
    expect(block).toMatch(/For each wine/i);
  });

  it("shows the worked illegal examples — the 13-mark country ID and the 15-mark bundled part", () => {
    const block = budget();
    expect(block).toMatch(/Identify the country of origin\. \(13 marks\)/);
    expect(block).toMatch(/Identify the grape variety and country of origin\. \(15 marks\)/);
  });

  it("shows a worked legal shape with every part within the cap", () => {
    const block = budget();
    expect(block).toMatch(/Identify the grape variety\. \(10 marks\)/);
    expect(block).toMatch(/\(2 x 8 marks\)/);
  });
});

describe("no other prompt section teaches an over-cap identification part", () => {
  it("never shows an identification example above 10 marks outside a labeled illegal shape", () => {
    // The old prompt taught "Identify the country of origin" worth 15 marks shared across the
    // flight, and a real-corpus 25-mark combined part — both auto-rejected by the validator the
    // moment the model obeys. Any mark value over 10 directly attached to an "Identify the …"
    // example must sit inside the worked-illegal-shapes context (or explicitly say it is rejected).
    // The verbatim real historical examples are authoritative text and may contain pre-2018 shapes
    // (a 2011 paper awards a 15-mark region ID) — they are covered by a caveat at the block header
    // instead of per-example labels, so first prove the caveat exists, then exempt that section.
    const histStart = full.indexOf("REAL HISTORICAL QUESTION EXAMPLES");
    if (histStart > -1) {
      expect(
        /NOT the mark values/i.test(full.slice(histStart, histStart + 600)),
        "the historical-examples block lost its 'match the voice, not the mark values' caveat"
      ).toBe(true);
    }
    const histEnd = histStart > -1 ? full.indexOf("\n## ", histStart + 1) : -1;
    const inHistorical = (i: number) =>
      histStart > -1 && i > histStart && (histEnd === -1 || i < histEnd);

    const re = /Identify the [^."]{0,80}\((?:\d+\s*[x×]\s*)?(\d+)\s*marks\)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(full)) !== null) {
      const perUnit = parseInt(m[1], 10);
      if (perUnit <= 10 || inHistorical(m.index)) continue;
      const context = full.slice(Math.max(0, m.index - 400), m.index + m[0].length + 400);
      expect(
        /illegal|auto-rejected|rejects it|fails at/i.test(context),
        `prompt shows an over-cap ID example without marking it illegal: "${m[0]}"`
      ).toBe(true);
    }
  });
});
