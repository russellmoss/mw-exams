import { readFileSync } from "fs";
import { join } from "path";
import { neon } from "@neondatabase/serverless";

const TARGET_DISTRIBUTIONS: Record<string, Record<number, number>> = {
  F1: { 2: 44, 3: 32, 4: 12, 5: 8, 6: 4 },
  F2: { 2: 42, 3: 33, 4: 25 },
  F3: { 2: 33, 3: 17, 4: 50 },
  F4: { 2: 12, 3: 27, 4: 46, 5: 6, 6: 9 },
  F5: { 1: 8, 2: 33, 3: 25, 4: 17, 5: 17 },
  F6: { 2: 50, 4: 25, 5: 25 },
  F7: { 2: 50, 3: 13, 4: 12, 6: 25 },
  any: { 2: 33, 3: 28, 4: 29, 5: 5, 6: 5 },
};

async function pickFlightSizeFromDistribution(
  paper: number,
  family: string,
  _existingWines?: string[]
): Promise<number> {
  const target = TARGET_DISTRIBUTIONS[family] || TARGET_DISTRIBUTIONS.any;

  // P1 never uses 5-wine flights
  const sizes = Object.entries(target)
    .map(([s, w]) => [parseInt(s), w] as [number, number])
    .filter(([s]) => !(paper === 1 && s === 5));

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const familyFilter = family && family !== "any" ? family : null;

    const rows = familyFilter
      ? await sql`
          SELECT jsonb_array_length(wines::jsonb) as wine_count, COUNT(*)::int as total
          FROM generated_questions
          WHERE paper = ${paper} AND family = ${familyFilter}
          GROUP BY jsonb_array_length(wines::jsonb)
        `
      : await sql`
          SELECT jsonb_array_length(wines::jsonb) as wine_count, COUNT(*)::int as total
          FROM generated_questions
          WHERE paper = ${paper}
          GROUP BY jsonb_array_length(wines::jsonb)
        `;

    const current: Record<number, number> = {};
    let totalGenerated = 0;
    for (const r of rows) {
      current[r.wine_count as number] = r.total as number;
      totalGenerated += r.total as number;
    }

    if (totalGenerated < 3) {
      // Not enough data — use pure random from target distribution
      const totalWeight = sizes.reduce((sum, [, w]) => sum + w, 0);
      let roll = Math.random() * totalWeight;
      for (const [size, weight] of sizes) {
        roll -= weight;
        if (roll <= 0) return size;
      }
      return sizes[0][0];
    }

    // Calculate which size is most underrepresented vs target
    const totalTarget = sizes.reduce((sum, [, w]) => sum + w, 0);
    let bestSize = sizes[0][0];
    let bestGap = -Infinity;

    for (const [size, targetPct] of sizes) {
      const targetShare = targetPct / totalTarget;
      const actualShare = (current[size] || 0) / totalGenerated;
      const gap = targetShare - actualShare;
      if (gap > bestGap) {
        bestGap = gap;
        bestSize = size;
      }
    }

    return bestSize;
  } catch (err) {
    console.error("Flight size DB lookup failed, using random:", err);
    const totalWeight = sizes.reduce((sum, [, w]) => sum + w, 0);
    let roll = Math.random() * totalWeight;
    for (const [size, weight] of sizes) {
      roll -= weight;
      if (roll <= 0) return size;
    }
    return sizes[0][0];
  }
}

// The appellations the single-variety validator actually REJECTS, in readable form.
//
// The prompt used to give illustrative examples ("Tawny Port, Champagne, Bordeaux blends…") rather
// than the enforced set, and the gap showed: a Paper 2 batch lost 7 attempts to Gigondas and
// Saint-Estephe, both already in the validator's list and neither named here. The model cannot avoid
// a rule it has not been shown.
//
// Mirrors KNOWN_BLEND_INDICATORS (question-engine.ts, duplicated in question-rules.mjs). It cannot
// be imported from there — question-engine imports THIS module, so the dependency would be circular —
// so tests/blend-list-sync.test.ts asserts every name below is genuinely detected by isLikelyBlend.
// That pins the direction that matters: the prompt must never promise something the validator does
// not enforce.
export const BLEND_APPELLATIONS = [
  "Tawny Port", "Ruby Port", "LBV", "Vintage Port", "Porto", "Port DOC/DOP",
  "Champagne", "Cremant", "Cava", "Franciacorta", "Prosecco",
  "Chateauneuf-du-Pape", "Gigondas", "Vacqueyras", "Cotes du Rhone", "Cotes de Provence",
  "Bordeaux", "Medoc", "Haut-Medoc", "Pauillac", "Margaux", "Saint-Julien", "Saint-Estephe",
  "Saint-Emilion", "Pomerol", "Pessac-Leognan", "Graves",
  "Rioja", "Chianti", "Tokaji", "GSM", "Meritage", "Ripasso", "Amarone", "Valpolicella",
];

// P3 wine style category distribution from 49-question corpus.
//
// still_dry is deliberately ABSENT, though 17.8% of real P3 wines are still dry. It is a component
// of P3 flights, not a category OF one: 42 of 51 real P3 questions (82%) contain a still dry wine,
// and 0 are built around them, because a flight with no sparkling / fortified / sweet / rosé /
// oxidative / orange wine is simply a Paper 1 or Paper 2 question.
//
// Listing it here made it selectable as the MANDATORY category, and the picker draws the biggest
// deficit — so still_dry (2.8% banked against a 20% target) was drawn over and over, the model built
// the all-still-dry flight it had been asked for, validatePaperScope rejected it, and the deficit
// never closed. paperScope was joint-top blocker on P3 (16 of 40 attempts) while barely registering
// on P1/P2. Relaxing the validator alone did not fix it: the next batch still failed 13 times on
// "no wine in this flight is sparkling, fortified, sweet, rosé, oxidative or orange", because the
// prompt was still ordering an all-still-dry flight.
//
// Still dry wines remain welcome — the scope text invites them and validatePaperScope permits them.
// They just arrive as part of a flight whose identity comes from another style, which is how the IMW
// actually sets them. The remaining weights renormalise on their own (the picker divides by their
// sum), so the balance among them is unchanged.
const P3_STYLE_DISTRIBUTION: Record<string, number> = {
  sparkling: 31,
  sweet: 22,
  fortified: 18,
  rose: 6,
  oxidative: 2,
};

/**
 * How far each category is below its target, measured PROPORTIONALLY to that target, keeping only
 * those still owed something. Exported for testing; see the note at the call site for why absolute
 * gaps starve small categories.
 */
export function relativeDeficits(
  styles: [string, number][],
  current: Record<string, number>,
  totalGenerated: number
): { style: string; relative: number }[] {
  const totalTarget = styles.reduce((sum, [, w]) => sum + w, 0);
  if (totalTarget <= 0 || totalGenerated <= 0) return [];
  return styles
    .map(([style, targetPct]) => {
      const targetShare = targetPct / totalTarget;
      const actualShare = (current[style] || 0) / totalGenerated;
      return { style, relative: (targetShare - actualShare) / targetShare };
    })
    .filter((d) => d.relative > 0);
}

