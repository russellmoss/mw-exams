import Anthropic from "@anthropic-ai/sdk";
import { lookupWines, buildStructuralProfile, type WineProfile, type WineBankEntry, type TastingGrid } from "./wine-bank-lookup";
import { neon } from "@neondatabase/serverless";

const TAVILY_API_URL = "https://api.tavily.com/search";

async function searchTavily(query: string): Promise<{ snippets: string[]; sources: string[] }> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) {
    console.warn("TAVILY_API_KEY not set — skipping web research");
    return { snippets: [], sources: [] };
  }

  try {
    const res = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tavilyKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: 6,
        search_depth: "basic",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Tavily API error ${res.status}: ${body.slice(0, 200)}`);
      return { snippets: [], sources: [] };
    }
    const data = await res.json();
    const snippets: string[] = [];
    const sources: string[] = [];
    for (const r of data.results || []) {
      if (r.content) snippets.push(r.content.slice(0, 400));
      if (r.url) sources.push(r.url);
    }
    console.log(`Tavily returned ${snippets.length} snippets for: ${query.slice(0, 80)}`);
    return { snippets, sources };
  } catch (err) {
    console.error("Tavily search failed:", err);
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
  const hasTavilyResults = tavily.snippets.length >= 1;

  const GRID_SYSTEM = `You are an MW-level wine expert building a structured tasting grid. Use the MW Systematic Approach to Tasting (SAT) framework.

For every field, use the standard MW vocabulary scales:
- color: e.g. "lemon-green", "gold", "ruby", "garnet", "tawny"
- clarity: "clear", "slight haze", "hazy"
- viscosity: "low", "medium", "high"
- nose_intensity: "light", "medium(-)", "medium", "medium(+)", "pronounced"
- nose_descriptors: specific aromas — fruit, floral, herbal, oak, earth, etc.
- palate_sweetness: "dry", "off-dry", "medium-dry", "medium-sweet", "sweet", "luscious"
- palate_acid: "low", "medium(-)", "medium", "medium(+)", "high"
- palate_tannin: "low", "medium(-)", "medium", "medium(+)", "high" (or "n/a" for whites)
- palate_body: "light", "medium(-)", "medium", "medium(+)", "full"
- palate_alcohol: "low", "medium", "medium(+)", "high"
- palate_flavor_descriptors: specific palate flavors, oak influence, secondary/tertiary notes
- palate_finish: "short", "medium(-)", "medium", "medium(+)", "long"
- quality_assessment: "poor", "acceptable", "good", "very good", "outstanding"

Output exactly one JSON object (no markdown, no code fences):
{"color":"...","clarity":"...","viscosity":"...","nose_intensity":"...","nose_descriptors":"...","palate_sweetness":"...","palate_acid":"...","palate_tannin":"...","palate_body":"...","palate_alcohol":"...","palate_flavor_descriptors":"...","palate_finish":"...","quality_assessment":"...","sources":["..."],"inferred_fields":["field names you had to infer rather than find stated"]}`;

  const client = new Anthropic({ apiKey });
  let grid: TastingGrid | null = null;
  let sourceMethod: WineProfile["source_method"] = "none";
  let confidence: "high" | "medium" | "low" = "low";

  if (hasTavilyResults) {
    // Step 1: Extract what Tavily sources explicitly state
    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: GRID_SYSTEM + `\n\nIMPORTANT: You have real search results below. Extract every detail the sources state. For fields where sources give no information, write "NOT_FOUND" as the value — do NOT guess. Put "NOT_FOUND" fields in inferred_fields.`,
        messages: [{
          role: "user",
          content: `Wine: ${wine.fullText}\n\nSearch results:\n${tavily.snippets.map((s, i) => `[${i + 1}] ${s}`).join("\n\n")}\n\nBuild the tasting grid from these sources. Use "NOT_FOUND" for anything the sources don't cover.`,
        }],
      });

      const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        grid = JSON.parse(jsonMatch[0]) as TastingGrid;
        grid.sources = tavily.sources.slice(0, 4);
        sourceMethod = "tavily_research";
        confidence = "medium";
      }
    } catch (err) {
      console.error("Tavily grid extraction failed for", wine.fullText, err);
    }
  }

  // Step 2: Fill gaps — either from Tavily partial grid or from scratch
  const isGap = (v: unknown): boolean => {
    if (!v || v === "NOT_FOUND") return true;
    const s = String(v).toLowerCase();
    return s.includes("not described") || s.includes("not found") || s.includes("not available")
      || s.length < 5 || s === "n/a" || s === "unknown" || s === "red, still" || s === "white, still";
  };
  const hasGaps = grid && Object.entries(grid)
    .filter(([k]) => !["sources", "inferred_fields"].includes(k))
    .some(([, v]) => isGap(v));
  if (!grid || hasGaps) {
    try {
      // Mark all gap fields for the LLM
      const gapFields = grid
        ? Object.entries(grid)
            .filter(([k, v]) => !["sources", "inferred_fields"].includes(k) && isGap(v))
            .map(([k]) => k)
        : [];
      const gapContext = grid
        ? `\n\nA partial grid was extracted from web sources:\n${JSON.stringify(grid)}\n\nThe following fields are incomplete or missing: ${gapFields.join(", ")}. Fill these fields using your expert knowledge of this exact producer, cuvée, vintage, and region. Keep all well-populated values exactly as they are. Update inferred_fields to list every field you filled in.`
        : `\n\nNo web sources were available. Build the complete grid from your knowledge of this exact producer, cuvée, and vintage. Be specific to THIS wine, not generic. List all fields in inferred_fields.`;

      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: GRID_SYSTEM + `\n\nYou are filling in gaps using your expert wine knowledge. Be accurate to this specific wine — use your knowledge of the producer's style, the appellation norms, and the vintage character.`,
        messages: [{
          role: "user",
          content: `Wine: ${wine.fullText}${gapContext}`,
        }],
      });

      const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const filled = JSON.parse(jsonMatch[0]) as TastingGrid;
        if (!grid) {
          grid = filled;
          sourceMethod = "llm_enrichment";
          confidence = "medium";
        } else {
          // Merge: keep Tavily values, fill gaps with LLM
          const gridAny = grid as unknown as Record<string, unknown>;
          for (const [k, v] of Object.entries(filled)) {
            if (isGap(gridAny[k])) {
              gridAny[k] = v;
            }
          }
          grid.inferred_fields = filled.inferred_fields || [];
        }
      }
    } catch (err) {
      console.error("LLM gap-fill failed for", wine.fullText, err);
    }
  }

  if (grid) {
    // Final check: if any key fields are still gaps after all processing, downgrade confidence
    const keyFields = [grid.color, grid.nose_descriptors, grid.palate_flavor_descriptors];
    const stillHasGaps = keyFields.some((v) => isGap(v));
    if (stillHasGaps) confidence = "low";

    return {
      bank_match: null,
      tasting_profile: {
        appearance: `${grid.color || "ruby"}, ${grid.clarity || "clear"}, ${grid.viscosity || "medium"} viscosity`,
        nose_summary: `${grid.nose_intensity || "medium"} intensity. ${grid.nose_descriptors || ""}`.trim(),
        palate_summary: `${grid.palate_flavor_descriptors || ""}. Finish: ${grid.palate_finish || "medium"}.`.trim(),
        structural_summary: `Sweetness: ${grid.palate_sweetness || "dry"}. Acid: ${grid.palate_acid || "medium"}. Tannin: ${grid.palate_tannin || "n/a"}. Body: ${grid.palate_body || "medium"}. Alcohol: ${grid.palate_alcohol || "medium"}.`,
        sources: grid.sources || [],
      },
      tasting_grid: grid,
      confidence,
      source_method: sourceMethod,
      enriched_at: new Date().toISOString(),
    };
  }

  return {
    bank_match: null,
    tasting_profile: null,
    confidence: "low",
    source_method: "none",
    enriched_at: new Date().toISOString(),
  };
}

