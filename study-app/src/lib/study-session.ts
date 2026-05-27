// Study session state machine using discriminated union + useReducer

export interface Wine {
  slot: number;
  fullText: string;
}

export interface Question {
  id: string;
  source: string;
  year: number | null;
  paper: number;
  questionNumber: number;
  text: string;
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

export type StudyAction =
  | { type: "SELECT_QUESTION"; question: Question }
  | { type: "START_PRE_GLASS" }
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

    case "START_PRE_GLASS":
      if (state.step === "question") {
        return { step: "pre-glass", question: state.question };
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
