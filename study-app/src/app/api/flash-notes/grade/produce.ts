import Anthropic from "@anthropic-ai/sdk";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import { MARKING_PRINCIPLES } from "@/lib/prompts/marking-principles";
import { streamWithThinking, resolveThinking, type ProgressEmitter } from "@/lib/thinking-stream";

/**
 * The Flash Notes grading core, shared by both routes that mark a card:
 *   • `route.ts`        — plain JSON
 *   • `stream/route.ts` — SSE, what the drill uses so the mark reports as it is decided
 *
 * Identical prompt and scoring either way; the only difference is whether an emitter is threaded
 * through, in which case the examiner's reasoning streams instead of the screen sitting on
 * "Marking your note…".
 */

// The four competencies Flash Notes can drill. A card grades EXACTLY ONE of these — the
// rapid, single-prompt cousin of Dry Notes. Labels + the brief the candidate answered to.
const PROMPTS: Record<string, { label: string; brief: string; rubric: string }> = {
  style: {
    label: "Style & method of production",
    brief:
      "Describe the STYLE of each wine and infer the winemaking that produced it (Cardinal Rule 4).",
    rubric:
      "Reward style claims connected to the glass with specific parameters (oak %, MLF, lees, maceration, residual sugar). Generic technique lists score low.",
  },
  quality: {
    label: "Quality",
    brief:
      "Assess the QUALITY of each wine, calibrated to its tier and origin (Cardinal Rule 3).",
    rubric:
      "Bare 'good quality' earns nothing. Reward a contextualised, calibrated judgement that names the official/legal tier where one is relevant, and penalise over- or under-calling. Do not let maturity be mistaken for quality.",
  },
  maturity: {
    label: "Maturity & drinking window",
    brief:
      "Assess MATURITY and the drinking window for each wine (Cardinal Rule 5).",
    rubric:
      "Full credit needs the four parts with CONCRETE timeframes: (a) current age estimate, (b) drink now vs hold, (c) how much longer it improves, (d) how long it holds before decline. Vague 'will age well' scores near zero.",
  },
  commercial: {
    label: "Commercial appraisal",
    brief:
      "Give a COMMERCIAL appraisal for each wine (Cardinal Rule 6).",
    rubric:
      "Reward channel (on/off-trade, Michelin vs pub), geography (domestic/export/global), a realistic price, the competitive set, and a drinking window. Rote 'sell it in a steakhouse' and food-pairing lists are rarely rewarded.",
  },
};

function normaliseVerdict(v: unknown): "pass" | "borderline" | "fail" {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("pass")) return "pass";
  if (s.includes("fail")) return "fail";
  return "borderline";
}

// Map a 0–100 single-competency score to the same verdict bands the rest of the app uses
// (marking-principles single-question proxy: FAIL < 50, BORDERLINE ~55–64, PASS ≥ 65).
function verdictFromScore(score: number): "pass" | "borderline" | "fail" {
  if (score >= 65) return "pass";
  if (score >= 50) return "borderline";
  return "fail";
}

export type FlashGrade = { score: number; verdict: "pass" | "borderline" | "fail"; feedback: string };

/** The model returned something that wasn't the strict JSON object the prompt demands. */
export class FlashGradeParseError extends Error {
  constructor() {
    super("Could not parse grading response");
    this.name = "FlashGradeParseError";
  }
}

export function isValidPromptType(t: unknown): t is string {
  return typeof t === "string" && Object.prototype.hasOwnProperty.call(PROMPTS, t);
}

