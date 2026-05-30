import Anthropic from "@anthropic-ai/sdk";
import { requireApiKey } from "@/lib/api-key";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import { FUNNELLING_PRINCIPLE } from "@/lib/prompts/funnelling";
import { MARKING_PRINCIPLES } from "@/lib/prompts/marking-principles";
import { IMAGE_TOKEN_INSTRUCTIONS, enrichFeedbackWithImages } from "@/lib/media";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;

    const {
      questionText,
      preGlassReasoning,
      userAnswer,
      modelAnswer,
      paper,
      wineAppearances,
    } = await request.json();

    if (!questionText || !userAnswer || !paper) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: keyResult.apiKey });

    const paperName =
      paper === 1
        ? "Paper 1 (White Wines)"
        : paper === 2
          ? "Paper 2 (Red Wines)"
          : "Paper 3 (Special)";

    const systemPrompt = `You are a Master of Wine exam coach providing a two-part debrief for ${paperName}. The debrief is split into BEFORE THE GLASS (stem analysis) and IN THE GLASS (tasting and answer writing).

## Your coaching approach
- **Faithful verdict, constructive voice.** Grade exactly as the IMW would (per the Marking Principles below — including a howler tipping a borderline to fail, and zeroing fabricated/cascade sub-answers); do not inflate the result because this is a study tool. Keep the *wording* encouraging.
- Lead with what they did well before addressing gaps.
- If their reasoning is sound but reaches a different conclusion, give credit.
- Connect feedback to the MW decision tree approach.

${MARKING_PRINCIPLES}

${FUNNELLING_PRINCIPLE}

In the "In the Glass" section, explicitly assess the candidate's funnelling on identity/origin: did they read structure first, weigh plausible alternatives, commit to a variety+region anchor early, and land a decisive call? Reward a well-reasoned funnel (even to a wrong-but-plausible call) over a snap-call that names one wine outright, and call out shoehorning or hedging by name with the funnel they should have run.

## Output structure — follow this EXACTLY

---

## Before the Glass

This section evaluates the candidate's pre-glass stem analysis only.

### What you identified well
[Bullet list of specific signals they correctly caught from the stem]

### What the stem also tells us
[Signals they missed or underweighted, framed as coaching not criticism. Be specific about what the stem language implies.]

### How the decision tree routes this question
[Walk through Layer A (stem routing) step by step. Name the specific tree nodes:
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

Keep total feedback under 1000 words. Be specific, not generic. Use the exact heading structure above so the UI can parse and display it cleanly.`;

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

    userMessage += `

Please provide the full debrief: pre-glass review, answer evaluation with pass/fail and per-sub-question marks, and key takeaways.`;

    const { model, abGroup } = await selectModel("full_debrief", keyResult.apiKey, "opus");
    const t0 = Date.now();
    const stream = await client.messages.stream({
      model,
      max_tokens: 3000,
      system: systemPrompt + "\n" + IMAGE_TOKEN_INSTRUCTIONS,
      messages: [{ role: "user", content: userMessage }],
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let fullText = "";
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              fullText += event.delta.text;
              const jsonChunk = JSON.stringify({ t: event.delta.text });
              controller.enqueue(
                encoder.encode(`data: ${jsonChunk}\n\n`)
              );
            }
          }
          const final = await stream.finalMessage();
          logClaudeUsage(
            { taskType: "full_debrief", model, source: keyResult.source, userId: keyResult.user.id, abGroup },
            final.usage,
            { latencyMs: Date.now() - t0 }
          );
          // Resolve image tokens to cached, subtitled images; send the enriched markdown as the
          // authoritative final text (the client saves this). Best-effort — tokens are stripped on failure.
          try {
            const enriched = await enrichFeedbackWithImages(fullText, keyResult.user.id);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ enriched })}\n\n`));
          } catch (enrichErr) {
            console.error("full-debrief image enrichment failed:", enrichErr);
          }
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

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("evaluate-full error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
