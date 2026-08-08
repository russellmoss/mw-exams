import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  studyReducer,
  type Question,
  type StudyState,
} from "@/lib/study-session";
import { ModelAnswerReveal } from "@/app/components/ModelAnswerReveal";

const rows = vi.hoisted(() => vi.fn());
vi.mock("@neondatabase/serverless", () => ({ neon: () => (...a: unknown[]) => rows(...a) }));

// Regression gate for the late-arriving model answer (user_attempts #427, gen_p1_F6_1786206158735).
//
// A freshly generated question is served the instant generation converges; its model answer takes
// another ~75s to write. The arrival path used to update sessionStorage ONLY, while the debrief
// renders from reducer state — so `state.question.modelAnswer` stayed empty for the whole attempt
// and every on-the-fly question showed "No model answer available for this question yet." even
// though the answer was sitting in the database. Grading escaped because it was the one consumer
// reading the copy that got updated.
//
// The three layers below are the three places that divergence could come back:
//   1. the reducer action that installs the answer without resetting the attempt
//   2. the component that renders it (and tells pending apart from absent)
//   3. the poll route, which must return the answer and not just a boolean

const QUESTION: Question = {
  id: "gen_p1_F6_1786206158735",
  source: "generated",
  year: null,
  paper: 1,
  questionNumber: 1,
  text: "Wines 1 and 2 are from different countries and are made from the same single grape variety.",
  wines: [
    { slot: 1, fullText: "Georges Vernay, Coteau de Vernon, 2022. Condrieu, Northern Rhône, France." },
    { slot: 2, fullText: "Yalumba, The Virgilius Viognier, 2022. Eden Valley, South Australia." },
  ],
  totalMarks: 50,
  family: "F6",
  familyLabel: "Style Mechanism",
  subcategory: "Two-wine same-variety style contrast",
  hasModelAnswer: false,
  hasDecisionMatrix: false,
  hasWineResearch: false,
  modelAnswer: "",
};

const ANSWER = "Both wines are Viognier. Wine 1 is Condrieu; wine 2 is Eden Valley.";

// The candidate is mid-attempt, at the step where the answer actually gets rendered.
const revealAnswerState = (question: Question): Extract<StudyState, { step: "reveal-answer" }> => ({
  step: "reveal-answer",
  question,
  reasoning: "Aromatic white, single variety.",
  preGlassFeedback: "Reasonable.",
  tastingNotes: ["Apricot, honeysuckle.", "Riper, oak-framed."],
  answer: "Viognier — Condrieu and Eden Valley.",
  answerFeedback: "Variety correct.",
});

describe("ATTACH_MODEL_ANSWER", () => {
  it("installs the answer without disturbing the attempt", () => {
    const before = revealAnswerState(QUESTION);
    const after = studyReducer(before, {
      type: "ATTACH_MODEL_ANSWER",
      answer: { modelAnswer: ANSWER, proposedAnnotation: "Examiner intent.", studyDiagramAssist: "Tree." },
    });

    expect(after.step).toBe("reveal-answer");
    if (after.step !== "reveal-answer") throw new Error("step changed");
    expect(after.question.modelAnswer).toBe(ANSWER);
    expect(after.question.hasModelAnswer).toBe(true);
    expect(after.question.proposedAnnotation).toBe("Examiner intent.");
    expect(after.question.studyDiagramAssist).toBe("Tree.");

    // The whole point: the candidate's work survives. SELECT_QUESTION would have reset all of this.
    expect(after.answer).toBe(before.answer);
    expect(after.answerFeedback).toBe("Variety correct.");
    expect(after.reasoning).toBe("Aromatic white, single variety.");
    expect(after.tastingNotes).toEqual(["Apricot, honeysuckle.", "Riper, oak-framed."]);
    expect(after.question.id).toBe(QUESTION.id);
    expect(after.question.wines).toHaveLength(2);

    // Fresh identities, or React never re-renders and the debrief keeps showing the empty state
    // even though the data is now correct — which is the bug wearing a different hat.
    expect(after).not.toBe(before);
    expect(after.question).not.toBe(before.question);
  });

  it("installs mid-flight at an earlier step too, without advancing it", () => {
    const before: StudyState = { step: "pre-glass", question: QUESTION };
    const after = studyReducer(before, {
      type: "ATTACH_MODEL_ANSWER",
      answer: { modelAnswer: ANSWER },
    });
    expect(after.step).toBe("pre-glass");
    if (after.step !== "pre-glass") throw new Error("step changed");
    expect(after.question.modelAnswer).toBe(ANSWER);
  });

  it("is a no-op on an empty answer, so a failed poll cannot blank a good one", () => {
    const withAnswer = studyReducer(revealAnswerState(QUESTION), {
      type: "ATTACH_MODEL_ANSWER",
      answer: { modelAnswer: ANSWER },
    });
    const after = studyReducer(withAnswer, {
      type: "ATTACH_MODEL_ANSWER",
      answer: { modelAnswer: "" },
    });
    expect(after).toBe(withAnswer);
  });

  it("does not erase companions the serve payload already carried", () => {
    const seeded = { ...QUESTION, proposedAnnotation: "From serve.", studyDiagramAssist: "From serve." };
    const after = studyReducer(revealAnswerState(seeded), {
      type: "ATTACH_MODEL_ANSWER",
      answer: { modelAnswer: ANSWER, proposedAnnotation: null, studyDiagramAssist: null },
    });
    if (after.step !== "reveal-answer") throw new Error("step changed");
    expect(after.question.proposedAnnotation).toBe("From serve.");
    expect(after.question.studyDiagramAssist).toBe("From serve.");
  });

  it("is a no-op before a question is selected", () => {
    const before: StudyState = { step: "select-paper" };
    expect(studyReducer(before, { type: "ATTACH_MODEL_ANSWER", answer: { modelAnswer: ANSWER } })).toBe(before);
  });
});