export async function gradeFlashCard(opts: {
  paper: number;
  promptType: string;
  wines: { slot: number; fullText: string }[];
  answer: string;
  apiKey: string;
  source: "user" | "server";
  userId: number | null;
  emit?: ProgressEmitter;
}): Promise<FlashGrade> {
  const { paper, promptType, wines, answer, apiKey, source, userId, emit } = opts;
  const prompt = PROMPTS[promptType];
  const paperName =
    paper === 1 ? "Paper 1 (White Wines)" : paper === 2 ? "Paper 2 (Red Wines)" : "Paper 3 (Special)";

  const client = new Anthropic({ apiKey });

  const wineList = wines
    .map((w: { slot: number; fullText: string }) => `${w.slot}. ${w.fullText}`)
    .join("\n");

  // Flash Notes reuses Dry Notes' grading temperament but constrained to ONE competency and ONE
  // short feedback line. The wine identities were revealed up front, so NO identification marks —
  // grade purely on the chosen dimension, exactly as Dry Notes does for that sub-part.
  const systemPrompt = `You are a Master of Wine examiner grading ONE competency of a rapid tasting drill ("Flash Notes") for ${paperName}.

The wine identities were REVEALED to the candidate up front (this is a Dry-Notes-style drill). Do NOT award or deduct any identification, origin, variety or producer marks — the names were given. Grade ONLY the candidate's "${prompt.label}" answer.

${MARKING_PRINCIPLES}

## This card
- Competency under test: **${prompt.label}**
- The brief the candidate answered: ${prompt.brief}
- How to score it: ${prompt.rubric}
- Where the answer covers more than one wine, Cardinal Rule 9 applies: penalise cut-and-paste across wines.
- A howler on this dimension (an impossible/grossly wrong claim about the revealed wine) caps the score and, on a borderline, resolves to FAIL.

## Output — STRICT
Return a SINGLE JSON object, nothing else (no markdown, no prose around it):
{"score": <integer 0-100>, "verdict": "PASS" | "BORDERLINE" | "FAIL", "feedback": "<one short line>"}

- "score" is a normalised 0–100 mark for the ${prompt.label} dimension ONLY (do not surface marks-per-wine internals).
- Map score to verdict: FAIL < 50, BORDERLINE 50–64, PASS >= 65 (then apply the howler→FAIL override).
- "feedback" is ONE short "what you missed" line, **45 words maximum**, the single highest-value fix for next time. Constructive voice, faithful verdict.`;

  const userMessage = `## Wines (revealed to the candidate)
${wineList}

## Competency to grade: ${prompt.label}

## Candidate's answer
${answer}

Grade only the ${prompt.label} dimension. Return the JSON object only.`;

  const { model, abGroup } = await selectModel("answer_grading", apiKey, "sonnet");
  const t0 = Date.now();
  emit?.({ type: "status", label: `Marking your ${prompt.label.toLowerCase()} note…` });

  // The answer here is a strict JSON object in ~400 tokens, so the usual "double max_tokens"
  // headroom would leave reasoning only 400 tokens before it started eating the JSON — and a
  // truncated JSON grader is a hard parse failure, not a slightly short reply. Hence an explicit,
  // generous reasoning budget. `{}` when the model can't take thinking, or reasoning is off.
  const extra = emit ? await resolveThinking(model) : {};
  const thinkingOn = Object.keys(extra).length > 0;
  const params = {
    model,
    max_tokens: thinkingOn ? 2400 : 400,
    system: systemPrompt,
    messages: [{ role: "user" as const, content: userMessage }],
    ...extra,
  } as Parameters<typeof client.messages.create>[0] & { stream?: never };
  const message = emit
    ? await streamWithThinking(client, params, {}, emit)
    : await client.messages.create(params);

  logClaudeUsage(
    { taskType: "answer_grading", model, source, userId, abGroup },
    message.usage,
    { latencyMs: Date.now() - t0 }
  );

  const raw = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let score = 0;
  let verdict: "pass" | "borderline" | "fail" = "borderline";
  let feedback = "";
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    feedback = String(parsed.feedback || "").trim();
    // Trust an explicit verdict, but never let it contradict a clear score band by more than the
    // howler override allows: a howler can drop PASS/BORDERLINE → FAIL, so honour a stated FAIL.
    const stated = normaliseVerdict(parsed.verdict);
    const fromScore = verdictFromScore(score);
    verdict = stated === "fail" ? "fail" : fromScore;
  } catch {
    // The routes map this to a 502 / stream error. Thrown rather than returned so both callers
    // share one failure path.
    throw new FlashGradeParseError();
  }

  // Cap the feedback line defensively (~45 words) so the verdict screen stays fast/short even if
  // the model overshoots.
  const words = feedback.split(/\s+/).filter(Boolean);
  if (words.length > 45) feedback = words.slice(0, 45).join(" ") + "…";

  return { score, verdict, feedback };
}
