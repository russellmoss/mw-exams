// The Coach's tool-use loop.
//
// Bounded twice, on purpose. MAX_TURNS caps iterations; DEADLINE_MS caps wall-clock. They are not
// the same bound and neither implies the other: eight fast lookups finish in seconds, while two slow
// ones plus a retrieval can outlive the Vercel route cap. Only the wall-clock bound prevents the
// failure that actually matters — the function being killed mid-stream, leaving the candidate with a
// half-written answer and nothing persisted.

import Anthropic from "@anthropic-ai/sdk";
import { selectModel } from "@/lib/model-selector";
import { getUserPersona } from "@/lib/persona-server";
import { restyleForPersona } from "@/lib/persona-restyle";
import { needsRestyle } from "@/lib/personas";
import { logClaudeUsage } from "@/lib/usage-log";
import type { ProgressEmitter } from "@/lib/thinking-stream";
import { resolveCoachState, type CoachState } from "./state";
import type { CoachScreenHint } from "./types";
import { dispatchTool, toolDefinitions } from "./registry";
import { buildSystemBlocks, tierForTurn } from "./prompt";
import { runGuards } from "./guards";
import { asProposal, createProposalToken } from "./confirm";

export interface CoachProposalCard {
  tool: string;
  preview: string;
  details: { label: string; value: string }[];
  blockers?: string[];
  /** Null on a draft — the card is then structurally uncommittable. */
  token: string | null;
}

/**
 * The identifiers to sign, resolved once so the card and the commit cannot disagree.
 *
 * THE INVARIANT: what gets executed must be what the card displayed. The write tools resolve the
 * target as `input.questionId || screen.questionId` — the model's, falling back to the screen — and
 * display that. So the signed args have to resolve it the SAME way round. An earlier version let the
 * screen override the model here while the card showed the model's choice, which meant that asking
 * "report that Semillon question from earlier" with a different question open displayed one id and
 * filed against another. Silently, and the card looked right.
 *
 * questionId and attemptId travel together or not at all. The screen's attemptId belongs to the
 * screen's question; pairing it with a question the candidate named from earlier would hang the
 * feedback off an unrelated attempt — which recordTabFeedback would faithfully honour.
 */
export function proposalArgs(
  tool: string,
  input: Record<string, unknown>,
  opts: { screen?: CoachScreenHint | null }
): Record<string, unknown> {
  /**
   * file_bug carries the question as CONTEXT, not as a target, and takes THREE deliberate
   * differences from the two report paths above.
   *
   * WHY IT NEEDS ONE AT ALL. A bug found while looking at a question is nearly always about that
   * question's rendering — the marks footer, a truncated stem, wines that won't reveal. Filed
   * without the id (which is what happened before this: `file_bug` was excluded here and its
   * committer hard-coded `questionId: null`) the report reaches an admin as "General feedback"
   * with the question named only in prose, if the model happened to mention it. Attempt 407 is the
   * worked example — a footer summing to 44 instead of 50, unattributable without reading the body.
   *
   * NO attemptId. The row is filed as app-level feedback (scope 'general'), which is never hung off
   * an attempt, so signing one in would be signing a field nothing reads.
   *
   * SCREEN ONLY, never a model-named id. `fileBug`'s schema deliberately has no questionId
   * property, so `input.questionId` is always absent and this cannot disagree with the card. That
   * also keeps the FK safe: the screen's id is one the server resolved, whereas a model-invented id
   * would fail `user_attempts_question_id_fkey` at commit and lose a bug report over a detail that
   * was only ever context.
   */
  if (tool === "file_bug") {
    return opts.screen?.questionId ? { questionId: opts.screen.questionId } : {};
  }

  if (tool !== "report_question" && tool !== "flag_defect") return {};

  const named = typeof input.questionId === "string" && input.questionId ? input.questionId : null;
  // Keys are only added when they have a value. Spreading `{questionId: undefined}` over the model's
  // input would erase a question id it correctly supplied, and the committer would then refuse a
  // report the candidate had already confirmed.
  const out: Record<string, unknown> = {};

  if (named && named !== opts.screen?.questionId) {
    // A question other than the one on screen. Take the model's id and no attempt — there is no
    // attempt in hand for it, and recordTabFeedback creates the row it needs from the question alone.
    out.questionId = named;
    return out;
  }

  if (opts.screen?.questionId) out.questionId = opts.screen.questionId;
  if (opts.screen?.attemptId != null) out.attemptId = opts.screen.attemptId;
  return out;
}

const MAX_TURNS = 8;
/**
 * Wall-clock budget. The route is capped at 300s by Vercel; stopping at 240 leaves room to persist
 * the exchange, run the guards and flush the stream rather than being killed with all of that undone.
 */
