// Server-side Stem Detail derivation + backfill. Given a question's canonical stem, derive the
// three framing variants (guided | exam_real | blind) in ONE LLM call, validate that each preserves
// the immutable sub-question/mark structure (retry once, then fall back to the canonical stem for any
// level that still fails), and persist them to generated_questions so subsequent serves are instant.

import Anthropic from "@anthropic-ai/sdk";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import { updateStemVariants } from "@/lib/db";
import {
  buildStemVariantsPrompt,
  variantPreservesStructure,
  type StemDetailLevel,
} from "@/lib/prompts/stemDetail";

type Meta = { source?: "user" | "server"; userId?: number | null; questionId?: string };

export interface StemVariants {
  guided: string;
  exam_real: string;
  blind: string;
}

interface RawVariants {
  guided?: unknown;
  exam_real?: unknown;
  blind?: unknown;
}

function parseVariantsJson(text: string): RawVariants | null {
  // Tolerate a stray markdown fence or leading prose — grab the first {...} block.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as RawVariants;
  } catch {
    return null;
  }
}

async function callDeriveOnce(
  canonical: string,
  apiKey: string,
  meta?: Meta
): Promise<RawVariants | null> {
  const client = new Anthropic({ apiKey });
  const { model, abGroup } = await selectModel("question_generation", apiKey, "sonnet");
  const prompt = buildStemVariantsPrompt(canonical);
  const t0 = Date.now();
  const message = await client.messages.create(
    {
      model,
      max_tokens: 2500,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    },
    // Bounded so the backfill endpoint can never hang: without opts the SDK defaults to a 10-minute
    // timeout with two retries. Failing fast is fine here — the canonical stem is a valid fallback
    // for every level and a later serve retries the derivation.
    { timeout: Number(process.env.STEM_DETAIL_TIMEOUT_MS) || 30_000, maxRetries: 0 }
  );
  logClaudeUsage(
    { taskType: "stem_detail_variants", model, source: meta?.source, userId: meta?.userId ?? null, questionId: meta?.questionId, abGroup },
    message.usage,
    { latencyMs: Date.now() - t0 }
  );
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return parseVariantsJson(text);
}

// Pick a validated string for one level from a raw LLM payload, else null.
function pick(raw: RawVariants | null, level: StemDetailLevel, canonical: string): string | null {
  const val = raw?.[level];
  if (typeof val !== "string" || val.trim().length === 0) return null;
  return variantPreservesStructure(canonical, val) ? val.trim() : null;
}

// A derivation result. `null` for a level means derivation genuinely FAILED for it (bad JSON, or the
// variant altered the sub-questions/marks). That is deliberately distinct from "derived a string that
// happens to equal the canonical stem", which is a legitimate result — see ensureStemVariants.
export interface DerivedVariants {
  guided: string | null;
  exam_real: string | null;
  blind: string | null;
}

// Derive all three variants from the canonical stem, retrying once for any level that fails.
export async function deriveStemVariants(
  canonical: string,
  apiKey: string,
  meta?: Meta
): Promise<DerivedVariants> {
  let raw: RawVariants | null = null;
  try {
    raw = await callDeriveOnce(canonical, apiKey, meta);
  } catch (err) {
    console.error("[stem-detail] derive call failed:", err);
  }

  let guided = pick(raw, "guided", canonical);
  let exam_real = pick(raw, "exam_real", canonical);
  let blind = pick(raw, "blind", canonical);

  // Retry once if any level failed validation / parsing.
  if (!guided || !exam_real || !blind) {
    try {
      const retry = await callDeriveOnce(canonical, apiKey, meta);
      guided = guided ?? pick(retry, "guided", canonical);
      exam_real = exam_real ?? pick(retry, "exam_real", canonical);
      blind = blind ?? pick(retry, "blind", canonical);
    } catch (err) {
      console.error("[stem-detail] derive retry failed:", err);
    }
  }

  return { guided, exam_real, blind };
}

type QuestionLike = {
  question_id: string;
  question_text: string;
  stem_guided?: string | null;
  stem_exam_real?: string | null;
  stem_blind?: string | null;
};

// Ensure a served question has all three stem variants. Returns them (using the canonical stem as
// the fallback for any level). Derives + persists only when at least one level is missing, so this
// is a cheap no-op on the common (already-backfilled) path.
export async function ensureStemVariants(
  question: QuestionLike,
  apiKey: string,
  meta?: Meta
): Promise<StemVariants> {
  const canonical = question.question_text;
  const existing: StemVariants = {
    guided: question.stem_guided || "",
    exam_real: question.stem_exam_real || "",
    blind: question.stem_blind || "",
  };

  if (existing.guided && existing.exam_real && existing.blind) {
    return existing;
  }

  const derived = await deriveStemVariants(canonical, apiKey, {
    ...meta,
    questionId: question.question_id,
  });

  const merged: StemVariants = {
    guided: existing.guided || derived.guided || canonical,
    exam_real: existing.exam_real || derived.exam_real || canonical,
    blind: existing.blind || derived.blind || canonical,
  };

  // Persist every level that actually derived, INCLUDING one whose text equals the canonical stem.
  //
  // The previous guard (`derived.X !== canonical ? X : null`) treated "identical to canonical" as a
  // failed derivation and refused to store it. But the canonical stem IS already exam-real prose —
  // it's what the generator emits — so `exam_real` legitimately comes back unchanged most of the
  // time. The column therefore stayed NULL forever, ensureStemVariants saw a missing level on every
  // single serve, and re-derived the same question indefinitely (production: 1 of 98 questions
  // backfilled after repeated calls; gen_p3_F2_1780176826047 was re-derived three times in 8
  // minutes). Storing the value ends the loop. A level that genuinely failed stays null and is
  // retried on a later pass. COALESCE in the query protects any concurrently-written level.
  try {
    await updateStemVariants(question.question_id, {
      guided: existing.guided ? null : derived.guided,
      exam_real: existing.exam_real ? null : derived.exam_real,
      blind: existing.blind ? null : derived.blind,
    });
  } catch (err) {
    console.error("[stem-detail] persist failed:", err);
  }

  return merged;
}
