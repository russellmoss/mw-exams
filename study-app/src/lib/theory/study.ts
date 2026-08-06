import studyRows from "@/data/theory-study-index.json";

export type TheoryClaimStatus = "verified" | "unsourced" | "time_sensitive";

export interface TheoryStudyClaim {
  index: number;
  claimId: string;
  claim: string;
  matchText: string | null;
  status: TheoryClaimStatus;
  verdict: string;
  confidence: string;
  timeSensitive: boolean;
  examYear: number;
  source: {
    kind: string;
    publisher: string;
    tier: number;
    ref: string;
    quote: string;
  } | null;
  note: string | null;
}

export interface TheoryStudyAnswer {
  id: string;
  year: number;
  paper: number;
  question: number;
  questionText: string;
  generated: string | null;
  body: string;
  coversCore: Array<{
    requirement: string;
    section: string;
    examinerQuote: string;
  }>;
  claims: TheoryStudyClaim[];
}

const answers = studyRows as TheoryStudyAnswer[];
const byId = new Map(answers.map((answer) => [answer.id, answer]));

export function getTheoryStudyAnswer(id: string): TheoryStudyAnswer | null {
  return byId.get(id) ?? null;
}

export function listTheoryStudyAnswers(): TheoryStudyAnswer[] {
  return answers;
}

/** Adds claim anchors without changing a word of the model answer. */
export function annotateTheoryAnswerMarkdown(answer: TheoryStudyAnswer): string {
  let markdown = answer.body;
  const matchedClaims = answer.claims
    .filter((claim): claim is TheoryStudyClaim & { matchText: string } => Boolean(claim.matchText))
    .sort((a, b) => b.matchText.length - a.matchText.length);
  for (const claim of matchedClaims) {
    const label = claim.matchText.replace(/([\\\[\]])/g, "\\$1");
    markdown = markdown.replace(claim.matchText, `[${label}](#theory-claim-${claim.index})`);
  }
  return markdown;
}
