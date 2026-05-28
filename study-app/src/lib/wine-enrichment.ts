import Anthropic from "@anthropic-ai/sdk";
import { lookupWines, buildStructuralProfile, type WineProfile, type WineBankEntry } from "./wine-bank-lookup";
import { neon } from "@neondatabase/serverless";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const TAVILY_API_URL = "https://api.tavily.com/search";

async function searchTavily(query: string): Promise<{ snippets: string[]; sources: string[] }> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) return { snippets: [], sources: [] };

  try {
    const res = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        max_results: 6,
        search_depth: "basic",
      }),
    });
    if (!res.ok) return { snippets: [], sources: [] };
    const data = await res.json();
    const snippets: string[] = [];
    const sources: string[] = [];
    for (const r of data.results || []) {
      if (r.content) snippets.push(r.content.slice(0, 400));
      if (r.url) sources.push(r.url);
    }
    return { snippets, sources };
  } catch {
    return { snippets: [], sources: [] };
  }
}

function parseWineIdentity(fullText: string): { producer: string; wineName: string; vintage: string; region: string; country: string } {
  const parts = fullText.split(".");
  const firstPart = (parts[0] || "").trim();
  const commaIdx = firstPart.indexOf(",");
  const producer = commaIdx > 0 ? firstPart.slice(0, commaIdx).trim() : firstPart;
  const wineName = commaIdx > 0 ? firstPart.slice(commaIdx + 1).trim().replace(/\d{4}$/, "").trim() : "";
  const vintageMatch = fullText.match(/\b(19|20)\d{2}\b/);
  const vintage = vintageMatch ? vintageMatch[0] : "NV";
  const regionPart = (parts[1] || "").trim();
  const regionComma = regionPart.lastIndexOf(",");
  const region = regionComma > 0 ? regionPart.slice(0, regionComma).trim() : regionPart;
  const country = regionComma > 0 ? regionPart.slice(regionComma + 1).trim().replace(/[()]/g, "") : "";
  return { producer, wineName, vintage, region, country };
}

async function researchWineViaTavily(
  wine: { slot: number; fullText: string },
  apiKey: string
): Promise<WineProfile> {
  const identity = parseWineIdentity(wine.fullText);
  const query = `${identity.producer} ${identity.wineName} ${identity.vintage} tasting notes appearance color aroma palate review`;

  const tavily = await searchTavily(query);
  const hasTavilyResults = tavily.snippets.length >= 2;

  if (hasTavilyResults) {
    // Use Claude to synthesize real tasting data from Tavily snippets
    try {
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: `You are synthesizing real tasting notes from web search results into a structured profile. Extract ONLY what the sources actually say — do not add your own descriptions. If sources conflict, note the consensus.

Output exactly one JSON object (no markdown, no code fences):
{"appearance": "...", "nose_summary": "...", "palate_summary": "...", "structural_summary": "...", "source_names": ["source1", "source2"], "confidence": "high|medium"}`,
        messages: [{
          role: "user",
          content: `Wine: ${wine.fullText}\n\nSearch results:\n${tavily.snippets.map((s, i) => `[${i + 1}] ${s}`).join("\n\n")}\n\nSynthesize the tasting profile from these real sources. Only include what the sources say.`,
        }],
      });

      const text = message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          bank_match: null,
          tasting_profile: {
            appearance: parsed.appearance || "",
            nose_summary: parsed.nose_summary || "",
            palate_summary: parsed.palate_summary || "",
            structural_summary: parsed.structural_summary || "",
            sources: tavily.sources.slice(0, 4),
          },
          confidence: (parsed.confidence as "high" | "medium") || "medium",
          source_method: "tavily_research" as WineProfile["source_method"],
          enriched_at: new Date().toISOString(),
        };
      }
    } catch (err) {
      console.error("Tavily synthesis failed for", wine.fullText, err);
    }
  }

  // Fallback: LLM knowledge only
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: `You are a wine expert. Produce a tasting profile for a specific wine based on your knowledge of this exact producer, cuvée, and vintage. Be accurate to THIS wine, not generic for the variety or region.

You MUST output exactly one JSON object with no markdown formatting, no code fences, no explanation — just the JSON:
{"appearance": "color, clarity, viscosity description", "nose_summary": "2-3 sentences of specific aromas", "palate_summary": "2-3 sentences of flavors, texture, finish", "structural_summary": "acid, tannin, body, alcohol, finish length", "sources": ["what you based this on — be honest"], "confidence": "high or medium or low"}`,
        messages: [{
          role: "user",
          content: `Produce a tasting profile for: ${wine.fullText}`,
        }],
      });

      const text = message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.appearance || parsed.nose_summary || parsed.palate_summary) {
          return {
            bank_match: null,
            tasting_profile: {
              appearance: parsed.appearance || "",
              nose_summary: parsed.nose_summary || "",
              palate_summary: parsed.palate_summary || "",
              structural_summary: parsed.structural_summary || "",
              sources: parsed.sources || ["LLM wine knowledge — not verified"],
            },
            confidence: (parsed.confidence as "high" | "medium" | "low") || "low",
            source_method: "llm_enrichment",
            enriched_at: new Date().toISOString(),
          };
        }
      }
      console.error(`LLM enrichment attempt ${attempt + 1} returned unparseable response for`, wine.fullText, text.slice(0, 200));
    } catch (err) {
      console.error(`LLM enrichment attempt ${attempt + 1} failed for`, wine.fullText, err);
    }
  }

  return {
    bank_match: null,
    tasting_profile: null,
    confidence: "low",
    source_method: "none",
    enriched_at: new Date().toISOString(),
  };
}

