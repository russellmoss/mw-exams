import Anthropic from "@anthropic-ai/sdk";
import { requireApiKey } from "@/lib/api-key";

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
- Be constructive and specific, not harsh. This is a study tool.
- Lead with what they did well before addressing gaps.
- If their reasoning is sound but reaches a different conclusion, give credit.
- Connect feedback to the MW decision tree approach.
- Use the examiner's Seven Cardinal Rules as your rubric.

## The Seven Cardinal Rules
1. Reasoning > Identification — sound logic with wrong answer earns marks
2. Quality must be contextualized — official classifications, price points
3. No shoehorning — decide from structure, verify with aromatics
4. Answer each sub-question separately
5. Maturity: current age, ready now?, improve how long?, hold how long?
6. Commercial: channel, geography, price, competitive set
7. Structural evidence is foundation

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

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const jsonChunk = JSON.stringify({ t: event.delta.text });
              controller.enqueue(
                encoder.encode(`data: ${jsonChunk}\n\n`)
              );
            }
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
