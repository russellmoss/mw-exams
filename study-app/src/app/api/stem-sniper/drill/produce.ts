import { neon } from "@neondatabase/serverless";
import { sanitizeTastingNotes } from "@/lib/tasting-sanitizer";
import {
  generateFreshQuestion,
  ensureP3Appearances,
  type UsageMeta,
  type ProgressEmitter,
} from "@/lib/question-engine";
import { deriveStemKey, persistStemKey } from "@/lib/stem-answer-key";

/**
 * The Stem Sniper drill producer, shared by both routes that serve one:
 *   • `drill/route.ts`        — plain JSON, used by the client-side prefetch of the NEXT drill
 *   • `drill/stream/route.ts` — SSE, used for the drill the candidate is waiting on
 *
 * Identical logic either way; the only difference is whether an emitter is threaded through, in
 * which case each phase (and the model's own reasoning) is reported live instead of the request
 * sitting silent for 20-60s.
 */

// Default 90% fresh per the unified-generation goal; tune via env without a deploy. Clamped to [0,1].
const FRESH_RATIO = Math.min(1, Math.max(0, Number(process.env.STEM_FRESH_RATIO ?? "0.9")));

type WineRow = { slot: number; fullText: string; appearance?: string };

interface DrillStemSource {
  question_id: string;
  paper: number;
  family: string;
  family_label: string;
  question_text: string;
  total_marks: number;
  wines: unknown;
}

// Shape the stem-only payload. For Paper 3 the candidate needs the look of the glass, so surface the
// sanitized per-wine appearance only (fullText is used solely to strip giveaways, never returned).
function toDrillStem(r: DrillStemSource) {
  const wines: WineRow[] = typeof r.wines === "string" ? JSON.parse(r.wines) : (r.wines as WineRow[]);
  let visuals: { slot: number; appearance: string }[] | undefined;
  if (Number(r.paper) === 3) {
    const notes = wines.map((w) => w.appearance || "");
    const sanitized = sanitizeTastingNotes(notes, wines.map((w) => ({ fullText: w.fullText })));
    visuals = wines
      .map((w, i) => ({ slot: w.slot, appearance: (sanitized[i] || "").trim() }))
      .filter((v) => v.appearance);
  }
  return {
    questionId: r.question_id,
    paper: r.paper,
    family: r.family,
    familyLabel: r.family_label,
    questionText: r.question_text,
    totalMarks: r.total_marks,
    wineCount: Array.isArray(wines) ? wines.length : 0,
    ...(visuals && visuals.length ? { visuals } : {}),
  };
}

export type DrillStem = ReturnType<typeof toDrillStem>;

// Banked path: a random question that already has a validated stem key.
async function pickBankedDrill(paper: number | null, family: string | null) {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT q.question_id, q.paper, q.family, q.family_label, q.question_text, q.total_marks, q.wines
    FROM generated_questions q
    JOIN stem_answer_keys k ON k.question_id = q.question_id
    WHERE k.validated = true
      AND (${paper}::int IS NULL OR q.paper = ${paper}::int)
      AND (${family}::text IS NULL OR q.family = ${family}::text)
    ORDER BY random()
    LIMIT 1
  `;
  return rows[0] ? toDrillStem(rows[0] as unknown as DrillStemSource) : null;
}

// Fresh path: generate through the SAME engine the study page uses, then derive + persist the stem
// key from the new question. Returns null if generation didn't yield a cleanly keyable question, so
// the caller can fall back to the banked pool.
async function tryFreshDrill(
  paper: number,
  family: string | null,
  apiKey: string,
  meta: UsageMeta,
  emit?: ProgressEmitter
) {
  const outcome = await generateFreshQuestion(paper, family || undefined, apiKey, meta, undefined, emit);
  if ("error" in outcome) return null;
  // generateFreshQuestion can fall back to a banked question after repeated validator failures; only
  // the genuinely-generated case is keyed here (a banked fallback already has its own validated key).
  if (outcome.source !== "generated") return null;

  let q = outcome.question as unknown as DrillStemSource & { wine_profiles?: unknown };
  // Paper 3 drills need the look of the glass; generateFreshQuestion doesn't add appearances, so do
  // it here with the SAME engine helper the study serve-path uses.
  if (Number(q.paper) === 3) {
    q = (await ensureP3Appearances(
      q as unknown as Parameters<typeof ensureP3Appearances>[0],
      apiKey,
      meta,
      emit
    )) as unknown as typeof q;
  }

  emit?.({ type: "status", label: "Deriving the answer key…" });

  // Derive the key now from the question itself. wine_profiles may still be enriching in the
  // background → {} falls back to label/appellation resolution, which is enough for the engine's
  // banker-anchored flights. A later enrichment/backfill can only improve it.
  const key = deriveStemKey({
    paper: q.paper,
    question_text: q.question_text,
    wines: q.wines,
    wine_profiles: (q.wine_profiles ?? {}) as unknown,
  });
  if (!key.ok) return null; // not cleanly scorable yet; the row stays for later enrichment/backfill
  await persistStemKey(q.question_id, key);
  return toDrillStem(q);
}

const randomPaper = (): 1 | 2 | 3 => (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3;

export async function produceDrill(opts: {
  paper: number | null;
  family: string | null;
  apiKey: string;
  meta: UsageMeta;
  emit?: ProgressEmitter;
}): Promise<DrillStem | { error: string }> {
  const { paper, family, apiKey, meta, emit } = opts;
  const goFresh = Math.random() < FRESH_RATIO;

  if (goFresh) {
    const fresh = await tryFreshDrill(paper ?? randomPaper(), family, apiKey, meta, emit);
    if (fresh) return fresh;
    // fall through to banked on any generation/keying miss
  }

  emit?.({ type: "status", label: "Pulling a validated drill from the bank…" });
  const banked = await pickBankedDrill(paper, family);
  if (banked) return banked;

  // Banked pool empty for this filter — last resort: generate even if the dice said banked.
  if (!goFresh) {
    const fresh = await tryFreshDrill(paper ?? randomPaper(), family, apiKey, meta, emit);
    if (fresh) return fresh;
  }

  return { error: "No drills available for that filter" };
}