function addToWineBank(wine: { slot: number; fullText: string }, profile: WineProfile): void {
  try {
    const bankPath = join(process.cwd(), "public", "data", "mock_wine_bank.json");
    const raw = readFileSync(bankPath, "utf-8");
    const bank: WineBankEntry[] = JSON.parse(raw);

    const identity = parseWineIdentity(wine.fullText);
    const id = `${identity.country.toLowerCase().replace(/\s+/g, "_")}_${identity.region.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${identity.producer.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`.slice(0, 80);

    const exists = bank.some((e) =>
      e.producer?.toLowerCase() === identity.producer.toLowerCase() &&
      e.wine_name?.toLowerCase() === identity.wineName.toLowerCase()
    );
    if (exists) return;

    const newEntry: WineBankEntry = {
      id,
      producer: identity.producer,
      wine_name: identity.wineName,
      country: identity.country,
      region: identity.region,
      grape_varieties: [],
      style_category: "still_dry",
      tasting_profile: profile.tasting_profile ? {
        appearance: profile.tasting_profile.appearance,
        nose_summary: profile.tasting_profile.nose_summary,
        palate_summary: profile.tasting_profile.palate_summary,
        sources: profile.tasting_profile.sources,
        confidence: profile.confidence,
      } : undefined,
    };

    bank.push(newEntry);
    writeFileSync(bankPath, JSON.stringify(bank, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to add wine to bank:", err);
  }
}

export async function enrichWineProfiles(
  questionId: string,
  wines: { slot: number; fullText: string }[],
  apiKey: string
): Promise<Record<string, WineProfile>> {
  const profiles = lookupWines(wines);

  const needsEnrichment = wines.filter(
    (w) => profiles[String(w.slot)]?.source_method === "none"
  );

  // Research each non-bank wine via Tavily, then add to bank
  for (const wine of needsEnrichment) {
    const profile = await researchWineViaTavily(wine, apiKey);
    profiles[String(wine.slot)] = profile;

    if (profile.tasting_profile) {
      addToWineBank(wine, profile);
    }
  }

  // For bank matches without tasting prose, build structural summary
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

  // Save profiles to DB
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
