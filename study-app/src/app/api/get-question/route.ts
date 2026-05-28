import {
  getQuestionsByFilter,
  getRecentAttempts,
  getRecentGeneratedQuestions,
  getUnansweredQuestions,
  type GeneratedQuestion,
} from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { saveGeneratedQuestion } from "@/lib/db";
import { buildQuestionGenerationPrompt } from "@/lib/prompts/question-generation-prompt";
import { enrichWineProfiles } from "@/lib/wine-enrichment";
import { neon } from "@neondatabase/serverless";
import { getLatestOpus } from "@/lib/model-resolver";
import { buildModelAnswerPrompt } from "@/lib/prompts/model-answer-prompt";
import { requireApiKey } from "@/lib/api-key";

export const runtime = "nodejs";
export const maxDuration = 300;

const FAMILY_LABELS: Record<string, string> = {
  F1: "Same Variety",
  F2: "Same Origin",
  F3: "Blend Logic",
  F4: "Mixed Breadth",
  F5: "Method / Production",
  F6: "Style Mechanism",
  F7: "Quality Hierarchy",
};

type QuestionCandidate = {
  family: string;
  familyLabel: string;
  subcategory: string;
  questionText: string;
  wines: { slot: number; fullText: string; appearance?: string }[];
  totalMarks: number;
  generationReasoning: string | null;
};

type NormalizedGeneratedQuestion = Omit<GeneratedQuestion, "wines"> & {
  wines: { slot: number; fullText: string; appearance?: string }[];
};

// Fire-and-forget background model answer generation
function generateModelAnswerInBackground(
  questionId: string,
  questionText: string,
  wines: { slot: number; fullText: string }[],
  paper: number,
  family: string,
  apiKey: string
) {
  (async () => {
    try {
      const client = new Anthropic({ apiKey });
      const opusModel = await getLatestOpus(apiKey);
      const prompt = buildModelAnswerPrompt(questionText, wines, paper);

      const message = await client.messages.create({
        model: opusModel,
        max_tokens: 4000,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });

      const text = message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      const modelAnswer = extractSection(text, "Model Answer", "Proposed Annotation") || text;
      const proposedAnnotation = extractSection(text, "Proposed Annotation", "Reasoning Trace");
      const reasoningTrace = extractSection(text, "Reasoning Trace", "Study Diagram");
      const studyDiagramAssist = extractSection(text, "Study Diagram", null);

      await saveGeneratedQuestion({
        questionId,
        paper,
        family,
        familyLabel: "",
        questionText,
        wines,
        totalMarks: 100,
        modelAnswer,
        proposedAnnotation: proposedAnnotation || undefined,
        reasoningTrace: reasoningTrace || undefined,
        studyDiagramAssist: studyDiagramAssist || undefined,
      });

      console.log(`Background model answer generated for ${questionId}`);
    } catch (err) {
      console.error(`Background model answer failed for ${questionId}:`, err);
    }
  })();
}

function extractSection(
  text: string,
  startHeader: string,
  endHeader: string | null
): string | null {
  const startPattern = new RegExp(
    `#+\\s*\\d*\\.?\\s*${startHeader}[\\s\\S]*?\\n`,
    "i"
  );
  const startMatch = text.match(startPattern);
  if (!startMatch) return null;

  const startIdx = text.indexOf(startMatch[0]) + startMatch[0].length;

  if (endHeader) {
    const endPattern = new RegExp(`#+\\s*\\d*\\.?\\s*${endHeader}`, "i");
    const remaining = text.slice(startIdx);
    const endMatch = remaining.match(endPattern);
    if (endMatch) {
      return remaining.slice(0, remaining.indexOf(endMatch[0])).trim();
    }
  }

  return text.slice(startIdx).trim();
}

async function ensureP3Appearances(question: GeneratedQuestion, apiKey: string): Promise<GeneratedQuestion> {
  if (question.paper !== 3) return question;
  const wines = typeof question.wines === "string" ? JSON.parse(question.wines) : question.wines;
  const hasAppearances = wines.some((w: { appearance?: string }) => w.appearance);
  if (hasAppearances) return question;

  try {
    const client = new Anthropic({ apiKey });
    const wineList = wines.map((w: { slot: number; fullText: string }) => `${w.slot}. ${w.fullText}`).join("\n");
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: `For each wine, describe ONLY what a candidate would see in the glass — color, clarity, bubbles if present, viscosity. No aromas, no tastes, no wine-type labels. Be accurate for the specific wine. One line per wine, 10-20 words. Output as JSON array: [{"slot":1,"appearance":"..."},...]`,
      messages: [{ role: "user", content: `Generate visual appearance notes:\n${wineList}` }],
    });
    const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const appearances = JSON.parse(match[0]) as { slot: number; appearance: string }[];
      for (const a of appearances) {
        const wine = wines.find((w: { slot: number }) => w.slot === a.slot);
        if (wine) wine.appearance = a.appearance;
      }
      // Save back to DB
      const sql = neon(process.env.DATABASE_URL!);
      await sql`UPDATE generated_questions SET wines = ${JSON.stringify(wines)} WHERE question_id = ${question.question_id}`;
      return { ...question, wines };
    }
  } catch (err) {
    console.error("Failed to generate P3 appearances:", err);
  }
  return question;
}

function getWineCount(q: GeneratedQuestion): number {
  const wines = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
  return Array.isArray(wines) ? wines.length : 0;
}

