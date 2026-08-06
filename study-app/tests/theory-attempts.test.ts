import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { getTheoryRubric } from "@/lib/theory/rubric";
import {
  beginTheoryAttempt,
  buildTheoryGradingProvenance,
  type BeginTheoryAttemptInput,
} from "@/lib/theory/attempts";
import type { TheoryRetrievalResult } from "@/lib/theory/retrieval";

const input: BeginTheoryAttemptInput = {
  questionId: "th_2024_p1_q3",
  userId: 7,
  submissionId: "4f50155a-575f-4de6-b46f-bcb7f7049d42",
  answer: "Candidate essay",
  inputMethod: "typed",
  elapsedSeconds: 3600,
  temporalAsOf: "2026-08-06",
};

describe("Theory attempt submit lock", () => {
  it("rejects the second claim of the same per-user submission id", async () => {
    const seen = new Set<string>();
    const insert = vi.fn(async (row: BeginTheoryAttemptInput) => {
      const key = `${row.userId}:${row.submissionId}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return 91;
    });
    expect(await beginTheoryAttempt(input, { insert })).toEqual({ attemptId: 91, duplicate: false });
    expect(await beginTheoryAttempt(input, { insert })).toEqual({ attemptId: null, duplicate: true });
  });

  it("supplies every practical-era NOT NULL column explicitly", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/theory/attempts.ts"), "utf-8");
    expect(source).toMatch(/mode, input_method, flagged, stem_detail/);
    expect(source).toMatch(/'theory'[\s\S]*false, 'none'/);
    expect(source).toMatch(/INSERT INTO user_attempts \(\s*theory_question_id,/);
    expect(source).not.toMatch(/INSERT INTO user_attempts \(\s*question_id,/);
  });

  it("keeps practical and Theory question foreign keys separate", () => {
    const migration = readFileSync(
      join(process.cwd(), "migrations/050_theory_attempt_questions.sql"),
      "utf-8"
    );
    const index = JSON.parse(
      readFileSync(join(process.cwd(), "public/data/theory-grading-index.json"), "utf-8")
    ) as Array<{ id: string }>;
    const registeredIds = [...migration.matchAll(/\('(th_\d{4}_p\d_q\d+)'\)/g)].map(
      (match) => match[1]
    );

    expect(registeredIds).toEqual(index.map((rubric) => rubric.id));
    expect(migration).toMatch(
      /FOREIGN KEY \(theory_question_id\) REFERENCES theory_questions\(question_id\)/
    );
    expect(migration).toMatch(/ALTER COLUMN question_id DROP NOT NULL/);
    expect(migration).not.toMatch(/DROP CONSTRAINT\s+user_attempts_question_id_fkey/);
    expect(migration).toMatch(
      /mode = 'theory' AND question_id IS NULL AND theory_question_id IS NOT NULL/
    );

    const history = readFileSync(join(process.cwd(), "src/app/api/history/route.ts"), "utf-8");
    expect(history).toMatch(/attempt\.theory_question_id \?\? attempt\.question_id/);
  });

  it("refuses rubricless 2015 and 2026 questions before beginning an attempt", () => {
    expect(getTheoryRubric("th_2015_p1_q1")).toBeNull();
    expect(getTheoryRubric("th_2026_p1_q1")).toBeNull();
    const route = readFileSync(join(process.cwd(), "src/app/api/theory/grade/route.ts"), "utf-8");
    expect(route.indexOf("if (!rubric)")).toBeGreaterThan(-1);
    expect(route.indexOf("const attempt = await beginTheoryAttempt")).toBeGreaterThan(route.indexOf("if (!rubric)"));
    expect(route).not.toMatch(/modelAnswer|model_answer/);
  });

  it("builds complete, supportable provenance for the saved attempt", () => {
    const rubric = getTheoryRubric("th_2024_p1_q3")!;
    const retrieval: TheoryRetrievalResult = {
      questionId: rubric.id,
      route: "kb",
      status: "available",
      reason: "fixture",
      query: "fixture",
      checkedAt: "2026-08-06T12:00:00Z",
      dateBucket: "2026-08-06",
      fromCache: false,
      factualChecking: "evidence_only",
      notice: "fixture",
      passages: [],
      citations: [
        {
          publisher: "AWRI",
          title: "Reference",
          url: "https://www.awri.com.au/reference",
          publishedAt: "2025-01-01",
        },
      ],
    };
    const provenance = buildTheoryGradingProvenance(
      rubric,
      retrieval,
      {
        verdict: "PASS",
        retrievalStatus: "available",
        factualDecisions: [
          {
            claim: "example claim",
            decision: "refuted",
            sourceUrls: ["https://www.awri.com.au/reference"],
            explanation: "Direct contradiction",
          },
        ],
      },
      "claude-sonnet-4-6"
    );
    expect(provenance.retrievalSnapshot).toBe(retrieval);
    expect(provenance.sourceUrls).toEqual(["https://www.awri.com.au/reference"]);
    expect(provenance.factualDecisions).toHaveLength(1);
    expect(provenance).toHaveProperty("supersededRequirements");
  });
});
