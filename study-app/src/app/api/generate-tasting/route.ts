import Anthropic from "@anthropic-ai/sdk";
import {
  buildTastingSystemPrompt,
  buildTastingUserPrompt,
} from "@/lib/prompts/tasting-prompt";
import { sanitizeTastingNotes } from "@/lib/tasting-sanitizer";
import { requireApiKey } from "@/lib/api-key";
import { lookupWines } from "@/lib/wine-bank-lookup";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;

    const { wines, questionId } = await request.json();

    if (!wines || !Array.isArray(wines) || wines.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or empty wines array" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Try to load stored wine profiles from DB first, fall back to bank lookup
    let wineProfiles = lookupWines(wines);
    if (questionId) {
      try {
        const sql = neon(process.env.DATABASE_URL!);
        const rows = await sql`
          SELECT wine_profiles FROM generated_questions WHERE question_id = ${questionId}
        `;
        const stored = rows[0]?.wine_profiles;
        if (stored && typeof stored === "object" && Object.keys(stored).length > 0) {
          wineProfiles = stored as typeof wineProfiles;
        }
      } catch {}
    }

    const client = new Anthropic({ apiKey: keyResult.apiKey });

    const systemPrompt = buildTastingSystemPrompt();
    const userPrompt = buildTastingUserPrompt(wines, wineProfiles);

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    // Extract text from the response
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    // Split into per-wine notes by "**Wine" markers
    const wineNotes: string[] = [];
    const parts = text.split(/(?=\*\*Wine\s+\d+)/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 0 && /\*\*Wine\s+\d+/.test(trimmed)) {
        wineNotes.push(trimmed);
      }
    }

    // If parsing failed, return the whole text as a single note
    if (wineNotes.length === 0) {
      wineNotes.push(text);
    }
    const sanitizedNotes = sanitizeTastingNotes(wineNotes, wines);

    return new Response(JSON.stringify({ tastingNotes: sanitizedNotes }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-tasting error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
