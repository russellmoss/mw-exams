import { getQuestionsByFilter, getRecentAttempts, getUnansweredQuestions } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { saveGeneratedQuestion } from "@/lib/db";
import { buildQuestionGenerationPrompt } from "@/lib/prompts/question-generation-prompt";
import { buildModelAnswerPrompt } from "@/lib/prompts/model-answer-prompt";

export const runtime = "nodejs";
export const maxDuration = 120;

// Fire-and-forget background model answer generation
function generateModelAnswerInBackground(
  questionId: string,
  questionText: string,
  wines: { slot: number; fullText: string }[],
  paper: number,
  family: string
) {
  (async () => {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
    const { paper, family, forceFresh } = await request.json();

    if (!paper) {
      return Response.json({ error: "Missing paper" }, { status: 400 });
    }

    // Skip bank and generate fresh if requested
    if (forceFresh) {
      console.log(`Force fresh question requested for P${paper} ${family || "any"}`);
      return generateFreshQuestion(paper, family);
    }

    // PRIORITY 1: Unanswered banked questions with model answers ready (instant, best UX)
    const unanswered = await getUnansweredQuestions(paper, family);
    if (unanswered.length > 0) {
      const picked = unanswered[Math.floor(Math.random() * unanswered.length)];
      console.log(`Serving unanswered banked question: ${picked.question_id}`);
      return Response.json({
        source: "pre-populated",
        question: picked,
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
      if (lastSeenIdx === -1) return false; // unanswered ones already handled above
      return lastSeenIdx >= 7; // seen but 7+ others since
    });

    if (staleWithAnswers.length > 0) {
      const picked = staleWithAnswers[Math.floor(Math.random() * staleWithAnswers.length)];
      console.log(`Serving stale banked question: ${picked.question_id}`);
      return Response.json({
        source: "pre-populated",
        question: picked,
        hasModelAnswer: true,
      });
    }

    // PRIORITY 3: Generate fresh on the fly
    return generateFreshQuestion(paper, family);
  } catch (err) {
    console.error("get-question error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

async function generateFreshQuestion(paper: number, family: string | undefined) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Pull existing wines from the bank for deduplication
  const allQuestions = await getQuestionsByFilter(paper);
  const existingWines: string[] = [];
  for (const q of allQuestions) {
    const wines = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
    for (const w of wines) {
      existingWines.push(w.fullText);
    }
  }

  const prompt = buildQuestionGenerationPrompt(paper, family || "any", existingWines);

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

  const parsed = parseGeneratedQuestion(text, paper, family || "F4");

  if (!parsed) {
    return Response.json(
      { error: "Failed to parse generated question" },
      { status: 500 }
    );
  }

  // Validate paper scope + variety consistency
  const scopeCheck = validatePaperScope(paper, parsed.wines);
  const varietyCheck = validateVarietyConsistency(parsed.questionText, parsed.wines);
  const allViolations = [...scopeCheck.violations, ...varietyCheck.violations];

  if (allViolations.length > 0) {
    console.error(`Validation failures for P${paper}:`, allViolations);
    // Retry once with a fresh generation rather than serving a bad question
    const retryMessage = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
    const retryText = retryMessage.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const retryParsed = parseGeneratedQuestion(retryText, paper, family || "F4");
    if (retryParsed) {
      const retryScope = validatePaperScope(paper, retryParsed.wines);
      const retryVariety = validateVarietyConsistency(retryParsed.questionText, retryParsed.wines);
      if (retryScope.valid && retryVariety.valid) {
        Object.assign(parsed, retryParsed);
        console.log("Retry succeeded — all validations now pass");
      } else {
        console.error("Retry also failed validation:", [...retryScope.violations, ...retryVariety.violations]);
      }
    }
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
      paperScopeCheck: scopeCheck,
    },
  });

  generateModelAnswerInBackground(
    questionId,
    parsed.questionText,
    parsed.wines,
    paper,
    parsed.family
  );

  return Response.json({
    source: "generated",
    question: saved,
    hasModelAnswer: false,
  });
}

const WHITE_GRAPE_INDICATORS = /\b(chardonnay|sauvignon\s*blanc|riesling|pinot\s*gri[gs]|gewurz|muscat|moscato|viognier|chenin|semillon|albarino|gruner|verdejo|vermentino|soave|garganega|torrontes|fiano|greco|arneis|cortese|marsanne|roussanne|picpoul|muscadet|melon\s*de\s*bourgogne|blanc\s*de\s*blancs|prosecco|glera)\b/i;
const RED_GRAPE_INDICATORS = /\b(cabernet\s*sauvignon|merlot|pinot\s*noir|syrah|shiraz|grenache|garnacha|tempranillo|sangiovese|nebbiolo|malbec|zinfandel|primitivo|mourvedre|carignan|barbera|dolcetto|touriga|tannat|carmenere|pinotage|gamay|blaufrankisch|zweigelt|aglianico|nero\s*d.avola|nerello|lagrein|cannonau|xinomavro|cabernet\s*franc)\b/i;

function validatePaperScope(paper: number, wines: { slot: number; fullText: string }[]): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const wine of wines) {
    const text = wine.fullText.toLowerCase();
    if (paper === 2) {
      if (WHITE_GRAPE_INDICATORS.test(text)) {
        violations.push(`Wine ${wine.slot}: "${wine.fullText}" appears to be a white wine in Paper 2 (reds only)`);
      }
    } else if (paper === 1) {
      if (RED_GRAPE_INDICATORS.test(text)) {
        violations.push(`Wine ${wine.slot}: "${wine.fullText}" appears to be a red wine in Paper 1 (whites only)`);
      }
    } else if (paper === 3) {
      const isWhiteGrape = WHITE_GRAPE_INDICATORS.test(text);
      const isRedGrape = RED_GRAPE_INDICATORS.test(text);
      const hasSpecialIndicator = /\b(sparkling|champagne|cava|prosecco|cremant|sekt|brut|blanc\s*de|rose|rosé|fortified|sherry|port|madeira|marsala|vin\s*santo|tokaj|aszu|sauternes|barsac|beerenauslese|trockenbeerenauslese|auslese|spätlese|kabinett|ice\s*wine|eiswein|passito|recioto|amarone|brachetto|moscato|muscat|rutherglen|maury|banyuls|rivesaltes|pedro\s*ximenez|oloroso|amontillado|manzanilla|fino|palo\s*cortado|VDN|vin\s*doux|late\s*harvest|botrytis|noble\s*rot|vendange\s*tardive|SGN|szamorodni)\b/i.test(text);
      const hasLowAlcohol = text.match(/\((\d+(?:\.\d+)?)%\)/);
      const abv = hasLowAlcohol ? parseFloat(hasLowAlcohol[1]) : null;
      const isLikelySweet = abv !== null && abv <= 10;
      if ((isWhiteGrape || isRedGrape) && !hasSpecialIndicator && !isLikelySweet) {
        violations.push(`Wine ${wine.slot}: "${wine.fullText}" appears to be a standard still wine in Paper 3 (sparkling/fortified/sweet/rosé/oxidative only)`);
      }
    }
  }
  return { valid: violations.length === 0, violations };
}