function pickFlightSizeAware(questions: GeneratedQuestion[], family?: string): GeneratedQuestion {
  if (questions.length <= 1) return questions[0];

  // For families where 4-wine is over-represented, prefer non-4-wine options
  const preferSmaller = !family || family === "any" || ["F1", "F2", "F5", "F7"].includes(family);

  if (preferSmaller) {
    const nonFour = questions.filter((q) => getWineCount(q) !== 4);
    if (nonFour.length > 0) {
      return nonFour[Math.floor(Math.random() * nonFour.length)];
    }
  }

  return questions[Math.floor(Math.random() * questions.length)];
}

export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;
    const userApiKey = keyResult.apiKey;

    const { paper, family, forceFresh } = await request.json();

    if (!paper) {
      return Response.json({ error: "Missing paper" }, { status: 400 });
    }

    // Skip bank and generate fresh if requested
    if (forceFresh) {
      console.log(`Force fresh question requested for P${paper} ${family || "any"}`);
      return generateFreshQuestion(paper, family, userApiKey);
    }

    // PRIORITY 1: Unanswered banked questions with model answers ready (instant, best UX)
    // Prefer non-4-wine flights for families that are over-indexed on 4-wine
    const unanswered = await getUnansweredQuestions(paper, family);
    if (unanswered.length > 0) {
      let picked = pickFlightSizeAware(unanswered, family);
      picked = await ensureP3Appearances(picked, userApiKey);
      console.log(`Serving unanswered banked question: ${picked.question_id} (${getWineCount(picked)} wines)`);
      return Response.json({
        source: "pre-populated",
        question: sanitizeQuestionMetadata(picked),
        hasModelAnswer: true,
      });
    }

    // PRIORITY 2: Previously answered but stale (seen 7+ others since last attempt)
    const available = await getQuestionsByFilter(paper, family);
    const recentAttempts = await getRecentAttempts(100);

    const categoryAttempts = recentAttempts
      .filter((a) => a.paper === paper && (family === "any" || !family || a.family === family))
      .map((a) => a.question_id);

    const staleWithAnswers = available.filter((q) => {
      if (!q.model_answer || q.model_answer.length < 100) return false;
      const lastSeenIdx = categoryAttempts.indexOf(q.question_id);
      if (lastSeenIdx === -1) return false;
      return lastSeenIdx >= 7;
    });

    if (staleWithAnswers.length > 0) {
      let picked = pickFlightSizeAware(staleWithAnswers, family);
      picked = await ensureP3Appearances(picked, userApiKey);
      console.log(`Serving stale banked question: ${picked.question_id} (${getWineCount(picked)} wines)`);
      return Response.json({
        source: "pre-populated",
        question: sanitizeQuestionMetadata(picked),
        hasModelAnswer: true,
      });
    }

    // PRIORITY 3: Generate fresh on the fly
    return generateFreshQuestion(paper, family, userApiKey);
  } catch (err) {
    console.error("get-question error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

async function generateFreshQuestion(paper: number, family: string | undefined, apiKey: string) {
  const client = new Anthropic({ apiKey });

  // Pull existing wines from the bank for deduplication
  const allQuestions = await getQuestionsByFilter(paper);
  const existingWines: string[] = [];
  for (const q of allQuestions) {
    const wines = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
    for (const w of wines) {
      existingWines.push(w.fullText);
    }
  }

  const recentGenerated = await getRecentGeneratedQuestions(5);
  const latestQuestion = recentGenerated[0] ? normalizeGeneratedQuestionWines(recentGenerated[0]) : null;
  const prompt = await buildQuestionGenerationPrompt(
    paper,
    family || "any",
    existingWines,
    latestQuestion
      ? {
          questionText: latestQuestion.question_text,
          wines: latestQuestion.wines,
          paper: latestQuestion.paper,
          family: latestQuestion.family,
        }
      : null
  );

  let parsed: ReturnType<typeof parseGeneratedQuestion> = null;
  let validation:
    | {
        paperScopeCheck: ReturnType<typeof validatePaperScope>;
        varietyCheck: ReturnType<typeof validateVarietyConsistency>;
        markCheck: ReturnType<typeof validateMarkAllocation>;
        originDiversityCheck: ReturnType<typeof validateOriginDiversity>;
        countryDiversityCheck: ReturnType<typeof validateCountryDiversity>;
        bankerCheck: ReturnType<typeof validateBankerMinimum>;
        flightSizeCheck: ReturnType<typeof validateFlightSize>;
        noveltyCheck: ReturnType<typeof validateNoveltyAgainstLatest>;
      }
    | null = null;
  let lastViolations: string[] = [];

  const MAX_ATTEMPTS = 8;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const model = attempt === 1 ? await getLatestOpus(apiKey) : "claude-sonnet-4-6";
    let message;
    try {
      message = await client.messages.create({
        model,
        max_tokens: 2000,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
    } catch (modelErr: unknown) {
      if (model !== "claude-sonnet-4-6" && modelErr instanceof Error && modelErr.message?.includes("404")) {
        console.warn(`${model} not available, falling back to claude-sonnet-4-6`);
        message = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
        });
      } else {
        throw modelErr;
      }
    }

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const candidate = parseGeneratedQuestion(text, paper, family || "F4");

    if (!candidate) {
      lastViolations = ["Failed to parse generated question"];
      console.error(`Generation attempt ${attempt}/${MAX_ATTEMPTS} failed: parse error`);
      continue;
    }

    // Critical validators (always run)
    const paperScopeCheck = validatePaperScope(paper, candidate.wines);
    const varietyCheck = validateVarietyConsistency(candidate.questionText, candidate.wines);
    const markCheck = validateMarkAllocation(candidate.questionText, candidate.wines.length);

    // Important validators (relax on attempt 6+)
    const relaxImportant = attempt >= 6;
    const originDiversityCheck = relaxImportant
      ? { valid: true, violations: [] }
      : validateOriginDiversity(candidate.questionText, candidate.wines, candidate.family, candidate.subcategory);
    const countryDiversityCheck = validateCountryDiversity(candidate.questionText, candidate.wines);

    // Nice-to-have validators (relax on attempt 4+)
    const relaxNiceToHave = attempt >= 4;
    const bankerCheck = relaxNiceToHave
      ? { valid: true, violations: [] }
      : validateBankerMinimum(candidate.wines);
    const flightSizeCheck = relaxNiceToHave
      ? { valid: true, violations: [] }
      : validateFlightSize(candidate.family, paper, candidate.wines.length);
    const noveltyCheck = relaxNiceToHave
      ? { valid: true, violations: [] }
      : validateNoveltyAgainstLatest(candidate, latestQuestion, recentGenerated.map(normalizeGeneratedQuestionWines));

    lastViolations = [
      ...paperScopeCheck.violations,
      ...varietyCheck.violations,
      ...markCheck.violations,
      ...originDiversityCheck.violations,
      ...countryDiversityCheck.violations,
      ...bankerCheck.violations,
      ...flightSizeCheck.violations,
      ...noveltyCheck.violations,
    ];

    if (lastViolations.length === 0) {
      parsed = candidate;
      validation = { paperScopeCheck, varietyCheck, markCheck, originDiversityCheck, countryDiversityCheck, bankerCheck, flightSizeCheck, noveltyCheck };
      if (attempt > 1) console.log(`Generation retry ${attempt} succeeded (relaxed=${relaxNiceToHave ? "nice-to-have" : relaxImportant ? "important" : "none"})`);
      break;
    }

    console.error(`Generation attempt ${attempt}/${MAX_ATTEMPTS} failed:`, JSON.stringify(lastViolations));
  }

  // Fallback: if generation failed, serve ANY banked question rather than showing an error
  if (!parsed || !validation) {
    console.error("All generation attempts failed, falling back to any banked question");
    const fallback = await getQuestionsByFilter(paper);
    const withAnswers = fallback.filter((q) => q.model_answer && q.model_answer.length > 100);
    if (withAnswers.length > 0) {
      const picked = withAnswers[Math.floor(Math.random() * withAnswers.length)];
      return Response.json({
        source: "pre-populated",
        question: sanitizeQuestionMetadata(picked),
        hasModelAnswer: true,
      });
    }
    // Absolute last resort: serve without model answer
    if (fallback.length > 0) {
      const picked = fallback[Math.floor(Math.random() * fallback.length)];
      return Response.json({
        source: "pre-populated",
        question: sanitizeQuestionMetadata(picked),
        hasModelAnswer: false,
      });
    }
    return Response.json({ error: "No questions available. Please try again." }, { status: 500 });
  }

  const questionId = `gen_p${paper}_${family || "any"}_${Date.now()}`;
  const saved = await saveGeneratedQuestion({
    questionId,
    paper,
    family: parsed.family,
    familyLabel: parsed.familyLabel,
    subcategory: parsed.subcategory,
    questionText: parsed.questionText,
    wines: parsed.wines,
    totalMarks: parsed.totalMarks,
    metadata: {
      generatedOnTheFly: true,
      generationReasoning: parsed.generationReasoning,
      paperScopeCheck: validation.paperScopeCheck,
      varietyCheck: validation.varietyCheck,
      markCheck: validation.markCheck,
      originDiversityCheck: validation.originDiversityCheck,
      countryDiversityCheck: validation.countryDiversityCheck,
      bankerCheck: validation.bankerCheck,
      flightSizeCheck: validation.flightSizeCheck,
      noveltyCheck: validation.noveltyCheck,
    },
  });

  // Fire-and-forget: enrich wine profiles in background
  enrichWineProfiles(questionId, parsed.wines, apiKey).catch((err) =>
    console.error("Wine enrichment background error:", err)
  );

  generateModelAnswerInBackground(
    questionId,
    parsed.questionText,
    parsed.wines,
    paper,
    parsed.family,
    apiKey
  );

  return Response.json({
    source: "generated",
    question: sanitizeQuestionMetadata(saved),
    hasModelAnswer: false,
  });
}

const WHITE_GRAPE_INDICATORS = /\b(chardonnay|sauvignon\s*blanc|riesling|pinot\s*gri[gs]|gewurz|muscat|moscato|viognier|chenin|semillon|albarino|gruner|verdejo|vermentino|soave|garganega|torrontes|fiano|greco|arneis|cortese|marsanne|roussanne|picpoul|muscadet|melon\s*de\s*bourgogne|blanc\s*de\s*blancs|prosecco|glera|palomino|pedro\s*xim[eé]nez|furmint|sercial|verdelho|malvasia|bual|assyrtiko|welschriesling|vidal)\b/i;
const RED_GRAPE_INDICATORS = /\b(cabernet\s*sauvignon|merlot|pinot\s*noir|syrah|shiraz|grenache|garnacha|tempranillo|sangiovese|nebbiolo|malbec|zinfandel|primitivo|mourvedre|carignan|barbera|dolcetto|touriga|tannat|carmenere|pinotage|gamay|blaufr[aä]nkisch|lemberger|zweigelt|aglianico|nero\s*d.avola|nerello|lagrein|cannonau|xinomavro|cabernet\s*franc|cinsault|monastrell|tinta\s*negra|tinta\s*roriz|touriga\s*nacional|touriga\s*franca|baga)\b/i;

const APPELLATION_TO_PRIMARY_VARIETY: { pattern: RegExp; variety: string }[] = [
  { pattern: /\b(barolo|barbaresco|gattinara|ghemme|carema|valtellina|sforzato)\b/i, variety: "nebbiolo" },
  { pattern: /\b(chianti|brunello|vino\s+nobile|morellino|montepulciano)\b/i, variety: "sangiovese" },
  { pattern: /\b(etna\s+rosso)\b/i, variety: "nerello mascalese" },
  { pattern: /\b(taurasi)\b/i, variety: "aglianico" },
  { pattern: /\b(valpolicella|amarone|ripasso|bardolino)\b/i, variety: "corvina blend" },
  { pattern: /\b(barbera)\b/i, variety: "barbera" },
  { pattern: /\b(dolcetto)\b/i, variety: "dolcetto" },
  { pattern: /\b(beaujolais|fleurie|morgon|moulin-a-vent|brouilly)\b/i, variety: "gamay" },
  { pattern: /\b(sherry|fino|manzanilla|amontillado|oloroso|palo\s*cortado)\b/i, variety: "palomino" },
  { pattern: /\b(madeira|malmsey|rainwater)\b/i, variety: "tinta negra" },
  { pattern: /\b(tokaj|tokaji|aszu|szamorodni)\b/i, variety: "furmint" },
  { pattern: /\b(sauternes|barsac)\b/i, variety: "semillon blend" },
  { pattern: /\b(port\b|vintage\s*port|lbv|tawny\s*\d+|ruby\s*port|vintage\s*port|colheita)\b/i, variety: "touriga nacional blend" },
  { pattern: /\b(banyuls|maury|rivesaltes)\b/i, variety: "grenache" },
  { pattern: /\b(rutherglen)\b/i, variety: "muscat" },
  { pattern: /\b(muscadet)\b/i, variety: "melon de bourgogne" },
  { pattern: /\b(burgundy|bourgogne|gevrey|chambolle|vosne|pommard|volnay)\b/i, variety: "pinot noir" },
  { pattern: /\b(rioja|ribera\s+del\s+duero)\b/i, variety: "tempranillo" },
  { pattern: /\b(cote-rotie|cornas|hermitage|crozes-hermitage|saint-joseph)\b/i, variety: "syrah" },
  { pattern: /\b(chateauneuf-du-pape|gigalondas|vacqueyras)\b/i, variety: "grenache blend" },
];

function detectPrimaryVariety(fullText: string): string {
  const text = fullText.toLowerCase();
  const whiteMatch = text.match(WHITE_GRAPE_INDICATORS);
  const redMatch = text.match(RED_GRAPE_INDICATORS);
  const direct = (whiteMatch?.[0] || redMatch?.[0])?.toLowerCase().trim();
  if (direct) return normalizeVariety(direct);

  const appellationMatch = APPELLATION_TO_PRIMARY_VARIETY.find((entry) => entry.pattern.test(text));
  return appellationMatch ? appellationMatch.variety : "unknown";
}

function normalizeVariety(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace("shiraz", "syrah")
    .replace("garnacha", "grenache")
    .replace("pinot gris", "pinot grigio")
    .replace("nerello", "nerello mascalese")
    .trim();
}

function validatePaperScope(paper: number, wines: { slot: number; fullText: string }[]): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const wine of wines) {
    const text = wine.fullText.toLowerCase();
    if (paper === 1) {
      if (RED_GRAPE_INDICATORS.test(text)) {
        violations.push(`Wine ${wine.slot}: "${wine.fullText}" appears to be a red wine in Paper 1 (whites only)`);
      }
      const hasNonStillIndicator = /\b(sparkling|champagne|cava|prosecco|cremant|sekt|brut|pétillant|mousseux|spumante|méthode\s*traditionnelle|blanc\s*de\s*blancs|blanc\s*de\s*noirs|fortified|sherry|port|madeira|marsala|vin\s*santo)\b/i.test(text);
      if (hasNonStillIndicator) {
        violations.push(`Wine ${wine.slot}: "${wine.fullText}" appears to be sparkling/fortified in Paper 1 (still wines only)`);
      }
    } else if (paper === 2) {
      if (WHITE_GRAPE_INDICATORS.test(text)) {
        violations.push(`Wine ${wine.slot}: "${wine.fullText}" appears to be a white wine in Paper 2 (reds only)`);
      }
      const hasNonStillIndicator = /\b(sparkling|champagne|cava|prosecco|cremant|sekt|brut|pétillant|mousseux|spumante|méthode\s*traditionnelle|fortified|sherry|port|madeira|marsala)\b/i.test(text);
      if (hasNonStillIndicator) {
        violations.push(`Wine ${wine.slot}: "${wine.fullText}" appears to be sparkling/fortified in Paper 2 (still wines only)`);
      }
    } else if (paper === 3) {
      const isWhiteGrape = WHITE_GRAPE_INDICATORS.test(text);
      const isRedGrape = RED_GRAPE_INDICATORS.test(text);
      const hasSpecialIndicator = /\b(sparkling|champagne|cava|prosecco|cremant|sekt|brut|blanc\s*de|rose|rosé|fortified|sherry|port|madeira|marsala|vin\s*santo|tokaj|aszu|sauternes|barsac|beerenauslese|trockenbeerenauslese|auslese|spätlese|kabinett|ice\s*wine|eiswein|passito|recioto|amarone|brachetto|moscato|muscat|rutherglen|maury|banyuls|rivesaltes|pedro\s*ximenez|oloroso|amontillado|manzanilla|fino|palo\s*cortado|VDN|vin\s*doux|late\s*harvest|botrytis|noble\s*rot|vendange\s*tardive|SGN|szamorodni|tawny|rimage|ruby|vintage|colheita|cream|dry\s*sack)\b/i.test(text);
      const abvMatch = text.match(/\((\d+(?:\.\d+)?)%(?:\s*abv)?\)/);
      const abv = abvMatch ? parseFloat(abvMatch[1]) : null;
      const isLikelySweet = abv !== null && abv <= 10;
      const isLikelyFortified = abv !== null && abv >= 15;
      if ((isWhiteGrape || isRedGrape) && !hasSpecialIndicator && !isLikelySweet && !isLikelyFortified) {
        violations.push(`Wine ${wine.slot}: "${wine.fullText}" appears to be a standard still wine in Paper 3 (sparkling/fortified/sweet/rosé/oxidative only)`);
      }
    }
  }
  return { valid: violations.length === 0, violations };
}

