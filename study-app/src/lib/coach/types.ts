import type Anthropic from "@anthropic-ai/sdk";
import type { CoachState } from "./state";

/**
 * Everything a tool is allowed to know. Resolved server-side per request — never sent by the client
 * and never inferred from the model's arguments, both of which are attacker-controlled in the sense
 * that matters here (a candidate can type anything, and the model will happily relay it).
 */
/**
 * What the client says is on screen.
 *
 * A DISPLAY HINT, NEVER AN AUTHORISATION INPUT. Everything here arrives from the browser and is
 * therefore attacker-controlled — a candidate can post any `questionId` they like. Tools that act on
 * it must re-establish the user's right to see it server-side (get_screen_context checks that the
 * user actually has an attempt on that question) and must never widen access because the client
 * asked nicely. Restriction is decided by `state`, which the client cannot influence at all.
 */
export interface CoachScreenHint {
  route?: string | null;
  mode?: string | null;
  paper?: number | null;
  questionId?: string | null;
  attemptId?: number | null;
  wineIndex?: number | null;
}

export interface CoachToolContext {
  userId: number;
  state: CoachState;
  /** The user's own Anthropic key (BYOK). Only tools that make their own model calls need it. */
  apiKey: string;
  screen?: CoachScreenHint | null;
}

export interface CoachTool {
  name: string;
  description: string;
  kind: "read" | "write";
  /**
   * Withheld from the model entirely while the user has an attempt open.
   *
   * THE THREAT MODEL, and why this flag is set on almost nothing (revised 2026-08-07).
   *
   * The first cut of this restricted every reference tool — trees, precedent, tiered rulings — on
   * the theory that routing a stem IS the identification. That was wrong, for a simple reason: the
   * decision trees and the study diagrams are already one click away in the Library while an
   * attempt is open, and question-index.json is a public static asset. Withholding them from the
   * Coach protected no secret; it just made the Coach worse than a second browser tab, and it
   * blocked the single most valuable thing a candidate can practise — routing a live stem through
   * the tree, which is exactly how the trees get learned.
   *
   * So the line moved to where it actually belongs. What must never happen is the Coach **handing
   * over a conclusion about the wine in the candidate's glass** — and, in Phase 2, reading that
   * question's stored answer key. The first is behavioural and lives in the process-mode prompt
   * (coach the routing, never state the verdict). The second is structural and is what this flag
   * exists for:
   *
   *   get_screen_context   (Phase 2) reads the live generated_questions row — wines, model answer,
   *                        wine profile. This one is genuinely secret and stays hard-gated.
   *
   * Reference tools — get_decision_tree, query_corpus, query_empirical_knowledge,
   * query_examiner_thinking, query_my_performance, search_winemaking_science — are study material
   * the candidate already has, and are available throughout.
   */
  restrictedWhenAttemptOpen?: boolean;
  /**
   * Write tools are withheld while an attempt is open — a confirmation card is an interruption when
   * the candidate is on the clock. This opts one back in.
   *
   * Set on flag_defect alone, because a genuinely broken question is wasting their time RIGHT NOW,
   * and making them finish it before they can say so is the wrong trade.
   */
  allowedWhenAttemptOpen?: boolean;
  /**
   * JSON Schema, passed verbatim as the Anthropic `input_schema`. Typed as the SDK's own
   * InputSchema rather than a loose record so a malformed schema is a compile error here, not a
   * 400 from the API at the moment a candidate asks a question.
   */
  inputSchema: Anthropic.Tool.InputSchema;
  run: (ctx: CoachToolContext, input: Record<string, unknown>) => Promise<unknown>;
}
