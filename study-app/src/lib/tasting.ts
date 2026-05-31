// tasting.ts — shared tasting-note generator (single source of truth for "what's in the glass").
//
// The study page (/api/generate-tasting) and Reverse Tasting (/api/stem-sniper/notes) both produce
// the in-glass sensory notes through THIS function, so the Layer-B reveal a Stem Sniper candidate
// reasons from is generated exactly like the study page's tasting reveal. Notes are sanitized
// (variety/region/origin giveaways stripped) because both surfaces show them before the candidate
// has committed their final answer.
//
// Like question generation, this is SELF-CORRECTING against validators: each attempt is checked by
// validateTastingNotes (the source of truth for tasting-note sanity, e.g. appearance↔colour) and
// regenerated with the violations fed back, so a red-coloured note for a white wine fixes itself.

import Anthropic from "@anthropic-ai/sdk";
import { buildTastingSystemPrompt, buildTastingUserPrompt } from "@/lib/prompts/tasting-prompt";
import { sanitizeTastingNotes } from "@/lib/tasting-sanitizer";
import { validateTastingNotes } from "@/lib/tasting-validators";
import { lookupWines } from "@/lib/wine-bank-lookup";
import { neon } from "@neondatabase/serverless";
import { logClaudeUsage } from "@/lib/usage-log";
import { selectModel } from "@/lib/model-selector";

export interface TastingWine {
  slot: number;
  fullText: string;
}

function parseWineNotes(text: string): string[] {
  const wineNotes: string[] = [];
  const parts = text.split(/(?=\*\*Wine\s+\d+)/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length > 0 && /\*\*Wine\s+\d+/.test(trimmed)) wineNotes.push(trimmed);
  }
  if (wineNotes.length === 0) wineNotes.push(text);
  return wineNotes;
}

/**
 * Generate sanitized, per-wine tasting notes (in flight order). Loads stored wine_profiles for the
 * question when available (richer notes), falls back to the wine bank. Validates each attempt against
 * the tasting-note validators and regenerates (up to 3x) with corrections fed back. Giveaways are
 * stripped before returning. Returns one note string per input wine.
 */
export async function generateSanitizedTastingNotes(opts: {
  wines: TastingWine[];
  questionId?: string | null;
  paper?: number;
  apiKey: string;
  source: "user" | "server";
  userId: number | null;
}): Promise<string[]> {
  const { wines, questionId, apiKey, source, userId } = opts;

  // Prefer stored wine profiles (the engine's enrichment) for this question; else bank lookup.
  // Also pick up the paper (whites/reds/special) so the colour validator knows what to expect.
  let wineProfiles = await lookupWines(wines);
  let paper = opts.paper;
  if (questionId) {
    try {
      const sql = neon(process.env.DATABASE_URL!);
      const rows = await sql`
        SELECT wine_profiles, paper FROM generated_questions WHERE question_id = ${questionId}
      `;
      const stored = rows[0]?.wine_profiles;
      if (stored && typeof stored === "object" && Object.keys(stored).length > 0) {
        wineProfiles = stored as typeof wineProfiles;
      }
      if (paper == null && rows[0]?.paper != null) paper = Number(rows[0].paper);
    } catch {}
  }

  const client = new Anthropic({ apiKey });
  const systemPrompt = buildTastingSystemPrompt();
  const { model, abGroup } = await selectModel("tasting_generation", apiKey, "sonnet");

  const MAX_ATTEMPTS = 3;
  let wineNotes: string[] = [];
  let corrections: string[] | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const userPrompt = buildTastingUserPrompt(wines, wineProfiles, corrections);
    const t0 = Date.now();
    const message = await client.messages.create({
      model,
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    logClaudeUsage(
      { taskType: "tasting_generation", model, source, userId, questionId: questionId ?? null, abGroup },
      message.usage,
      { latencyMs: Date.now() - t0 }
    );

    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    wineNotes = parseWineNotes(text);

    const v = validateTastingNotes(wineNotes, wines, paper);
    if (v.valid) break;
    corrections = v.violations;
    console.warn(`tasting-note validation failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${v.violations.join(" | ")}`);
  }

  return sanitizeTastingNotes(wineNotes, wines);
}
