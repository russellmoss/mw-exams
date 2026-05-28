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
      const prompt = buildModelAnswerPrompt(questionText, wines, paper);

      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
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
    const unanswered = await getUnansweredQuestions(paper, family);
    if (unanswered.length > 0) {
      const picked = unanswered[Math.floor(Math.random() * unanswered.length)];
      console.log(`Serving unanswered banked question: ${picked.question_id}`);
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
      const picked = staleWithAnswers[Math.floor(Math.random() * staleWithAnswers.length)];
      console.log(`Serving stale banked question: ${picked.question_id}`);
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

  const recentGenerated = await getRecentGeneratedQuestions(1);
  const latestQuestion = recentGenerated[0] ? normalizeGeneratedQuestionWines(recentGenerated[0]) : null;
  const prompt = buildQuestionGenerationPrompt(
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
        originDiversityCheck: ReturnType<typeof validateOriginDiversity>;
        countryDiversityCheck: ReturnType<typeof validateCountryDiversity>;
        noveltyCheck: ReturnType<typeof validateNoveltyAgainstLatest>;
      }
    | null = null;
  let lastViolations: string[] = [];

  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });

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

    const paperScopeCheck = validatePaperScope(paper, candidate.wines);
    const varietyCheck = validateVarietyConsistency(candidate.questionText, candidate.wines);
    const originDiversityCheck = validateOriginDiversity(
      candidate.questionText,
      candidate.wines,
      candidate.family,
      candidate.subcategory
    );
    const countryDiversityCheck = validateCountryDiversity(
      candidate.questionText,
      candidate.wines
    );
    // Skip novelty check on final attempt — it's the least critical validator
    const noveltyCheck = attempt < MAX_ATTEMPTS
      ? validateNoveltyAgainstLatest(candidate, latestQuestion)
      : { valid: true, violations: [] };

    lastViolations = [
      ...paperScopeCheck.violations,
      ...varietyCheck.violations,
      ...originDiversityCheck.violations,
      ...countryDiversityCheck.violations,
      ...noveltyCheck.violations,
    ];

    if (lastViolations.length === 0) {
      parsed = candidate;
      validation = { paperScopeCheck, varietyCheck, originDiversityCheck, countryDiversityCheck, noveltyCheck };
      if (attempt > 1) console.log(`Generation retry ${attempt} succeeded; all validations pass`);
      break;
    }

    console.error(`Generation attempt ${attempt}/${MAX_ATTEMPTS} failed:`, JSON.stringify(lastViolations));
  }

  if (!parsed || !validation) {
    return Response.json(
      {
        error: "Generated question failed validation",
        violations: lastViolations,
      },
      { status: 500 }
    );
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
      originDiversityCheck: validation.originDiversityCheck,
      countryDiversityCheck: validation.countryDiversityCheck,
      noveltyCheck: validation.noveltyCheck,
    },
  });

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

const WHITE_GRAPE_INDICATORS = /\b(chardonnay|sauvignon\s*blanc|riesling|pinot\s*gri[gs]|gewurz|muscat|moscato|viognier|chenin|semillon|albarino|gruner|verdejo|vermentino|soave|garganega|torrontes|fiano|greco|arneis|cortese|marsanne|roussanne|picpoul|muscadet|melon\s*de\s*bourgogne|blanc\s*de\s*blancs|prosecco|glera)\b/i;
const RED_GRAPE_INDICATORS = /\b(cabernet\s*sauvignon|merlot|pinot\s*noir|syrah|shiraz|grenache|garnacha|tempranillo|sangiovese|nebbiolo|malbec|zinfandel|primitivo|mourvedre|carignan|barbera|dolcetto|touriga|tannat|carmenere|pinotage|gamay|blaufr[aä]nkisch|lemberger|zweigelt|aglianico|nero\s*d.avola|nerello|lagrein|cannonau|xinomavro|cabernet\s*franc|cinsault|monastrell)\b/i;

const APPELLATION_TO_PRIMARY_VARIETY: { pattern: RegExp; variety: string }[] = [
  { pattern: /\b(barolo|barbaresco|gattinara|ghemme|carema|valtellina|sforzato)\b/i, variety: "nebbiolo" },
  { pattern: /\b(chianti|brunello|vino\s+nobile|morellino|montepulciano)\b/i, variety: "sangiovese" },
  { pattern: /\b(etna\s+rosso)\b/i, variety: "nerello mascalese" },
  { pattern: /\b(taurasi)\b/i, variety: "aglianico" },
  { pattern: /\b(valpolicella|amarone|ripasso|bardolino)\b/i, variety: "corvina blend" },
  { pattern: /\b(barbera)\b/i, variety: "barbera" },
  { pattern: /\b(dolcetto)\b/i, variety: "dolcetto" },
  { pattern: /\b(beaujolais|fleurie|morgon|moulin-a-vent|brouilly)\b/i, variety: "gamay" },
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
        const m = line.match(/^(\d+)\.\s+(.*)/);
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
        const m = line.match(/^(\d+)\.\s+(.*)/);
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
  latestQuestion: NormalizedGeneratedQuestion | null
): { valid: boolean; violations: string[] } {
  if (!latestQuestion) return { valid: true, violations: [] };

  const latestWines = latestQuestion.wines.map((w) => w.fullText).join("\n");
  const candidateWines = candidate.wines.map((w) => w.fullText).join("\n");
  const violations: string[] = [];

  if (candidate.questionText.trim() === latestQuestion.question_text.trim()) {
    violations.push("Generated question repeats the latest question stem");
  }
  if (candidateWines === latestWines) {
    violations.push("Generated question repeats the latest wine set");
  }

  const candidateVarieties = new Set(candidate.wines.map((w) => detectPrimaryVariety(w.fullText)).filter((v) => v !== "unknown"));
  const latestVarieties = new Set(latestQuestion.wines.map((w) => detectPrimaryVariety(w.fullText)).filter((v) => v !== "unknown"));
  const candidateCountries = new Set(candidate.wines.map((w) => detectCountryName(w.fullText)).filter((v) => v !== "unknown"));
  const latestCountries = new Set(latestQuestion.wines.map((w) => detectCountryName(w.fullText)).filter((v) => v !== "unknown"));
  const samePaperAndFamily = candidate.family === latestQuestion.family;
  const sameCountryPattern = jaccard(candidateCountries, latestCountries) >= 0.8;
  const similarVarietyPattern = jaccard(candidateVarieties, latestVarieties) >= 0.6;

  if (samePaperAndFamily && sameCountryPattern && similarVarietyPattern) {
    violations.push("Generated question is too similar to the latest generated question's family/country/variety pattern");
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