const KNOWN_BLEND_INDICATORS = /\b(tawny\s*(port|\d+\s*year)|ruby\s*port|lbv|vintage\s*port|champagne\s*(brut|nv|vintage|rose)|cremant|cava|franciacorta|prosecco|chateauneuf|cdp|gigondas|vacqueyras|bordeaux|medoc|haut-medoc|pauillac|margaux|saint-julien|saint-estephe|saint-emilion|pomerol|pessac|graves|cotes\s*du\s*rhone|gsm|meritage|ripasso|amarone|valpolicella)\b/i;

function isLikelyBlend(fullText: string): boolean {
  const text = fullText.toLowerCase();
  if (KNOWN_BLEND_INDICATORS.test(text)) return true;
  const variety = detectPrimaryVariety(fullText);
  if (variety.includes("blend")) return true;
  return false;
}

function validateVarietyConsistency(questionText: string, wines: { slot: number; fullText: string }[]): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const stemSaysOneVariety = /same single grape variety/i.test(questionText);

  if (stemSaysOneVariety) {
    const wineVarieties = wines.map((wine) => ({
      slot: wine.slot,
      variety: detectPrimaryVariety(wine.fullText),
      text: wine.fullText,
    }));
    const detected = wineVarieties.filter((w) => w.variety !== "unknown");
    const undetected = wineVarieties.filter((w) => w.variety === "unknown");
    const uniqueVarieties = [...new Set(detected.map((w) => w.variety))];

    if (uniqueVarieties.length > 1) {
      violations.push(`Stem says "same single grape variety" but wines contain multiple varieties: ${uniqueVarieties.join(", ")}`);
    }

    // Flag wines where variety cannot be detected — suspicious in a same-variety flight
    for (const w of undetected) {
      violations.push(
        `Wine ${w.slot} ("${w.text}") — variety undetectable in a same-variety flight. Every wine's name or appellation must clearly map to the declared variety.`
      );
    }

    // Name-label cross-check: scan each wine's text for ANY grape name that contradicts the flight variety
    const flightVariety = uniqueVarieties[0] || null;
    if (flightVariety) {
      const allGrapePatterns = [WHITE_GRAPE_INDICATORS, RED_GRAPE_INDICATORS];
      for (const wine of wines) {
        const text = wine.fullText.toLowerCase();
        for (const pattern of allGrapePatterns) {
          const matches = text.match(new RegExp(pattern.source, "gi"));
          if (matches) {
            for (const match of matches) {
              const normalized = normalizeVariety(match.trim());
              if (normalized !== flightVariety && normalized !== "unknown") {
                violations.push(
                  `Wine ${wine.slot} name contains "${match.trim()}" which is a different variety than the flight variety "${flightVariety}". Wine labels must not contradict the same-variety constraint.`
                );
              }
            }
          }
        }
      }
    }
  }

  const stemSaysEachSingleVariety = /\beach\b.*\b(single|one)\s*(grape\s*)?variet/i.test(questionText)
    || /\bdifferent[,]?\s*(single|predominant)\s*(grape\s*)?variet/i.test(questionText);

  if (stemSaysEachSingleVariety) {
    for (const wine of wines) {
      if (isLikelyBlend(wine.fullText)) {
        violations.push(
          `Stem says each wine is a single grape variety, but Wine ${wine.slot} ("${wine.fullText}") is a known blend category. Single-variety stems require every wine to be genuinely single-varietal.`
        );
      }
    }

    // Check for variety duplicates in "each different variety" flights
    const perWineVarieties = wines.map((w) => ({
      slot: w.slot,
      variety: detectPrimaryVariety(w.fullText),
    }));
    const knownPerWine = perWineVarieties.filter((w) => w.variety !== "unknown");
    const uniquePerWine = new Set(knownPerWine.map((w) => w.variety));
    if (knownPerWine.length >= 2 && uniquePerWine.size < knownPerWine.length) {
      const dupes = [...uniquePerWine].filter(
        (v) => knownPerWine.filter((w) => w.variety === v).length > 1
      );
      violations.push(
        `Stem says each wine is a different variety, but detected duplicates: ${dupes.join(", ")}. Each wine must be a distinct variety.`
      );
    }
  }

  return { valid: violations.length === 0, violations };
}

