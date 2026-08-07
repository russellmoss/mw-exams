// stem-printed-total.test.ts — a Stem Detail variant may not invent or alter a printed Total line.
//
// Production incident (attempt 407, gen_p2_F5_1786049788105, reported through the Coach): the
// question's sub-parts sum to 50 — 6 + (2x5) + (2x8) + (2x9) — and total_marks is 50, but both stored
// stem variants ended with "Total: 44 marks". 44 is the "For each wine" parts alone (10+16+18), with
// the flight-wide 6 marks for part (a) dropped. The candidate saw a header badge reading 50 marks and
// a footer reading 44 on the same screen.
//
// TWO defects let that through, and this file pins both:
//
//  1. The derivation prompt ORDERED a Total line — "Each value is the COMPLETE stem (preamble + every
//     sub-question with its marks + the Total line)" — so when the canonical stem printed none, the
//     model dutifully computed one, and computed it wrong.
//  2. variantPreservesStructure could not see it. MARK_TOKEN_RE requires parentheses and a total line
//     has none, so both signatures reported markTotal 50 and the gate passed the variant as
//     structurally identical.
//
// Prompt wording is necessary but not sufficient — the same lesson as the constraint-preservation
// gate next door, and as the theory quote gate. The signature is what actually holds.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractStemSignature,
  signaturesMatch,
  variantPreservesStructure,
  buildStemVariantsPrompt,
} from "../src/lib/prompts/stemDetail";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Verbatim from generated_questions.question_text. Note: no Total line.
const CANONICAL =
  "Wines 1 and 2 are made from the same single grape variety and are from different countries.\n\n" +
  "With reference to both wines:\n" +
  "a) Identify the grape variety. (6 marks)\n\n" +
  "For each wine:\n" +
  "b) Identify the region of origin as closely as possible. (2 x 5 marks)\n" +
  "c) Comment on the style and key winemaking decisions that distinguish these two wines. (2 x 8 marks)\n" +
  "d) Assess the quality, maturity and commercial position. (2 x 9 marks)";

// Verbatim from generated_questions.stem_exam_real — the row production actually served.
const BAD_VARIANT = CANONICAL + "\n\nTotal: 44 marks";

describe("extractStemSignature — the printed total", () => {
  it("reads no total from a stem that prints none", () => {
    expect(extractStemSignature(CANONICAL).printedTotal).toBeNull();
  });

  it("reads the invented total the incident variant carried", () => {
    expect(extractStemSignature(BAD_VARIANT).printedTotal).toBe(44);
  });

  it("still agrees with the sub-parts on the parenthesised marks", () => {
    // The regression is invisible on this axis — which is precisely why it survived. Both stems sum
    // to 50 here; only printedTotal separates them.
    expect(extractStemSignature(CANONICAL).markTotal).toBe(50);
    expect(extractStemSignature(BAD_VARIANT).markTotal).toBe(50);
  });

  it("does not mistake prose for a printed total", () => {
    // Line-anchored: "a total of 50 marks" inside a sentence is not a printed Total line.
    const prose = CANONICAL + "\n\nThe paper allocates a total of 50 marks to this question.";
    expect(extractStemSignature(prose).printedTotal).toBeNull();
  });

  it("reads a legitimate total the canonical does print", () => {
    expect(extractStemSignature(CANONICAL + "\n\nTotal: 50 marks").printedTotal).toBe(50);
  });
});

