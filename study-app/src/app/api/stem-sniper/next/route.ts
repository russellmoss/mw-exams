import { neon } from "@neondatabase/serverless";
import { getUser } from "@/lib/auth";
import { sanitizeTastingNotes } from "@/lib/tasting-sanitizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WineRow = { slot: number; fullText: string; appearance?: string };

/**
 * GET /api/stem-sniper/next?paper=&family=
 * Returns the next Stem Sniper drill: the question STEM only (never the wines, model answer,
 * or answer key). Only draws questions that have a validated stem_answer_keys row.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const paperRaw = searchParams.get("paper");
  const paper = paperRaw ? Number(paperRaw) : null;
  const family = searchParams.get("family"); // e.g. "F3" or null

  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT q.question_id, q.paper, q.family, q.family_label, q.question_text, q.total_marks, q.wines,
           jsonb_array_length(q.wines::jsonb) AS wine_count
    FROM generated_questions q
    JOIN stem_answer_keys k ON k.question_id = q.question_id
    WHERE k.validated = true
      AND (${paper}::int IS NULL OR q.paper = ${paper}::int)
      AND (${family}::text IS NULL OR q.family = ${family}::text)
    ORDER BY random()
    LIMIT 1
  `;
  const r = rows[0];
  if (!r) return Response.json({ error: "No drills available for that filter" }, { status: 404 });

  // Paper 3 styles (sparkling/fortified/sweet/oxidative/rosé) can't be read off the stem alone —
  // the candidate needs the look of the glass. Surface the sanitized per-wine appearance only
  // (colour/clarity/effervescence/viscosity); fullText is used solely to strip giveaways and is
  // never returned.
  let visuals: { slot: number; appearance: string }[] | undefined;
  if (Number(r.paper) === 3) {
    const wines: WineRow[] = typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
    const notes = wines.map((w) => w.appearance || "");
    const sanitized = sanitizeTastingNotes(notes, wines.map((w) => ({ fullText: w.fullText })));
    visuals = wines
      .map((w, i) => ({ slot: w.slot, appearance: (sanitized[i] || "").trim() }))
      .filter((v) => v.appearance);
  }

  return Response.json({
    questionId: r.question_id,
    paper: r.paper,
    family: r.family,
    familyLabel: r.family_label,
    questionText: r.question_text,
    totalMarks: r.total_marks,
    wineCount: Number(r.wine_count),
    ...(visuals && visuals.length ? { visuals } : {}),
  });
}
