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
  const message = await client.messages.create({
    model,
    max_tokens: 2500,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  });
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

// Derive all three variants from the canonical stem. Any level that fails validation twice falls
// back to the canonical stem (so the level is always servable and grading stays comparable).
export async function deriveStemVariants(
  canonical: string,
  apiKey: string,
  meta?: Meta
): Promise<StemVariants> {
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

  return {
    guided: guided ?? canonical,
    exam_real: exam_real ?? canonical,
    blind: blind ?? canonical,
  };
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
    guided: existing.guided || derived.guided,
    exam_real: existing.exam_real || derived.exam_real,
    blind: existing.blind || derived.blind,
  };

  // Persist only genuinely-derived values (skip pure-canonical fallbacks, so a later retry can still
  // fill a proper variant). COALESCE in the query protects any concurrently-written level.
  try {
    await updateStemVariants(question.question_id, {
      guided: !existing.guided && derived.guided !== canonical ? derived.guided : null,
      exam_real: !existing.exam_real && derived.exam_real !== canonical ? derived.exam_real : null,
      blind: !existing.blind && derived.blind !== canonical ? derived.blind : null,
    });
  } catch (err) {
    console.error("[stem-detail] persist failed:", err);
  }

  return merged;
}