describe("the gate rejects a fabricated or altered total", () => {
  it("rejects the exact variant from the incident", () => {
    expect(variantPreservesStructure(CANONICAL, BAD_VARIANT)).toBe(false);
  });

  it("rejects an invented total even when it is arithmetically RIGHT", () => {
    // 50 is the correct number, but the canonical prints no total and the variant may not add one —
    // the levels must be identical prose apart from framing, and a footer appearing at one level and
    // not another is a difference the candidate would see.
    expect(variantPreservesStructure(CANONICAL, CANONICAL + "\n\nTotal: 50 marks")).toBe(false);
  });

  it("rejects DROPPING a total the canonical printed", () => {
    const withTotal = CANONICAL + "\n\nTotal: 50 marks";
    expect(variantPreservesStructure(withTotal, CANONICAL)).toBe(false);
  });

  it("accepts a variant that reproduces the printed total verbatim", () => {
    const withTotal = CANONICAL + "\n\nTotal: 50 marks";
    const guided =
      "Wines 1 and 2 are made from the same single grape variety and are from different countries. " +
      "These two wines show how one variety is interpreted differently across winemaking traditions.\n\n" +
      "With reference to both wines:\n" +
      "a) Identify the grape variety. (6 marks)\n\n" +
      "For each wine:\n" +
      "b) Identify the region of origin as closely as possible. (2 x 5 marks)\n" +
      "c) Comment on the style and key winemaking decisions that distinguish these two wines. (2 x 8 marks)\n" +
      "d) Assess the quality, maturity and commercial position. (2 x 9 marks)\n\n" +
      "Total: 50 marks";
    expect(variantPreservesStructure(withTotal, guided)).toBe(true);
  });

  it("accepts the legitimate no-total case, so the fix does not fail every ordinary variant", () => {
    const guided =
      "Wines 1 and 2 are made from the same single grape variety and are from different countries. " +
      "These two wines show how one variety is interpreted differently across winemaking traditions.\n\n" +
      "With reference to both wines:\n" +
      "a) Identify the grape variety. (6 marks)\n\n" +
      "For each wine:\n" +
      "b) Identify the region of origin as closely as possible. (2 x 5 marks)\n" +
      "c) Comment on the style and key winemaking decisions that distinguish these two wines. (2 x 8 marks)\n" +
      "d) Assess the quality, maturity and commercial position. (2 x 9 marks)";
    expect(variantPreservesStructure(CANONICAL, guided)).toBe(true);
  });

  it("compares the total directly, not only via signaturesMatch's other fields", () => {
    const a = extractStemSignature(CANONICAL);
    const b = extractStemSignature(BAD_VARIANT);
    expect(a.markTotal).toBe(b.markTotal);
    expect(a.subLabels).toEqual(b.subLabels);
    expect(a.markTokens).toEqual(b.markTokens);
    // Everything else is equal — so a false here can only come from printedTotal.
    expect(signaturesMatch(a, b)).toBe(false);
  });
});

describe("the derivation prompt no longer orders a total line", () => {
  it("forbids inventing one", () => {
    const { system } = buildStemVariantsPrompt(CANONICAL);
    expect(system).toMatch(/NEVER INVENT A TOTAL/);
    expect(system).toMatch(/if and only if the canonical stem prints one/);
  });

  it("no longer states unconditionally that the output includes the Total line", () => {
    // The exact clause that produced the incident.
    const { system } = buildStemVariantsPrompt(CANONICAL);
    expect(system).not.toMatch(/with its marks \+ the Total line/);
  });
});

describe("the footer renders the authoritative total, not the stem's literal", () => {
  it("takes the number from the question, keeping the stem only as a fallback", () => {
    // A component test would need a renderer; the invariant worth pinning is that the JSX no longer
    // interpolates the scraped value, because that is the whole defect.
    const src = fs.readFileSync(path.join(appDir, "src/app/components/QuestionDisplay.tsx"), "utf8");
    expect(src).not.toMatch(/Total: \{derived\.totalMarks\}/);
    expect(src).toMatch(/Total: \{footerTotal\} marks/);
    expect(src).toMatch(/question\.totalMarks > 0 \? question\.totalMarks : derived\.totalMarks/);
    // Still gated on the stem having declared one, so no footer appears where none did before.
    expect(src).toMatch(/const declaresTotal = derived\.totalMarks != null/);
  });
});
