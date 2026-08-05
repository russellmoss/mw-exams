// generation-prompt-wine-list.test.ts — the ## Wines block must stay a wine-only contract.
//
// Twelve banked questions carried the generator's own deliberation in a wine slot ("Chambers Rosewood
// — wait, excluded. Let me correct.", "Spain ✓", a 601-char paragraph weighing up Amontillados).
// question-rules.mjs now rejects those drafts, but a rejection costs a full redraft — so the prompt is
// where it has to stop. Three instructions were inviting it, and each fix is pinned below:
//
//   1. The output format showed the wine line as a template with no statement of what else was
//      forbidden, so commentary appended to a well-formed wine was not obviously wrong.
//   2. CRITICAL OUTPUT RULE 6 and the WINE NAME / LABEL INTEGRITY section both required a self-
//      correction to be APPLIED but never said it had to be invisible. "Stanton & Killeen has been
//      excluded — replacing: Yalumba Museum Reserve Muscat NV. Rutherglen, Victoria, Australia. (18%)"
//      complies with the old wording exactly.
//   3. FINAL SELF-CHECK said "list each wine's country" with nowhere to write the list. One flight came
//      back with five slots holding "Spain ✓", "Italy ✓", "France ✓", "Germany ✓", "South Africa ✓" —
//      the self-check's own output standing where the wines should have been.
//
// These assert intent, not phrasing: each looks for the prohibition, so the wording can be reworked
// without breaking the test, but deleting the guard cannot pass silently.
import { describe, it, expect, beforeAll } from "vitest";
import { buildQuestionGenerationPrompt } from "../src/lib/prompts/question-generation-prompt";

let user: string;
let system: string;

beforeAll(async () => {
  // Paper 1 / F1 takes no DB-dependent branch (the P3 style weighting is Paper 3 only, and falls back
  // to a local roll on error regardless), so this builds offline.
  const prompt = await buildQuestionGenerationPrompt(1, "F1", [
    "Domaine Weinbach Cuvée Ste Catherine Riesling, 2021. Alsace, France. (13%)",
  ]);
  user = prompt.user;
  system = prompt.system;
});

describe("the ## Wines block states what a line may not contain", () => {
  it("says the line is machine-parsed and shown to the candidate verbatim", () => {
    const block = user.slice(user.indexOf("## Wines"));
    expect(block).toMatch(/machine.?parsed/i);
    expect(block).toMatch(/verbatim/i);
  });

  it("forbids commentary, markdown, ticks and rejected alternatives on a wine line", () => {
    const block = user.slice(user.indexOf("## Wines"), user.indexOf("## Metadata"));
    for (const forbidden of [/commentary/i, /markdown/i, /tick/i, /alternative/i, /ellipsis/i]) {
      expect(block, `the wine-line contract no longer rules out ${forbidden}`).toMatch(forbidden);
    }
  });

  it("sends the weighing-up to ## Generation Reasoning instead", () => {
    const block = user.slice(user.indexOf("## Wines"), user.indexOf("## Metadata"));
    expect(block).toMatch(/Generation Reasoning/);
  });

  it("shows the real failures as BAD and a clean reference as GOOD", () => {
    const block = user.slice(user.indexOf("## Wines"), user.indexOf("## Metadata"));
    expect((block.match(/^BAD:/gm) || []).length).toBeGreaterThanOrEqual(3);
    expect(block).toMatch(/^GOOD:.*Australia\. \(18%\)$/m);
  });

  it("requires a complete line ending on the country", () => {
    // The one failure mode that is not narration: "Losada Vinos de Finca, Losada Mencía, 2022. Bierz".
    const block = user.slice(user.indexOf("## Wines"), user.indexOf("## Metadata"));
    expect(block).toMatch(/truncat/i);
    expect(block).toMatch(/end on the country/i);
  });
});

describe("self-correction must be silent, not just applied", () => {
  it("CRITICAL OUTPUT RULE 6 bans annotating the swap", () => {
    const rule = system.slice(system.indexOf("6. If you self-correct"));
    expect(rule.slice(0, 600)).toMatch(/silent/i);
    // The exact annotations that reached the bank.
    for (const leak of ["excluded", "replacing", "CORRECTION APPLIED", "see reasoning"]) {
      expect(rule.slice(0, 600), `rule 6 no longer names "${leak}"`).toContain(leak);
    }
  });

  it("WINE NAME / LABEL INTEGRITY says the correction is invisible", () => {
    const section = system.slice(system.indexOf("## WINE NAME / LABEL INTEGRITY"));
    expect(section.slice(0, 900)).toMatch(/silent/i);
  });
});

describe("the self-check and the dedup list have somewhere to go", () => {
  it("routes self-check working to ## Paper Scope Check, never the wine list", () => {
    const section = system.slice(system.indexOf("## FINAL SELF-CHECK"));
    expect(section).toMatch(/Paper Scope Check/);
    expect(section).toMatch(/NEVER be written into the ## Wines/i);
  });

  it("tells the model to resolve the dedup list silently", () => {
    const section = system.slice(system.indexOf("## WINE DEDUPLICATION"));
    expect(section.length, "the avoid-list block did not render").toBeGreaterThan(0);
    expect(section).toMatch(/silent/i);
    expect(section).toMatch(/deduplication list/i);
  });
});
