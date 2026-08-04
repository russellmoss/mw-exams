import Anthropic from "@anthropic-ai/sdk";
import { lookupWines, buildStructuralProfile, type WineProfile, type WineBankEntry, type TastingGrid } from "./wine-bank-lookup";
import { neon } from "@neondatabase/serverless";
import { logClaudeUsage, logTavilyUsage } from "./usage-log";
import { selectModel } from "./model-selector";

const TAVILY_API_URL = "https://api.tavily.com/search";

// Usage-tracking context threaded from the request so each enrichment call (Tavily + Claude)
// is attributed to the right source/user/question.
type EnrichMeta = {
  source?: "user" | "server";
  userId?: number | null;
  questionId?: string | null;
  batchId?: string | null; // migration 029 — attribute bulk-run enrichment spend to its batch
};

async function searchTavily(query: string, meta?: EnrichMeta): Promise<{ snippets: string[]; sources: string[] }> {
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
      logTavilyUsage({ taskType: "wine_enrichment", query, resultsCount: 0, userId: meta?.userId,
          batchId: meta?.batchId, questionId: meta?.questionId, success: false });
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
    logTavilyUsage({ taskType: "wine_enrichment", query, resultsCount: (data.results || []).length, userId: meta?.userId,
          batchId: meta?.batchId, questionId: meta?.questionId, success: true });
    return { snippets, sources };
  } catch (err) {
    console.error("Tavily search failed:", err);
    logTavilyUsage({ taskType: "wine_enrichment", query, resultsCount: 0, userId: meta?.userId,
          batchId: meta?.batchId, questionId: meta?.questionId, success: false });
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

// Valid style_category values (must match data/mock_wine_bank.schema.json).
const STYLE_CATEGORIES = "still_dry, still_off_dry, still_sweet, sparkling, fortified, oxidative, orange, rose";

export type WineIdentity = {
  producer: string;
  wineName: string;
  country: string;
  region: string;
  grapeVarieties: string[];
  styleCategory: string;
};

// Derive a clean, structured identity (+ grape varieties + style classification) from a wine's
// reference string. The old regex parser (parseWineIdentity) mangled anything that didn't fit the
// exact "Producer, Name. Region, Country" shape — producing rows like producer="R", country="2012",
// and every wine defaulting to still_dry. We're already calling Claude per non-bank wine, so we let
// it do the parsing/classification too. parseWineIdentity remains the fallback if the call fails.
async function classifyWine(fullText: string, apiKey: string, meta?: EnrichMeta): Promise<WineIdentity> {
  const fallback = parseWineIdentity(fullText);
  const fallbackIdentity: WineIdentity = {
    producer: fallback.producer,
    wineName: fallback.wineName,
    country: fallback.country,
    region: fallback.region,
    grapeVarieties: [],
    styleCategory: "still_dry",
  };

  try {
    const client = new Anthropic({ apiKey });
    const { model, abGroup } = await selectModel("wine_enrichment", apiKey, "haiku");
    const t0 = Date.now();
    const message = await client.messages.create({
      model,
      max_tokens: 300,
      system: `You identify a wine from a single reference string. Output exactly one JSON object, no prose, no code fences:
{"producer":"...","wine_name":"...","country":"...","region":"...","grape_varieties":["..."],"style_category":"..."}

Rules:
- producer: the estate/house only, e.g. "Domaine Leflaive", "Billecart-Salmon", "Nyetimber". Never a year or a region.
- wine_name: the cuvée/bottling without the producer and without the vintage year, e.g. "Mâcon-Verzé", "Blanc de Blancs Grand Cru", "Tillington Single Vineyard". Empty string if there is none.
- country: the country of origin, e.g. "France", "England". Never a year.
- region: the wine region, e.g. "Burgundy", "Champagne", "Mosel", "West Sussex". Never a year.
- grape_varieties: the grape(s). If not stated, infer the standard variety/blend for the appellation. Use standard names, e.g. ["Chardonnay"], ["Grenache","Syrah","Mourvèdre"].
- style_category: exactly one of: ${STYLE_CATEGORIES}.
  - sparkling: Champagne, Crémant, Cava, Prosecco, Sekt, traditional-method / any fizzy wine.
  - fortified: Port, Sherry, Madeira, Rutherglen/liqueur Muscat, Vin Doux Naturel.
  - still_sweet: Sauternes, Tokaji Aszú, Beerenauslese/Trockenbeerenauslese, Icewine/Eiswein, Vin Santo, passito, Quarts de Chaume, Vin de Constance, late-harvest dessert wines.
  - still_off_dry: fruity Kabinett/Spätlese and other clearly off-dry (not fully sweet) styles.
  - oxidative: Vin Jaune, oxidative/sous-voile Jura whites, biologically/deliberately oxidative styles. This includes wines where the style is implied by the house rather than stated on the label — traditional white Rioja aged for years in old oak (López de Heredia Viña Tondonia Blanco and Viña Gravonia, Marqués de Murrieta Castillo Ygay Blanco, CVNE Monopole Clásico) and the voile-by-default Jura domaines (Macle, Montbourgeau, Berthet-Bondet, Bourdy). A "Blanco Reserva/Gran Reserva" from Rioja is oxidative, not still_dry.
  - NOT oxidative: anything labelled "ouillé" (topped up) is the deliberate opposite — no flor forms — so an Arbois Savagnin Ouillé is still_dry however Jura it looks. A grape or appellation never settles this on its own: Arbois and L'Étoile both cover topped-up and voile-aged wines, and the reds from those same houses (Viña Tondonia Tinto, Castillo Ygay Gran Reserva, Berthet-Bondet Trousseau) are still_dry.
  - rose / orange: as appropriate. Blush wines count as rose even when unlabelled (White Zinfandel).
  - still_dry: everything else (the default for dry still whites and reds).`,
      messages: [{ role: "user", content: `Wine: ${fullText}` }],
    });
    logClaudeUsage(
      { taskType: "wine_enrichment", model, source: meta?.source, userId: meta?.userId,
          batchId: meta?.batchId, questionId: meta?.questionId, abGroup },
      message.usage,
      { latencyMs: Date.now() - t0 }
    );

    const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const o = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const str = (v: unknown, fb: string) => (typeof v === "string" && v.trim() ? v.trim() : fb);
      return {
        producer: str(o.producer, fallbackIdentity.producer),
        wineName: str(o.wine_name, fallbackIdentity.wineName),
        country: str(o.country, fallbackIdentity.country),
        region: str(o.region, fallbackIdentity.region),
        grapeVarieties: Array.isArray(o.grape_varieties)
          ? (o.grape_varieties as unknown[]).filter((g): g is string => typeof g === "string" && g.trim().length > 0)
          : [],
        styleCategory: str(o.style_category, "still_dry"),
      };
    }
  } catch (err) {
    console.error("Wine classification failed, falling back to regex parse:", fullText, err);
  }
  return fallbackIdentity;
}

