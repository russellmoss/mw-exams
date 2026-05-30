import { neon } from "@neondatabase/serverless";

/**
 * API usage / cost tracking.
 *
 * Every billable Claude (Anthropic) and Tavily call should funnel through
 * `logClaudeUsage` / `logTavilyUsage`. Both are FIRE-AND-FORGET: they never throw
 * and never block the request path — a logging failure must never break a user's
 * question generation or grading. The admin Cost dashboard reads the rows back.
 *
 * Pricing below is in USD per 1,000,000 tokens, matched by substring on the model
 * id (so it survives Opus/Sonnet version bumps and the dynamic getLatestOpus()
 * resolver). VERIFY against https://www.anthropic.com/pricing when prices change.
 */

export const TAVILY_COST_PER_CREDIT = 0.008; // $/credit (basic search = 1 credit)

// ElevenLabs TTS is billed per character (≈ 1 credit/char). The USD value of a
// credit is plan-dependent, so this is an ESTIMATE used only for the Cost
// dashboard — override with ELEVENLABS_USD_PER_1K_CHARS to match your plan.
// VERIFY against https://elevenlabs.io/pricing when the plan changes.
export const ELEVENLABS_USD_PER_1K_CHARS = Number(
  process.env.ELEVENLABS_USD_PER_1K_CHARS || 0.18
);

interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number; // 5-minute cache write
  cacheRead: number;
}

// Keyed by substring; first match wins (order matters — check most specific first).
const MODEL_PRICING: { match: string; price: ModelPrice }[] = [
  { match: "opus", price: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 } },
  { match: "sonnet", price: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } },
  { match: "haiku", price: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } },
];

const FALLBACK_PRICE: ModelPrice = { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 };

export function priceForModel(model: string): ModelPrice {
  const lower = (model || "").toLowerCase();
  for (const { match, price } of MODEL_PRICING) {
    if (lower.includes(match)) return price;
  }
  return FALLBACK_PRICE;
}

/** Structural shape of an Anthropic Usage object (non-streaming or finalMessage). */
export interface ClaudeUsageTokens {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function computeClaudeCost(model: string, usage: ClaudeUsageTokens): number {
  const p = priceForModel(model);
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return (
    (input * p.input +
      output * p.output +
      cacheCreate * p.cacheWrite +
      cacheRead * p.cacheRead) /
    1_000_000
  );
}

export interface ClaudeUsageContext {
  taskType: string;
  model: string;
  source?: "server" | "user";
  userId?: number | null;
  attemptId?: number | null;
  questionId?: string | null;
  abGroup?: string | null;
}

/**
 * Record one Claude call. Pass the message's `.usage` (from messages.create) or
 * `(await stream.finalMessage()).usage` (from messages.stream). Safe to await or
 * fire-and-forget; it swallows its own errors.
 */
export async function logClaudeUsage(
  ctx: ClaudeUsageContext,
  usage: ClaudeUsageTokens | null | undefined,
  opts?: { latencyMs?: number; success?: boolean; error?: string }
): Promise<void> {
  try {
    const u = usage ?? {};
    const cost = computeClaudeCost(ctx.model, u);
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      INSERT INTO model_usage (
        task_type, model, source, user_id, attempt_id, question_id, ab_group,
        input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
        cost_usd, latency_ms, success, error
      ) VALUES (
        ${ctx.taskType}, ${ctx.model}, ${ctx.source ?? "server"},
        ${ctx.userId ?? null}, ${ctx.attemptId ?? null}, ${ctx.questionId ?? null}, ${ctx.abGroup ?? null},
        ${u.input_tokens ?? 0}, ${u.output_tokens ?? 0},
        ${u.cache_read_input_tokens ?? 0}, ${u.cache_creation_input_tokens ?? 0},
        ${cost}, ${opts?.latencyMs ?? null}, ${opts?.success ?? true}, ${opts?.error ?? null}
      )
    `;
  } catch (err) {
    console.error("[usage-log] failed to record Claude usage:", err);
  }
}

export interface TavilyUsageContext {
  taskType: string;
  query?: string | null;
  resultsCount?: number;
  credits?: number;
  userId?: number | null;
  questionId?: string | null;
  success?: boolean;
}

/** Record one Tavily search. Fire-and-forget; swallows its own errors. */
export async function logTavilyUsage(ctx: TavilyUsageContext): Promise<void> {
  try {
    const credits = ctx.credits ?? 1;
    const cost = credits * TAVILY_COST_PER_CREDIT;
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      INSERT INTO tavily_usage (
        task_type, query, results_count, credits, cost_usd, user_id, question_id, success
      ) VALUES (
        ${ctx.taskType}, ${ctx.query ?? null}, ${ctx.resultsCount ?? 0}, ${credits}, ${cost},
        ${ctx.userId ?? null}, ${ctx.questionId ?? null}, ${ctx.success ?? true}
      )
    `;
  } catch (err) {
    console.error("[usage-log] failed to record Tavily usage:", err);
  }
}

export interface ElevenLabsUsageContext {
  taskType: string;
  voiceId?: string | null;
  modelId?: string | null;
  characters: number;
  userId?: number | null;
  attemptId?: number | null;
  analysisId?: number | null;
}

/**
 * Record one ElevenLabs TTS synthesis. Characters synthesized ≈ credits ≈ cost
 * basis. Fire-and-forget; swallows its own errors so a logging failure never
 * breaks narration generation.
 */
export async function logElevenLabsUsage(
  ctx: ElevenLabsUsageContext,
  opts?: { latencyMs?: number; success?: boolean; error?: string }
): Promise<void> {
  try {
    const characters = Math.max(0, Math.round(ctx.characters || 0));
    const credits = characters; // ≈ 1 credit/char (conservative; turbo bills less)
    const cost = (characters / 1000) * ELEVENLABS_USD_PER_1K_CHARS;
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      INSERT INTO elevenlabs_usage (
        task_type, voice_id, model_id, characters, credits, cost_usd,
        user_id, attempt_id, analysis_id, latency_ms, success, error
      ) VALUES (
        ${ctx.taskType}, ${ctx.voiceId ?? null}, ${ctx.modelId ?? null},
        ${characters}, ${credits}, ${cost},
        ${ctx.userId ?? null}, ${ctx.attemptId ?? null}, ${ctx.analysisId ?? null},
        ${opts?.latencyMs ?? null}, ${opts?.success ?? true}, ${opts?.error ?? null}
      )
    `;
  } catch (err) {
    console.error("[usage-log] failed to record ElevenLabs usage:", err);
  }
}