function validateOriginDiversity(
  questionText: string,
  wines: { slot: number; fullText: string }[],
  family: string,
  subcategory: string
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const combinedText = `${questionText}\n${subcategory}`.toLowerCase();
  const isSameOriginFrame = family === "F2" || /\bsame (country|region|origin)\b/.test(combinedText);
  const explicitlySameVariety = /\bsame (single )?grape variety\b|\bsame variety\b/.test(combinedText);
  const explicitlyLimitedVarietyCount = /\bthere (?:are|is) (?:two|three|four|\d+) (?:single |predominant )?grape variet/.test(combinedText);
  const explicitlyDifferentVarieties = /\bdifferent (?:single |predominant )?grape variet/.test(combinedText);

  if (!isSameOriginFrame || explicitlySameVariety || explicitlyLimitedVarietyCount || wines.length < 3) {
    return { valid: true, violations };
  }

  const knownVarieties = wines
    .map((wine) => ({ slot: wine.slot, variety: detectPrimaryVariety(wine.fullText) }))
    .filter((wine) => wine.variety !== "unknown");
  const uniqueVarieties = new Set(knownVarieties.map((wine) => wine.variety));

  if (knownVarieties.length >= 2 && uniqueVarieties.size < knownVarieties.length) {
    const repeated = [...uniqueVarieties].filter(
      (variety) => knownVarieties.filter((wine) => wine.variety === variety).length > 1
    );
    violations.push(
      `Same-origin question has primary variety overlap (${repeated.join(", ")}). Each wine must represent a distinctly different primary variety — this includes blends whose dominant grape matches another wine's solo variety.`
    );
  }

  if (explicitlyDifferentVarieties && knownVarieties.length === wines.length && uniqueVarieties.size !== wines.length) {
    violations.push("Stem/subcategory says different grape varieties, but detected varieties are not all distinct.");
  }

  return { valid: violations.length === 0, violations };
}

