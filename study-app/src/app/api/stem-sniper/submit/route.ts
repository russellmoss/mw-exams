import { neon } from "@neondatabase/serverless";
import { getUser } from "@/lib/auth";
import { scorePredictions, type Prediction, type AnswerKey } from "@/lib/stem-scoring";

export const runtime = "nodejs";

const asJson = <T>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

/**
 * POST /api/stem-sniper/submit
 * Body: { questionId: string, predictions: [{ variety, region?, country?, tier? }] }
 * Scores the predictions against the question's validated answer key, persists the drill as a
 * `mode:'stem-sniper'` user_attempts row (with the full result in drill_payload), and returns
 * the graded result plus the now-revealed answer key.
 */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    questionId?: string;
    predictions?: Prediction[];
  };
  const { questionId } = body;
  const predictions = Array.isArray(body.predictions) ? body.predictions : null;
  if (!questionId || !predictions) {
    return Response.json({ error: "questionId and predictions[] are required" }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const keyRows = await sql`
    SELECT ground_truth, plausible, validated FROM stem_answer_keys WHERE question_id = ${questionId}
  `;
  const keyRow = keyRows[0];
  if (!keyRow || !keyRow.validated) {
    return Response.json({ error: "No validated answer key for this question" }, { status: 400 });
  }

  const key: AnswerKey = {
    ground_truth: asJson(keyRow.ground_truth),
    plausible: asJson(keyRow.plausible),
  };
  const result = scorePredictions(predictions, key);

  const drillPayload = {
    predictions,
    score: { points: result.points, maxPoints: result.maxPoints, percent: result.percent, summary: result.summary },
    grades: result.grades,
    calibration: result.calibration,
  };

  const ins = await sql`
    INSERT INTO user_attempts (question_id, user_id, mode, drill_payload, completed_at)
    VALUES (${questionId}, ${user.id}, 'stem-sniper', ${JSON.stringify(drillPayload)}::jsonb, now())
    RETURNING id
  `;

  return Response.json({
    attemptId: ins[0].id,
    result,
    revealed: { ground_truth: key.ground_truth, plausible: key.plausible },
  });
}
