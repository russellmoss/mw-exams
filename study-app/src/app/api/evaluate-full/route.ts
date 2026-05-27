import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const {
      questionText,
      preGlassReasoning,
      userAnswer,
      modelAnswer,
      paper,
    } = await request.json();

    if (!questionText || !userAnswer || !paper) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const paperName =
      paper === 1
        ? "Paper 1 (White Wines)"
        : paper === 2
          ? "Paper 2 (Red Wines)"
          : "Paper 3 (Special)";

    const systemPrompt = `You are a Master of Wine exam coach providing a comprehensive end-of-question debrief for ${paperName}. You will evaluate both the candidate's pre-glass reasoning AND their full answer.

## Your coaching approach
- Be constructive and specific, not harsh. This is a study tool.
- Lead with what they did well before addressing gaps.
- If their reasoning is sound but reaches a different conclusion, give credit.
- Connect feedback to the MW decision tree approach: show how the tree would have routed this question.
- Use the examiner's Seven Cardinal Rules as your rubric.

## The Seven Cardinal Rules
1. Reasoning > Identification — sound logic with wrong answer earns marks
2. Quality must be contextualized — official classifications, price points
3. No shoehorning — decide from structure, verify with aromatics
4. Answer each sub-question separately
5. Maturity: current age, ready now?, improve how long?, hold how long?
6. Commercial: channel, geography, price, competitive set
7. Structural evidence is foundation

## Output structure
Use this exact structure:

### Pre-Glass Analysis Review
**What you identified well:** [specific signals they caught]
**What the stem also tells us:** [signals they missed, framed as coaching]
**Decision tree routing:** [how the tree would approach this stem — Layer A only]

### Answer Evaluation
**Result: [PASS / BORDERLINE / FAIL]**
**Estimated marks: [range out of total]**

[2-3 sentences on overall performance]

**Per sub-question:**

**a) [topic]** ([marks])
- Strengths: ...
- Could improve: ...
- Estimated: X/Y marks

[Repeat for b), c), d) etc.]

### Key Takeaways
1. [Most important thing to focus on next]
2. [Second priority]
3. [Third priority]

Keep total feedback under 800 words. Be specific, not generic.`;

    let userMessage = `## Question
${questionText}

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