function parseWordNumber(word: string): number | null {
  const map: Record<string, number> = {
    two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  const n = parseInt(word);
  if (!isNaN(n)) return n;
  return map[word.toLowerCase()] ?? null;
}

const BENCHMARK_APPELLATIONS = /\b(premier\s*cru|1er\s*cru|grand\s*cru|cru\s*class[eé]|pauillac|margaux|saint[- ]julien|saint[- ]estephe|saint[- ]emilion|pomerol|pessac[- ]leognan|sauternes|barsac|meursault|puligny[- ]montrachet|chassagne[- ]montrachet|chablis|corton|gevrey[- ]chambertin|chambolle[- ]musigny|vosne[- ]roman[eé]e|nuits[- ]saint|pommard|volnay|barolo|barbaresco|brunello|chianti\s*classico|vino\s*nobile|taurasi|hermitage|cote[- ]rotie|cornas|chateauneuf[- ]du[- ]pape|marlborough|sancerre|pouilly[- ]fum[eé]|vouvray|savennieres|clos\s*ste\s*hune|alsace\s*grand\s*cru|rioja\s*(gran\s*)?reserva|ribera\s*del\s*duero|priorat|vintage\s*port|lbv|tawny\s*\d+|fino|manzanilla|amontillado|oloroso|palo\s*cortado|madeira|tokaj|rutherford|oakville|stags\s*leap|napa\s*valley|sonoma\s*coast|willamette|stellenbosch|hawkes?\s*bay|waipara|clare\s*valley|eden\s*valley|barossa|margaret\s*river|yarra\s*valley|wachau|kamptal)\b/i;

function validateBankerMinimum(
  wines: { slot: number; fullText: string }[]
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  if (wines.length < 3) return { valid: true, violations };

  let bankerCount = 0;
  for (const wine of wines) {
    if (BENCHMARK_APPELLATIONS.test(wine.fullText)) {
      bankerCount++;
    }
  }

  if (bankerCount === 0) {
    violations.push(
      `Flight of ${wines.length} wines has no recognizable benchmark appellation. ` +
      `Every flight of 3+ wines must include at least one banker — a wine from a benchmark ` +
      `appellation (e.g., Premier Cru Burgundy, classified Bordeaux, Barolo, Marlborough, Sancerre) ` +
      `that any MW candidate should identify confidently.`
    );
  }

  return { valid: violations.length === 0, violations };
}

function validateMarkAllocation(questionText: string, wineCount?: number): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Check 25-marks-per-wine rule
  if (wineCount && wineCount > 0) {
    let totalMarks = 0;
    const mult = [...questionText.matchAll(/\((\d+)\s*[x×]\s*(\d+)\s*marks?\)/gi)];
    for (const m of mult) totalMarks += parseInt(m[1]) * parseInt(m[2]);
    const single = [...questionText.matchAll(/\((\d+)\s*marks?\)/gi)];
    for (const m of single) totalMarks += parseInt(m[1]);

    if (totalMarks > 0) {
      const expectedTotal = wineCount * 25;
      if (Math.abs(totalMarks - expectedTotal) > 2) {
        violations.push(
          `Total marks (${totalMarks}) does not equal 25 × ${wineCount} wines (${expectedTotal}). The MW exam allocates exactly 25 marks per wine — no exceptions.`
        );
      }
    }
  }

  // Find per-wine mark allocations like (4 x 2 marks) or (3 x 3 marks)
  const perWineMarks = [...questionText.matchAll(/\((\d+)\s*[x×]\s*(\d+)\s*marks?\)/gi)];
  for (const m of perWineMarks) {
    const perWine = parseInt(m[2]);
    if (perWine <= 4) {
      // Check if the sub-question is a "state RS/ABV" type (allowed at 2-3 marks)
      const idx = questionText.indexOf(m[0]);
      const preceding = questionText.slice(Math.max(0, idx - 150), idx).toLowerCase();
      const isStateQuestion = /\b(state|indicate|estimate)\b.*\b(residual sugar|alcohol|rs|abv|sugar level|alcohol level)\b/.test(preceding)
        || /\b(residual sugar|alcohol level|alcohol %|rs level)\b/.test(preceding);
      if (!isStateQuestion) {
        violations.push(
          `Sub-question "${m[0]}" allocates only ${perWine} marks per wine for a written answer. The MW exam only uses 2-4 marks for numerical "state RS/ABV" answers. Written sub-questions must be at least 5 marks.`
        );
      }
    }
  }
  // Also check single mark allocations
  const singleMarks = [...questionText.matchAll(/\((\d+)\s*marks?\)/gi)];
  for (const m of singleMarks) {
    const marks = parseInt(m[1]);
    if (marks <= 4 && marks >= 1) {
      const idx = questionText.indexOf(m[0]);
      const preceding = questionText.slice(Math.max(0, idx - 150), idx).toLowerCase();
      const isStateQuestion = /\b(state|indicate|estimate)\b.*\b(residual sugar|alcohol|rs|abv|sugar level|alcohol level)\b/.test(preceding)
        || /\b(residual sugar|alcohol level|alcohol %|rs level)\b/.test(preceding);
      if (!isStateQuestion) {
        violations.push(
          `Sub-question "${m[0]}" allocates only ${marks} marks for a written answer. Written sub-questions must be at least 5 marks.`
        );
      }
    }
  }
  return { valid: violations.length === 0, violations };
}

