import { neon } from "@neondatabase/serverless";
import { getUser } from "@/lib/auth";
import { scoreStemSniper, type TwoAxisPrediction, type AnswerKey } from "@/lib/stem-scoring";

export const runtime = "nodejs";

const asJson = <T>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

// Accept the {grape, country, tier} shape plus Hedge & Blend's multi-tag arrays, and tolerate legacy
// {variety|style, region, country} payloads (grape ← variety|style, country ← country|region) so
// older clients still score.
//
// The arrays are passed through verbatim; the scorer owns trimming, de-duping and the MAX_HEDGE cap
// (see stem-scoring.chips) so the limit binds here on the server and not just in the card UI.
type IncomingPrediction = TwoAxisPrediction & { variety?: string; style?: string; region?: string };
const strList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
const toTwoAxis = (p: IncomingPrediction): TwoAxisPrediction => ({
  grape: (p.grape ?? p.variety ?? p.style ?? "").trim(),
  grapes: strList(p.grapes),
  grapeMode: p.grapeMode === "blend" ? "blend" : "any",
  leadGrapeIndex: typeof p.leadGrapeIndex === "number" ? p.leadGrapeIndex : 0,
  country: (p.country ?? p.region ?? "").trim(),
  countries: strList(p.countries),
  tier: p.tier,
});

/**
 * POST /api/stem-sniper/submit
 * Body: { questionId: string, predictions: [{ grape?, country?, tier? }] }
 * Marks EXACTLY two axes — grape + country, never region — against the question's validated answer
 * key (see stem-scoring.scoreStemSniper). Persists the drill as a `mode:'stem-sniper'` user_attempts
 * row (per-wine grape/country guesses + verdicts in drill_payload) and returns the graded result
 * plus the now-revealed answer key.
 */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    questionId?: string;
    predictions?: IncomingPrediction[];
  };
  const { questionId } = body;
  const predictions = Array.isArray(body.predictions) ? body.predictions.map(toTwoAxis) : null;
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
  const result = scoreStemSniper(predictions, key);

  const drillPayload = {
    twoAxis: true,
    predictions,
    score: {
      points: result.points,
      maxPoints: result.maxPoints,
      percent: result.percent,
      roundPoints: result.roundPoints,
      roundMax: result.roundMax,
      summary: result.summary,
    },
    // Per-wine attempt record: grape/country guesses, the two booleans, and the verdict.
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