async function addToWineBank(wine: { slot: number; fullText: string }, profile: WineProfile): Promise<void> {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const identity = parseWineIdentity(wine.fullText);
    const id = `${identity.country.toLowerCase().replace(/\s+/g, "_")}_${identity.region.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${identity.producer.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`.slice(0, 80);

    await sql`
      INSERT INTO wine_bank (id, producer, wine_name, country, region, tasting_profile, source)
      VALUES (
        ${id},
        ${identity.producer},
        ${identity.wineName},
        ${identity.country},
        ${identity.region},
        ${profile.tasting_profile ? JSON.stringify({
          appearance: profile.tasting_profile.appearance,
          nose_summary: profile.tasting_profile.nose_summary,
          palate_summary: profile.tasting_profile.palate_summary,
          sources: profile.tasting_profile.sources,
          confidence: profile.confidence,
        }) : null},
        ${profile.source_method}
      )
      ON CONFLICT (id) DO UPDATE SET
        tasting_profile = COALESCE(EXCLUDED.tasting_profile, wine_bank.tasting_profile),
        updated_at = now()
    `;
    console.log(`Added wine to DB bank: ${id} (${identity.producer} ${identity.wineName})`);
  } catch (err) {
    console.error("Failed to add wine to DB bank:", err);
  }
}

export async function enrichWineProfiles(
  questionId: string,
  wines: { slot: number; fullText: string }[],
  apiKey: string
): Promise<Record<string, WineProfile>> {
  const profiles = await lookupWines(wines);

  const needsEnrichment = wines.filter(
    (w) => profiles[String(w.slot)]?.source_method === "none"
  );

  // Research each non-bank wine via Tavily, then add to bank
  for (const wine of needsEnrichment) {
    const profile = await researchWineViaTavily(wine, apiKey);
    profiles[String(wine.slot)] = profile;

    if (profile.tasting_profile) {
      await addToWineBank(wine, profile);
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