const FAMILY_FLIGHT_RANGES: Record<string, { min: number; max: number; typical: number[] }> = {
  F1: { min: 2, max: 6, typical: [2, 3] },
  F2: { min: 2, max: 4, typical: [2, 3] },
  F3: { min: 2, max: 4, typical: [2, 4] },
  F4: { min: 2, max: 6, typical: [3, 4] },
  F5: { min: 1, max: 5, typical: [2, 3, 4] },
  F6: { min: 2, max: 5, typical: [2, 4, 5] },
  F7: { min: 2, max: 6, typical: [2, 6] },
};

function validateFlightSize(
  family: string,
  paper: number,
  wineCount: number
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const range = FAMILY_FLIGHT_RANGES[family];
  if (!range) return { valid: true, violations };

  if (wineCount < range.min || wineCount > range.max) {
    violations.push(
      `Flight of ${wineCount} wines is outside historical range for ${family} (${range.min}-${range.max} wines). Regenerate with a different flight size.`
    );
  }

  // P1 never uses 5-wine flights
  if (paper === 1 && wineCount === 5) {
    violations.push("Paper 1 has never used a 5-wine flight in the corpus. Use 2, 3, 4, or 6.");
  }

  return { valid: violations.length === 0, violations };
}

function validateCountryDiversity(
  questionText: string,
  wines: { slot: number; fullText: string }[]
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const text = questionText.toLowerCase();

  const numberedMatch = text.match(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+) different countries\b/);
  const bareMatch = /\bdifferent countries\b/.test(text) && !numberedMatch;

  let expectedUniqueCountries: number | null = null;

  if (bareMatch) {
    expectedUniqueCountries = wines.length;
  } else if (numberedMatch) {
    expectedUniqueCountries = parseWordNumber(numberedMatch[1]);
  }

  if (expectedUniqueCountries !== null && expectedUniqueCountries >= wines.length) {
    const countries = wines.map((w) => detectCountryName(w.fullText));
    const knownCountries = countries.filter((c) => c !== "unknown");
    const uniqueCountries = new Set(knownCountries);

    if (knownCountries.length === wines.length && uniqueCountries.size < expectedUniqueCountries) {
      const repeated = [...uniqueCountries].filter(
        (c) => knownCountries.filter((k) => k === c).length > 1
      );
      violations.push(
        `Stem says "different countries" implying ${expectedUniqueCountries} unique countries, but wines share country: ${repeated.join(", ")}. Each wine must be from a genuinely different country.`
      );
    }
  }

  return { valid: violations.length === 0, violations };
}

