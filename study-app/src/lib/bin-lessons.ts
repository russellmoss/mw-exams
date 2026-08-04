// bin-lessons.ts — the "Lessons for new questions" feed (spec §1/§4/§5 of Bin with Reason).
//
// Three app_settings keys (the generic jsonb key/value store) back this feature:
//   • use_bin_lessons        — toggle: inject the distilled summary into new-question prompts (default ON)
//   • bin_lessons_summary    — the LLM-distilled plain-English bullet summary
//   • bin_lessons_updated_at — ISO timestamp of the last regeneration
//
// regenerateBinLessons() reads the most recent bins, distils them into bullets via Claude, and stores
// the result. It is called (debounced/best-effort) on every bin write and on the admin "Refresh"
// button. getBinLessonsBlock() renders the stored summary as the prompt-injection block, gated on the
// toggle, so question generation "avoids these known failure patterns".

import Anthropic from "@anthropic-ai/sdk";
import { getSetting, setSetting } from "@/lib/settings";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import { getRecentBinReasonRows } from "@/lib/db";
import { buildBinLessonsPrompt } from "@/lib/prompts/bin-lessons-prompt";

export const USE_BIN_LESSONS_KEY = "use_bin_lessons";
export const BIN_LESSONS_SUMMARY_KEY = "bin_lessons_summary";
export const BIN_LESSONS_UPDATED_AT_KEY = "bin_lessons_updated_at";

// Toggle default is ON — an absent row must read as "as built" (see migration 031).
export async function getUseBinLessons(): Promise<boolean> {
  return (await getSetting<boolean>(USE_BIN_LESSONS_KEY, true)) !== false;
}

export async function setUseBinLessons(value: boolean): Promise<void> {
  await setSetting(USE_BIN_LESSONS_KEY, value);
}

export interface BinLessons {
  summary: string | null;
  updatedAt: string | null;
}

export async function getBinLessons(): Promise<BinLessons> {
  const summary = await getSetting<string | null>(BIN_LESSONS_SUMMARY_KEY, null);
  const updatedAt = await getSetting<string | null>(BIN_LESSONS_UPDATED_AT_KEY, null);
  return { summary: summary || null, updatedAt: updatedAt || null };
}

async function storeBinLessons(summary: string): Promise<BinLessons> {
  const updatedAt = new Date().toISOString();
  await setSetting(BIN_LESSONS_SUMMARY_KEY, summary);
  await setSetting(BIN_LESSONS_UPDATED_AT_KEY, updatedAt);
  return { summary, updatedAt };
}

// Distil the last ~50 bins into a bullet summary and persist it. Returns the stored lessons (or the
// existing/empty lessons when there's nothing to distil). Best-effort by design: callers on the write
// path fire-and-forget it, so it must never throw into the bin flow — it logs and returns instead.
export async function regenerateBinLessons(
  apiKey: string,
  userId?: number | null
): Promise<BinLessons> {
  try {
    const rows = await getRecentBinReasonRows(50);
    const prompt = buildBinLessonsPrompt(rows);
    if (!prompt) {
      // Nothing tagged/noted to learn from — clear any stale summary so the UI/prompt don't show one.
      return await storeBinLessons("");
    }

    const client = new Anthropic({ apiKey });
    const { model, abGroup } = await selectModel("bin_lessons", apiKey, "sonnet");
    const t0 = Date.now();
    const message = await client.messages.create({
      model,
      max_tokens: 700,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
    logClaudeUsage(
      { taskType: "bin_lessons", model, source: "server", userId: userId ?? null, abGroup },
      message.usage,
      { latencyMs: Date.now() - t0 }
    );

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();

    return await storeBinLessons(text);
  } catch (err) {
    console.error("[bin-lessons] regenerate failed (non-fatal):", err);
    return await getBinLessons();
  }
}

// The prompt-injection block (spec §5). Returns "" when the toggle is off or there's no summary, so the
// caller can append it unconditionally. Phrased as a short, soft "avoid these" nudge — it rides AFTER
// the exam-knowledge / scope context and never overrides paper scope.
export async function getBinLessonsBlock(): Promise<string> {
  try {
    if (!(await getUseBinLessons())) return "";
    const { summary } = await getBinLessons();
    if (!summary || !summary.trim()) return "";
    return `

## AVOID THESE KNOWN FAILURE PATTERNS
A reviewer has binned recent generated questions for the faults below. Do NOT reproduce them in this question. This is guidance, never a licence to break paper scope above.

${summary.trim()}`;
  } catch (err) {
    console.error("[bin-lessons] block build failed (non-fatal):", err);
    return "";
  }
}
