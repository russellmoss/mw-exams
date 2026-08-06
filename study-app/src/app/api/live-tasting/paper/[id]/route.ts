import { getUser } from "@/lib/auth";
import { getLiveTastingPaper, getPaperSessions, getQuestionById, getAttemptById } from "@/lib/db";
import { deriveSessionState, deriveBlindIntegrity } from "@/lib/live-tasting";
import { paperComposition } from "@/lib/live-tasting-paper-engine";

export const runtime = "nodejs";

/**
 * GET /api/live-tasting/paper/[id] — paper detail with per-flight summaries.
 *
 * Redaction contract as everywhere in Live Tasting: pre-grade flights expose the question stem
 * and marks only — no wine identity, no families (the candidate must not know the sampled
 * composition beyond what the stems reveal), no keys. Graded flights carry their reveal via the
 * per-session endpoint; here we only aggregate marks for the report card.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
  const { id } = await params;

  const paper = await getLiveTastingPaper(id, user.id);
  if (!paper) return Response.json({ error: "Not found" }, { status: 404 });

  const comp = paperComposition(paper);
  const children = await getPaperSessions(paper.id);
  const flights = [];
  let awarded = 0;
  let possible = 0;
  for (const c of comp) {
    const s = children.find((x) => x.paper_position === c.position);
    if (!s) {
      flights.push({ position: c.position, flightSize: c.flightSize, state: "pending" });
      possible += c.flightSize * 25;
      continue;
    }
    const state = deriveSessionState(s);
    const q = s.question_id ? await getQuestionById(s.question_id) : null;
    const marksTotal = q?.total_marks ?? c.flightSize * 25;
    possible += marksTotal;
    let marksLow: number | null = null;
    if (state === "tasted" && s.attempt_id) {
      const attempt = await getAttemptById(s.attempt_id);
      const m = (attempt?.marks_estimate ?? "").match(/\d+/);
      if (m) {
        marksLow = Number(m[0]);
        awarded += marksLow;
      }
    }
    flights.push({
      position: c.position,
      flightSize: c.flightSize,
      state,
      sessionId: s.id,
      questionId: s.question_id,
      questionText: q?.question_text ?? null,
      totalMarks: marksTotal,
      marksLow,
      blindIntegrity: deriveBlindIntegrity(s),
    });
  }

  const gradedCount = flights.filter((f) => f.state === "tasted").length;
  const deadlinePassed = Boolean(
    paper.pacing === "exam-conditions" && paper.exam_deadline_at &&
    new Date(paper.exam_deadline_at).getTime() < Date.now()
  );
  // Exam-conditions report (real rule: unanswered = ZERO): complete when every flight is graded
  // OR the clock has run out. Flight-by-flight papers report progressively, no zeros.
  const complete = gradedCount === comp.length || deadlinePassed;

  return Response.json({
    id: paper.id,
    paper: paper.paper,
    size: paper.size,
    mode: paper.mode,
    pacing: paper.pacing,
    city: paper.city,
    country: paper.country,
    totalBudget: paper.total_budget,
    budgetCurrency: paper.budget_currency,
    createdAt: paper.created_at,
    examStartedAt: paper.exam_started_at,
    examDeadlineAt: paper.exam_deadline_at,
    // BLIND AT THE API (paper-level twin of the session rule): the multi-flight brief reaches
    // the candidate only after an explicit open-brief; a partner-routed brief never does.
    prepGuidance: paper.mode === "byo" && paper.brief_self_opened_at ? paper.prep_guidance : null,
    briefSentTo: paper.brief_sent_to,
    briefSelfOpened: Boolean(paper.brief_self_opened_at),
    flights,
    report: complete
      ? {
          awarded,
          possible,
          pct: possible > 0 ? Math.round((awarded / possible) * 100) : 0,
          passLine: 65,
          answered: gradedCount,
          totalFlights: comp.length,
          zeroed: paper.pacing === "exam-conditions" ? comp.length - gradedCount : 0,
        }
      : null,
  });
}
