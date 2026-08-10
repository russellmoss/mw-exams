import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { REVIEW_REASON_OPTIONS } from "../src/lib/question-review-shared";

/**
 * The model answer must reach the reviewer's eye, not just the payload.
 *
 * It was rendered all along — inside QuestionReviewCard, collapsed behind an (m) keystroke — which is
 * why grepping the /review PAGE for "answer" returns nothing and reads like the answer was dropped.
 * The measured problem was subtler than that and worse: across 226 rejections the reviewer's notes
 * mention the answer three times, and `answer_key_wrong` has been used zero times. A pane nobody
 * opens produces the same silence as a pane that does not exist, and we cannot tell the two apart.
 *
 * These are source pins, not render tests — there is no jsdom environment in this project and adding
 * one to assert a default boolean would cost more than it proves.
 */

const CARD = join(__dirname, "..", "src", "app", "components", "QuestionReviewCard.tsx");
const src = () => readFileSync(CARD, "utf-8");

describe("/review surfaces the model answer", () => {
  it("renders the model answer at all", () => {
    expect(src()).toMatch(/body=\{card\.modelAnswer\}/);
  });

  it("opens the model answer by default", () => {
    expect(src()).toMatch(/const \[showAnswer, setShowAnswer\] = useState\(true\)/);
  });

  it("re-opens it on every new card rather than carrying a dismissal forward", () => {
    // The card-change reset block sets each pane's state for the incoming question. If this ever
    // reverts to setShowAnswer(false), the default above becomes true only for the FIRST card of a
    // session — the failure mode that is easiest to ship and hardest to notice.
    const reset = src().match(/if \(card\.id !== lastCardId\) \{[\s\S]*?\n  \}/);
    expect(reset, "card-change reset block not found").toBeTruthy();
    expect(reset![0]).toMatch(/setShowAnswer\(true\)/);
  });

  it("keeps a tag for answer faults, so the complaint can be counted and not just read", () => {
    expect(REVIEW_REASON_OPTIONS.map((o) => o.value)).toContain("answer_key_wrong");
  });
});
