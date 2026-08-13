// rs-flight-structure-prompt.test.ts — the generation prompt must carry the RS/sweet flight
// structure rules.
//
// Auto-feedback attempt #596: a reviewer binned a six-wine all-curveball RS flight for three
// distinct faults — five curveballs against one anchor (curveball overdensity), three botrytis
// wines bunched together (no mechanism spread in a question whose sub-part (b) tests the RS
// mechanism), and no "state the RS in g/L / ABV" numerical sub-part (EK-0184). The fix is upstream
// in the generation prompt: it must enforce a banker floor, mechanism deduplication and the
// numerical ask whenever the stem links every wine by residual sugar. Like the other prompt tests
// these assert intent, not phrasing — the wording can be reworked, but deleting the block cannot
// pass silently.
import { describe, it, expect, beforeAll } from "vitest";
import { buildQuestionGenerationPrompt } from "../src/lib/prompts/question-generation-prompt";

let full: string;

beforeAll(async () => {
  const prompt = await buildQuestionGenerationPrompt(3, "F4", [
    "De Bortoli Noble One, 2019. Riverina, Australia. (10%)",
  ]);
  full = `${prompt.system}\n${prompt.user}`;
});

const block = () => {
  const start = full.indexOf("## RS / SWEET FLIGHT STRUCTURE");
  expect(start, "the RS / SWEET FLIGHT STRUCTURE block is gone from the prompt").toBeGreaterThan(-1);
  return full.slice(start, start + 3500);
};

describe("the RS / sweet flight structure block", () => {
  it("enforces a banker floor of at least ceil(N/3) anchors", () => {
    const b = block();
    expect(b).toMatch(/N\/3/);
    expect(b).toMatch(/anchor/i);
    expect(b).toMatch(/De Bortoli Noble One/);
  });

  it("names the disqualified pseudo-anchors as curveballs", () => {
    const b = block();
    expect(b).toMatch(/Bonnezeaux/);
    expect(b).toMatch(/Moscadello di Montalcino/);
    expect(b).toMatch(/late-harvest Riesling/i);
  });

  it("caps any single mechanism at two wines and lists the mechanisms to count", () => {
    const b = block();
    expect(b).toMatch(/no more than TWO wines/i);
    expect(b).toMatch(/botrytis/i);
    expect(b).toMatch(/late-harvest|passerillage/i);
    expect(b).toMatch(/icewine|cryoextraction/i);
    expect(b).toMatch(/fortification|VDN/i);
  });

  it("flags three-or-more of one mechanism as a generation error", () => {
    const b = block();
    expect(b).toMatch(/THREE or more/i);
    expect(b).toMatch(/generation error/i);
  });

  it("requires the RS-in-g/L and ABV numerical sub-part per EK-0184", () => {
    const b = block();
    expect(b).toMatch(/EK-0184/);
    expect(b).toMatch(/State the level of residual sugar/i);
    expect(b).toMatch(/alcohol level/i);
    expect(b).toMatch(/2-3 marks/);
  });
});