async function pickP3StyleCategory(): Promise<string> {
  const styles = Object.entries(P3_STYLE_DISTRIBUTION);

  try {
    const sql = neon(process.env.DATABASE_URL!);
    // Count generated P3 questions by dominant wine style
    const rows = await sql`
      SELECT
        CASE
          WHEN wines::text ILIKE '%champagne%' OR wines::text ILIKE '%cremant%' OR wines::text ILIKE '%cava%'
            OR wines::text ILIKE '%prosecco%' OR wines::text ILIKE '%sekt%' OR wines::text ILIKE '%sparkling%'
            OR wines::text ILIKE '%brut%' OR wines::text ILIKE '%franciacorta%' THEN 'sparkling'
          WHEN wines::text ILIKE '%port%' OR wines::text ILIKE '%sherry%' OR wines::text ILIKE '%madeira%'
            OR wines::text ILIKE '%amontillado%' OR wines::text ILIKE '%oloroso%' OR wines::text ILIKE '%fino%'
            OR wines::text ILIKE '%manzanilla%' OR wines::text ILIKE '%vin santo%' OR wines::text ILIKE '%banyuls%'
            OR wines::text ILIKE '%rutherglen%' THEN 'fortified'
          WHEN wines::text ILIKE '%sauternes%' OR wines::text ILIKE '%tokaji%' OR wines::text ILIKE '%icewine%'
            OR wines::text ILIKE '%beerenauslese%' OR wines::text ILIKE '%spatlese%' OR wines::text ILIKE '%auslese%'
            OR wines::text ILIKE '%quarts de chaume%' OR wines::text ILIKE '%late harvest%' THEN 'sweet'
          WHEN wines::text ILIKE '%rosé%' OR wines::text ILIKE '%rose%' OR wines::text ILIKE '%rosado%' THEN 'rose'
          WHEN wines::text ILIKE '%vin jaune%' OR wines::text ILIKE '%orange%' OR wines::text ILIKE '%amber%' THEN 'oxidative'
          ELSE 'still_dry'
        END as style_cat,
        COUNT(*)::int as total
      FROM generated_questions
      WHERE paper = 3
      GROUP BY style_cat
    `;

    const current: Record<string, number> = {};
    let totalGenerated = 0;
    for (const r of rows) {
      current[r.style_cat as string] = r.total as number;
      totalGenerated += r.total as number;
    }

    if (totalGenerated < 3) {
      const totalWeight = styles.reduce((sum, [, w]) => sum + w, 0);
      let roll = Math.random() * totalWeight;
      for (const [style, weight] of styles) {
        roll -= weight;
        if (roll <= 0) return style;
      }
      return styles[0][0];
    }

    // PROPORTIONAL deficit, drawn at random — not the single largest ABSOLUTE gap.
    //
    // Comparing absolute share gaps starves every small category permanently. A category's gap can
    // never exceed its own target share, so rosé (7.6% of the target) could not out-rank sparkling
    // (39.2%) until sparkling was itself nearly satisfied. Measured on the live bank: sparkling's
    // gap was 25.8% while rosé's maximum conceivable gap was 7.6%, so rosé was unreachable until
    // sparkling's actual share passed 31.6%. It sat at 1 question in ~70 with the second-largest
    // relative shortfall in the bank.
    //
    // Dividing the gap by the target share asks the right question — "how empty is this category
    // relative to what it should be?" — and puts them on comparable footing: rosé 80% short beats
    // sparkling 66% short, which is the correct priority.
    //
    // Drawing at random among the deficits rather than always taking the maximum also stops a batch
    // becoming a single-category run. The deterministic version produced 11 consecutive sparkling
    // questions in one batch, because the winner stays the winner until its own share moves.
    const deficits = relativeDeficits(styles, current, totalGenerated);

    // Every category at or above target — nothing is owed, so fall back to the plain target weights.
    if (deficits.length === 0) {
      const totalWeight = styles.reduce((sum, [, w]) => sum + w, 0);
      let roll = Math.random() * totalWeight;
      for (const [style, weight] of styles) {
        roll -= weight;
        if (roll <= 0) return style;
      }
      return styles[0][0];
    }

    const totalDeficit = deficits.reduce((sum, d) => sum + d.relative, 0);
    let roll = Math.random() * totalDeficit;
    for (const d of deficits) {
      roll -= d.relative;
      if (roll <= 0) return d.style;
    }
    return deficits[0].style;
  } catch (err) {
    console.error("P3 style distribution lookup failed:", err);
    const totalWeight = styles.reduce((sum, [, w]) => sum + w, 0);
    let roll = Math.random() * totalWeight;
    for (const [style, weight] of styles) {
      roll -= weight;
      if (roll <= 0) return style;
    }
    return styles[0][0];
  }
}

let cachedContext: PipelineContext | null = null;

interface PipelineContext {
  mockExamWriterAgent: string;
  mockAnswerWriterAgent: string;
  sharedRules: string;
  examinerReportSynthesis: string;
  curveballAnalysis: string;
  sourcingGuide: string;
  wineCompositionAnalysis: string;
  geographicVocabularyRules: string;
  historicalQuestionExamples: Record<
    string,
    { year: number; family: string; text: string; wineCount: number }[]
  >;
}