const DEADLINE_MS = 240_000;
const MAX_TOKENS = 4096;

export interface CoachTurnResult {
  text: string;
  toolsUsed: string[];
  /** Confirmation cards raised this turn. Nothing has been executed. */
  proposals: CoachProposalCard[];
  guardCodes: string[];
  model: string;
  state: CoachState;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  /** True when the loop stopped on its own bounds rather than because the model finished. */
  truncated: boolean;
}

export type CoachMessage = Anthropic.MessageParam;

export async function runCoachTurn(opts: {
  userId: number;
  apiKey: string;
  /** Full replayed thread, oldest first, ending with the new user message. */
  messages: CoachMessage[];
  /** Tools already used earlier in this conversation — drives prompt-tier promotion. */
  priorTools: string[];
  /** What the browser says is on screen. A hint only — see CoachScreenHint. */
  screen?: CoachScreenHint | null;
  emit?: ProgressEmitter;
}): Promise<CoachTurnResult> {
  // Images are attached to the LAST user message only. Anthropic accepts them anywhere, but sending
  // one screenshot per turn for the rest of the conversation would re-bill the candidate for the
  // same pixels on every subsequent request under BYOK.
  const started = Date.now();
  const client = new Anthropic({ apiKey: opts.apiKey });
  const { model, abGroup } = await selectModel("coach", opts.apiKey, "sonnet");

  let state = await resolveCoachState(opts.userId);
  // Resolved once for the turn's OUTPUT decision. The system blocks re-read it per hop so
  // `set_persona` lands mid-turn; this one only decides whether a re-voicing pass follows, and
  // flipping that halfway through a turn would strand half a reply in each voice.
  const turnPersona = await getUserPersona(opts.userId);
  // True only for a persona whose copy comes from another vendor: Claude wrote this turn in its
  // own neutral voice (resolvePersonaFor pins it), so the chosen voice has not spoken yet.
  const willRestyle = needsRestyle(turnPersona, "chat");
  const messages: CoachMessage[] = [...opts.messages];
  const toolsUsed: string[] = [];
  const proposals: CoachProposalCard[] = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let finalText = "";
  let truncated = false;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (Date.now() - started > DEADLINE_MS) {
      truncated = true;
      break;
    }

    // Re-read inside the loop, not once above it, so `set_persona` takes effect on the very next
    // hop rather than at the next message — the candidate asks the Coach to stop being nice and
    // the reply they are waiting on is already in the new voice. Cached and invalidated on write
    // (see persona-server), so the extra iterations are not extra queries.
    const system = await buildSystemBlocks({
      tier: tierForTurn({ toolsUsedSoFar: [...opts.priorTools, ...toolsUsed] }),
      state,
      screen: opts.screen,
      persona: await getUserPersona(opts.userId),
    });

    const stream = client.messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      system,
      tools: toolDefinitions(state),
      messages,
    });

    // Forward text as it arrives. Tool-use argument deltas are deliberately not forwarded — they are
    // half-formed JSON and mean nothing to a reader.
    stream.on("text", (delta) => {
      finalText += delta;
      // Withheld when a rewrite is coming, so the candidate does not watch the neutral answer
      // type itself out and then get replaced.
      if (!willRestyle) opts.emit?.({ type: "thinking", delta });
    });

    const message = await stream.finalMessage();
    usage.input += message.usage?.input_tokens ?? 0;
    usage.output += message.usage?.output_tokens ?? 0;
    usage.cacheRead += message.usage?.cache_read_input_tokens ?? 0;
    usage.cacheWrite += message.usage?.cache_creation_input_tokens ?? 0;

    const toolUses = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) break;

    // Re-resolve before dispatching. The loop can run for minutes and the candidate may have opened
    // a question in another tab since the turn began (plan H2) — the gate has to close now, not at
    // the next message.
    state = await resolveCoachState(opts.userId);

    messages.push({ role: "assistant", content: message.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      opts.emit?.({ type: "status", label: labelFor(tu.name) });
      const outcome = await dispatchTool(
        tu.name,
        (tu.input ?? {}) as Record<string, unknown>,
        { userId: opts.userId, state, apiKey: opts.apiKey, screen: opts.screen ?? null }
      );
      if (outcome.ok) {
        toolsUsed.push(tu.name);

        // A write tool returns a PROPOSAL, never a result. Intercept it before it reaches the
        // model: emit a confirmation card to the client, and hand the model back a note saying the
        // card was shown. Without that note the model tends to call the tool again, having seen no
        // result — and then the candidate gets two identical cards.
        const p = asProposal(outcome.result);
        if (p) {
          const blocked = (p.blockers?.length ?? 0) > 0;
          // A draft ships with NO token, so it is uncommittable by construction rather than by the
          // client agreeing not to submit it.
          const token = blocked
            ? null
            : createProposalToken({
                tool: tu.name,
                args: {
                  ...(tu.input as Record<string, unknown>),
                  ...proposalArgs(tu.name, (tu.input ?? {}) as Record<string, unknown>, opts),
                },
                userId: opts.userId,
              });
          proposals.push({ tool: tu.name, preview: p.preview, details: p.details, blockers: p.blockers, token });
          opts.emit?.({ type: "status", label: "Waiting for your confirmation…" });
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: blocked
              ? `A DRAFT card was shown to the user: "${p.preview}". It cannot be sent yet — missing: ${p.blockers!.join("; ")}. Ask them for exactly what is missing. Do not call this tool again this turn.`
              : `A confirmation card was shown to the user: "${p.preview}". Nothing has been sent yet — they must press Confirm. Do not call this tool again, and do not claim it is done.`,
          });
          continue;
        }

        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(outcome.result).slice(0, 60_000),
        });
      } else {
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: outcome.error,
          is_error: true,
        });
      }
    }
    // Every result goes back in ONE user message — the API requires each tool_use to be answered
    // before the next assistant turn, and splitting them across messages breaks the pairing.
    messages.push({ role: "user", content: results });

    // Separate this turn's prose from the next turn's. The model often narrates before calling a
    // tool ("Let me check the corpus.") and then continues after the result, and without this the
    // two run together mid-sentence: "…check the corpus.Here is what I found". A paragraph break is
    // right rather than a space — they are separate thoughts with a tool call between them.
    if (finalText && !/\n\n$/.test(finalText)) {
      const sep = finalText.endsWith("\n") ? "\n" : "\n\n";
      finalText += sep;
      if (!willRestyle) opts.emit?.({ type: "thinking", delta: sep });
    }
  }

  if (truncated) {
    finalText +=
      "\n\n---\n\n*I ran out of time on that one before I could finish looking things up. Ask me again — " +
      "narrowing the question usually gets there faster.*";
  }

  // PASS 2 — hand the finished answer to the persona's own copy vendor. Claude has already done
  // every lookup, every citation and every judgement in this turn; what comes back is the same
  // answer in a different mouth, and the fingerprint gate discards it if it is not.
  if (willRestyle && finalText.trim()) {
    const restyled = await restyleForPersona({
      neutralText: finalText,
      persona: turnPersona,
      surface: "chat",
      client,
      apiKey: opts.apiKey,
      userId: opts.userId,
      usage: { taskType: "coach_persona_restyle", source: "user", userId: opts.userId },
      maxTokens: MAX_TOKENS,
      onDelta: (delta) => opts.emit?.({ type: "thinking", delta }),
    });
    if (restyled.outcome === "applied") {
      finalText = restyled.text;
    } else {
      // Nothing was streamed (the gate rejected before onDelta, or the vendor was unreachable), so
      // emit the neutral answer now — otherwise the candidate watches a spinner produce nothing.
      console.warn(`[coach] restyle not applied (${restyled.outcome}); serving the neutral reply`);
      opts.emit?.({ type: "thinking", delta: finalText });
    }
  }

  // Guards run on what the candidate will actually READ, so they have to see the re-voiced text.
  const guarded = runGuards({ text: finalText, toolsUsed, committed: false });

  logClaudeUsage(
    // source: "user" — the Coach always runs on the candidate's own BYOK key, so this spend is
    // theirs, not the app's. The cost dashboard splits on exactly this field.
    { taskType: "coach", model, source: "user", userId: opts.userId, abGroup },
    {
      input_tokens: usage.input,
      output_tokens: usage.output,
      cache_read_input_tokens: usage.cacheRead,
      cache_creation_input_tokens: usage.cacheWrite,
    },
    { latencyMs: Date.now() - started, success: true }
  );

  return {
    text: guarded.text,
    toolsUsed,
    proposals,
    guardCodes: guarded.codes,
    model,
    state,
    usage,
    truncated,
  };
}

/** Human-readable progress labels. Safe by construction — no tool argument is ever interpolated. */
function labelFor(tool: string): string {
  switch (tool) {
    case "query_corpus":
      return "Searching the past papers…";
    case "query_examiner_thinking":
      return "Reading the examiners' reports…";
    case "query_empirical_knowledge":
      return "Checking what we know…";
    case "get_decision_tree":
      return "Opening the decision tree…";
    case "query_my_performance":
      return "Looking at your record…";
    case "get_attempt_debrief":
      return "Reading back what you wrote…";
    case "get_screen_context":
      return "Looking at the question…";
    case "search_winemaking_science":
      return "Searching the technical corpus…";
    case "search_wine_web":
      return "Checking tier-1 sources…";
    case "set_persona":
      return "Changing voice…";
    default:
      return "Working…";
  }
}
