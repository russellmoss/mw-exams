// model-answer-completeness.test.ts — a served question must carry a model answer that COVERS every
// lettered sub-part of its stem (fb_427, fb_368, fb_362).
//
// fb_427 is the acute case: a Paper 1 whites flight (Georges Vernay Coteau de Vernon Condrieu vs
// Yalumba The Virgilius Viognier) reached a candidate with the reveal screen showing "No model answer
// available for this question yet." — ungradeable, and the debrief empty. fb_368 and fb_362 are the
// same gap endorsed more mildly ("would be nice to have model answers"). validateModelAnswerPresent is
// the mechanical gate: no answer, or an answer that skips a sub-part, is not servable. The engine's
// bankedServeRejection consumes it so such a row never reaches a candidate.
import { describe, it, expect } from "vitest";
import {
  validateModelAnswerPresent,
  MODEL_ANSWER_SUBPART_MIN_CHARS,
} from "../src/lib/question-validator";
import type { QuestionForAudit } from "../src/lib/question-validator";
import { bankedServeRejection, filterValidBanked } from "../src/lib/question-engine";
import type { GeneratedQuestion } from "../src/lib/db";

// A three-part stem in the exact shape the flagged questions use.
const STEM_ABC = `Wines 1 and 2 are made from the same single grape variety and are from different countries.

With reference to both wines:
a) Identify the grape variety. (6 marks)

For each wine:
b) Identify the origin as closely as possible. (2 x 10 marks)
c) Comment on the quality and winemaking. (2 x 12 marks)`;

// >= MODEL_ANSWER_SUBPART_MIN_CHARS characters of prose per block.
const block = (letter: string) =>
  `${letter}) This block answers sub-part ${letter} in full sentences, weighing the plausible calls and ` +
  `ruling out the alternatives on structural evidence before landing the answer decisively so that a ` +
  `grader has real prose to mark against and the candidate's debrief is not left empty at all here.`;

const baseQuestion = (modelAnswer: string | null): QuestionForAudit => ({
  questionId: "q_test",
  paper: 2,
  family: "F1",
  questionText: STEM_ABC,
  totalMarks: 50,
  wines: [],
  modelAnswer,
});

describe("validateModelAnswerPresent — sub-part coverage", () => {
  it("fails when the model answer covers a and b but not c", () => {
    const answer = `${block("a")}\n\n${block("b")}`;
    const v = validateModelAnswerPresent(baseQuestion(answer));
    expect(v.some((x) => x.rule === "model-answer-incomplete" && x.severity === "hard")).toBe(true);
    expect(v[0].detail).toContain('"c)"');
  });

  it("passes when the model answer covers a, b and c", () => {
    const answer = `${block("a")}\n\n${block("b")}\n\n${block("c")}`;
    expect(validateModelAnswerPresent(baseQuestion(answer))).toEqual([]);
  });

  it("fails hard when no model answer is attached at all (fb_427)", () => {
    for (const empty of [null, "", "   "]) {
      const v = validateModelAnswerPresent(baseQuestion(empty));
      expect(v.some((x) => x.rule === "model-answer-missing" && x.severity === "hard")).toBe(true);
    }
  });

  it("fails when a covered sub-part is only a stub below the character floor", () => {
    const answer = `${block("a")}\n\n${block("b")}\n\nc) Nebbiolo.`;
    const v = validateModelAnswerPresent(baseQuestion(answer));
    expect(v.some((x) => x.rule === "model-answer-incomplete")).toBe(true);
    expect(v[0].detail).toContain('"c)"');
    expect("c) Nebbiolo.".length).toBeLessThan(MODEL_ANSWER_SUBPART_MIN_CHARS);
  });

  it("tolerates markdown decoration around the sub-part labels (**a)**, ### b), - c))", () => {
    const answer = `**${block("a")}\n\n### ${block("b")}\n\n- ${block("c")}`;
    expect(validateModelAnswerPresent(baseQuestion(answer))).toEqual([]);
  });
});

// A banked row shaped like a real GeneratedQuestion, differing only in its model_answer.
const bankRow = (id: string, modelAnswer: string | null): GeneratedQuestion =>
  ({
    question_id: id,
    paper: 2,
    family: "F1",
    question_text: STEM_ABC,
    wines: [
      { slot: 1, fullText: "Penfolds, Bin 707 Cabernet Sauvignon, 2018. Coonawarra, Australia. (14.5%)" },
      { slot: 2, fullText: "Stag's Leap Wine Cellars, Cabernet Sauvignon, 2018. Napa Valley, USA. (14.5%)" },
    ],
    total_marks: 50,
    model_answer: modelAnswer,
    wine_profiles: {},
  } as unknown as GeneratedQuestion);

describe("question-engine selection never serves a model-answer-less banked question", () => {
  const fullAnswer = `${block("a")}\n\n${block("b")}\n\n${block("c")}`;

  it("bankedServeRejection refuses a row with no model answer, citing the model-answer gate", () => {
    const reason = bankedServeRejection(bankRow("q_no_answer", null));
    expect(reason).toContain("model-answer");
  });

  it("does not refuse an otherwise-identical row over its model answer once one is attached", () => {
    const reason = bankedServeRejection(bankRow("q_good", fullAnswer));
    expect(reason ?? "").not.toContain("model-answer");
  });

  it("filterValidBanked drops the answer-less row from the servable pool", () => {
    const bank = [bankRow("q_good", fullAnswer), bankRow("q_no_answer", null)];
    const servable = filterValidBanked(bank).map((q) => q.question_id);
    expect(servable).not.toContain("q_no_answer");
    // and the fully-keyed, otherwise-valid row survives — the gate removes only the incomplete one.
    expect(servable).toContain("q_good");
  });
});
