import { neon } from "@neondatabase/serverless";
import { getAppVersion } from "@/lib/app-version";
import type { TheoryRubric } from "./rubric";
import type { TheoryGradingMeta } from "./grading-meta";
import type { TheoryRetrievalResult } from "./retrieval";

export interface BeginTheoryAttemptInput {
  questionId: string;
  userId: number;
  submissionId: string;
  answer: string;
  inputMethod: "typed" | "voice";
  elapsedSeconds: number | null;
  temporalAsOf: string;
}

export interface TheoryAttemptInsert {
  insert: (input: BeginTheoryAttemptInput) => Promise<number | null>;
}

const DEFAULT_INSERT: TheoryAttemptInsert = {
  async insert(input) {
    const sql = neon(process.env.DATABASE_URL!);
    const initialPayload = {
      schemaVersion: 1,
      kind: "theory",
      state: "grading",
      submissionId: input.submissionId,
      temporalAsOf: input.temporalAsOf,
      startedAt: new Date().toISOString(),
    };
    const rows = await sql`
      INSERT INTO user_attempts (
        theory_question_id, user_id, mode, input_method, flagged, stem_detail,
        user_answer, elapsed_seconds, drill_payload, submission_key, app_version
      ) VALUES (
        ${input.questionId}, ${input.userId}, 'theory', ${input.inputMethod}, false, 'none',
        ${input.answer}, ${input.elapsedSeconds}, ${JSON.stringify(initialPayload)}::jsonb,
        ${input.submissionId}, ${getAppVersion()}
      )
      ON CONFLICT (user_id, submission_key) WHERE submission_key IS NOT NULL DO NOTHING
      RETURNING id`;
    return (rows[0]?.id as number | undefined) ?? null;
  },
};

export async function beginTheoryAttempt(
  input: BeginTheoryAttemptInput,
  store: TheoryAttemptInsert = DEFAULT_INSERT
): Promise<{ attemptId: number | null; duplicate: boolean }> {
  const attemptId = await store.insert(input);
  return { attemptId, duplicate: attemptId == null };
}

export function buildTheoryGradingProvenance(
  rubric: TheoryRubric,
  retrieval: TheoryRetrievalResult,
  meta: TheoryGradingMeta | null,
  model: string
) {
  const requirements = [...rubric.coreRequirements, ...rubric.differentiators];
  return {
    schemaVersion: 1,
    kind: "theory",
    state: "complete",
    gradedAt: new Date().toISOString(),
    model,
    temporalAsOf: rubric.temporalAsOf,
    exAnte: rubric.exAnte,
    retrievalSnapshot: retrieval,
    sourceUrls: retrieval.citations.map((source) => source.url),
    factualDecisions: meta?.factualDecisions ?? [],
    gradingMetaParsed: meta !== null,
    supersededRequirements: requirements
      .filter((requirement) => requirement.temporalClass === "superseded")
      .map((requirement) => ({
        element: requirement.element,
        source: requirement.temporalSource,
      })),
  };
}

export async function saveTheoryRetrieval(
  attemptId: number,
  userId: number,
  retrieval: TheoryRetrievalResult
): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    UPDATE user_attempts SET
      drill_payload = COALESCE(drill_payload, '{}'::jsonb) ||
        ${JSON.stringify({ retrievalSnapshot: retrieval })}::jsonb
    WHERE id = ${attemptId} AND user_id = ${userId} AND mode = 'theory'`;
}

export async function finishTheoryAttempt(input: {
  attemptId: number;
  userId: number;
  feedback: string;
  verdict: "PASS" | "BORDERLINE" | "FAIL" | null;
  provenance: ReturnType<typeof buildTheoryGradingProvenance>;
}): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    UPDATE user_attempts SET
      answer_feedback = ${input.feedback},
      pass_estimate = ${input.verdict?.toLowerCase() ?? null},
      drill_payload = COALESCE(drill_payload, '{}'::jsonb) || ${JSON.stringify(input.provenance)}::jsonb,
      completed_at = NOW()
    WHERE id = ${input.attemptId} AND user_id = ${input.userId} AND mode = 'theory'`;
}

export async function failTheoryAttempt(
  attemptId: number,
  userId: number,
  message: string
): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    UPDATE user_attempts SET
      drill_payload = COALESCE(drill_payload, '{}'::jsonb) ||
        ${JSON.stringify({ state: "error", error: message, failedAt: new Date().toISOString() })}::jsonb
    WHERE id = ${attemptId} AND user_id = ${userId} AND mode = 'theory'`;
}
