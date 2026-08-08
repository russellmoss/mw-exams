import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { TOUR_NARRATION } from "@/lib/tour-narration";

// The Theory walkthrough describes mechanics that live in three other files and one product
// decision recorded in CLAUDE.md. As with the Practical one, the risk is DRIFT: rename a control or
// change a time budget and the teach keeps confidently describing the old app to the one audience
// that cannot tell it is wrong. Everything it claims is asserted against its source here.

const APP_ROOT = process.cwd();
const read = (path: string) => readFileSync(join(APP_ROOT, path), "utf8");

const walkthrough = read("src/app/components/TheoryWalkthrough.tsx");
const page = read("src/app/theory/page.tsx");
const picker = read("src/app/components/TheoryQuestionPicker.tsx");
const rubricPanel = read("src/app/components/TheoryRubricPanel.tsx");
const modelAnswer = read("src/app/components/TheoryModelAnswer.tsx");
const narration = Object.entries(TOUR_NARRATION)
  .filter(([id]) => id.startsWith("theory-"))
  .map(([, text]) => text)
  .join("\n");

describe("what it says about the corpus is still true", () => {
  it("names the five papers exactly as the picker does", () => {
    for (const name of [
      "Viticulture",
      "Vinification",
      "Handling of wine",
      "Business of wine",
      "Contemporary issues",
    ]) {
      expect(picker, `the picker no longer lists ${name}`).toContain(name);
    }
    // The walkthrough uses the plain names, so match case-insensitively on its own wording.
    for (const name of ["Viticulture", "Vinification", "Handling of wine", "Contemporary issues"]) {
      expect(walkthrough, `the walkthrough dropped ${name}`).toContain(name);
    }
    expect(walkthrough).toContain("The business of wine");
  });

  it("warns that theory Paper 1 is not practical Paper 1", () => {
    // The single most confusing thing about this exam, and it is documented in CLAUDE.md.
    expect(walkthrough).toMatch(/not a wine colour/i);
    expect(read("../CLAUDE.md")).toContain('"Paper" means a subject domain, not a wine colour');
  });

  it("claims only the coverage the corpus actually has", () => {
    const claude = read("../CLAUDE.md");
    expect(claude).toContain("243 of 297 questions");
    expect(claude).toMatch(/never\s+shown in the study app/);
    expect(walkthrough).toContain("243");
    expect(walkthrough).toContain("2016");
    expect(narration).toContain("243 real past questions from 2016 to 2025");
    // The reason the other 54 are hidden must be stated, not glossed.
    expect(narration).toMatch(/not shown at all/);
  });

  it("is honest that the IMW publishes no theory marks", () => {
    expect(read("../CLAUDE.md")).toContain("Never synthesise theory marks");
    expect(walkthrough).toMatch(/no model answers and no/i);
    expect(narration).toMatch(/publishes no model answers and no per-question marks/i);
  });
});

describe("what it says about the workspace is still true", () => {
  it("quotes the real time budgets", () => {
    expect(picker).toContain("Papers 1&ndash;4: 60 min · Paper 5: 90 min");
    expect(walkthrough).toContain("Papers 1–4");
    expect(walkthrough).toContain("Paper 5");
    expect(narration).toContain("sixty minutes for Papers 1 to 4");
    expect(narration).toContain("ninety minutes for Paper 5");
    // And the reason, which comes from the Student Guide via ANSWER_SPEC.
    expect(walkthrough).toContain("three hours for only two");
  });

  it("promises the rubric is hidden until submission, because it is", () => {
    expect(page).toContain("The examiner rubric stays hidden until submission.");
    expect(walkthrough).toMatch(/stays hidden until you submit/);
    expect(narration).toMatch(/hidden until you submit/);
  });

  it("gets the submit gate and the confirm dialog right", () => {
    expect(page).toContain("disabled={words < 50}");
    expect(page).toContain("Grading can take 30–60 seconds. The submission locks immediately to prevent duplicate cost.");
    expect(walkthrough).toContain("50 words");
    expect(walkthrough).toContain("30–60 seconds");
    expect(walkthrough).toMatch(/locks immediately/);
  });

  it("describes dictation the way the page does", () => {
    expect(page).toContain("Wine terms are normalized before grading");
    expect(walkthrough).toMatch(/normalised for wine vocabulary/i);
  });

  it("calls the verdict indicative, never a mark", () => {
    expect(page).toContain("· indicative");
    expect(page).toContain("never calibrated numeric marks");
    for (const verdict of ["PASS", "BORDERLINE", "FAIL"]) {
      expect(walkthrough, `the walkthrough dropped ${verdict}`).toContain(verdict);
    }
    expect(walkthrough).toContain("indicative");
    expect(walkthrough).toMatch(/not a mark out of a hundred/);
    expect(narration).toMatch(/any number here would be invented/);
  });
});

