import { describe, expect, it } from "vitest";
import {
  annotateTheoryAnswerMarkdown,
  getTheoryStudyAnswer,
  listTheoryStudyAnswers,
} from "@/lib/theory/study";

describe("Theory study answer payload", () => {
  it("covers all 243 rubric-backed questions and 1,300 registered claims", () => {
    const answers = listTheoryStudyAnswers();
    expect(answers).toHaveLength(243);
    expect(answers.reduce((total, answer) => total + answer.claims.length, 0)).toBe(1300);
  });

  it("maps every covers_core entry to an examiner quote", () => {
    for (const answer of listTheoryStudyAnswers()) {
      for (const coverage of answer.coversCore) {
        expect(coverage.requirement, answer.id).toBeTruthy();
        expect(coverage.section, answer.id).toBeTruthy();
        expect(coverage.examinerQuote, answer.id).toBeTruthy();
      }
    }
  });

  it("returns verified, unsourced, and time-sensitive learner statuses", () => {
    const statuses = new Set(listTheoryStudyAnswers().flatMap((answer) => answer.claims.map((c) => c.status)));
    expect(statuses).toEqual(new Set(["verified", "unsourced", "time_sensitive"]));
  });

  it("annotates matched claims while preserving the source body", () => {
    const answer = getTheoryStudyAnswer("th_2024_p1_q3")!;
    const annotated = annotateTheoryAnswerMarkdown(answer);
    expect(answer.body).not.toContain("#theory-claim-");
    expect(annotated).toContain("#theory-claim-");
    expect(getTheoryStudyAnswer("th_2015_p1_q1")).toBeNull();
  });
});
