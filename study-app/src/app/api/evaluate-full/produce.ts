import Anthropic from "@anthropic-ai/sdk";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import { FUNNELLING_PRINCIPLE } from "@/lib/prompts/funnelling";
import { MARKING_PRINCIPLES, VOICE_INPUT_SPELLING } from "@/lib/prompts/marking-principles";
import { normalizeDictatedTerms } from "@/lib/dictation-normalizer";
import { loadWineTerms } from "@/lib/wine-terms";
import { scanDislikedWording, buildLexiconCritiqueGuidance } from "@/lib/prompts/tasting-lexicon";
import { extractGradingMeta, recordGradingOverrideCheck, GRADING_META_INSTRUCTION } from "@/lib/grading-telemetry";
import { deriveStemKey } from "@/lib/stem-answer-key";
import {
  answerKeyFlight,
  regenerateFeedbackOnce,
  type AuditWine,
  type KeyedGroundWine,
} from "@/lib/question-validator";
import { getAnswerKeyGroundTruth } from "@/lib/db";
import { buildClaimCorrectionPrompt } from "@/lib/prompts/claim-correction-prompt";
import { IMAGE_TOKEN_INSTRUCTIONS, INFOGRAPHIC_INSTRUCTIONS, enrichFeedbackWithImages, createImageStreamer, deriveWineSubjects, answerImageConstraint } from "@/lib/media";
import { withThinking, thinkingFrame } from "@/lib/thinking-stream";
import { deriveQuestion, markPhrase } from "@/lib/question-sections";
import { masterTreeForPaper } from "@/lib/master-trees";
import { getUserPersona } from "@/lib/persona-server";
import { personaBlock } from "@/lib/personas";

/**
 * The full-debrief grading core, shared by two callers (flash-notes/grade/produce.ts precedent):
 *
 *  - /api/evaluate-full — the study flow. The CLIENT supplies questionText/wines/modelAnswer,
 *    which is fine there: the wines are revealed to the candidate at debrief time anyway.
 *  - /api/live-tasting/[id]/grade — the blind flow. The SERVER loads everything from the DB and
 *    the client sends only its own answer; this producer never learns where its inputs came from.
 *    `onComplete` lets that caller persist the final feedback + stamp graded_at only when the
 *    stream actually finished (live_tasting_plan.md §2.4 one-shot semantics).
 */
export type FullEvaluationInput = {
  apiKey: string;
  userId: number;
  usageSource?: "user" | "server";
  questionText: string;
  preGlassReasoning?: string | null;
  modelAnswer?: string | null;
  paper: number;
  /**
   * Which banked question this is. Optional only because the study flow historically posted the
   * question's TEXT and wines rather than its id. Supply it wherever possible: it is the only way the
   * STORED answer key (and therefore each wine's keyed banker/curveball role) can be read, which is
   * what lets the answer-key claim check enforce rather than merely flag.
   */
  questionId?: string | null;
  wineAppearances?: { slot: number; appearance: string }[] | null;
  wines?: { slot: number; fullText: string }[] | null;
  identityRevealed?: boolean;
  inputMethod: "typed" | "voice";
  userAnswer: string;
  /** Live Tasting: recorded bottle vintages, shown to the grader as context. */
  vintagesBought?: Record<string, string> | null;
  /** Called with the final (image-enriched, meta-stripped) markdown before [DONE]. May persist. */
  onComplete?: (finalText: string) => Promise<void>;
};