describe("what it says about the rubric and exemplar is still true", () => {
  it("uses the panel's own vocabulary", () => {
    for (const label of [
      "Pass floor",
      "Differentiator",
      "Evergreen · applies in full",
      "Year-bound · current substitute accepted",
      "Superseded · excused",
    ]) {
      expect(rubricPanel, `the rubric panel no longer uses "${label}"`).toContain(label);
      expect(walkthrough, `the walkthrough dropped "${label}"`).toContain(label);
    }
  });

  it("promises a verbatim quote per requirement, which the panel renders", () => {
    expect(rubricPanel).toContain("blockquote");
    expect(rubricPanel).toContain("requirement.quote");
    expect(walkthrough).toMatch(/verbatim quote/);
    expect(narration).toMatch(/if we could not quote it, it is not there/i);
  });

  it("explains ex-ante the way the panel does", () => {
    expect(rubricPanel).toContain("without hindsight credit");
    expect(walkthrough).toContain("Ex-ante");
    expect(walkthrough).toMatch(/no credit for\s*\n?\s*hindsight/);
  });

  it("carries the model answer's claim-verification warning", () => {
    expect(modelAnswer).toContain("No tier-1 source in the verification pass");
    expect(modelAnswer).toContain('"Verified"');
    expect(walkthrough).toContain("Verified");
    expect(walkthrough).toContain("Time-sensitive");
    expect(walkthrough).toContain("Not verified");
    // CLAUDE.md is blunt that none of the 1,300 claims is externally verified; the teach must not
    // oversell the exemplar.
    expect(narration).toMatch(/not as a fact you should carry into an exam/);
  });
});

describe("first-visit trigger and replay", () => {
  it("is gated on its own flag, end to end", () => {
    expect(read("migrations/062_theory_walkthrough.sql")).toContain(
      "ADD COLUMN IF NOT EXISTS theory_walkthrough_seen"
    );
    expect(read("src/app/api/auth/me/route.ts")).toContain("theory_walkthrough_seen");
    expect(read("src/app/api/auth/me/route.ts")).toContain("theoryWalkthroughSeen");
    expect(read("src/app/api/user/shell-prefs/route.ts")).toContain("theoryWalkthroughSeen");
    expect(read("src/lib/auth-context.tsx")).toContain("theoryWalkthroughSeen");
  });

  it("opens on the first visit and marks itself seen", () => {
    expect(page).toContain("user.theoryWalkthroughSeen");
    expect(page).toContain("theoryWalkthroughSeen: true");
  });

  it("stays out of the way of a deep link to a specific question", () => {
    // /theory?question=… comes from History, the Coach and bookmarks. Someone arriving that way
    // wants the essay, not a 7-step teach on top of it.
    expect(page).toContain('if (new URLSearchParams(window.location.search).get("question")) return;');
  });

  it("defers the StrictMode-sensitive commit into the timer callback", () => {
    const effect = page.match(/if \(authLoading \|\| !user \|\| decidedRef\.current\)[\s\S]*?\}, \[authLoading, user\]\);/)?.[0] ?? "";
    expect(effect).toContain("setTimeout");
    expect(effect).not.toContain("requestAnimationFrame");
    const latchAt = effect.indexOf("decidedRef.current = true");
    const timerAt = effect.indexOf("setTimeout");
    expect(latchAt, "decidedRef is latched outside the timer callback").toBeGreaterThan(timerAt);
  });

  it("is replayable from both the Theory header and the Library", () => {
    expect(page).toContain("How Theory works");
    const replay = read("src/app/components/WalkthroughReplayButton.tsx");
    expect(replay).toContain("TheoryWalkthrough");
    expect(replay).toContain("How Theory works");
    expect(read("src/app/library/page.tsx")).toContain("WalkthroughReplayButtons");
  });

  it("does not re-write the flag on replay", () => {
    expect(page).toContain("if (replaying) setReplaying(false);");
    expect(page).toContain("else closeWalkthrough();");
  });

  it("is reset by the Settings replay button, which claims to reset everything", () => {
    const settings = read("src/app/settings/page.tsx");
    expect(settings).toContain("theoryWalkthroughSeen: false");
  });
});
