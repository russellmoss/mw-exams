import Anthropic from "@anthropic-ai/sdk";
import { lookupWines, buildStructuralProfile, type WineProfile } from "./wine-bank-lookup";
import { neon } from "@neondatabase/serverless";

export async function enrichWineProfiles(
  questionId: string,
  wines: { slot: number; fullText: string }[],
  apiKey: string
): Promise<Record<string, WineProfile>> {
  const profiles = lookupWines(wines);

  const needsEnrichment = wines.filter(
    (w) => profiles[String(w.slot)]?.source_method === "none"
  );

  if (needsEnrichment.length > 0) {
    try {
      const client = new Anthropic({ apiKey });
      const wineList = needsEnrichment
        .map((w) => `${w.slot}. ${w.fullText}`)
        .join("\n");

      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: `You are a wine research assistant. For each wine, produce a brief tasting profile based on your knowledge of the specific producer, cuvée, and vintage. Be accurate to THIS wine, not generic for the variety.

Output JSON array:
[{"slot": 1, "appearance": "...", "nose_summary": "...", "palate_summary": "...", "structural_summary": "...", "sources": ["source1", "source2"], "confidence": "high|medium|low"}]

For appearance: describe color, clarity, viscosity as they would actually appear for this specific wine.
For sources: list what you based this on (e.g., "producer website", "Wine Advocate review", "general Syrah knowledge"). Be honest — if you're inferring from variety/region norms rather than specific wine data, say so and mark confidence as "low" or "medium".
Keep each field to 1-2 sentences.`,
        messages: [{
          role: "user",
          content: `Produce tasting profiles for these wines:\n${wineList}`,
        }],
      });

      const text = message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const enriched = JSON.parse(jsonMatch[0]) as {
          slot: number;
          appearance: string;
          nose_summary: string;
          palate_summary: string;
          structural_summary: string;
          sources: string[];
          confidence: string;
        }[];

        for (const e of enriched) {
          profiles[String(e.slot)] = {
            bank_match: null,
            tasting_profile: {
              appearance: e.appearance,
              nose_summary: e.nose_summary,
              palate_summary: e.palate_summary,
              structural_summary: e.structural_summary,
              sources: e.sources,
            },
            confidence: (e.confidence as "high" | "medium" | "low") || "low",
            source_method: "llm_enrichment",
            enriched_at: new Date().toISOString(),
          };
        }
      }
    } catch (err) {
      console.error("Wine enrichment LLM call failed:", err);
    }
  }

  // For bank matches, generate structural summary if no tasting profile exists
  for (const wine of wines) {
    const p = profiles[String(wine.slot)];
    if (p?.source_method === "bank_lookup" && !p.tasting_profile && p.structural_tags) {
      p.tasting_profile = {
        appearance: "",
        nose_summary: "",
        palate_summary: "",
        structural_summary: buildStructuralProfile({
          id: p.bank_match || "",
          producer: "",
          wine_name: "",
          country: "",
          region: "",
          grape_varieties: p.grape_varieties || [],
          style_category: p.style_category || "",
          structure_tags: p.structural_tags,
          oak_signature: p.oak_signature,
          rs_level: p.rs_level,
          quality_tier: p.quality_tier,
        }),
        sources: [],
      };
    }
  }

  // Save to DB
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      UPDATE generated_questions
      SET wine_profiles = ${JSON.stringify(profiles)}
      WHERE question_id = ${questionId}
    `;
  } catch (err) {
    console.error("Failed to save wine profiles:", err);
  }

  return profiles;
}
