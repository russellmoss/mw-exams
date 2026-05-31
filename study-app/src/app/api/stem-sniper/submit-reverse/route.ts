import { neon } from "@neondatabase/serverless";
import { getUser } from "@/lib/auth";
import { scorePredictions, type Prediction, type AnswerKey, type ScoreResult } from "@/lib/stem-scoring";

export const runtime = "nodejs";

const asJson = <T>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

// Movement = how the Layer-B sensory evidence changed the candidate's accuracy. Calibration is
// reported on the Stage-2 (Layer-B) tiers — the honest one, made WITH the evidence in the glass.
function computeMovement(s1: ScoreResult, s2: ScoreResult) {
  return {
    stage1Percent: s1.percent,
    stage2Percent: s2.percent,
    delta: s2.percent - s1.percent,
    stage1Hits: s1.summary.hits + s1.summary.nears,
    stage2Hits: s2.summary.hits + s2.summary.nears,
  };
}

const score = (r: ScoreResult) => ({ points: r.points, maxPoints: r.maxPoints, percent: r.percent, summary: r.summary });

/**
 * POST /api/stem-sniper/submit-reverse
 * Body: { questionId, stage1: Prediction[], stage2: Prediction[] }
 * Reverse Tasting: scores the Layer-A (stem-only) guess AND the Layer-B (post-tasting) guess against
 * the same validated key, computes the movement between them, persists a `mode:'reverse-tasting'`
 * attempt, and returns both results + the revealed key. Calibration rides on Stage 2 (see UI).
 */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    questionId?: string;
    stage1?: Prediction[];
    stage2?: Prediction[];
  };
  const { questionId } = body;
  const stage1 = Array.isArray(body.stage1) ? body.stage1 : null;
  const stage2 = Array.isArray(body.stage2) ? body.stage2 : null;
  if (!questionId || !stage1 || !stage2) {
    return Response.json({ error: "questionId, stage1[] and stage2[] are required" }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const keyRows = await sql`
    SELECT ground_truth, plausible, validated FROM stem_answer_keys WHERE question_id = ${questionId}
  `;
  const keyRow = keyRows[0];
  if (!keyRow || !keyRow.validated) {
    return Response.json({ error: "No validated answer key for this question" }, { status: 400 });
  }

  const key: AnswerKey = { ground_truth: asJson(keyRow.ground_truth), plausible: asJson(keyRow.plausible) };
  const r1 = scorePredictions(stage1, key);
  const r2 = scorePredictions(stage2, key);
  const movement = computeMovement(r1, r2);

  const drillPayload = {
    reverse: true,
    stage1: { predictions: stage1, score: score(r1), grades: r1.grades, calibration: r1.calibration },
    stage2: { predictions: stage2, score: score(r2), grades: r2.grades, calibration: r2.calibration },
    movement,
  };

  const ins = await sql`
    INSERT INTO user_attempts (question_id, user_id, mode, drill_payload, completed_at)
    VALUES (${questionId}, ${user.id}, 'reverse-tasting', ${JSON.stringify(drillPayload)}::jsonb, now())
    RETURNING id
  `;

  return Response.json({
    attemptId: ins[0].id,
    stage1: r1,
    stage2: r2,
    movement,
    revealed: { ground_truth: key.ground_truth, plausible: key.plausible },
  });
}
