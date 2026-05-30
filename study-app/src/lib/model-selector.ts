import { getLatestOpus } from "./model-resolver";
import { getSetting } from "./settings";

/**
 * A/B model selection (Phase 2).
 *
 * Each instrumentable task has a DEFAULT tier (current production behavior). An admin can
 * configure a per-task weighted split across tiers in the `model_ab_config` app setting;
 * when a task has a configured split, `selectModel` rolls a weighted random tier per request
 * and stamps `abGroup` (the chosen tier) so the cost dashboard can compare arms. When a task
 * has no split (or all-zero weights), it falls back to its default tier and `abGroup` is null
 * — i.e. "no experiment running", behavior identical to before Phase 2.
 */

export type ModelTier = "opus" | "sonnet" | "haiku";

const SONNET_ID = "claude-sonnet-4-6";
const HAIKU_ID = "claude-haiku-4-5-20251001";

// The tasks exposed in the admin A/B panel, each with its current-production default tier.
export const AB_TASKS: { task: string; label: string; defaultTier: ModelTier }[] = [
  { task: "question_generation", label: "Question generation", defaultTier: "opus" },
  { task: "model_answer", label: "Model answer", defaultTier: "opus" },
  { task: "feedback_analysis", label: "Feedback analysis", defaultTier: "opus" },
  { task: "reasoning_grading", label: "Pre-glass grading", defaultTier: "opus" },
  { task: "full_debrief", label: "Full debrief grading", defaultTier: "opus" },
  { task: "answer_grading", label: "Answer grading", defaultTier: "sonnet" },
  { task: "tasting_generation", label: "Tasting notes", defaultTier: "sonnet" },
  { task: "wine_enrichment", label: "Wine enrichment", defaultTier: "sonnet" },
  { task: "question_appearance", label: "P3 appearance notes", defaultTier: "sonnet" },
  { task: "feedback_reply", label: "Feedback reply", defaultTier: "sonnet" },
  { task: "notification_narration", label: "Verdict narration (spoken)", defaultTier: "sonnet" },
];

export const AB_CONFIG_KEY = "model_ab_config";

// { [task]: { opus?: weight, sonnet?: weight, haiku?: weight } } — weights are relative
// (we normalise), but the UI presents them as percentages.
export type AbConfig = Record<string, Partial<Record<ModelTier, number>>>;

// Short in-memory cache so the hot generation path doesn't read app_settings every call.
// Config changes propagate within TTL across serverless instances (admin save invalidates
// the instance that handled it immediately).
let cache: { config: AbConfig; at: number } | null = null;
const TTL_MS = 30_000;

async function loadConfig(): Promise<AbConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.config;
  const config = (await getSetting<AbConfig>(AB_CONFIG_KEY, {})) || {};
  cache = { config, at: Date.now() };
  return config;
}

export function invalidateAbCache(): void {
  cache = null;
}

async function resolveTier(tier: ModelTier, apiKey: string): Promise<string> {
  if (tier === "opus") return getLatestOpus(apiKey);
  if (tier === "haiku") return HAIKU_ID;
  return SONNET_ID;
}

function weightedPick(weights: Partial<Record<ModelTier, number>>): ModelTier | null {
  const entries = (Object.entries(weights) as [ModelTier, number][]).filter(
    ([, w]) => Number(w) > 0
  );
  if (entries.length === 0) return null;
  if (entries.length === 1) return entries[0][0];
  const total = entries.reduce((sum, [, w]) => sum + Number(w), 0);
  let r = Math.random() * total;
  for (const [tier, w] of entries) {
    r -= Number(w);
    if (r < 0) return tier;
  }
  return entries[entries.length - 1][0];
}

/**
 * Resolve the model to use for one call of `task`. `defaultTier` is the call site's
 * current production tier, used when no A/B split is configured for the task.
 */
export async function selectModel(
  task: string,
  apiKey: string,
  defaultTier: ModelTier
): Promise<{ model: string; abGroup: string | null; tier: ModelTier }> {
  const config = await loadConfig();
  const picked = config[task] ? weightedPick(config[task]!) : null;
  if (picked) {
    return { model: await resolveTier(picked, apiKey), abGroup: picked, tier: picked };
  }
  return { model: await resolveTier(defaultTier, apiKey), abGroup: null, tier: defaultTier };
}
