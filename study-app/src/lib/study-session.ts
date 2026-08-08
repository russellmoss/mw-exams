// Study session state machine using discriminated union + useReducer

export interface Wine {
  slot: number;
  fullText: string;
  appearance?: string;
}

export interface Question {
  id: string;
  source: string;
  year: number | null;
  paper: number;
  questionNumber: number;
  text: string;
  // Stem Detail variants (guided | exam_real). Canonical `text` is the fallback for any that
  // is null. Both are returned by /api/get-question so the level can be previewed/escalated client-side.
  stemGuided?: string | null;
  stemExamReal?: string | null;
  wines: Wine[];
  totalMarks: number;
  family: string;
  familyLabel: string;
  subcategory: string;
  hasModelAnswer: boolean;
  hasDecisionMatrix: boolean;
  hasWineResearch: boolean;
  modelAnswer?: string;
  decisionMatrixContent?: string;
  proposedAnnotation?: string;
  studyDiagramAssist?: string;
}

// ---- State discriminated union ----

export type StudyState =
  | { step: "select-paper" }
  | { step: "question"; question: Question }
  | { step: "pre-glass"; question: Question }
  | { step: "pre-glass-feedback"; question: Question; reasoning: string }
  | { step: "reveal"; question: Question; reasoning: string; preGlassFeedback: string }
  | {
      step: "answer";
      question: Question;
      reasoning: string;
      preGlassFeedback: string;
      tastingNotes: string[];
    }
  | {
      step: "feedback";
      question: Question;
      reasoning: string;
      preGlassFeedback: string;
      tastingNotes: string[];
      answer: string;
    }
  | {
      step: "reveal-answer";
      question: Question;
      reasoning: string;
      preGlassFeedback: string;
      tastingNotes: string[];
      answer: string;
      answerFeedback: string;
    };

// ---- Actions ----

/**
 * The answer-side fields that arrive AFTER the question has been served. A freshly generated
 * question is handed to the candidate the moment generation converges; its model answer takes
 * another ~75s to write, so it always lands mid-attempt.
 */
export type ModelAnswerPatch = {
  modelAnswer: string;
  proposedAnnotation?: string | null;
  studyDiagramAssist?: string | null;
};

export type StudyAction =
  | { type: "SELECT_QUESTION"; question: Question }
  | { type: "ATTACH_MODEL_ANSWER"; answer: ModelAnswerPatch }
  | { type: "START_PRE_GLASS" }
  | { type: "START_KNOWN_WINE" }
  | { type: "SUBMIT_REASONING"; reasoning: string }
  | { type: "PRE_GLASS_FEEDBACK_DONE"; feedback: string }
  | { type: "REVEAL_WINES"; tastingNotes: string[] }
  | { type: "SUBMIT_ANSWER"; answer: string }
  | { type: "ANSWER_FEEDBACK_DONE"; feedback: string }
  | { type: "RESET" };

// ---- Reducer ----

export function studyReducer(state: StudyState, action: StudyAction): StudyState {
  switch (action.type) {
    case "SELECT_QUESTION":
      return { step: "question", question: action.question };

    // Install a late-arriving model answer WITHOUT disturbing the attempt. SELECT_QUESTION is the
    // only other action that sets `question`, and it resets `step` to "question" — dispatching it
    // mid-attempt would wipe the candidate's progress, which is why the arrival path used to write
    // only to sessionStorage and left `state.question.modelAnswer` empty forever. That divergence
    // is the bug: the debrief renders from state, so every on-the-fly question showed
    // "No model answer available for this question yet." even after the answer had been persisted.
    //
    // Every step except select-paper carries a question, so spreading `state` preserves both the
    // discriminant and the step-specific fields.
    case "ATTACH_MODEL_ANSWER": {
      if (state.step === "select-paper") return state;
      // An empty answer is not an update. Guarding here means no caller can blank a good answer by
      // dispatching a failed poll result.
      if (!action.answer.modelAnswer) return state;
      const { modelAnswer, proposedAnnotation, studyDiagramAssist } = action.answer;
      return {
        ...state,
        question: {
          ...state.question,
          modelAnswer,
          hasModelAnswer: true,
          // Only overwrite the optional companions when the arrival actually carried them —
          // a poll response missing them must not erase what the serve payload already had.
          ...(proposedAnnotation ? { proposedAnnotation } : {}),
          ...(studyDiagramAssist ? { studyDiagramAssist } : {}),
        },
      };
    }

    case "START_PRE_GLASS":
      if (state.step === "question") {
        return { step: "pre-glass", question: state.question };
      }
      return state;

    // Known-Wine Write-Up ("dry notes") mode: identity is revealed up front, so there is no
    // blind stem analysis AND no pre-write-up tasting reveal — the candidate writes from the
    // known identity. Jump straight from the question to the write-up (answer) step, carrying
    // empty stem fields and no tasting notes (the reference notes are revealed later, at Results).
    case "START_KNOWN_WINE":
      if (state.step === "question") {
        return {
          step: "answer",
          question: state.question,
          reasoning: "",
          preGlassFeedback: "(Not applicable — Known-Wine Write-Up mode)",
          tastingNotes: [],
        };
      }
      return state;

    case "SUBMIT_REASONING":
      if (state.step === "pre-glass") {
        return {
          step: "pre-glass-feedback",
          question: state.question,
          reasoning: action.reasoning,
        };
      }
      return state;

    case "PRE_GLASS_FEEDBACK_DONE":
      if (state.step === "pre-glass-feedback") {
        return {
          step: "reveal",
          question: state.question,
          reasoning: state.reasoning,
          preGlassFeedback: action.feedback,
        };
      }
      return state;

    case "REVEAL_WINES":
      if (state.step === "reveal") {
        return {
          step: "answer",
          question: state.question,
          reasoning: state.reasoning,
          preGlassFeedback: state.preGlassFeedback,
          tastingNotes: action.tastingNotes,
        };
      }
      return state;

    case "SUBMIT_ANSWER":
      if (state.step === "answer") {
        return {
          step: "feedback",
          question: state.question,
          reasoning: state.reasoning,
          preGlassFeedback: state.preGlassFeedback,
          tastingNotes: state.tastingNotes,
          answer: action.answer,
        };
      }
      return state;

    case "ANSWER_FEEDBACK_DONE":
      if (state.step === "feedback") {
        return {
          step: "reveal-answer",
          question: state.question,
          reasoning: state.reasoning,
          preGlassFeedback: state.preGlassFeedback,
          tastingNotes: state.tastingNotes,
          answer: state.answer,
          answerFeedback: action.feedback,
        };
      }
      return state;

    case "RESET":
      return { step: "select-paper" };

    default:
      return state;
  }
}

export const initialStudyState: StudyState = { step: "select-paper" };