function validateVarietyConsistency(questionText: string, wines: { slot: number; fullText: string }[]): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const stemSaysOneVariety = /same single grape variety/i.test(questionText);
  if (!stemSaysOneVariety) return { valid: true, violations };

  const detectedVarieties: string[] = [];
  for (const wine of wines) {
    const text = wine.fullText.toLowerCase();
    const whiteMatch = text.match(WHITE_GRAPE_INDICATORS);
    const redMatch = text.match(RED_GRAPE_INDICATORS);
    const variety = (whiteMatch?.[0] || redMatch?.[0] || "unknown").toLowerCase().trim();
    detectedVarieties.push(variety);
  }

  const uniqueVarieties = [...new Set(detectedVarieties.filter(v => v !== "unknown"))];
  if (uniqueVarieties.length > 1) {
    violations.push(`Stem says "same single grape variety" but wines contain multiple varieties: ${uniqueVarieties.join(", ")}`);
  }
  return { valid: violations.length === 0, violations };
}

function parseGeneratedQuestion(
  text: string,
  paper: number,
  family: string
): {
  family: string;
  familyLabel: string;
  subcategory: string;
  questionText: string;
  wines: { slot: number; fullText: string }[];
  totalMarks: number;
  generationReasoning: string | null;
} | null {
  try {
    // Extract question text (between ## Question and ## Wines)
    const questionMatch = text.match(
      /## Question\s*\n([\s\S]*?)(?=\n## Wines|\n## Metadata)/i
    );
    const questionText = questionMatch ? questionMatch[1].trim() : "";

    // Extract wines
    const winesMatch = text.match(
      /## Wines\s*\n([\s\S]*?)(?=\n## Metadata|\n## |$)/i
    );
    const wines: { slot: number; fullText: string }[] = [];
    if (winesMatch) {
      const lines = winesMatch[1].split("\n").filter((l) => /^\d+\./.test(l.trim()));
      for (const line of lines) {
        const m = line.match(/^(\d+)\.\s+(.*)/);
        if (m) wines.push({ slot: parseInt(m[1]), fullText: m[2].trim() });
      }
    }

    // Extract metadata
    const familyMatch = text.match(/Family:\s*(F\d)/i);
    const familyLabelMatch = text.match(/Family:\s*F\d\s*[-–]\s*(.*)/i);
    const subcatMatch = text.match(/Subcategory:\s*(.*)/i);

    // Extract generation reasoning
    const reasoningMatch = text.match(
      /## Generation Reasoning\s*\n([\s\S]*?)(?=\n## Paper Scope|\n## |$)/i
    );
    const generationReasoning = reasoningMatch ? reasoningMatch[1].trim() : null;

    const FAMILY_LABELS: Record<string, string> = {
      F1: "Same Variety",
      F2: "Same Origin",
      F3: "Blend Logic",
      F4: "Mixed Breadth",
      F5: "Method / Production",
      F6: "Style Mechanism",
      F7: "Quality Hierarchy",
    };

    const parsedFamily = familyMatch ? familyMatch[1] : family;
    const parsedLabel = familyLabelMatch
      ? familyLabelMatch[1].trim()
      : FAMILY_LABELS[parsedFamily] || "Unknown";

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
      subcategory: subcatMatch ? subcatMatch[1].trim() : "",
      questionText,
      wines,
      totalMarks,
      generationReasoning,
    };
  } catch {
    return null;
  }
}