function parseGeneratedQuestion(
  text: string,
  paper: number,
  family: string
): QuestionCandidate | null {
  try {
    // Extract question text (between ## Question and ## Wines)
    const questionMatch = text.match(
      /## Question\s*\n([\s\S]*?)(?=\n## Wines|\n## Metadata)/i
    );
    const questionText = questionMatch ? questionMatch[1].trim() : "";

    // Extract wines
    const winesMatch = text.match(
      /## Wines\s*\n([\s\S]*?)(?=\n## Wine Appearance|\n## Metadata|\n## |$)/i
    );
    const wines: { slot: number; fullText: string; appearance?: string }[] = [];
    if (winesMatch) {
      const lines = winesMatch[1].split("\n").filter((l) => /^\d+\./.test(l.trim()));
      for (const line of lines) {
        const m = line.trim().match(/^(\d+)\.\s+(.*)/);
        if (m) wines.push({ slot: parseInt(m[1]), fullText: m[2].trim() });
      }
    }

    // Extract wine appearance notes (Paper 3 only)
    const appearanceMatch = text.match(
      /## Wine Appearance\s*\n([\s\S]*?)(?=\n## Metadata|\n## |$)/i
    );
    if (appearanceMatch) {
      const lines = appearanceMatch[1].split("\n").filter((l) => /^\d+\./.test(l.trim()));
      for (const line of lines) {
        const m = line.trim().match(/^(\d+)\.\s+(.*)/);
        if (m) {
          const slot = parseInt(m[1]);
          const wine = wines.find((w) => w.slot === slot);
          if (wine) wine.appearance = m[2].trim();
        }
      }
    }

    // Extract metadata
    const familyMatch = text.match(/Family:\s*(F\d)/i);
    const subcatMatch = text.match(/Subcategory:\s*(.*)/i);

    // Extract generation reasoning
    const reasoningMatch = text.match(
      /## Generation Reasoning\s*\n([\s\S]*?)(?=\n## Paper Scope|\n## |$)/i
    );
    const generationReasoning = reasoningMatch ? reasoningMatch[1].trim() : null;

    const parsedFamily = familyMatch ? familyMatch[1] : family;
    const parsedLabel = FAMILY_LABELS[parsedFamily] || "Unknown";

    // Extract marks
    let totalMarks = 0;
    const mult = [...questionText.matchAll(/\((\d+)\s*[x×]\s*(\d+)\s*marks?\)/gi)];
    for (const m of mult) totalMarks += parseInt(m[1]) * parseInt(m[2]);
    const single = [...questionText.matchAll(/\((\d+)\s*marks?\)/gi)];
    for (const m of single) totalMarks += parseInt(m[1]);
    if (!totalMarks) totalMarks = 100;

    if (!questionText || wines.length === 0) return null;

    // Stem says "Wines 1 to N" — parsed wines must match
    const stemCountMatch = questionText.match(/wines\s+1\s+(?:to|–|-)\s+(\d+)/i);
    if (stemCountMatch) {
      const expected = parseInt(stemCountMatch[1]);
      if (wines.length < expected) {
        console.error(`Parse mismatch: stem expects ${expected} wines but parsed ${wines.length}`);
        return null;
      }
    }

    return {
      family: parsedFamily,
      familyLabel: parsedLabel,
      subcategory: sanitizeSubcategory(subcatMatch ? subcatMatch[1].trim() : ""),
      questionText,
      wines,
      totalMarks,
      generationReasoning,
    };
  } catch {
    return null;
  }
}

