import type Anthropic from "@anthropic-ai/sdk";
import { requireApiKey } from "@/lib/api-key";
import { getUser } from "@/lib/auth";
import { sseStream } from "@/lib/thinking-stream";
import { isCoachEnabled } from "@/lib/settings";
import { runCoachTurn } from "@/lib/coach/run";
import {
  appendMessage,
  conversationExists,
  createConversation,
  listConversations,
  loadThread,
  saveScreenshot,
  toAnthropicMessages,
} from "@/lib/coach/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The loop's own budget is 240s (src/lib/coach/run.ts); this leaves headroom to persist and flush.
export const maxDuration = 300;

const MAX_MESSAGE_CHARS = 4000;
/** ~3.7MB of PNG. The client downscales to 1568px, so a legitimate capture lands far under this. */
const MAX_SCREENSHOT_CHARS = 5_000_000;

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** GET /api/coach — the user's recent conversations, for the dock's history menu. */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
  if (!(await isCoachEnabled())) return Response.json({ enabled: false, conversations: [] });

  return Response.json({ enabled: true, conversations: await listConversations(user.id) });
}

/**
 * POST /api/coach — one chat turn, streamed as SSE.
 * Body: { message: string, conversationId?: string }
 */
export async function POST(request: Request) {
  if (!(await isCoachEnabled())) {
    return Response.json({ error: "The Coach is currently unavailable." }, { status: 503 });
  }

  // BYOK. A non-admin without their own Anthropic key gets 402 here — the dock turns that into
  // "add your key in Settings" rather than a generic failure, because it is a setup step, not a bug.
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  const { user, apiKey } = keyResult;

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });
  if (message.length > MAX_MESSAGE_CHARS) {
    return Response.json({ error: `Message too long (max ${MAX_MESSAGE_CHARS} characters)` }, { status: 400 });
  }

  // An unknown or someone else's conversation id starts a fresh thread rather than erroring: the id
  // is only ever a continuation hint, and ownership is enforced by the same check.
  const requested = typeof body?.conversationId === "string" ? body.conversationId : null;
  const conversationId =
    requested && (await conversationExists(requested, user.id))
      ? requested
      : await createConversation(user.id, message.slice(0, 80));

  // A screenshot, if the candidate consented to one. Size-capped before it reaches the model:
  // under BYOK an oversized capture is billed to them, and a 5MB base64 blob would also blow the
  // request body limit before it ever got that far.
  const shot =
    typeof body?.screenshot === "string" && body.screenshot.length > 0
      ? body.screenshot.slice(0, MAX_SCREENSHOT_CHARS)
      : null;
  if (typeof body?.screenshot === "string" && body.screenshot.length > MAX_SCREENSHOT_CHARS) {
    return Response.json({ error: "That screenshot is too large." }, { status: 413 });
  }

  return sseStream(async (emit) => {
    const priorRows = await loadThread(conversationId);
    const priorTools = priorRows.flatMap((r) => r.tools_used || []);
    const history = toAnthropicMessages(priorRows);

    const userMessageId = await appendMessage({ conversationId, role: "user", text: message });
    if (shot) {
      await saveScreenshot({
        userId: user.id,
        conversationId,
        messageId: userMessageId,
        base64: shot,
      }).catch((e) => console.error("[coach] screenshot persist failed:", e));
    }

    const userContent: Anthropic.ContentBlockParam[] = shot
      ? [
          { type: "image", source: { type: "base64", media_type: "image/png", data: shot } },
          { type: "text", text: message },
        ]
      : [{ type: "text", text: message }];

    const result = await runCoachTurn({
      userId: user.id,
      apiKey,
      messages: [...history, { role: "user", content: userContent }],
      priorTools,
      // Sanitised, and a hint only — restriction is decided server-side by resolveCoachState, which
      // nothing here can influence. Strings are length-capped so a hostile client cannot inflate the
      // prompt (and the user's own token bill) through this channel.
      screen: body?.screen
        ? {
            route: str(body.screen.route, 200),
            mode: str(body.screen.mode, 40),
            paper: num(body.screen.paper),
            questionId: str(body.screen.questionId, 120),
            attemptId: num(body.screen.attemptId),
            wineIndex: num(body.screen.wineIndex),
          }
        : null,
      emit,
    });

    const messageId = await appendMessage({
      conversationId,
      role: "assistant",
      text: result.text,
      model: result.model,
      attemptState: result.state.state,
      toolsUsed: result.toolsUsed,
      usage: result.usage,
    });

    return {
      conversationId,
      messageId,
      text: result.text,
      toolsUsed: result.toolsUsed,
      proposals: result.proposals,
      guardCodes: result.guardCodes,
      attemptState: result.state.state,
      restricted: result.state.restricted,
      truncated: result.truncated,
      // Shown in the dock. Under BYOK the candidate is paying for this turn, so they get to see it.
      usage: result.usage,
    };
  });
}
