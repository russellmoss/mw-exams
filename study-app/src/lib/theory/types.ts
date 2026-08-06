export interface RubricQuote {
  quote: string;
}

export interface RubricRequirement extends RubricQuote {
  element: string;
  temporalClass: "evergreen" | "year_bound" | "superseded";
  temporalRationale: string;
  temporalSource: {
    tier: 1;
    publisher: string;
    title: string;
    url: string;
    published_at: string;
    quote: string;
  } | null;
}

export interface RubricSignal extends RubricQuote {
  signal: string;
}

export interface RubricTrap extends RubricQuote {
  trap: string;
}

export interface RubricDefinition extends RubricQuote {
  term: string;
}

export interface TheoryRubric {
  id: string;
  year: number;
  paper: number;
  question: number;
  section: "A" | "B" | null;
  domain: string;
  paperTitle: string | null;
  questionText: string;
  commandWord: string | null;
  commandWordDemand: string | null;
  definitionsRequired: RubricDefinition[];
  coreRequirements: RubricRequirement[];
  differentiators: RubricRequirement[];
  creditSignals: RubricSignal[];
  penaltySignals: RubricSignal[];
  scopeTraps: RubricTrap[];
  examplesExpected: {
    required?: boolean;
    specificity?: string;
    named_in_report?: string[];
    quote?: string;
  } | null;
  performanceNote: string | null;
  evidenceQuality: "rich" | "moderate" | "thin" | null;
  sourceReport: string | null;
  textSource: "pdf_text_layer" | "transcribed_render";
  hasModelAnswer: boolean;
  exAnte: boolean;
  temporalAsOf: string;
  temporalRefresh: {
    owner: string | null;
    cadence: string | null;
    status: string;
  };
}