export async function produceFullEvaluation(input: FullEvaluationInput): Promise<ReadableStream> {
  const {
    apiKey, userId, usageSource, questionText, preGlassReasoning, modelAnswer, paper,
    questionId, wineAppearances, wines, identityRevealed, inputMethod, vintagesBought, onComplete,
  } = input;

  let userAnswer: string = input.userAnswer;
  let transcriptionFixes: { from: string; to: string }[] = [];
  if (inputMethod === "voice") {
    const normalized = normalizeDictatedTerms(userAnswer, loadWineTerms());
    userAnswer = normalized.text;
    transcriptionFixes = normalized.substitutions;
  }

  const client = new Anthropic({ apiKey });

  const paperName =
    paper === 1
      ? "Paper 1 (White Wines)"
      : paper === 2
        ? "Paper 2 (Red Wines)"
        : "Paper 3 (Special)";

  const dislikedFound = scanDislikedWording(userAnswer);
  // The paper's living master tree — before 2026-08-06 the debrief asked the model to "walk
  // Layer A" from recall alone, so tree corrections never reached it (fail-soft: "" omits it).
  const masterTree = masterTreeForPaper(paper);
  const systemPrompt = `You are a Master of Wine exam coach providing a two-part debrief for ${paperName}. The debrief is split into BEFORE THE GLASS (stem analysis) and IN THE GLASS (tasting and answer writing).

## Your coaching approach
- **Faithful verdict, constructive voice.** Grade exactly as the IMW would (per the Marking Principles below — including a howler tipping a borderline to fail, and zeroing fabricated/cascade sub-answers); do not inflate the result because this is a study tool. Keep the *wording* encouraging.
- Lead with what they did well before addressing gaps.
- If their reasoning is sound but reaches a different conclusion, give credit.
- Connect feedback to the MW decision tree approach.

${MARKING_PRINCIPLES}

${FUNNELLING_PRINCIPLE}

In the "In the Glass" section, explicitly assess the candidate's funnelling on identity/origin: did they read structure first, weigh plausible alternatives, commit to a variety+region anchor early, and land a decisive call? Reward a well-reasoned funnel (even to a wrong-but-plausible call) over a snap-call that names one wine outright, and call out shoehorning or hedging by name with the funnel they should have run.

${
  masterTree
    ? `## Master decision tree for ${paperName}
This is the candidate's canonical Layer A stem-routing logic — use it (not your own recall of exam patterns) when walking the tree in the "How the decision tree routes this question" section. Honour its dated correction notes: they record real leaf misses (e.g. the 2-wine maturity-pair leaf once excluded Riesling entirely), and a candidate who reasons past a stale leaf from the stem's own signals deserves credit.

<master_tree>
${masterTree}
</master_tree>

`
    : ""
}${buildLexiconCritiqueGuidance(dislikedFound)}
${inputMethod === "voice" ? VOICE_INPUT_SPELLING : ""}
${
  transcriptionFixes.length
    ? `## Transcription repairs already applied
Before you saw it, these dictated terms were auto-corrected to the nearest known wine term. Name them under "Transcription check" so the candidate knows, and do not treat them as the candidate's own spelling errors:
${transcriptionFixes.map((s) => `- "${s.from}" → ${s.to}`).join("\n")}`
    : ""
}

## Output structure — follow this EXACTLY

---

## Before the Glass

This section evaluates the candidate's pre-glass stem analysis only.

### What you identified well
[Bullet list of specific signals they correctly caught from the stem]

### What the stem also tells us
[Signals they missed or underweighted, framed as coaching not criticism. Be specific about what the stem language implies.]

### How the decision tree routes this question
[Walk through Layer A (stem routing) step by step, using the master tree provided above (fall back to general MW routing logic only if no tree was provided). Name the specific tree nodes:
- START → which branch? → which leaf?
- What does the tree predict as STRONG SIGNAL, PLAUSIBLE, CURVEBALL?
- Which question family (F1-F7) does this stem map to?]

---

## In the Glass

This section evaluates the candidate's full answer after tasting.

### Overall Assessment

**Result: [PASS / BORDERLINE / FAIL]**

**Estimated marks: [range] out of [total available]**

[2-3 sentences on overall performance — what stood out, what held them back]

### Per sub-question

For each sub-question, use this format:

**a) [topic]** — [marks available]
- **Strengths:** [what they got right]
- **Could improve:** [specific, actionable feedback]
- **Estimated:** X/Y marks

**b) [topic]** — [marks available]
- **Strengths:** ...
- **Could improve:** ...
- **Estimated:** X/Y marks

[Continue for c), d) etc.]

---

## Key Takeaways

Three priorities for next time, numbered:
1. [Most important — specific and actionable]
2. [Second priority]
3. [Third priority]

---

Keep total feedback under 1000 words. Be specific, not generic. Use the exact heading structure above so the UI can parse and display it cleanly.
${identityRevealed ? `
## MODE OVERRIDE — Known-Wine Write-Up ("dry notes") — READ AND APPLY (supersedes the output structure above)
The candidate practised in **Known-Wine Write-Up** mode: the wine identity (and therefore region, variety and producer) was **revealed to them up front** before they wrote. They were NOT asked to identify anything — the drill isolates the *quality of the write-up* from the identification gamble. Adjust your grading and output accordingly:
- **OMIT the entire "## Before the Glass" section.** There was no blind stem analysis. Begin your debrief directly at "## In the Glass".
- **Do NOT award or deduct any identification, origin, variety or producer marks** — identity was given, so getting the name "right" is not an achievement and a name is never in doubt here. Take the identification tariff printed on the question and **fold it proportionally into the remaining write-up sub-parts** (style & method-of-production, quality, maturity/development, commercial). Grade purely on the quality of the write-up against the printed mark allocation for those parts. "Estimated marks … out of [total]" should still use the question's printed total, just re-weighted off identification.
- **Keep every other Cardinal Rule in force**, especially: quality contextualised & calibrated to the named tier (Rule 3); four-part maturity with concrete timeframes (Rule 5); commercial with channel + geography (specific AND global) + realistic price + competitive set + drinking window (Rule 6); winemaking connected to the glass with specific parameters (Rule 4); answer every sub-question and the exact question asked (Rule 7); no cut-and-paste across wines (Rule 9).
- **Howler/cascade rules still apply to the WRITE-UP** (e.g. an impossible structural figure, or a quality/maturity/commercial claim that contradicts the revealed wine) — but never penalise "wrong identification", since none was required. A cascade error here is a write-up disconnected from the revealed wine, not a misnamed one.
- **Anti-template:** reward fresh reasoning tied to THIS specific wine; a generic, memorised template applied to a classic should NOT score top band even with the name handed over.
` : ""}
${GRADING_META_INSTRUCTION}`;

  let userMessage = `## Question
${questionText}
${wineAppearances && wineAppearances.length > 0 ? `
## Visual Appearance (shown to candidate before tasting)
${wineAppearances.map((w: { slot: number; appearance: string }) => `${w.slot}. ${w.appearance}`).join("\n")}
` : ""}
## Candidate's Pre-Glass Reasoning
${preGlassReasoning || "(No pre-glass reasoning submitted)"}

## Candidate's Answer
${userAnswer}`;

  if (modelAnswer) {
    userMessage += `

## Model Answer (reference — do not quote directly, use for comparison)
${modelAnswer}`;
  }

  if (vintagesBought && Object.keys(vintagesBought).length > 0) {
    userMessage += `

## Bottles actually tasted (Live Tasting — recorded at purchase)
${Object.entries(vintagesBought).map(([slot, v]) => `Wine ${slot}: ${v}`).join("\n")}
The candidate tasted these specific bottles at home. Do not penalise development/maturity observations that fit the recorded vintage rather than a generic recent release.`;
  }

  // PG-1: give the grader a per-wine PLAUSIBILITY reference so partial credit on WRONG identification
  // calls is anchored to stylistic adjacency (EK-0112 / marking-principles Cardinal Rule 1) rather than
  // left to unaided judgement. Derived purely from the revealed wines' text via the same live key
  // builder the Stem Sniper uses (empty wine_profiles → fullText fallback). Best-effort: any failure or
  // an empty set silently skips, so grading behaviour is unchanged when it can't derive a useful set.
  // The keyed flight, kept for the answer-key CLAIM check at the end of the stream. Derived from the
  // same key as the plausibility reference below — no extra call, no extra I/O. Seeded label-only so a
  // key-derivation failure still leaves the claim check something to judge explicit "wine N" claims on.
  let keyedFlight: AuditWine[] = answerKeyFlight(null, wines);
  // The STORED answer key first, when we know which question this is. Only the stored key carries
  // `role` — the live re-derivation below rebuilds the flight from the wine labels and has no access to
  // what the generator declared, so a role can never come out of it. Without this read Rule 1 stays a
  // review flag forever, however many roles are keyed. Best-effort: any failure falls through to the
  // derived flight, which is what every pre-migration-065 question gets anyway.
  if (questionId) {
    try {
      const stored = await getAnswerKeyGroundTruth(questionId);
      if (stored?.length) keyedFlight = answerKeyFlight(stored as KeyedGroundWine[], wines);
    } catch (err) {
      console.error(`[answer-key-claims] stored key lookup failed for ${questionId} (non-fatal):`, err);
    }
  }
  try {
    if (Array.isArray(wines) && wines.length) {
      const key = deriveStemKey({ paper, question_text: questionText, wines, wine_profiles: {} });
      // Only fall back to the derived flight when the stored key gave us nothing — never overwrite a
      // stored one, or the role we just read would be dropped on the floor.
      if (!keyedFlight.some((w) => w.role)) keyedFlight = answerKeyFlight(key?.ground, wines);
      const pl = (key?.plausible ?? []).slice(0, 16);
      if (pl.length) {
        const lines = pl
          .map((p) => `- ${p.variety}${p.region ? ` — ${p.region}${p.country ? `, ${p.country}` : ""}` : ""}`)
          .join("\n");
        userMessage += `

## Plausibility reference (INTERNAL — for grading WRONG calls; do NOT reveal, do NOT treat as the answer)
The model answer above is the ground truth. The keyed varieties also occur in these stylistically-adjacent origins. Use this ONLY to calibrate partial credit on wrong identification/origin calls: a wrong call matching one of these (or otherwise stylistically adjacent to the glass) is a PLAUSIBLE miss earning real partial credit; a call that is neither listed nor stylistically adjacent is an IMPLAUSIBLE miss earning little (EK-0112). Never penalise a correct call for not matching this list.
${lines}`;
      }
    }
  } catch {
    /* plausibility reference is best-effort — never block grading */
  }

  userMessage += identityRevealed
    ? `

The wine identity was revealed to the candidate up front (Known-Wine Write-Up mode). Please provide the debrief per the MODE OVERRIDE: skip "Before the Glass", grade the write-up only (no identification marks), and give the "In the Glass" evaluation with pass/fail and per-sub-question marks, plus key takeaways.`
    : `

Please provide the full debrief: pre-glass review, answer evaluation with pass/fail and per-sub-question marks, and key takeaways.`;

  // Constrain debrief imagery to the revealed wines (user feedback FA#28): build the answer-wine
  // allow-list and tell the model to query only those wines' regions/producers/varieties.
  const imageAllowList = deriveWineSubjects(wines);

  // Split Sections: when the flight's sub-parts span BOTH scopes, tell the grader to score each
  // section and report the marks awarded per section in a machine tag (parsed for the debrief's
  // Section A / Section B row). Skipped for single-scope questions — there is only one section.
  const wineCount = Array.isArray(wines) ? wines.length : 0;
  const derivedSections = deriveQuestion(questionText, wineCount);
  let sectionMarksBlock = "";
  if (derivedSections.scopes.length > 1) {
    const flight = derivedSections.sections.find((s) => s.scope === "flight");
    const perWine = derivedSections.sections.find((s) => s.scope === "per_wine");
    const listOf = (sec: typeof derivedSections.sections[number]) =>
      sec.subParts.map((p) => `  ${p.label}) ${p.text} — ${markPhrase(p, wineCount)}`).join("\n");
    sectionMarksBlock = `

## SPLIT SECTIONS — PER-SECTION MARKS (REQUIRED)
This question is organised into two scored sections. Grade every sub-part under its own section.
${flight ? `Section A · For the flight as a whole — out of ${flight.subtotal} marks:\n${listOf(flight)}` : ""}
${perWine ? `Section B · For each wine individually — out of ${perWine.subtotal} marks:\n${listOf(perWine)}` : ""}
In ADDITION to your per-sub-question marks, emit this machine-readable tag LAST — once, after all visible feedback, on its own line, exactly like the grading tag — and NEVER mention it in the visible debrief:
<!-- SECTION_MARKS {"sectionA":{"awarded":<int 0-${flight?.subtotal ?? 0}>,"outOf":${flight?.subtotal ?? 0}},"sectionB":{"awarded":<int 0-${perWine?.subtotal ?? 0}>,"outOf":${perWine?.subtotal ?? 0}}} -->
The two awarded values MUST sum to your overall estimated marks.`;
  }

  // LAST in the system prompt, deliberately. MARKING_PRINCIPLES ends with its own "Tone — faithful
  // verdict, constructive voice" section, and a candidate who chose The Examiner or The Cellar Rat
  // must not be read that instruction last. The invariants inside the block are what keep the
  // override confined to wording: the verdict stays faithful either way.
  const persona = personaBlock(await getUserPersona(userId), "grading");

  const { model, abGroup } = await selectModel("full_debrief", apiKey, "opus");
  const t0 = Date.now();
  // Adaptive thinking so the debrief's reasoning streams while the (long) markdown is composed.
  // The wines are already revealed at debrief time, so this is not a spoiler surface.
  const stream = await client.messages.stream({
    model,
    system:
      systemPrompt + sectionMarksBlock + "\n" + IMAGE_TOKEN_INSTRUCTIONS + "\n" + INFOGRAPHIC_INSTRUCTIONS +
      "\n" + answerImageConstraint(wines) + "\n\n" + persona,
    messages: [{ role: "user", content: userMessage }],
    ...(await withThinking(model, 4000, userId)),
  } as Parameters<typeof client.messages.stream>[0]);

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        let fullText = "";
        // Resolve image tokens AS THEY STREAM and push each one the moment it's ready, so the hero
        // (line 1) and inline images surface mid-generation instead of all at the end.
        const imageStreamer = createImageStreamer(
          userId,
          (token, markdown) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ image: { token, markdown } })}\n\n`)),
          imageAllowList
        );
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullText += event.delta.text;
            imageStreamer.feed(fullText);
            const jsonChunk = JSON.stringify({ t: event.delta.text });
            controller.enqueue(
              encoder.encode(`data: ${jsonChunk}\n\n`)
            );
          } else if (
            event.type === "content_block_delta" &&
            event.delta.type === "thinking_delta"
          ) {
            controller.enqueue(encoder.encode(thinkingFrame(event.delta.thinking)));
          }
        }
        const final = await stream.finalMessage();
        logClaudeUsage(
          { taskType: "full_debrief", model, source: usageSource, userId, abGroup },
          final.usage,
          { latencyMs: Date.now() - t0 }
        );
        // Wait for any in-flight incremental image fetches, then send the enriched markdown as the
        // authoritative final text (the client saves this). Images resolved above are cache hits now,
        // so this is cheap. Best-effort — tokens are stripped on failure.
        // Phase 4b (detect-only): pull the hidden GRADING_META tag, strip it from the saved text, and
        // log any howler/cascade override the grader should have applied. Does NOT change the verdict.
        const { meta, cleanedText } = extractGradingMeta(fullText);

        // ANSWER-KEY CLAIM CHECK (fb_188 / fb_175 / fb_135). The debrief prose can assert wine facts the
        // key contradicts — a curveball called a banker, "Prosecco is not traditional method", a quality
        // hierarchy flattened to geography. Validate the finished prose against the keyed flight and, on a
        // hard violation, run ONE targeted correction pass.
        //
        // This runs BEFORE image enrichment on purpose: the corrector rewrites markdown, and it must not
        // be handed resolved <img> markup to preserve — only the compact [[IMG:...]] tokens.
        //
        // The candidate has already watched the original stream in. The `{enriched}` frame below is the
        // documented authoritative final text — use-streaming.ts replaces its buffer with it verbatim and
        // that is what gets persisted — so pushing the corrected prose through it corrects BOTH the view
        // and the saved record. Nothing here can block grading: a correction failure serves the original.
        const claimCheck = await regenerateFeedbackOnce(cleanedText, keyedFlight, async (_reason, violations) => {
          const t1 = Date.now();
          const prompt = buildClaimCorrectionPrompt(cleanedText, violations);
          const corrected = await client.messages.create({
            model,
            // The corrected debrief is a rewrite of the original, so it needs at least its own length
            // back. Reuse the grader's own budget rather than guessing a smaller one and truncating.
            max_tokens: 8000,
            system: prompt.system,
            messages: [{ role: "user", content: prompt.user }],
          });
          logClaudeUsage(
            { taskType: "debrief_claim_correction", model, source: usageSource, userId, abGroup },
            corrected.usage,
            { latencyMs: Date.now() - t1 }
          );
          return corrected.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("");
        });
        await recordGradingOverrideCheck(meta, {
          grader: "full_debrief",
          userId,
          paper,
          claims: claimCheck,
        });

        let finalText = claimCheck.feedback;
        try {
          await imageStreamer.flush();
          const enriched = await enrichFeedbackWithImages(claimCheck.feedback, userId, imageAllowList);
          finalText = enriched;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ enriched })}\n\n`));
        } catch (enrichErr) {
          console.error("full-debrief image enrichment failed:", enrichErr);
          // Enrichment failed but the prose may still have been CORRECTED — the client is holding the
          // uncorrected stream, so the corrected text has to reach it even without images.
          if (claimCheck.regenerated) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ enriched: finalText })}\n\n`));
          }
        }
        // Persist-on-completion hook (Live Tasting): runs BEFORE [DONE] so the client only sees a
        // finished stream once the server-side save landed. Errors surface on the stream.
        if (onComplete) await onComplete(finalText);
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: err instanceof Error ? err.message : "unknown" })}\n\n`
          )
        );
        controller.close();
      }
    },
  });
}
