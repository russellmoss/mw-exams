// The tool registry and the single choke point that decides what the model is allowed to see.
//
// Everything about the Coach's exam-integrity guarantee reduces to `toolsFor()`. It is deliberately
// the only place a tool list is constructed — nothing else in the codebase may assemble one — so the
// integrity test can assert the exact list per attempt state and be sure it is asserting reality.

import type { CoachTool, CoachToolContext } from "./types";
import type { CoachState } from "./state";
import { queryCorpus, queryExaminerThinking } from "./tools/corpus-tools";
import {
  getDecisionTree,
  queryEmpiricalKnowledge,
  queryMyPerformance,
  searchWinemakingScience,
} from "./tools/study-tools";
import { getScreenContext } from "./tools/screen-tools";
import { getAttemptDebrief } from "./tools/debrief-tools";
import { searchWineWeb } from "./tools/web-tools";
import { setPersona } from "./tools/persona-tools";
import { WRITE_TOOLS } from "./tools/write-tools";

export const ALL_TOOLS: CoachTool[] = [
  queryCorpus,
  queryExaminerThinking,
  queryEmpiricalKnowledge,
  getDecisionTree,
  queryMyPerformance,
  searchWinemakingScience,
  // Not flagged `restrictedWhenAttemptOpen`, deliberately: withholding it entirely would make the
  // Coach blind to the question precisely when knowing the stem is most useful ("how do I split my
  // eight minutes here?"). It redacts instead, via a column allow-list — see screen-tools.ts.
  getScreenContext,
  // Gated per-attempt rather than globally (see debrief-tools.ts): a FINISHED attempt's wines are
  // already on the candidate's own debrief screen, so reviewing it while a different question
  // happens to be open is not a leak.
  getAttemptDebrief,
  searchWineWeb,
  // Available throughout, including mid-attempt: a candidate who is finding the voice grating
  // needs to be able to stop it now, and "finish your question first" is no answer to that.
  setPersona,
  ...WRITE_TOOLS,
];

/**
 * The tools this user may use right now.
 *
 * ONE filter: while an attempt is open, `restrictedWhenAttemptOpen` tools are dropped.
 *
 * Write tools used to be withheld here too, on the theory that a confirmation card interrupts a
 * candidate on the clock. That was withdrawn when the standalone Feedback tab was removed and the
 * Coach became the only way to report anything: the tab worked mid-attempt, so refusing to file a
 * report until the candidate finished would have been a straight regression. The interruption
 * argument was weak anyway — opening the dock now pauses the study timer, so the time is not
 * theirs to lose.
 */
export function toolsFor(state: CoachState): CoachTool[] {
  return ALL_TOOLS.filter((t) => {
    if (state.restricted && t.restrictedWhenAttemptOpen) return false;
    return true;
  });
}

/** Anthropic tool definitions for the current turn. */
export function toolDefinitions(state: CoachState) {
  return toolsFor(state).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

/**
 * Dispatch by name, re-checking availability at call time.
 *
 * The re-check is not paranoia about the model — it is the H2 race. State is resolved when the turn
 * starts, but a bounded 8-turn loop can run for minutes, and the candidate may begin an attempt in
 * another tab midway through. Looking the tool up in the CURRENT allow-list rather than trusting the
 * list we handed out means the gate closes mid-conversation rather than at the next message.
 */
export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: CoachToolContext
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const tool = toolsFor(ctx.state).find((t) => t.name === name);
  if (!tool) {
    const exists = ALL_TOOLS.some((t) => t.name === name);
    return {
      ok: false,
      error: exists
        ? "That tool is unavailable while you have a question open. Finish or submit the attempt first — " +
          "I can help with structure, timing and what the question is asking for in the meantime."
        : `Unknown tool: ${name}`,
    };
  }
  try {
    return { ok: true, result: await tool.run(ctx, input) };
  } catch (err) {
    console.error(`[coach] tool ${name} threw:`, err);
    return { ok: false, error: err instanceof Error ? err.message : "Tool failed" };
  }
}