function sanitizeQuestionMetadata<T extends { family: string; family_label: string; subcategory: string | null }>(
  question: T
): T {
  return {
    ...question,
    family_label: FAMILY_LABELS[question.family] || question.family_label || "Unknown",
    subcategory: sanitizeSubcategory(question.subcategory || ""),
  };
}

function sanitizeSubcategory(value: string): string {
  return value
    .replace(/^Subcategory:\s*/i, "")
    .replace(/\s*\((?:[^)]*(?:Italy|France|Spain|Portugal|Germany|Austria|Greece|Hungary|Australia|Argentina|Chile|Canada|California|United States|USA|South Africa|New Zealand)[^)]*)\)/gi, "")
    .replace(/\b(?:Italy|Italian|France|French|Spain|Spanish|Portugal|Portuguese|Germany|German|Austria|Austrian|Greece|Greek|Hungary|Hungarian|Australia|Australian|Argentina|Argentinian|Chile|Chilean|Canada|Canadian|California|Californian|United States|USA|South Africa|South African|New Zealand)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;:])/g, "$1")
    .replace(/[,\s]+$/g, "")
    .trim();
}

function normalizeGeneratedQuestionWines(
  question: GeneratedQuestion
): NormalizedGeneratedQuestion {
  return {
    ...question,
    wines:
      typeof question.wines === "string"
        ? JSON.parse(question.wines)
        : question.wines,
  };
}

function validateNoveltyAgainstLatest(
  candidate: QuestionCandidate,
  latestQuestion: NormalizedGeneratedQuestion | null,
  recentQuestions?: NormalizedGeneratedQuestion[]
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const questionsToCheck = recentQuestions?.length
    ? recentQuestions
    : latestQuestion ? [latestQuestion] : [];

  if (questionsToCheck.length === 0) return { valid: true, violations };

  const candidateWines = candidate.wines.map((w) => w.fullText).join("\n");
  const candidateVarieties = new Set(candidate.wines.map((w) => detectPrimaryVariety(w.fullText)).filter((v) => v !== "unknown"));
  const candidateCountries = new Set(candidate.wines.map((w) => detectCountryName(w.fullText)).filter((v) => v !== "unknown"));

  for (const recent of questionsToCheck) {
    const recentWines = recent.wines.map((w) => w.fullText).join("\n");

    if (candidate.questionText.trim() === recent.question_text.trim()) {
      violations.push("Generated question repeats a recent question stem");
      break;
    }
    if (candidateWines === recentWines) {
      violations.push("Generated question repeats a recent wine set");
      break;
    }

    const recentVarieties = new Set(recent.wines.map((w) => detectPrimaryVariety(w.fullText)).filter((v) => v !== "unknown"));
    const recentCountries = new Set(recent.wines.map((w) => detectCountryName(w.fullText)).filter((v) => v !== "unknown"));
    const samePaperAndFamily = candidate.family === recent.family;
    const sameCountryPattern = jaccard(candidateCountries, recentCountries) >= 0.8;
    const similarVarietyPattern = jaccard(candidateVarieties, recentVarieties) >= 0.6;

    if (samePaperAndFamily && sameCountryPattern && similarVarietyPattern) {
      violations.push("Generated question is too similar to a recent question's family/country/variety pattern");
      break;
    }
  }

  return { valid: violations.length === 0, violations };
}

function detectCountryName(fullText: string): string {
  const text = fullText.toLowerCase();
  const countries = [
    "south africa",
    "new zealand",
    "united states",
    "france",
    "italy",
    "spain",
    "portugal",
    "germany",
    "austria",
    "greece",
    "hungary",
    "australia",
    "argentina",
    "chile",
    "canada",
    "usa",
    "england",
    "georgia",
    "uruguay",
    "brazil",
    "lebanon",
    "japan",
    "switzerland",
    "croatia",
    "slovenia",
    "israel",
    "mexico",
    "china",
  ];
  const match = countries.find((country) => text.includes(country));
  return match?.replace("united states", "usa") || "unknown";
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}