// The agent fields hold whole .claude/agents/*.md files, and those open with YAML frontmatter
// written for the agent RUNNER rather than for the model — including
// `tools: Read, Write, Edit, Bash, Grep`.
//
// Pasted verbatim into a system prompt that reads as a tool grant, and the model acts on it: in the
// model-answer path the same frontmatter produced answers that opened "I'll load the necessary files
// and wine research data before writing the answer" followed by fabricated <function_calls> blocks
// (fixed in 2f55858). This path embeds mockExamWriterAgent the same way and was missed, so the same
// contamination has been reaching question generation — where the symptom is a draft that does not
// parse rather than a bloated answer. Parse failures were running 8.3% and rising to 17.6%.
//
// Only the runner metadata is removed; the agent INSTRUCTIONS, which are the point of embedding the
// file, are untouched.
function stripFrontmatter(md: string): string {
  return md.replace(/^﻿?\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trimStart();
}

function loadPipelineContext(): PipelineContext {
  if (cachedContext) return cachedContext;
  const filePath = join(process.cwd(), "public", "data", "pipeline-context.json");
  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as PipelineContext;
  cachedContext = {
    ...raw,
    mockExamWriterAgent: stripFrontmatter(raw.mockExamWriterAgent || ""),
    mockAnswerWriterAgent: stripFrontmatter(raw.mockAnswerWriterAgent || ""),
  };
  return cachedContext!;
}

// The dedup avoid-list used to inject every banked wine's full `fullText` verbatim. That is fine at
// ~120 wines/paper but does not scale: at a few hundred banked questions the block runs to thousands
// of lines, the instruction gets diluted, and repeats start appearing precisely as the bank grows.
//
// The rule we actually enforce is "don't reuse a PRODUCER", so we send the distinct producer list
// instead of whole wine strings — ~4x fewer characters, and it grows far more slowly than the wine
// count (a producer with five cuvées costs one entry, not five). fullText is authored as
// `Producer, Cuvée, Vintage. Region, Country. (ABV)`, so the producer is the head segment.
//
// MAX_AVOID_PRODUCERS bounds the worst case. The list is built most-recent-first by every caller, so
// truncation drops the OLDEST producers — the ones a repeat is least likely to be noticed on.
const MAX_AVOID_PRODUCERS = 400;

export function compressAvoidList(existingWines?: string[]): string[] {
  if (!existingWines || existingWines.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const full of existingWines) {
    if (!full) continue;
    const producer = full.split(",")[0].trim();
    // Guard against a malformed fullText with no comma: a whole wine string as a "producer" would
    // be noise, so skip anything implausibly long rather than poisoning the list.
    if (!producer || producer.length > 60) continue;
    const key = producer.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(producer);
    if (out.length >= MAX_AVOID_PRODUCERS) break;
  }
  return out;
}

// PRODUCER EXCLUSION (hard) — the block generateFreshQuestion appends when the paper's bank has
// over-used producers. Unlike the deduplication list above (a preference with a banker escape hatch)
// this is an outright ban: the reviewer has complained repeatedly about the same houses recurring
// ("please stop including weinbach gewurztraminer - I have told you this at least three times"), and
// validateProducerExclusion rejects any draft naming one of these producers, so promising less than
// a ban here would be lying to the model. Kept pure (names in, text out) so it is testable without a
// database; the caller caps the list (PRODUCER_EXCLUDE_TOP) so the block stays small.
export function buildProducerExclusionBlock(producers: string[]): string {
  if (producers.length === 0) return "";
  return `

## PRODUCER EXCLUSION (HARD RULE — violation = automatic rejection)
The following producers are over-used in the question bank. Do NOT use a wine from ANY of them, under any label, cuvée or spelling variant (with or without "Domaine"/"Château"/etc.): ${producers.join(" · ")}.
This is a hard ban, not a preference — a validator rejects any flight naming one of these producers, even as the banker. Choose a different, equally credible producer from the same region and price band instead; every region here has many.
Apply this silently: the wine list and stem must never mention that a producer was excluded, banned or replaced.`;
}

// WINE-STYLE EXCLUSION (hard) — the block generateFreshQuestion appends when a signature niche STYLE
// (vin jaune / sous voile Jura, Seppeltsfield-style aged tawny, Alsace Gewurztraminer) is over the
// frequency cap or was used in the paper's last few questions. The reviewer's complaint is about the
// CATEGORY recurring as much as any one label ("we are overindexing on vin jaune", "way overindexed on
// this seppeltsfield wine", "we keep overusing … gewurztraminer"), so swapping producers within the
// same style does NOT satisfy it. Kept pure (labels in, text out) so it is testable without a database.
export function buildStyleExclusionBlock(styles: string[]): string {
  if (styles.length === 0) return "";
  return `

## WINE-STYLE EXCLUSION (HARD RULE — over-used niche categories)
These niche wine STYLES are already over-represented in this paper's recent questions and bank: ${styles.join(" · ")}.
Do NOT build this flight around any of them. The complaint is the CATEGORY recurring, not just one label, so choosing a different producer of the SAME style does NOT satisfy this rule — pick a genuinely different style/region for this question. If avoiding the style leaves the flight hard to complete, widen the region or grape choice rather than falling back on the banned category.
Apply this silently: the wine list and stem must never mention that a style was excluded or replaced.`;
}

// Exam Mix (migration 034): per-flight category + curveball guidance. Human-readable "how to build
// this category" cues so the model can actually deliver the required, coherent flight the validators
// then check. Returns "" (no injection) when Exam Mix is inactive.
const EXAM_MIX_CATEGORY_GUIDANCE: Record<string, string> = {
  sparkling: "Champagne, Cava, Crémant, English sparkling, Prosecco, Franciacorta, Trentodoc, Sekt, Cap Classique, traditional-method or pét-nat.",
  rose: "Provence, Tavel, Bandol, Clairet, sparkling rosé, or a serious New World rosé — every wine in the flight must be a rosé.",
  fortified: "Port, Sherry, Madeira, Marsala, Rutherglen Muscat, VDN (Banyuls/Maury/Rivesaltes), Moscatel de Setúbal, Commandaria.",
  sweet: "Sauternes/Barsac, Tokaji Aszú, German/Austrian BA/TBA/Eiswein, Loire moelleux, Vin Santo, Icewine, late-harvest or noble-rot sweet wines with meaningful RS.",
  oxidative: "Vin Jaune / Château-Chalon, sous voile Jura Savagnin, biologically- or oxidatively-aged whites — flor/voile driven, not conventional cask oxidation.",
  orange: "Skin-contact / amber / qvevri whites — Georgian Rkatsiteli, Friulian ramato, extended skin-contact styles.",
  still_white: "A still dry white that belongs in a Paper 3 context — an unusual variety or a wine that crosses paper boundaries (e.g. dry Furmint alongside Tokaji).",
  still_red: "A still dry red used as a Paper 3 curveball or cross-boundary contrast (e.g. Grenache spanning dry and fortified).",
};

function buildExamMixBlock(
  paper: number,
  examMix?: { flightCategory?: string | null; curveball?: "low" | "medium" | "high" | null } | null
): string {
  if (!examMix || (!examMix.flightCategory && !examMix.curveball)) return "";
  const lines: string[] = ["## EXAM MIX — REQUIRED COMPOSITION FOR THIS QUESTION (HARD)"];

  if (paper === 3 && examMix.flightCategory) {
    const cat = examMix.flightCategory;
    const guidance = EXAM_MIX_CATEGORY_GUIDANCE[cat] || "";
    lines.push(
      `This must be a ${cat.replace(/_/g, " ").toUpperCase()} flight. EVERY wine in it must belong to the '${cat}' category — ${guidance}`,
      `The flight must be category-COHERENT: do NOT mix categories (e.g. one sparkling + two fortified is INVALID). The only exception is a deliberate cross-category comparison that the stem itself explicitly frames and justifies — and if you do that, you MUST set CrossCategoryIntentional: true in the Metadata and explain the contrast in the stem.`,
      `Set WineCategory: ${cat} in the Metadata.`
    );
  }

  if (examMix.curveball) {
    const c = examMix.curveball;
    const howMany =
      c === "low"
        ? "All wines in this flight should be LOW curveball — standard, expected, benchmark examples with no hidden trap."
        : c === "medium"
          ? "This flight should carry exactly ONE medium-curveball wine (a rare style or unexpected origin); the rest stay low/anchor."
          : "This flight should carry ONE genuinely HIGH-curveball wine (rare variety, rare style, hidden identity or unexpected origin); the rest stay low/anchor.";
    lines.push(`Curveball target: ${c}. ${howMany} Set CurveballLevel: ${c} in the Metadata.`);
  }

  return lines.join("\n") + "\n\n";
}

export async function buildQuestionGenerationPrompt(
  paper: number,
  family: string,
  existingWines?: string[],
  latestQuestion?: {
    questionText: string;
    wines: { slot: number; fullText: string }[];
    paper: number;
    family: string;
  } | null,
  // Stem Sniper's variety drill filter. When set, every wine must be this grape and the contrast has
  // to come from somewhere else. Undefined for every other caller — normal generation is unchanged.
  variety?: string | null,
  // Exam Mix (migration 034) — the invisible composition-balancing target for this generation. Set
  // only on the bank-generation path. flightCategory pins a REQUIRED, coherent Paper 3 category;
  // curveball pins the difficulty level for this flight's wines. Undefined → the prompt is unchanged.
  examMix?: {
    flightCategory?: string | null;
    curveball?: "low" | "medium" | "high" | null;
  } | null,
  // Flight-size policy (fb_73): when the engine has already chosen the size via selectFlightSize, it
  // passes it here and this prompt uses it verbatim instead of the legacy per-family distribution
  // draw. Null/undefined preserves the old self-contained behaviour for any caller that hasn't moved.
  flightSizeOverride?: number | null,
  // Single-wine curveball rule (fb_354/355/98): when true, the flight is one CURVEBALL wine and the
  // stem must NOT ask the candidate to identify the grape variety or region/country of origin. The
  // engine enforces this after generation (validateSingleWineIdentification); this adds the matching
  // instruction so the model builds the right stem in the first place.
  suppressIdentification?: boolean
): Promise<{ cachedPrefix: string; system: string; user: string }> {
  const ctx = loadPipelineContext();

  const examples = ctx.historicalQuestionExamples[`p${paper}`] || [];
  const exampleText = examples
    .map(
      (e) =>
        `[${e.year} P${paper}, ${e.family}, ${e.wineCount} wines]: ${e.text}`
    )
    .join("\n\n");

  // Use the actual mock-exam-writer agent instructions as the core system prompt
  // This keeps the app and CLI pipeline in perfect sync
  const paperScope = paper === 1
    ? "WHITE STILL WINES ONLY. Every wine in this question MUST be a white still wine. No reds, no rosés, no sparkling, no fortified, no sweet wines (unless a white wine with residual sugar like Riesling Spätlese or Vouvray demi-sec)."
    : paper === 2
      ? "RED STILL WINES ONLY. Every wine in this question MUST be a red still wine. No whites, no rosés, no sparkling, no fortified. All wines must be made from red grape varieties."
      // Measured over the 51 real P3 questions in the corpus: 0 are entirely still dry, 42 (82%)
      // contain at least one still dry wine, 9 contain none. 32 of 180 real P3 wines (17.8%) are
      // still dry, and not as exotica — Nuits St Georges 1er Cru, Bandol, Saint-Romain and Riesling
      // Trocken all appear at curveball_level=low.
      //
      // The old text said "No standard still dry whites or reds", which contradicted both the real
      // exam and this prompt's own P3 style block (which lists still_dry at 20% and can make it the
      // required category). When it did, the model was told to produce still dry wines and that
      // still dry wines were an automatic failure.
      : "A MIXED PAPER: sparkling, fortified, sweet, rosé, oxidative, orange AND still dry wines all belong here. Still dry wines are NOT excluded — 82% of real Paper 3 questions contain at least one, including mainstream examples like Nuits St Georges 1er Cru and Alsace Pinot Gris Grand Cru. The ONE thing Paper 3 never is: a flight made ENTIRELY of standard still dry wines, because that is simply a Paper 1 or Paper 2 question. Every flight must carry at least one wine that is sparkling, fortified, sweet, rosé, oxidative or orange.";

  // Per-paper mark emphasis — the modern (2018–2025) shape differs sharply by paper (EK-0098).
  const markEmphasis = paper === 1
    ? "P1 (whites): lean MATURITY (~20% of marks) and quality; commercial is the LOWEST (~13%). Include an ageing / drink-window ask."
    : paper === 2
      ? "P2 (reds): most ORIGIN-driven (~50% of marks) and STYLE-driven (~23%); maturity is low (~9%). Include a precise-origin ask (commune / cru / classification level)."
      : "P3 (special): highest COMMERCIAL (~21%) and WINEMAKING (~27%); sweetness/RS and structure 'state' asks (2-3 marks) belong here.";

  // Pre-roll the flight size. The engine now owns this choice (selectFlightSize over
  // HISTORIC_FLIGHT_SIZE_WEIGHTS, with the rolling 4-wine cap — fb_73) and passes it as
  // flightSizeOverride; the legacy per-family distribution draw only runs when no override was given,
  // so a caller that hasn't been moved onto the engine sampler still behaves exactly as before.
  const targetFlightSize =
    flightSizeOverride && flightSizeOverride > 0
      ? flightSizeOverride
      : await pickFlightSizeFromDistribution(paper, family || "any", existingWines);
  // Exam Mix supplies its own authoritative P3 category when active; fall back to the legacy corpus
  // draw otherwise so a non-bank generation is unchanged.
  const targetP3Style = paper === 3 && !examMix?.flightCategory ? await pickP3StyleCategory() : null;

  // Exam Mix (migration 034): a required, coherent P3 flight category + a per-flight curveball level.
  // Phrased as hard requirements the post-generation validators (validateP3Composition /
  // validateCurveballMix) then enforce.
  const examMixBlock = buildExamMixBlock(paper, examMix);

  // ── THE CACHEABLE PREFIX ────────────────────────────────────────────────────────────────────
  //
  // The corpus documents, which are loaded once from public/data/pipeline-context.json, memoised in
  // module scope, and byte-identical on every call in the process. ~31k of the ~42k median input.
  //
  // They used to sit in the MIDDLE of the system prompt, behind `${paper}` and the flight-size draw,
  // which made the prefix vary per question and left prompt caching impossible: measured 2026-08-07,
  // the cache-hit rate across 3,358 generation calls was 0.0% and this text was re-sent, and re-paid
  // for, every single time. Hoisting them ahead of everything dynamic gives THREE stable prefixes —
  // one per paper, since the historical examples are per-paper — each hit hundreds of times a day.
  //
  // NOTHING PER-QUESTION MAY BE INTERPOLATED HERE. `${paper}` is the only variable and it is what
  // makes the prefix per-paper rather than global; anything else (flight size, family, avoid-list,
  // exam mix) breaks the byte-identity and silently returns the cache-hit rate to zero. There is a
  // test for exactly that — see tests/generation-prompt-cache.test.ts.
  const cachedPrefix = `## MOCK EXAM WRITER AGENT INSTRUCTIONS (CANONICAL — follow these exactly)
${ctx.mockExamWriterAgent}

## SHARED RULES
${ctx.sharedRules}

## EXAMINER REPORT SYNTHESIS
${ctx.examinerReportSynthesis}

## CURVEBALL ANALYSIS
${ctx.curveballAnalysis}

## WINE SOURCING GUIDE
${ctx.sourcingGuide}

## WINE COMPOSITION RULES
${ctx.wineCompositionAnalysis}

## REAL HISTORICAL QUESTION EXAMPLES (Paper ${paper} — match this voice exactly)
Match the VOICE and structure, NOT the mark values: several examples predate the modern mark shape, and older papers used identification parts worth 13-15+ marks that are now illegal — your marks must follow the IDENTIFICATION MARK BUDGET below (no identification part over 10 marks per instance, ever, even where an example below shows one).
${exampleText}`;

  const system = `You are generating a SINGLE question (not a full exam) for Paper ${paper}. You follow the exact same rules as the mock-exam-writer agent above.

## ABSOLUTE PAPER SCOPE CONSTRAINT (VIOLATION = AUTOMATIC FAILURE)
Paper ${paper}: ${paperScope}
This is non-negotiable. If you include a wine that violates this scope, the entire question is invalid. Check every wine against this constraint before outputting.

## FLIGHT SIZE FOR THIS QUESTION: ${targetFlightSize} WINES (MANDATORY)
This question MUST have exactly ${targetFlightSize} ${targetFlightSize === 1 ? "wine" : "wines"}. This number was selected from the historical corpus distribution for ${family || "this paper"} to ensure realistic variety in flight sizes. Do NOT change it to a different number.
${targetFlightSize === 2 ? "This is a pair comparison — the most common format for this question type. Design the question around comparing and contrasting two wines." : ""}
${targetFlightSize === 3 ? "This is a three-wine flight — common for same-origin or same-variety questions with regional spread." : ""}
${targetFlightSize >= 5 ? "This is a larger comparative flight — use it for breadth questions, mechanism comparisons, or hierarchy ladders." : ""}

${suppressIdentification && targetFlightSize === 1 ? `## SINGLE-WINE CURVEBALL — IDENTIFICATION SUPPRESSED (HARD RULE — violation = automatic rejection)
This is a single-wine flight and the wine is a CURVEBALL. Do NOT ask the candidate to identify the grape variety, or the region/country of origin — no "Identify the grape variety", no "Identify the region/origin as closely as possible", not even at a low mark value. A candidate is not expected to name, for example, a Cabernet Franc from Hungary, so the real exam does not stake marks on identifying a lone curveball. Build all 25 marks on:
- the STYLE of the wine (a concise descriptor of what it is),
- its METHOD OF PRODUCTION / winemaking,
- its QUALITY and maturity,
- its COMMERCIAL POSITIONING (how it would be positioned in the global market).
A blocking validator rejects this question if it contains ANY "identify the grape variety / region / origin" sub-part.

` : ""}${targetP3Style ? `## P3 WINE STYLE CATEGORY FOR THIS QUESTION: ${targetP3Style.toUpperCase()} (MANDATORY)
This Paper 3 question must feature ${targetP3Style} wines as the primary category. This was selected from the corpus distribution to ensure users practice all P3 categories at realistic frequencies.

Flight categories and their frequencies: sparkling=39%, sweet=28%, fortified=23%, rose=8%, oxidative=3%.
Still dry wines are NOT a category of their own — they appear WITHIN these flights (82% of real Paper 3 questions contain at least one) and are welcome here, but a flight's identity always comes from one of the styles above.

${targetP3Style === "sparkling" ? "Select sparkling wines — Champagne, Cava, Crémant, English sparkling, Prosecco, Franciacorta, Sekt, Cap Classique." : ""}${targetP3Style === "fortified" ? "Select fortified wines — Port, Sherry, Madeira, Banyuls, Rutherglen, VDN, Marsala." : ""}${targetP3Style === "sweet" ? "Select sweet wines with meaningful RS — Sauternes, Tokaji, BA/TBA, Icewine, Quarts de Chaume, Vin Santo, late harvest." : ""}${targetP3Style === "rose" ? "Select rosé wines — Provence, Tavel, Bandol, sparkling rosé, New World rosé." : ""}${targetP3Style === "oxidative" ? "Select oxidative wines — Vin Jaune, orange/amber wines, oxidative Jura, sous voile styles." : ""}

P3 OXIDATIVE STILL-WHITE SUB-RULE (HARD): A still (non-sparkling, non-fortified) white wine is in-scope for Paper 3 ONLY if its oxidative character is flor/sous voile-driven (e.g., Jura Savagnin sous voile, Vin Jaune). Conventionally cask-oxidized still whites — oxidative white Rioja (e.g., López de Heredia Tondonia/Gravonia Blanco, Marqués de Murrieta Castillo Ygay Blanco), oxidative aged Hunter Semillon — are PAPER 1 wines and must NOT be the basis of a Paper 3 question. Two such still whites contrasted by production method is a Paper 1 question. A P3 question may feature a conventionally-oxidative still white ONLY when it is paired with a fortified or biologically-aged (flor) wine (e.g., a Fino/Manzanilla Sherry) that supplies a genuine P3 contrast (oxidative-vs-biological, or still-vs-fortified). If you reason about including a Fino, Sherry, or other fortified/flor wine, you MUST actually place that wine in the wine list — do not let the selection collapse into all still wines.
` : ""}${examMixBlock}## YOUR TASK
Generate ONE question with exactly ${targetFlightSize} wines for Paper ${paper}${family !== "any" ? `, question family ${family}` : ""}. Follow every constraint in the agent instructions above and the rules below — geographic vocabulary, wine selection, mark allocation, curveball design, etc.

${(() => {
  const avoid = compressAvoidList(existingWines);
  return avoid.length > 0 ? `## WINE DEDUPLICATION — PREFER PRODUCERS NOT ON THIS LIST
The following ${avoid.length} producers already appear in the question bank for this paper. Choose different producers from the same variety/region wherever you can.

This is a STRONG PREFERENCE, not an absolute ban. The benchmark/iconic producers a flight of 3+ needs to satisfy the banker requirement are a small, finite set, and most of them are already listed below — so if every suitable banker for this flight appears here, reuse one rather than dropping the banker. When you do, pick a DIFFERENT cuvée from that producer. What is never acceptable is repeating the same producer + cuvée combination.

Check this list silently. Whether a producer appeared on it is working, not output: the wine list must never mention a producer being "excluded", "banned", "non-banned", "on the deduplication list", or being replaced by another.

${avoid.join(" · ")}
` : "";
})()}
${latestQuestion ? `## LATEST GENERATED QUESTION - DO NOT REPEAT ITS SHAPE
The most recent generated question in the live system was:
Paper: ${latestQuestion.paper}
Family: ${latestQuestion.family}
Stem: ${latestQuestion.questionText}
Wines:
${latestQuestion.wines.map((w) => `${w.slot}. ${w.fullText}`).join("\n")}

Your new question must be materially different from this latest question. Do not reuse the same paper + family + country/region pattern with substantially the same grape/appellation set. If you choose the same broad country or family, change the question structure and the grape/region set enough that it is clearly a new exam problem.
` : ""}
## QUESTION NOVELTY — DO NOT REUSE THE STRUCTURAL TEMPLATE OR PEDAGOGICAL CONTRAST
Novelty is not just about picking different wines. A candidate must not be able to recognise and "nail" a question because they have already seen its shape. A new question is a NEAR-DUPLICATE — and will be rejected — if it shares BOTH of the following with a recent question:
- the same structural template (same family, same flight size, same stem phrasing — e.g. "X wines from different countries, each made predominantly from a different, single grape variety"), AND
- the same primary pedagogical contrast / core skill being tested (e.g. botrytis vs. passerillage sweetness mechanisms; same-variety different-country origin discrimination; arrested-fermentation low-alcohol vs. dried-grape high-alcohol).

Swapping the specific wines while keeping the same stem template AND the same contrast axis is NOT enough — that is the exact repetition we are eliminating. When you reuse a familiar template, you MUST change the contrast axis (test a different mechanism, a different identification skill, or a different style category) or change the structure (different flight size, different sub-question mix). Aim for a question that feels like a fresh exam problem, not a re-skin of a previous one.

## SAME-ORIGIN DIVERSITY GUARDRAIL
For F2 same-origin questions where the stem says the wines are from the same country/region and does NOT explicitly say "same single grape variety" or specify a smaller number of represented varieties, hidden variety repetition is invalid. The wines must be genuinely different identification targets, not just stylistic variants of the same grape.

CRITICAL: This includes BLEND OVERLAP. Do NOT include both a varietal wine and a blend where that same variety is the dominant grape. For example:
- BAD: Sancerre (100% Sauvignon Blanc) + Pessac-Léognan Blanc (Sauvignon Blanc/Sémillon blend) — both have Sauvignon Blanc as the primary variety, creating confusion about whether the flight tests four distinct varieties or not.
- BAD: Barolo + Gattinara — both are Nebbiolo unless the stem explicitly says a Nebbiolo comparison is intended.
- GOOD: Pessac-Léognan Blanc (SB/Sém) + Alsace Riesling + Muscadet (Melon) + Vouvray (Chenin) — four genuinely different primary varieties.
- GOOD: Barolo/Nebbiolo + Chianti Classico/Sangiovese + Taurasi/Aglianico + Etna Rosso/Nerello Mascalese.

Each wine in the flight must have a DIFFERENT primary/dominant grape variety so candidates face four distinct identification challenges. If a repeated grape is intentional, the stem must say so clearly, e.g. "same single grape variety" or "there are three single grape varieties represented."

## DIFFERENT-COUNTRY CONSTRAINT
When the stem says "different countries" (without specifying a number smaller than the wine count), EVERY wine MUST be from a genuinely different country. The MW exam is 100% truthful with geographic claims — in 10 years of exams, not a single "different countries" stem has ever had two wines from the same country. Two wines from different appellations in the same country (e.g., Vouvray and Anjou are both France; Barossa and Margaret River are both Australia) still count as the SAME country. Verify each wine's country before outputting.

If you want two wines from the same country, the stem must either:
- Say "N different countries" where N < wine count (e.g., "from three different countries" for 4 wines signals one country appears twice)
- Not mention "different countries" at all
- Say "same country" or "same region"

## SINGLE-VARIETY STEM CONSTRAINT
When the stem says "each from a different, single grape variety" or "each is made predominantly from a different, single grape variety" or similar per-wine single-variety language, EVERY wine must genuinely be a single-varietal wine. Do NOT include known blend categories:
- REJECTED AUTOMATICALLY — every one of these is treated as a blend, so a wine from any of them fails a single-variety stem outright:
  ${BLEND_APPELLATIONS.join(" · ")}
  (Accents and suffixes do not help: "Chateauneuf-du-Pape AOC", "DOCa Rioja" and "Porto DOP" all match.)
- GOOD: Rutherglen Muscat (100% Muscat), Amontillado (100% Palomino), Banyuls (predominantly Grenache), single-varietal Riesling, Nebbiolo (Barolo/Barbaresco)
If you want to include a blend, remove the "single grape variety" language from the stem and hedge as "grape variety or varieties" (the exam's own wording). Do NOT reach for "predominantly from a … grape variety" as the fallback — the audit treats "predominantly … grape variety" as a singular-variety claim too, and it fails the same check over any blend.

## BANKER MINIMUM RULE (mandatory for flights of 3+ wines)
Every flight of 3 or more wines MUST include at least one "banker" — a benchmark or iconic wine that any well-prepared MW candidate should identify confidently. The MW exam always does this. In 6 examined France same-country P1 flights (2012-2025), EVERY flight had at least 1 benchmark/iconic wine. Most had 2+.

What counts as a banker:
- Premier Cru or Grand Cru Burgundy (not generic Bourgogne or regional)
- Classified Bordeaux (Cru Classé, not generic)
- Marlborough Sauvignon Blanc from a recognized producer
- Barolo/Barbaresco DOCG from a known producer
- Fino/Manzanilla Sherry, classified Sauternes, Vintage/LBV Port
- Any wine with a specific official classification or appellation hierarchy that a candidate can name

What does NOT count as a banker:
- Generic regional wines (Bourgogne Blanc, basic Côtes du Rhône)
- Obscure producers from well-known regions
- Curveball wines that happen to be from famous countries
- Wines where the variety or style is unusual for the region
- A region's NON-NOBLE / minor variety, even from a famous region — it is the curveball, not the banker. In Alsace only the four noble grapes (Riesling, Pinot Gris, Gewürztraminer, Muscat) are bankers; Sylvaner, Pinot Blanc and Auxerrois are curveballs. So an Alsace pair must anchor on the noble grape (e.g. Pinot Gris) and treat Sylvaner as the harder wine — never the reverse (EK-0131).

The banker is the anchor that establishes the baseline. The curveball(s) then differentiate candidates above that baseline. A flight with no banker is disproportionately difficult and prevents the examiners from evaluating mastery of the classics.

BAD: Montlouis sparkling + Bourgogne Blanc + Hermitage Blanc + Deiss field blend (0 bankers, 2 curveballs)
GOOD: Puligny-Montrachet 1er Cru + Sancerre + Hermitage Blanc + Deiss field blend (2 bankers, 1 curveball)
GOOD: Chablis Grand Cru + Pouilly-Fumé + Condrieu + Jurançon Sec (2 bankers, 1 curveball)

## F4 (MIXED BREADTH) WINE SELECTION — QUALITY TIER CAP
F4 "grab bag" questions test VARIETAL IDENTIFICATION and REGIONAL TYPICITY, not quality prestige. The 10-year MW corpus consistently uses mid-tier, regional-identity wines for this question family — not icon cuvées or prestige bottlings.

Wine selection rules for F4:
- Choose wines that are REPRESENTATIVE of their variety and region at a good-to-very-good quality level. The identification challenge should be "what variety and where" — not "how prestigious is this wine."
- AVOID icon/prestige cuvées: no First Growths, no Grand Cru Burgundy, no cult wines, no joint-venture icons (Almaviva, Opus One, Sassicaia). These belong in F1 (same variety), F2 (same country), or F7 (quality hierarchy) flights.
- AVOID village-level Côte de Nuits Burgundy (Vosne-Romanée, Gevrey-Chambertin) as an F4 wine — it's too quality-coded. Use a Bourgogne Rouge or a regional Pinot Noir instead if you need Pinot Noir in F4.
- IDEAL F4 wines (from real MW exams): Chinon Cab Franc, Baden Spätburgunder, Pinotage from Stellenbosch, Lagrein from Alto Adige, Touriga Nacional from Douro, Zweigelt from Austria, Barbera d'Alba, Xinomavro from Greece, Tannat from Uruguay, Carménère from Chile, Malbec from Mendoza (estate level, not icon).
- The banker in F4 should be a well-known VARIETY from its classic region (e.g., a good Chinon, a solid Stellenbosch Pinotage) — not a prestige producer.

## WINE NAME / LABEL INTEGRITY
For same-variety flights ("same single grape variety"), NO wine's name, cuvée, or producer name may contain a DIFFERENT grape variety name. If a wine is labeled "Blaufränkisch" it IS Blaufränkisch, not Syrah. If a wine is labeled "Pinot Noir" it cannot appear in a Riesling flight. Verify every wine name against the declared variety before outputting. If you catch a contradiction during your reasoning, you MUST apply the correction to your final output — do not output the pre-correction version. Apply it silently: the wine list carries the corrected wine alone, with no note that a substitution happened.

## STEM-WINE CONSISTENCY: RESIDUAL SUGAR CLAIMS
When the stem says "both wines have residual sugar" or "all wines have residual sugar," EVERY wine in the flight must have MEANINGFUL residual sugar — at least 10g/L, detectable as off-dry or sweet on the palate. Do NOT include essentially dry wines (like Savennières, dry Alsace Riesling, brut Champagne, dry Furmint) in an RS-focused flight. The MW only uses "residual sugar" language when sweetness is a defining characteristic of the wine, not for trace amounts that are sub-threshold.

Examples of wines that do NOT qualify as "having residual sugar":
- Savennières (legally up to 7g/L but functionally bone dry)
- Dry Alsace Riesling or Grüner Veltliner
- Brut sparkling wines (dosage RS is not what the MW means)
- Any wine a candidate would taste and call "dry"

If you want to compare a sweet wine with a dry wine from the same region, phrase the stem as "compare and contrast the sweetness levels" or do not claim both have RS. The MW is precise with RS language — when they say it, they mean it.

## 25 MARKS PER WINE (ABSOLUTE — violation = automatic failure)
Every wine in the question MUST receive exactly 25 marks total across all sub-questions. This is universal in the MW exam from 2014-2025 — zero exceptions across 122 questions.
- 2-wine question = 50 marks total
- 3-wine question = 75 marks total
- 4-wine question = 100 marks total
- 5-wine question = 125 marks total
- 6-wine question = 150 marks total

Some marks may be allocated to "all wines" sub-questions (e.g., "Identify the country of origin" worth 10 marks shared across the flight — never more; see the identification mark budget below). Divide these equally across wines when calculating. The per-wine total must still equal 25.

## MARK ALLOCATION RULES (CRITICAL — violation = automatic failure)
**THE TOTAL IS FIXED: exactly 25 marks per wine.** This ${targetFlightSize}-wine question is worth EXACTLY **${targetFlightSize * 25} marks**. Before you output, ADD UP every printed sub-question mark value and confirm the sum is EXACTLY ${targetFlightSize * 25} — a question whose printed marks do not total ${targetFlightSize * 25} is automatically rejected. Do the arithmetic; do not estimate.
Reliable allocation that always sums correctly (use it unless the question family needs another shape): (a) variety + origin = ${targetFlightSize} × 8 = ${targetFlightSize * 8}; (b) winemaking / production = ${targetFlightSize} × 9 = ${targetFlightSize * 9}; (c) quality, maturity & commercial = ${targetFlightSize} × 8 = ${targetFlightSize * 8}; → total ${targetFlightSize * 25}.${targetFlightSize === 1 ? " (For a single wine, write the marks as plain values, e.g. \"(10 marks)\".)" : ` (Per-wine sub-questions are written "${targetFlightSize} × M marks".)`} If you use a different shape — e.g. a single shared "identify the variety" part for a same-variety flight, or two parts instead of three — re-add the numbers: they must STILL total ${targetFlightSize * 25}, weighted per the mark emphasis below.

Minimum marks per written sub-question: **5 marks**.
The MW exam ONLY uses 2-3 mark sub-questions for numerical "state" answers:
- 2 marks: "State the level of residual sugar" or "State the alcohol level" — one-number answers
- 3 marks: Same type of quick factual answers
NEVER allocate 2-4 marks for written answers like "Comment on commercial position" or "Discuss winemaking." These require sentences and always get 5+ marks.

Typical per-wine mark ranges for written sub-questions:
- Identification (variety + origin): 8 marks standard — NEVER more than 10 on any single "Identify the …" part (hard validator cap)
- Winemaking / method of production: 5-10 marks
- Quality / maturity: 5-10 marks
- Commercial position: 5-10 marks
- Style: 5-10 marks (often combined with quality)

## IDENTIFICATION MARK BUDGET (non-negotiable — a blocking validator auto-rejects every violation)
Three rules govern every lettered sub-part that asks the candidate to identify the grape variety, country, region or any other origin attribute. They are enforced verbatim by a hard validator; a draft breaking any one is rejected and costs a full redraft.
1. **No single identification sub-part may carry more than 10 marks per instance.** The per-wine multiplier counts as the per-wine value: "(4 x 10 marks)" is legal (10 per wine); "(13 marks)" on one identification part is illegal — including a flat, flight-wide part.
2. **Never bundle two or more origin attributes into one sub-part.** If an identification part asks for more than one attribute (e.g. "Identify the grape variety and country of origin"), split it into separate lettered parts, each individually within the 10-mark cap.
3. **Put each attribute where it varies.** An attribute the stem states as shared belongs in the flight-wide "With reference to all N wines:" part. An attribute that varies across the flight — typically region when the stem fixes the country, or origin when only the variety is shared — is asked per-wine under "For each wine:", never bundled into the shared part.

WORKED LEGAL SHAPE (same-variety flight of 2 — shared variety flight-wide, varying origin per-wine, every part within cap):
With reference to both wines:
a) Identify the grape variety. (10 marks)
For each wine:
b) Identify the origin as closely as possible. (2 x 8 marks)

WORKED ILLEGAL SHAPES (each is auto-rejected — do not emit them):
- "a) Identify the country of origin. (13 marks)" — 13 marks on a single identification part breaches the 10-mark cap.
- "a) Identify the grape variety and country of origin. (15 marks)" — bundles two attributes into one 15-mark part; write "a) Identify the grape variety. (8 marks)" and "b) Identify the country of origin. (8 marks)" instead.

**CURVEBALL FLIGHTS SHIFT MARKS OFF IDENTIFICATION.** When the flight is curveball-heavy (obscure varieties or origins few candidates could name), the real exam does not stake 10 marks per wine on identification the examiner knows will mostly fail — it drops identification to ~5-6 marks per wine (sometimes skipping the variety ask entirely) and moves the weight onto style, method of production and quality, which a strong candidate CAN earn on an unfamiliar wine. Reviewer-attested pattern (2026-08 review corpus): a mostly-curveball flight carrying 10/25 per wine on identification reads as unrealistic and gets binned. Banker-anchored flights keep the normal 8-15 identification weighting.

**SINGLE-WINE FLIGHTS ARE A RARE CURVEBALL — NEVER ask for variety or origin (blocking validator).** A one-wine question almost never appears (Paper 3 only, roughly 1 question in 20), and when it does the lone wine is a big CURVEBALL (e.g. a Georgian Qvevri, an orange wine). Do NOT ask the candidate to identify the grape variety or the region/origin — the answer would be unguessable and the exam does not test it. Ask instead for STYLE, how the wine was made, QUALITY evaluation, or COMMERCIAL / global-positioning evaluation. Prefer a 2+ wine flight; only draw a single wine when it is a genuine curveball framed this way. Also NEVER build the hybrid structure where wines 1–2 share a sub-part block and wine 3 gets its own private block — either present the shared wines as an explicit paired comparison, or give the whole flight the same sub-parts.

## SHARED-ATTRIBUTE SCAFFOLDING (same-variety / same-country / same-region flights — violation = automatic failure)
When the preamble states a SHARED attribute (e.g. "made from the same single grape variety", "from the same country"), the sub-question identifying that shared attribute is asked ONCE, flight-wide — never once per wine. Use the real exam's addressee scaffolding, which the corpus uses in virtually every same-variety flight:

With reference to both wines: [or "With reference to all N wines:"]
a) Identify the grape variety. (10 marks)
For each wine:
b) Identify the origin as closely as possible. (2 x 8 marks)
c) Comment on quality and commercial position. (2 x 7 marks)

- The shared part carries a FLAT mark value (no "N x" multiplier); per-wine parts keep the "(N x M marks)" form under a "For each wine:" line.
- NEVER write "a) Identify the grape variety and region of origin. (2 x 10 marks)" on a same-variety flight — that pays the candidate twice for one shared answer. No real stem does this, and a blocking validator rejects it.
- Do NOT combine the shared attribute with per-wine attributes in one part. The historical corpus occasionally did ("For both wines: a) Identify the country of origin and grape variety. (25 marks)") but a single 25-mark identification part breaches the 10-mark cap above and is auto-rejected — keep the shared attribute in its own flat part and ask the varying attributes per-wine.
- Marks must still total 25 per wine — the flat shared marks divide equally across the flight.

## ASKS THE EXAM NEVER MAKES (reviewer-binned phrasings — do not use)
Verified against all 162 historical stems (zero occurrences of any of these):
- Never ask **how the bubbles/sparkle/mousse were created** — no real stem mentions bubbles at all. Ask "comment on the method of production"; the mechanism belongs in the answer.
- Never ask the candidate to **cite/state an official quality designation or classification** — knowing and stating it unprompted is part of what earns the marks.
- Never name a **mechanism pair** in an ask ("comment on the role of autolysis and dosage") — ask about the method, or at most one topic ("discuss the role of yeast"), and let the candidate surface the mechanisms.
These are also enforced by a blocking validator; a stem using them is redrafted.

## SUB-BULLET LENGTH & ASK DENSITY (match real MW paper terseness)
Real MW sub-bullets are short and ask one or two things. A candidate has ~8 minutes per written answer, so a bullet that bundles five demands into sixty words is unanswerable and gets rewritten.
- At most **3 asks per sub-bullet**, and aim for **1-2**. An "ask" is a distinct interrogative demand: "assess the quality and the method of production" is 2 asks. Never bundle oak, yeast, maturity, quality and origin into one bullet — give each its own sub-bullet.
- Keep each sub-bullet's length proportional to its marks: **<=5 marks -> <=25 words; 6-12 marks -> <=35 words; 13-24 marks -> <=45 words; >=25 marks -> <=60 words**.
- Numerical "state the residual sugar / alcohol" bullets (2 marks) are a **single line, <=15 words, exactly one ask**.
- The WHOLE question (preamble + every sub-bullet, excluding the wine list) must stay **under 140 words**.

## OLD WORLD / NEW WORLD BALANCE (flights of 3+ wines, except same-origin families)
Unless the stem ties the flight to ONE country or region (a same-country or same-region question),
a flight of 3 or more wines MUST NOT be entirely Old World or entirely New World. Real F1/F4/F6
flights mix the two roughly 60%+ of the time (EK-0099): the Old/New contrast is one of the exam's
main discriminators, because it forces the candidate to read ripeness, oak handling and acid
structure rather than recite an appellation.

Old World = France, Italy, Spain, Portugal, Germany, Austria, Greece, Hungary and the rest of
Europe, plus Georgia and Lebanon. New World = USA, Australia, New Zealand, Chile, Argentina, South
Africa, Canada, Uruguay.

So: if you have picked three European wines, replace one with a credible New World counterpart that
still fits the stem — a Central Otago Pinot against Burgundy, a Swartland Chenin against Vouvray, an
Eden Valley Riesling against the Mosel. This is checked and a single-world flight is rejected.

## MARK EMPHASIS FOR THIS PAPER (match the modern 2018–2025 shape — EK-0098)
${markEmphasis}
Across any paper: identification parts (any sub-question whose text says "Identify the grape variety /
region / country / origin") are HARD-CAPPED by a blocking validator, and the caps are tight:
- No single identification part may exceed **10 marks** per instance.
- Identification parts may total at most **50% of the paper's marks when every wine is a mainstream
  benchmark**, and only **35% the moment the flight contains even ONE curveball or hard-to-place
  wine**. You cannot reliably predict which wines the auditor will class as curveballs, so treat
  **35% as the working ceiling**: the safe shape is **8 identification marks per wine (32%)**, which
  passes both caps in every flight composition.
Commercial should appear in most questions (never 0% of marks); include a compare/contrast item
(20–36 marks) where the flight invites it.

HOW THAT PERCENTAGE IS COUNTED — read this before allocating marks. A sub-question is scored as
identification if it mentions identification AT ALL, and then ALL of its marks count as ID. There is
no partial credit for a sub-question that asks for other things too. So this fails at 100% ID:
  a) Identify the variety and region, and assess the quality and commercial appeal. (2 x 25 marks)
even though it looks half-and-half. Put identification in its OWN sub-question and give the other
assessments their own, so the split is visible in the mark allocation:
  a) Identify the grape variety and region of origin as closely as possible. (2 x 8 marks)
  b) Comment on the style and the key winemaking decisions behind each wine. (2 x 9 marks)
  c) Assess quality, maturity and commercial position. (2 x 8 marks)
That is 32% ID and passes both caps. Merging identification into every sub-question, or pouring more
than a third of the paper into "Identify the …" parts, is the single most common reason a draft is
rejected.

## CURVEBALL DENSITY BY FAMILY (EK-0100)
- F1 (same variety): keep it banker-clean — every wine should be a confidently identifiable benchmark of the stated variety; no curveballs.
- F5 (method) / F6 (style) / any Paper 3 flight: expect at least one genuinely harder wine — the difficulty is the point.
- ~54% of real flights are all-anchor, so do NOT force a curveball into F1/F2/F7; but do not make an F5/F6/P3 flight all-banker either.

## STYLE SUB-QUESTIONS (MANDATORY — include in most questions)
"Style" is one of the most common sub-question types in the MW exam. It appears in 60+ questions across the corpus, and in nearly EVERY question in 2024-2025. The generation system must include style questions.

Common style phrasings from recent exams (use these as templates):
- "Comment on the style, quality, and commercial position" (combined — most common in 2024-2025)
- "Comment on the style and quality"
- "Discuss how climate and winemaking techniques have influenced the quality and style"
- "Comment on the style of the wine with reference to the relative importance of human inputs versus natural factors"
- "Compare and contrast the styles and consumer appeal"
- "Comment on the style, winemaking and quality"

At least ONE sub-question should reference "style" unless the question is purely identification-focused. This reflects the modern exam's emphasis on style convergence and differentiation.

Weight recent exam years (2021-2025) more heavily when designing sub-questions. The exam is evolving — style questions barely existed before 2016 but now appear on nearly every question.

## CRITICAL OUTPUT RULES
1. NO markdown formatting in the question stem. No **bold**, no *italic*, no &nbsp;. Plain text only.
2. Sub-questions use: a) b) c) d). NOT (a), NOT **(a)**.
3. Marks shown as: (15 marks) or (4 x 8 marks). Plain parentheses, no bold.
4. The question reads like it would appear on a printed exam paper.
5. Metadata must never reveal the answer. Family is only the code (F1-F7). Subcategory describes structure only and must not contain a country, region, appellation, producer, grape variety, or parenthetical answer clue.
6. If you self-correct during reasoning (e.g., replacing a wine that contradicts a constraint), the FINAL output must reflect the correction SILENTLY — print the replacement wine on its own. Never output a pre-correction wine, and never annotate the swap: no "excluded", "replacing:", "CORRECTION APPLIED", "wait", or "see reasoning" anywhere in the wine list. A reader must not be able to tell a wine was ever changed.
7. Every written sub-question must be worth at least 5 marks. Only "State RS" or "State ABV" can be 2-3 marks.

## FINAL SELF-CHECK (run this before output; if any check fails, FIX the wines and output the corrected version)
Work these silently, or write them out under ## Paper Scope Check if you need them on the page. They must NEVER be written into the ## Wines block — a wine line that reads "Spain ✓" or "Sparkling ✓" is a self-check verdict standing where a wine should be, and the flight is unusable.
- If the stem says "N different countries": list each wine's country — they MUST be N genuinely DISTINCT countries (two wines from the USA do NOT satisfy "four different countries").
- If the stem says "same single grape variety": every wine MUST be genuinely single-varietal — the same one grape, not merely the dominant grape. A Cabernet-dominant Pauillac, a Châteauneuf-du-Pape, a Super Tuscan or any other blend-normed wine is NOT single-varietal and will be rejected. Additionally, every wine's variety must be identifiable from its name or appellation: write the variety into the wine name where the producer labels it that way (e.g. "Henschke, Hill of Grace Shiraz", "Torbreck, The Struie Shiraz"), or use a varietal appellation (Barolo, Chablis, Sancerre, Chinon).
- If the stem says "different grape varieties" (and not "predominantly"): every wine's dominant grape MUST be distinct — no repeats.
- If the stem says "same country": every wine MUST be from that one country.
- Marks MUST total 25 per wine.
A question that fails any of these is INVALID and will be rejected by the validator — do not output it.`;

  // The candidate has chosen to drill one grape. Hold the variety fixed and move the contrast onto
  // origin/style/maturity — a stem that asks for "different varieties" is simply the wrong stem here.
  const varietyConstraint = variety
    ? `

## MANDATORY VARIETY CONSTRAINT — overrides any conflicting instruction below

The candidate is drilling ${variety}. EVERY wine in this flight MUST have ${variety} as its dominant grape (>50% of the blend, or the grape the appellation mandates — e.g. Chablis for Chardonnay).

- Build the pedagogical contrast from ORIGIN, climate, style, oak, maturity, quality tier or price. NOT from the grape.
- Do NOT write a stem that implies differing varieties ("each from a different grape variety", "different varieties from the same country"). Choose a stem whose logic holds for a single-variety flight.
- Do NOT satisfy this by naming ${variety} in the stem — the stem must stay blind. The constraint governs the WINES.
- If ${variety} cannot plausibly fill a Paper ${paper} flight, output exactly CONSTRAINT_IMPOSSIBLE and nothing else.
`
    : "";

  const user = `Generate ONE exam question for Paper ${paper}${family !== "any" ? `, type ${family}` : ""}.${varietyConstraint}

Output in this EXACT format:

## Question

[Plain text question stem with lettered sub-questions and marks in parentheses]

## Wines

1. [Producer, Cuvee, Vintage. Region, Country. (ABV%)]
2. ...

Each numbered line is MACHINE-PARSED as one wine reference and is shown to the candidate verbatim. A line must hold the finished wine and NOTHING else: no commentary, no markdown, no ticks or crosses, no rejected alternatives, no dedup or correction notes, no ellipsis. If you weighed several wines for a slot, only the winner appears here — the weighing-up belongs in ## Generation Reasoning. Every line must be complete (never truncated mid-word) and must end on the country, followed by the ABV parenthetical if you have it.
BAD: **Spain** — Amontillado Sherry (Palomino, oxidative) — Barbadillo VORS is non-banned ✓. But VORS is quite special...
BAD: Chambers Rosewood — wait, excluded. Let me correct.
BAD: Stanton & Killeen has been excluded — replacing: Yalumba Museum Reserve Muscat NV. Rutherglen, Victoria, Australia. (18%)
BAD: Weingut Dr. Loosen, Erdener Treppchen Riesling — CORRECTION APPLIED — see reasoning.
BAD: Spain ✓
GOOD: Yalumba, Museum Reserve Muscat, NV. Rutherglen, Victoria, Australia. (18%)
${paper === 3 ? `
## Wine Appearance

For each wine, describe ONLY what the candidate would see in the glass before smelling or tasting — the visual cues a real candidate observes before picking up the glass. This replicates the real exam experience where candidates can see the wines.

1. [Brief visual description: color, clarity, bubbles if present, viscosity/legs. 10-20 words max.]
2. ...

RULES for appearance notes:
- Describe ONLY visual observations — no aroma, no taste, no wine-type labels.
- Do NOT name the wine category (do not say "fortified", "sparkling", "sweet", etc.).
- DO mention: color (pale lemon, deep gold, amber, tawny, ruby, garnet, salmon pink, etc.), clarity, bubbles/mousse if present, viscosity/tears.
- Be accurate for the SPECIFIC wine you selected — a 10-Year Tawny Port looks different from a Rutherglen Muscat. An old-vine concentrated Syrah is NOT "pale ruby." A Vin Santo is NOT "pale gold." Base your description on what THIS wine actually looks like, not a generic version of the variety.
- If you know the wine's structural profile (e.g., style, oak treatment, RS level, quality tier), use that knowledge to inform the visual description.
- Keep each note to one line, 10-20 words.
` : ''}
## Metadata

- Paper: ${paper}
- Family: [F1-F7 only, no label text]
- Subcategory: [structure only; no country, region, appellation, producer, grape variety, or answer clue]
- Variety: [the key variety/varieties]
- Countries: [list]
- Curveball: [which wine and why, or "None"]
- CurveballLevel: [low | medium | high — the overall difficulty of this flight]
- WineCategory: [sparkling | rose | fortified | sweet | oxidative | orange | still_white | still_red — the single category ALL wines in this flight belong to]
- CrossCategoryIntentional: [true ONLY if the stem explicitly and deliberately frames a comparison ACROSS two wine categories; otherwise false. If true, the stem must itself justify the cross-category contrast.]

## Generation Reasoning

[2-4 sentences explaining: Why this question structure? Why these wines? What constraint trade-offs did you make? What examiner principle does this question test? This field is stored for debugging — be honest about your choices.]

## Paper Scope Check

[Confirm: "All ${paper === 1 ? 'wines are white still wines' : paper === 2 ? 'wines are red still wines' : 'wines are sparkling/fortified/sweet/rosé/oxidative'} — VERIFIED." List each wine and its color/type to prove compliance.]`;

  return { cachedPrefix, system, user };
}