describe("ModelAnswerReveal", () => {
  const MISSING = "No model answer available for this question yet.";
  const PENDING = "still being written";

  it("renders the answer and drops the fallback once it has arrived", () => {
    const html = renderToStaticMarkup(
      <ModelAnswerReveal
        question={{ ...QUESTION, modelAnswer: ANSWER, hasModelAnswer: true }}
        onNextQuestion={() => {}}
      />
    );
    expect(html).toContain("Both wines are Viognier");
    expect(html).not.toContain(MISSING);
    expect(html).not.toContain(PENDING);
  });

  it("says the answer is coming while it is still being written", () => {
    const html = renderToStaticMarkup(
      <ModelAnswerReveal question={QUESTION} onNextQuestion={() => {}} pending />
    );
    expect(html).toContain(PENDING);
    expect(html).not.toContain(MISSING);
  });

  it("falls back to the flat message only when it is genuinely absent", () => {
    const html = renderToStaticMarkup(
      <ModelAnswerReveal question={QUESTION} onNextQuestion={() => {}} pending={false} />
    );
    expect(html).toContain(MISSING);
    expect(html).not.toContain(PENDING);
  });
});

// The study page has FIVE places a model answer can arrive: the on-mount generate call, the
// background poll, the submit gate's poll, "Generate fresh", and flag-load-next. Four of the five
// were wrong at the time this bug was filed — each had independently reinvented "flip the flag and
// move on". A contract every call site has to remember is a contract that gets forgotten, so it is
// asserted here instead (same shape of guard as historical-stem-callers.test.ts).
describe("every model-answer arrival goes through the one writer", () => {
  const src = readFileSync(join(__dirname, "..", "src/app/study/page.tsx"), "utf8");

  it("never flips the ready flag outside applyModelAnswer", () => {
    // A bare setModelAnswerReady(true) is precisely the old bug: the flag says the answer landed
    // while state.question.modelAnswer stays empty. The serve paths' setModelAnswerReady(
    // data.hasModelAnswer) is a different thing — that is the value the question arrived with.
    const bare = src.match(/setModelAnswerReady\(true\)/g) ?? [];
    expect(bare, "install the answer via applyModelAnswer instead of flipping the flag").toHaveLength(1);

    const writer = src.slice(src.indexOf("const applyModelAnswer"));
    const endOfWriter = writer.indexOf("}, []);");
    expect(endOfWriter).toBeGreaterThan(0);
    expect(writer.slice(0, endOfWriter)).toContain("setModelAnswerReady(true)");
  });

  it("grades from the ref, not from a second copy in sessionStorage", () => {
    // The divergence that hid the bug for so long: grading read the copy that WAS updated, so the
    // only visible symptom was the debrief.
    expect(src).toMatch(/const modelAnswer = modelAnswerTextRef\.current/);
  });

  it("tells the debrief whether the answer is pending", () => {
    expect(src).toMatch(/pending=\{!modelAnswerReady\}/);
  });
});

describe("/api/check-model-answer", () => {
  afterEach(() => vi.clearAllMocks());

  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/check-model-answer/route");
    return POST(new Request("https://x.test/api/check-model-answer", { method: "POST", body: JSON.stringify(body) }));
  };

  it("returns the answer itself, not just a readiness flag", async () => {
    const long = ANSWER.padEnd(200, " .");
    rows.mockResolvedValue([
      { model_answer: long, proposed_annotation: "Intent.", study_diagram_assist: "Tree." },
    ]);
    const body = await (await post({ questionId: QUESTION.id })).json();
    expect(body.ready).toBe(true);
    // The original route returned {ready} alone, which left the poll with nothing to install.
    expect(body.modelAnswer).toBe(long);
    expect(body.proposedAnnotation).toBe("Intent.");
    expect(body.studyDiagramAssist).toBe("Tree.");
  });

  it("withholds a stub answer, so the submit gate is not unblocked by one", async () => {
    rows.mockResolvedValue([{ model_answer: "too short", proposed_annotation: null, study_diagram_assist: null }]);
    const body = await (await post({ questionId: QUESTION.id })).json();
    expect(body.ready).toBe(false);
    expect(body.modelAnswer).toBeNull();
  });

  it("reports not-ready for an unknown question", async () => {
    rows.mockResolvedValue([]);
    const body = await (await post({ questionId: "nope" })).json();
    expect(body.ready).toBe(false);
    expect(body.modelAnswer).toBeNull();
  });
});
