import { describe, it, expect } from "vitest";
import { citationGuard, overclaimGuard, runGuards, tierGuard } from "@/lib/coach/guards";

describe("citation guard", () => {
  it("corrects an absolute corpus claim made without searching the corpus", () => {
    const r = citationGuard("Semillon has never appeared in a Paper 1 single-variety flight.", []);
    expect(r.code).toBe("uncited_absolute_claim");
    expect(r.correction).toMatch(/unverified/i);
  });

  it("stays silent when the corpus was actually searched", () => {
    const r = citationGuard("Semillon has never appeared in a Paper 1 flight.", ["query_corpus"]);
    expect(r.code).toBeNull();
  });

  it("treats a hedge as an opinion, not an assertion of fact", () => {
    // "I don't think it has come up" is a candidate-to-coach register we do not want to punish;
    // the guard exists for confident fabrication, not for visible uncertainty.
    const r = citationGuard("As far as I recall that has never appeared, but check me.", []);
    expect(r.code).toBeNull();
  });

  it("ignores ordinary prose with no absolute claim in it", () => {
    const r = citationGuard("Semillon shows up in Australian and Bordeaux blends.", []);
    expect(r.code).toBeNull();
  });

  it("catches the positive form too", () => {
    expect(citationGuard("Riesling always appears in Paper 1.", []).code).toBe("uncited_absolute_claim");
  });
});

describe("tier guard", () => {
  it("corrects a tier asserted without consulting a tiered source", () => {
    // The real case that prompted this: it searched the corpus, then wrote "STRONG SIGNAL that this
    // recurs" — dressing an impression in the vocabulary of earned evidence.
    const r = tierGuard("It's been set three times. STRONG SIGNAL that this recurs.", ["query_corpus"]);
    expect(r.code).toBe("unbacked_tier_claim");
  });

  it("accepts a tier backed by the empirical knowledge base", () => {
    expect(tierGuard("EK-0042 rates this PLAUSIBLE.", ["query_empirical_knowledge"]).code).toBeNull();
  });

  it("accepts a tier read off a decision tree, which labels its own branches", () => {
    expect(tierGuard("The tree marks that branch CURVEBALL.", ["get_decision_tree"]).code).toBeNull();
  });

  it("ignores the lowercase word, which is ordinary English", () => {
    // "a plausible read" must never trip this, or the guard fires on half of all wine talk.
    expect(tierGuard("Chenin is a plausible call on that evidence.", []).code).toBeNull();
  });
});

describe("overclaim guard", () => {
  it("corrects a claimed action when nothing was committed", () => {
    const r = overclaimGuard("I've filed that as feedback for you.", false);
    expect(r.code).toBe("overclaimed_action");
    expect(r.correction).toMatch(/nothing has actually been sent/i);
  });

  it("stays silent once a write really has been committed", () => {
    expect(overclaimGuard("I've filed that as feedback for you.", true).code).toBeNull();
  });

  it("does not fire on an offer to act", () => {
    expect(overclaimGuard("Would you like me to file that as feedback?", false).code).toBeNull();
  });
});

describe("runGuards", () => {
  it("appends every correction that fired and reports their codes", () => {
    const out = runGuards({
      text: "That has never appeared. I've filed it for you.",
      toolsUsed: [],
      committed: false,
    });
    expect(out.codes.sort()).toEqual(["overclaimed_action", "uncited_absolute_claim"]);
    expect(out.text).toMatch(/unverified/i);
    expect(out.text).toMatch(/nothing has actually been sent/i);
  });

  it("returns a clean turn unchanged", () => {
    const text = "Two of the 18 Paper 1 single-variety flights used Chenin Blanc.";
    const out = runGuards({ text, toolsUsed: ["query_corpus"], committed: false });
    expect(out.text).toBe(text);
    expect(out.codes).toEqual([]);
  });
});