async function researchWineViaTavily(
  wine: { slot: number; fullText: string },
  apiKey: string,
  meta?: EnrichMeta
): Promise<WineProfile> {
  const identity = parseWineIdentity(wine.fullText);
  const query = `${identity.producer} ${identity.wineName} ${identity.vintage} tasting notes appearance color aroma palate review`;

  const tavily = await searchTavily(query, meta);
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
  const { model: enrichModel, abGroup: enrichAb } = await selectModel("wine_enrichment", apiKey, "sonnet");
  let grid: TastingGrid | null = null;
  let sourceMethod: WineProfile["source_method"] = "none";
  let confidence: "high" | "medium" | "low" = "low";

  if (hasTavilyResults) {
    // Step 1: Extract what Tavily sources explicitly state
    try {
      const t0 = Date.now();
      const message = await client.messages.create({
        model: enrichModel,
        max_tokens: 1000,
        system: GRID_SYSTEM + `\n\nIMPORTANT: You have real search results below. Extract every detail the sources state. For fields where sources give no information, write "NOT_FOUND" as the value — do NOT guess. Put "NOT_FOUND" fields in inferred_fields.`,
        messages: [{
          role: "user",
          content: `Wine: ${wine.fullText}\n\nSearch results:\n${tavily.snippets.map((s, i) => `[${i + 1}] ${s}`).join("\n\n")}\n\nBuild the tasting grid from these sources. Use "NOT_FOUND" for anything the sources don't cover.`,
        }],
      });
      logClaudeUsage(
        { taskType: "wine_enrichment", model: enrichModel, source: meta?.source, userId: meta?.userId,
          batchId: meta?.batchId, questionId: meta?.questionId, abGroup: enrichAb },
        message.usage,
        { latencyMs: Date.now() - t0 }
      );

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

      const t0 = Date.now();
      const message = await client.messages.create({
        model: enrichModel,
        max_tokens: 1000,
        system: GRID_SYSTEM + `\n\nYou are filling in gaps using your expert wine knowledge. Be accurate to this specific wine — use your knowledge of the producer's style, the appellation norms, and the vintage character.`,
        messages: [{
          role: "user",
          content: `Wine: ${wine.fullText}${gapContext}`,
        }],
      });
      logClaudeUsage(
        { taskType: "wine_enrichment", model: enrichModel, source: meta?.source, userId: meta?.userId,
          batchId: meta?.batchId, questionId: meta?.questionId, abGroup: enrichAb },
        message.usage,
        { latencyMs: Date.now() - t0 }
      );

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

async function addToWineBank(identity: WineIdentity, profile: WineProfile): Promise<void> {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    // Include wine_name so different cuvées from the same producer/region get distinct ids
    // (country_region_producer alone collapses e.g. Muga Reserva and Muga Rosado onto one row).
    const slug = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const id = [slug(identity.country), slug(identity.region), slug(identity.producer), slug(identity.wineName)]
      .filter(Boolean).join("_").slice(0, 120);

    await sql`
      INSERT INTO wine_bank (id, producer, wine_name, country, region, grape_varieties, style_category, tasting_profile, source)
      VALUES (
        ${id},
        ${identity.producer},
        ${identity.wineName},
        ${identity.country},
        ${identity.region},
        ${JSON.stringify(identity.grapeVarieties)},
        ${identity.styleCategory || "still_dry"},
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
        grape_varieties = CASE
          WHEN wine_bank.grape_varieties IS NULL OR wine_bank.grape_varieties = '[]'::jsonb
          THEN EXCLUDED.grape_varieties ELSE wine_bank.grape_varieties END,
        style_category = COALESCE(NULLIF(EXCLUDED.style_category, ''), wine_bank.style_category),
        tasting_profile = COALESCE(EXCLUDED.tasting_profile, wine_bank.tasting_profile),
        updated_at = now()
    `;
    console.log(`Added wine to DB bank: ${id} (${identity.producer} ${identity.wineName}) [${identity.styleCategory}]`);
  } catch (err) {
    console.error("Failed to add wine to DB bank:", err);
  }
}

export async function enrichWineProfiles(
  questionId: string,
  wines: { slot: number; fullText: string }[],
  apiKey: string,
  meta?: { source?: "user" | "server"; userId?: number | null; batchId?: string | null }
): Promise<Record<string, WineProfile>> {
  const profiles = await lookupWines(wines);
  const enrichMeta: EnrichMeta = {
    source: meta?.source,
    userId: meta?.userId,
    batchId: meta?.batchId,
    questionId,
  };

  const needsEnrichment = wines.filter(
    (w) => profiles[String(w.slot)]?.source_method === "none"
  );

  // Research each non-bank wine via Tavily, classify it, then add to bank
  for (const wine of needsEnrichment) {
    const profile = await researchWineViaTavily(wine, apiKey, enrichMeta);
    const identity = await classifyWine(wine.fullText, apiKey, enrichMeta);
    // Carry the classification onto the profile so the current question's wine_profiles
    // (and any downstream tasting context) reflect the real style/grapes, not still_dry/[].
    profile.style_category = identity.styleCategory;
    profile.grape_varieties = identity.grapeVarieties;
    profiles[String(wine.slot)] = profile;

    if (profile.tasting_profile) {
      await addToWineBank(identity, profile);
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
