import Anthropic from "@anthropic-ai/sdk";
import {
  buildTastingSystemPrompt,
  buildTastingUserPrompt,
} from "@/lib/prompts/tasting-prompt";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { wines } = await request.json();

    if (!wines || !Array.isArray(wines) || wines.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or empty wines array" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = buildTastingSystemPrompt();
    const userPrompt = buildTastingUserPrompt(wines);

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

    return new Response(JSON.stringify({ tastingNotes: wineNotes }), {
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
