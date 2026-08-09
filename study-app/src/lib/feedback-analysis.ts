import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { buildFeedbackAnalysisPrompt } from "@/lib/prompts/feedback-analysis-prompt";
import { createFeedbackAnalysis, updateFeedbackAnalysis, reviewFeedback, saveNarration, getEmpiricalKnowledgeForAnalysis, createFeatureRequestFromFeedback, endorseQuestionForAttempt, getUserVoiceId } from "@/lib/db";
import { selectModel, resolveTierModel, type ModelTier } from "@/lib/model-selector";
import { isAutoApplyEnabled } from "@/lib/settings";
import { applyFeedbackChange } from "@/lib/apply-change";
import { logClaudeUsage, logTavilyUsage } from "@/lib/usage-log";
import { synthesizeSpeech, isElevenLabsConfigured } from "@/lib/elevenlabs";
import { resolveTavilyKey } from "@/lib/tavily-key";
import { getUserPersona } from "@/lib/persona-server";
import { personaBlock } from "@/lib/personas";

/**
 * Server-side feedback analysis — the durable core of the "feedback → analysis →
 * (auto-apply)" pipeline. This used to live inline in the trigger route and was
 * kicked off by a CLIENT fire-and-forget fetch, which silently stranded feedback
 * whenever the page navigated/closed before the request landed (see EK app-bug
 * catalog). It now lives here so it can be driven server-side from save-attempt
 * (decoupled from the browser via `after()`) and from a cron/sweeper that
 * self-heals anything that still slips through. Takes an explicit apiKey so it
 * never depends on an incoming authenticated Request.
 */

const TAVILY_API_URL = "https://api.tavily.com/search";

/**
 * Output ceiling for one analysis. Was 4000, which SILENTLY LOST SIX VERDICTS.
 *
 * The verdict line ("Recommendation: ACCEPT|REJECT|PARTIAL|ENDORSE") is the LAST thing the prompt
 * asks for, so a response cut short at the ceiling loses precisely the one machine-read token in it.
 * extractRecommendation then falls through to "pending", applyRecommendation has no branch for
 * "pending", and the attempt keeps feedback_status = NULL — indistinguishable from feedback nobody
 * has looked at yet, except that the sweeper skips it forever (auto_analysis_id is already stamped).
 *
 * Why 4000 was enough and then wasn't: `message.content` is filtered to text blocks at the call site,
 * but `usage.output_tokens` bills for everything the model emits, thinking included. Measured over
 * this table's history — Sonnet 4.6 returns 3.98 characters of saved text per billed output token and
 * never once hit the ceiling in 31 runs; Opus 5 returns 1.37 and pinned 4000 exactly in 17 of 25.
 * The ceiling was sized against a model that spent it all on the answer.
 *
 * 16000 leaves room for the largest real analysis (11,856 chars ≈ 3k tokens) plus a thinking budget
 * several times its size. It costs nothing when unused — output is billed as generated, not as capped.
 */
export const ANALYSIS_MAX_TOKENS = 16000;

export type FeedbackAnalysisStatus =
  | "complete"
  | "already_analyzing"
  | "no_feedback"
  | "not_found"
  | "no_api_key"
  | "error";

export interface RunFeedbackAnalysisResult {
  status: FeedbackAnalysisStatus;
  analysisId?: number;
  recommendation?: string;
  autoApplied?: boolean;
  autoRejected?: boolean;
  autoPartial?: boolean;
  autoEndorsed?: boolean;
  error?: string;
}

// The attempt `feedback_status` each recommendation maps to once a decision is applied.
// (accept → "accepted" is set inside applyFeedbackChange; reject/partial/endorse via reviewFeedback.)
const STATUS_FOR_RECOMMENDATION: Record<string, string> = {
  accept: "accepted",
  reject: "rejected",
  partial: "partial",
  endorse: "endorsed",
};

/**
 * Does this recommendation actually resolve the feedback? Anything else — in practice the "pending"
 * that extractRecommendation returns when it finds no verdict line — leaves the attempt open with
 * nothing to apply, and must be treated as a failed run rather than a finished one.
 */
export function isTerminalRecommendation(recommendation: string): boolean {
  return Boolean(STATUS_FOR_RECOMMENDATION[recommendation]);
}

/**
 * Parse the analysis text's "Recommendation:" line. Single source of truth — the initial analysis
 * and the follow-up reply route both use this, so a recommendation added in one place can never be
 * silently unparseable in the other (endorse was nearly that bug).
 */
export function extractRecommendation(text: string): string {
  return /recommendation:\s*\*?\*?accept/i.test(text)
    ? "accept"
    : /recommendation:\s*\*?\*?reject/i.test(text)
      ? "reject"
      : /recommendation:\s*\*?\*?partial/i.test(text)
        ? "partial"
        : /recommendation:\s*\*?\*?endorse/i.test(text)
          ? "endorse"
          : "pending";
}

/**
 * Execute the Auto-Apply decision for a resolved recommendation. Extracted so the initial
 * analysis AND a follow-up reply that changes the verdict drive the exact same logic. Does NOT
 * itself check the Auto-Apply master switch — callers gate on `isAutoApplyEnabled()`.
 */
export async function applyRecommendation(
  attemptId: number,
  recommendation: string,
  opts?: { rejectNote?: string; partialNote?: string; endorseNote?: string }
): Promise<{ autoApplied: boolean; autoRejected: boolean; autoPartial: boolean; autoEndorsed: boolean }> {
  const r = { autoApplied: false, autoRejected: false, autoPartial: false, autoEndorsed: false };
  if (recommendation === "accept") {
    try {
      await applyFeedbackChange({ attemptId, appliedBy: "auto" });
      r.autoApplied = true;
    } catch (applyErr) {
      console.error("auto-apply dispatch failed:", applyErr);
    }
  } else if (recommendation === "reject") {
    try {
      await reviewFeedback(
        attemptId,
        "rejected",
        opts?.rejectNote ?? "Auto-rejected by Auto-Apply — analysis recommended reject.",
        "auto"
      );
      r.autoRejected = true;
    } catch (rejErr) {
      console.error("auto-reject failed:", rejErr);
    }
  } else if (recommendation === "partial") {
    try {
      await reviewFeedback(
        attemptId,
        "partial",
        opts?.partialNote ?? "Auto-marked partial by Auto-Apply — some points valid; review recommended (no code shipped).",
        "auto"
      );
      r.autoPartial = true;
    } catch (partErr) {
      console.error("auto-partial failed:", partErr);
    }
  } else if (recommendation === "endorse") {
    // Positive feedback: nothing to fix. Flag the question as an exemplar (feeds the generation
    // prompt + the miner's contrast class) and resolve with a status that thanks rather than
    // "rejects" the praise.
    try {
      await endorseQuestionForAttempt(attemptId);
    } catch (endErr) {
      console.error("question endorsement failed:", endErr); // still resolve the feedback below
    }
    try {
      await reviewFeedback(
        attemptId,
        "endorsed",
        opts?.endorseNote ?? "Auto-endorsed by Auto-Apply — positive feedback; question flagged as an exemplar for future generation.",
        "auto"
      );
      r.autoEndorsed = true;
    } catch (endErr) {
      console.error("auto-endorse failed:", endErr);
    }
  }
  return r;
}

/**
 * Reconcile an attempt's stored decision with a (possibly updated) recommendation. A follow-up
 * reply on the analysis thread can flip the verdict (e.g. reject → accept once the user makes their
 * case). Without this, the attempt stays frozen at its first auto-decision and the corrected verdict
 * is silently buried (the exact bug behind attempt #138 / analysis #21). Safe to call on every reply:
 * it's a no-op when the decision is already consistent, and it never overrides a decision a human made.
 */
export async function reconcileAttemptDecision(
  attemptId: number,
  recommendation: string
): Promise<{ reconciled: boolean; from?: string | null; to?: string }> {
  const expected = STATUS_FOR_RECOMMENDATION[recommendation];
  if (!expected) return { reconciled: false }; // "pending"/unknown — nothing was decided
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT feedback_status, feedback_decided_by FROM user_attempts
    WHERE id = ${attemptId} AND mode = 'full'`;
  const cur = rows[0] as { feedback_status: string | null; feedback_decided_by: string | null } | undefined;
  if (!cur) return { reconciled: false };
  if (cur.feedback_status === expected) return { reconciled: false }; // already consistent — don't re-dispatch
  if (cur.feedback_decided_by === "manual") return { reconciled: false }; // respect a human decision
  if (!(await isAutoApplyEnabled())) return { reconciled: false };
  // The verdict changed under auto-decisioning — re-run the decision so the corrected verdict sticks.
  const note = `Re-decided by Auto-Apply after follow-up discussion (was ${cur.feedback_status ?? "undecided"}).`;
  await applyRecommendation(attemptId, recommendation, { rejectNote: note, partialNote: note, endorseNote: note });
  return { reconciled: true, from: cur.feedback_status, to: expected };
}

async function tavilyFactCheck(
  wines: { slot: number; fullText: string }[],
  feedback: string,
  userId: number | null
): Promise<string> {
  // BYOK: fact-check on the attempt owner's own Tavily key (admin env fallback). No key → the
  // analysis still runs, just without web sources.
  const resolved = await resolveTavilyKey(userId);
  if (!resolved) return "";
  const tavilyKey = resolved.key;

  const wineNames = wines.map((w) => {
    const parts = w.fullText.split(".");
    return parts[0]?.trim() || w.fullText;
  });

  const results: string[] = [];
  const queries = [
    ...wineNames.slice(0, 3).map((name) => `${name} grape variety winemaking technique`),
  ];

  const claimKeywords = feedback.match(
    /\b(merlot|cabernet|pinot|syrah|shiraz|chardonnay|riesling|nebbiolo|sangiovese|tempranillo|grenache|palomino|whole cluster|stem inclusion|carbonic|malolactic|oak|barrel|fermentation|maceration|biodynamic|organic|natural wine)\b/gi
  );
  if (claimKeywords && claimKeywords.length > 0) {
    const wineContext = wineNames[0] || "";
    queries.push(`${wineContext} ${[...new Set(claimKeywords)].slice(0, 3).join(" ")}`);
  }

  for (const query of queries.slice(0, 3)) {
    let ok = false;
    let resultsCount = 0;
    try {
      const res = await fetch(TAVILY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tavilyKey}`,
        },
        body: JSON.stringify({ query, max_results: 3, search_depth: "basic" }),
      });
      if (res.ok) {
        const data = await res.json();
        ok = true;
        resultsCount = (data.results || []).length;
        for (const r of (data.results || []).slice(0, 2)) {
          if (r.content) results.push(`[Source: ${r.url}]\n${r.content.slice(0, 300)}`);
        }
      }
    } catch {}
    logTavilyUsage({ taskType: "feedback_factcheck", query, resultsCount, userId, success: ok });
  }

  if (results.length === 0) return "";
  return `\n\n## Web Research for Fact-Checking (from Tavily)\nThe following real-world sources were found to help verify the user's claims:\n\n${results.join("\n\n---\n\n")}`;
}

/**
 * Write a 2–3 sentence, spoken-aloud explanation of the verdict (Sonnet) and
 * voice it (ElevenLabs), storing both on the analysis row. Best-effort: any
 * failure here is swallowed so it never blocks the analysis from completing —
 * the notification just arrives without sound. The Sonnet call lands in
 * model_usage (task `notification_narration`); the TTS call in elevenlabs_usage.
 */
async function generateVerdictNarration(opts: {
  analysisId: number;
  attemptId: number;
  userId: number | null;
  apiKey: string;
  source: "user" | "server";
  recommendation: string;
  analysisText: string;
  userName: string;
}): Promise<void> {
  try {
    if (!isElevenLabsConfigured()) return; // no key → skip silently (no narration)

    const client = new Anthropic({ apiKey: opts.apiKey });
    const { model, abGroup } = await selectModel("notification_narration", opts.apiKey, "sonnet");

    const verdictWord =
      opts.recommendation === "accept"
        ? "accepted"
        : opts.recommendation === "reject"
          ? "rejected"
          : opts.recommendation === "partial"
            ? "partially accepted"
            : opts.recommendation === "endorse"
              ? "received as an endorsement — the question they praised is now flagged as an exemplar future questions are generated against"
              : "reviewed";

    const system =
      "You write a SPOKEN notification, read aloud to a Master of Wine candidate, " +
      "explaining how the system handled the feedback they left on a practice question. " +
      "Address them directly as 'you'. " +
      "STRICT: 2 to 3 sentences, no more. Plain prose only — no markdown, no lists, no headings, " +
      "no emojis, no stage directions. Do not start with 'Recommendation' or restate the verdict label; " +
      "speak naturally. NEVER mention internal codes (e.g. 'EK-0042'), file paths, or routing labels like " +
      "'Kind:' — speak in plain, everyday language; you may reference real past exams (e.g. 'past Paper 3 " +
      "exams') as precedent. Make clear their feedback was " + verdictWord + " and give the key reason why, " +
      "so they learn something about the exam from it.\n\n" +
      // Was a hardcoded "warm, encouraging, educational tone — like a mentor" until personas
      // landed. The `spoken` surface is where the voices need the most restraint: TTS makes a
      // line sound like a person meaning it, so the rider halves the roast's intensity and bans
      // everything that only works on a page.
      personaBlock(await getUserPersona(opts.userId), "spoken");

    // Only the candidate-facing part of the analysis (everything before the [[INTERNAL]] marker).
    const candidateFacing = (opts.analysisText.split("[[INTERNAL]]")[0] || opts.analysisText).trim();
    const user =
      `The candidate's feedback was ${verdictWord}. Here is the explanation it was based on:\n\n` +
      `${candidateFacing.slice(0, 6000)}\n\n` +
      `Write the 2–3 sentence spoken explanation now.`;

    const t0 = Date.now();
    const message = await client.messages.create({
      model,
      max_tokens: 300,
      system,
      messages: [{ role: "user", content: user }],
    });
    logClaudeUsage(
      { taskType: "notification_narration", model, source: opts.source, userId: opts.userId, attemptId: opts.attemptId, abGroup },
      message.usage,
      { latencyMs: Date.now() - t0 }
    );

    const narrationText = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!narrationText) return;

    // Whose voice: the listener's own choice (Settings → Coach Voice, migration 059), falling back
    // to the app default. Undefined rather than null so synthesizeSpeech's own fallback chain —
    // ELEVENLABS_VOICE_ID then the default — still applies.
    const userVoiceId = opts.userId ? await getUserVoiceId(opts.userId) : null;

    const tts = await synthesizeSpeech(narrationText, {
      taskType: "notification_narration",
      userId: opts.userId,
      attemptId: opts.attemptId,
      analysisId: opts.analysisId,
      voiceId: userVoiceId || undefined,
    });
    if (!tts) return; // synthesis failed → no audio, notification stays silent

    await saveNarration(opts.analysisId, {
      text: narrationText,
      audioBase64: tts.audioBase64,
      voiceId: tts.voiceId,
      characters: tts.characters,
    });
  } catch (err) {
    console.error("generateVerdictNarration error (non-fatal):", err);
  }
}

/**
 * Analyze one attempt's feedback and, when Auto-Apply is on, act on the verdict.
 * Idempotent against concurrent runs (skips if an analysis is already in flight).
 */
export async function runFeedbackAnalysis(opts: {
  attemptId: number;
  apiKey?: string;
  source?: "user" | "server";
  /** Skip the auto-apply step (used when we only want the analysis row). */
  skipAutoApply?: boolean;
  /**
   * Pin this call to a tier, bypassing the A/B split entirely.
   *
   * Not merely a different default: `feedback_analysis` currently carries a configured 50/50
   * opus/sonnet split, and a configured split beats the default tier in selectModel — so a
   * "preferred" tier would still coin-flip back onto the arm the retry exists to get off.
   */
  forceTier?: ModelTier;
}): Promise<RunFeedbackAnalysisResult> {
  const { attemptId } = opts;
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const source = opts.source ?? "server";
  if (!apiKey) return { status: "no_api_key" };

  const sql = neon(process.env.DATABASE_URL!);
  // The attempt's GENERATED artifacts (tasting notes, pre-glass critique, grading) ride along: the
  // feedback is usually about one of them, and analyzing it without them meant adjudicating a
  // complaint about the tasting note by guessing from the model answer.
  const attempts = await sql`
    SELECT a.id, a.user_feedback, a.user_answer, a.user_id,
      a.tasting_notes, a.pre_glass_reasoning, a.pre_glass_feedback, a.answer_feedback,
      a.pass_estimate, a.marks_estimate, a.mode, a.stem_detail, a.stem_detail_escalated_to,
      a.app_version,
      q.question_text, q.wines, q.paper, q.family, q.family_label, q.model_answer, q.metadata,
      q.reasoning_trace,
      u.name as user_name, u.is_admin as user_is_admin
    FROM user_attempts a
    JOIN generated_questions q ON a.question_id = q.question_id
    JOIN users u ON a.user_id = u.id
    WHERE a.id = ${attemptId}
      AND a.mode = 'full'
  `;
  if (!attempts[0]) return { status: "not_found" };

  const attempt = attempts[0];
  const feedbackText = attempt.user_feedback as string | null;
  if (!feedbackText || !feedbackText.trim()) return { status: "no_feedback" };

  // Concurrency guard — never run two analyses for the same attempt at once. Reap first: without a
  // TTL this guard is a permanent lock (see reapStaleAnalyses).
  await reapStaleAnalyses({ attemptId });
  const inFlight = await sql`
    SELECT id FROM feedback_analyses WHERE attempt_id = ${attemptId} AND status = 'analyzing'
  `;
  if (inFlight.length > 0) {
    return { status: "already_analyzing", analysisId: inFlight[0].id as number };
  }

  // createFeedbackAnalysis also stamps user_attempts.auto_analysis_id, which moves the
  // item out of the "stranded / never analyzed" set the sweeper looks for.
  const analysis = await createFeedbackAnalysis(attemptId, attempt.user_id as number);

  // Pin the EXACT feedback this analysis ran on. Apply (apply-change.ts) and the knowledge sync
  // read THIS snapshot instead of re-reading the mutable user_attempts.user_feedback column at a
  // later time, so the analyzed text can never silently diverge from what gets shipped/synced
  // (the root cause of the attempt-188 incident). Stored up front so it survives a later error.
  await sql`UPDATE feedback_analyses SET analyzed_feedback = ${feedbackText} WHERE id = ${analysis.id}`;

  try {
    const wines = typeof attempt.wines === "string" ? JSON.parse(attempt.wines) : attempt.wines;
    const metadata =
      typeof attempt.metadata === "string" ? JSON.parse(attempt.metadata) : attempt.metadata;

    const factCheckContext = await tavilyFactCheck(
      wines,
      feedbackText,
      (attempt.user_id as number) ?? null
    );

    // Live empirical knowledge (paper-filtered) from the Neon projection — always current.
    const empiricalKnowledge = await getEmpiricalKnowledgeForAnalysis(attempt.paper as number);

    const prompt = buildFeedbackAnalysisPrompt({
      questionText: attempt.question_text as string,
      wines,
      paper: attempt.paper as number,
      family: attempt.family as string,
      familyLabel: attempt.family_label as string,
      modelAnswer: attempt.model_answer as string | null,
      userAnswer: attempt.user_answer as string | null,
      userFeedback: feedbackText,
      userName: attempt.user_name as string,
      // The voice belongs to whoever left the feedback, not to whoever triggered the analysis —
      // a nightly sweep or an admin re-run still writes back to the candidate who filed it.
      persona: await getUserPersona((attempt.user_id as number) ?? null),
      empiricalKnowledge,
      questionMetadata: metadata as Record<string, unknown> | null,
      reasoningTrace: attempt.reasoning_trace as string | null,
      attempt: {
        tastingNotes: attempt.tasting_notes,
        preGlassReasoning: attempt.pre_glass_reasoning as string | null,
        preGlassFeedback: attempt.pre_glass_feedback as string | null,
        answerFeedback: attempt.answer_feedback as string | null,
        passEstimate: attempt.pass_estimate as string | null,
        marksEstimate: attempt.marks_estimate as string | null,
        mode: attempt.mode as string | null,
        stemDetail: attempt.stem_detail as string | null,
        stemDetailEscalatedTo: attempt.stem_detail_escalated_to as string | null,
        appVersion: attempt.app_version as string | null,
      },
    });

    const client = new Anthropic({ apiKey });
    // abGroup stays null on a pinned call: it is not a sample of an arm, and counting it as one
    // would make the arm that truncates look better every time a retry rescues it.
    const { model, abGroup } = opts.forceTier
      ? { model: await resolveTierModel(opts.forceTier, apiKey), abGroup: null }
      : await selectModel("feedback_analysis", apiKey, "opus");
    const t0 = Date.now();
    const message = await client.messages.create({
      model,
      max_tokens: ANALYSIS_MAX_TOKENS,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user + factCheckContext }],
    });
    logClaudeUsage(
      { taskType: "feedback_analysis", model, source, userId: (attempt.user_id as number) ?? null, attemptId, abGroup },
      message.usage,
      { latencyMs: Date.now() - t0 }
    );

    const analysisText = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const recommendation = extractRecommendation(analysisText);

    const thread = [
      { role: "system" as const, content: analysisText, timestamp: new Date().toISOString() },
    ];

    // NO VERDICT IS A FAILURE, NOT A COMPLETION.
    //
    // A run that produced no parseable recommendation has nothing downstream can act on: auto-apply
    // no-ops, the attempt stays feedback_status = NULL, and the row nonetheless reads 'complete' with
    // a confident-looking half-analysis in it. That is how fa_66 came to store ZERO characters, get a
    // spoken verdict narrated over it, and still be filed as done.
    //
    // Marking it 'error' instead puts it on the one path that already exists for a broken analysis:
    // it shows as failed in the admin feedback view, and — new below — the sweeper gives it exactly
    // one retry. The partial text is written first and deliberately kept: it is usually several
    // thousand words of real reasoning, and a human reading why the run failed should be able to see
    // how far it got.
    if (!isTerminalRecommendation(recommendation)) {
      const truncated = message.stop_reason === "max_tokens";
      const why = truncated
        ? `Response hit the ${ANALYSIS_MAX_TOKENS}-token output ceiling before writing its verdict line`
        : "Response completed without a parseable 'Recommendation:' line";
      const detail =
        `${why} (model ${model}, ${message.usage.output_tokens} output tokens, ` +
        `${analysisText.length} characters of text). No verdict was applied. Re-trigger to retry.`;
      await updateFeedbackAnalysis(analysis.id, { thread, status: "analyzing" }); // keep partial text
      await updateFeedbackAnalysis(analysis.id, { status: "error", error_message: detail });
      console.error(`feedback analysis ${analysis.id} produced no verdict: ${detail}`);
      return { status: "error", analysisId: analysis.id, error: detail };
    }

    // Generate the spoken verdict BEFORE flipping to 'complete': the notification
    // only surfaces once status is complete, so doing this first guarantees the
    // audio is ready the moment the bell shows it (playback is spoken-only).
    await generateVerdictNarration({
      analysisId: analysis.id,
      attemptId,
      userId: (attempt.user_id as number) ?? null,
      apiKey,
      source,
      recommendation,
      analysisText,
      userName: attempt.user_name as string,
    });

    await updateFeedbackAnalysis(analysis.id, { status: "complete", recommendation, thread });

    // FEATURE-REQUEST GATE: feedback must NEVER build a feature (the attempt-188 incident).
    // If the analysis classified this as a request for new functionality, do NOT run the code-apply
    // pipeline. Log it as a Feature Request (so it surfaces in the admin Feature Request engine) and
    // resolve the feedback with an author-aware note. Admins get a direct link to the engine.
    const kind = (analysisText.match(/Kind:\s*\**(feature-request)\**/i)?.[1] || "").toLowerCase();
    if (kind === "feature-request") {
      const isAdminAuthor = attempt.user_is_admin === true;
      let frId: number | null = null;
      try {
        frId = await createFeatureRequestFromFeedback({
          userId: (attempt.user_id as number) ?? null,
          feedbackText,
          analysisText,
        });
      } catch (frErr) {
        console.error("[feature-gate] failed to log feature request from feedback:", frErr);
      }
      const link = frId ? `/admin#feature-request` : "/admin#feature-request";
      // Mixed praise + feature request ("good question, would be nice to see model answers"): the
      // analysis marks `Endorse: yes`, so the FR is logged AND the praised question still becomes
      // an exemplar — the praise isn't discarded, and the user isn't told "rejected".
      const alsoEndorse = /endorse:\s*\**yes\**/i.test(analysisText);
      if (alsoEndorse) {
        try {
          await endorseQuestionForAttempt(attemptId);
          // Keep the analysis row consistent with the decision (the prompt has FR set
          // "recommendation: reject", which is wrong for the praise half).
          await updateFeedbackAnalysis(analysis.id, { recommendation: "endorse" });
        } catch (endErr) {
          console.error("[feature-gate] endorse-alongside-FR failed:", endErr);
        }
      }
      const frNote = isAdminAuthor
        ? `Feature request (not a fix) — open the Feature Request engine to refine and build it: ${link}${frId ? ` (logged as feature_requests #${frId})` : ""}.`
        : `Feature request from a non-admin — logged for admin review${frId ? ` (feature_requests #${frId})` : ""}; not auto-built.`;
      const status = alsoEndorse ? "endorsed" : "rejected";
      const note = alsoEndorse
        ? `Positive feedback — question flagged as an exemplar. ${frNote}`
        : frNote;
      await reviewFeedback(attemptId, status, note, "auto");
      return {
        status: "complete",
        analysisId: analysis.id,
        recommendation: alsoEndorse ? "endorse" : "reject",
        autoApplied: false,
        autoRejected: !alsoEndorse,
        autoPartial: false,
        autoEndorsed: alsoEndorse,
      };
    }

    // Auto-Apply: the AI's recommendation is authoritative and the item leaves the open queue.
    let autoApplied = false;
    let autoRejected = false;
    let autoPartial = false;
    let autoEndorsed = false;
    if (!opts.skipAutoApply && (await isAutoApplyEnabled())) {
      ({ autoApplied, autoRejected, autoPartial, autoEndorsed } = await applyRecommendation(attemptId, recommendation));
    }

    return { status: "complete", analysisId: analysis.id, recommendation, autoApplied, autoRejected, autoPartial, autoEndorsed };
  } catch (err) {
    // Don't leave the analysis row stuck in 'analyzing' — mark it errored so the
    // sweeper/admin can see it failed (auto_analysis_id is already set, so it won't
    // be re-swept as "never analyzed"; a manual re-trigger can retry it).
    const msg = err instanceof Error ? err.message : "Analysis failed";
    try {
      await updateFeedbackAnalysis(analysis.id, { status: "error", error_message: msg });
    } catch {}
    console.error("runFeedbackAnalysis error:", err);
    return { status: "error", analysisId: analysis.id, error: msg };
  }
}

/**
 * An analysis still 'analyzing' after this long is dead, not slow.
 *
 * THE CEILING IS WHAT MAKES THIS SAFE. Both entry points — /api/save-attempt (which runs the analysis
 * in `after()`) and /api/feedback-analysis/trigger — declare `maxDuration = 120`, so no invocation can
 * still be working after two minutes; the platform has already killed it. Ten minutes is five times
 * that ceiling, so a LIVE analysis can never be reaped, which is the only way this could do harm.
 * Measured for reference: real analyses finish in 31-73s (feedback_analyses 49-64; the multi-hour
 * created→updated spans on rows 55 and 54 are a later admin apply bumping updated_at, not the LLM).
 */
export const STALE_ANALYSIS_MINUTES = 10;

/**
 * Mark abandoned 'analyzing' rows as errored, and return how many were reaped.
 *
 * WHY THIS EXISTS — a killed analysis was a PERMANENT LOCK. fa_65 (attempt 394, 2026-08-07) was
 * inserted and never written to again: empty thread, no recommendation, no error_message. The catch in
 * runFeedbackAnalysis marks 'error' on a thrown exception, but this invocation was KILLED, so no catch
 * ran. The row then blocked every route back:
 *
 *   1. the concurrency guard matched `status = 'analyzing'` with no TTL, so every re-trigger returned
 *      `already_analyzing` — forever;
 *   2. the stranded sweep below requires `auto_analysis_id IS NULL`, and createFeedbackAnalysis had
 *      already stamped it.
 *
 * So attempt 394 was unreachable by every recovery path the system has, and sat "analyzing" for seven
 * hours looking like work in progress. This is the same shape as EK-0158's flight claims — a claim
 * taken before the work with nothing to release it if the worker dies — and the same answer: a TTL.
 *
 * DELIBERATELY NOT A RETRY. Reaping unwedges the attempt; it does not re-run it. `auto_apply_enabled`
 * is ON, so a retry can dispatch a branch-and-PR, and the feedback most likely to be sitting behind a
 * stale lock is old — 394's substance had already shipped as R11 in question-rules.mjs, so re-running
 * it would have proposed a fix for something already fixed. Re-triggering is a human decision; this
 * just makes it possible again.
 */
export async function reapStaleAnalyses(
  opts: { attemptId?: number } = {}
): Promise<{ reaped: number; ids: number[] }> {
  const sql = neon(process.env.DATABASE_URL!);
  const cutoffMinutes = STALE_ANALYSIS_MINUTES;
  const message =
    `Abandoned mid-analysis — no update for over ${cutoffMinutes} minutes, and the invocation's own ` +
    `maxDuration is 120s, so the process was killed rather than still running. Reaped automatically; ` +
    `re-trigger from the admin feedback view if this feedback still needs a verdict.`;

  // updated_at, not created_at: a run that got partway and wrote its thread should get the full window
  // from its LAST sign of life.
  //
  // The reap also STAMPS updated_at, matching every other write path in updateFeedbackAnalysis. Without
  // it a reaped row keeps `updated_at == created_at` — which is precisely the signature used to diagnose
  // fa_65 as "inserted and never written to again". A reaped row would look untouched, and the next
  // person to read one would reach the wrong conclusion about what happened to it.
  const rows = opts.attemptId
    ? await sql`
        UPDATE feedback_analyses SET status = 'error', error_message = ${message}, updated_at = NOW()
        WHERE status = 'analyzing'
          AND attempt_id = ${opts.attemptId}
          AND updated_at < NOW() - (${cutoffMinutes} * INTERVAL '1 minute')
        RETURNING id
      `
    : await sql`
        UPDATE feedback_analyses SET status = 'error', error_message = ${message}, updated_at = NOW()
        WHERE status = 'analyzing'
          AND updated_at < NOW() - (${cutoffMinutes} * INTERVAL '1 minute')
        RETURNING id
      `;
  const ids = rows.map((r) => r.id as number);
  if (ids.length) console.log(`reapStaleAnalyses: reaped ${ids.length} abandoned analysis row(s): ${ids.join(", ")}`);
  return { reaped: ids.length, ids };
}

/**
 * Find feedback that was submitted but never analyzed (the stranded set the original
 * client-fire-and-forget bug produced) and analyze it. Drives the cron sweeper and an
 * opportunistic sweep when the admin opens the feedback dashboard.
 *
 * Reaps abandoned analyses first, so the queue tells the truth even for an attempt nobody re-triggers:
 * a stale row shows as errored rather than as work still in progress.
 */
/**
 * Re-run feedback that WAS analysed but never got a verdict — the gap the guard above closes going
 * forward, and the only way back for the rows that fell through it before it existed.
 *
 * These are invisible to sweepStrandedFeedback, which keys on `auto_analysis_id IS NULL`. An analysis
 * that ran and produced nothing has that column stamped, so the attempt sits at feedback_status NULL
 * for good: it looks open in the admin queue, has an analysis attached, and no path re-reaches it.
 * Six rows reached that state (all Opus 5, all pinned at the old 4000-token ceiling); three were
 * eventually resolved by hand and three were still sitting there.
 *
 * WHY THIS RETRIES WHEN reapStaleAnalyses DELIBERATELY DOES NOT. The reaper faces a killed invocation
 * of unknown age and unknown progress, where a retry can dispatch a branch-and-PR for feedback whose
 * substance already shipped. This faces a run whose failure mode is known, local and cheap: the model
 * stopped early. Nothing was applied, so nothing can be applied twice.
 *
 * TWO BOUNDS KEEP IT FROM BECOMING A LOOP THAT SPENDS MONEY:
 *   1. At most one retry per attempt, ever — `< 2` total analyses. A second failure stays failed and
 *      waits for a human, because a repeat is evidence of something the retry cannot fix.
 *   2. Sonnet, PINNED past the A/B split. It is the arm that has never truncated (0 of 31 runs
 *      against Opus 5's 17 of 25) and it costs $0.23 against $1.55. `feedback_analysis` carries a
 *      configured 50/50 split, so a mere default would coin-flip the retry back onto the arm that
 *      failed — the same run again at seven times the price.
 */
export async function retryUnadjudicatedFeedback(
  limit = 3
): Promise<{ retried: number; results: { attemptId: number; status: string; recommendation?: string }[] }> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT a.id
    FROM user_attempts a
    WHERE a.mode = 'full'
      AND a.user_feedback IS NOT NULL AND trim(a.user_feedback) <> ''
      AND a.feedback_status IS NULL
      AND a.question_id IS NOT NULL
      AND (a.scope IS DISTINCT FROM 'general')
      AND a.auto_analysis_id IS NOT NULL
      -- Nothing in flight, and no run that actually reached a verdict.
      AND NOT EXISTS (
        SELECT 1 FROM feedback_analyses f
        WHERE f.attempt_id = a.id
          AND (f.status = 'analyzing' OR (f.status = 'complete' AND f.recommendation <> 'pending'))
      )
      AND (SELECT COUNT(*) FROM feedback_analyses f2 WHERE f2.attempt_id = a.id) < 2
    ORDER BY a.started_at ASC
    LIMIT ${limit}
  `;
  const results: { attemptId: number; status: string; recommendation?: string }[] = [];
  for (const row of rows) {
    const attemptId = row.id as number;
    const r = await runFeedbackAnalysis({ attemptId, source: "server", forceTier: "sonnet" });
    // A question-review card deep-links to the analysis it spawned. The retry makes a NEW row, so
    // without this the reviewer's card keeps pointing at the failed one and shows a verdict-less
    // analysis next to a resolved vote.
    if (r.analysisId && r.status === "complete") {
      await sql`UPDATE question_reviews SET analysis_id = ${r.analysisId}, updated_at = NOW()
                WHERE attempt_id = ${attemptId}`;
    }
    results.push({ attemptId, status: r.status, recommendation: r.recommendation });
  }
  if (results.length) console.log(`retryUnadjudicatedFeedback: retried ${results.length} attempt(s)`);
  return { retried: results.length, results };
}

export async function sweepStrandedFeedback(
  limit = 3
): Promise<{
  swept: number;
  reaped: number;
  retried: number;
  results: { attemptId: number; status: string; recommendation?: string }[];
}> {
  const sql = neon(process.env.DATABASE_URL!);
  const { reaped } = await reapStaleAnalyses();
  const stranded = await sql`
    SELECT id FROM user_attempts
    WHERE mode = 'full'
      AND user_feedback IS NOT NULL AND trim(user_feedback) <> ''
      AND auto_analysis_id IS NULL
      AND feedback_status IS NULL
      -- App-level feedback is skipped on BOTH predicates, which are no longer redundant.
      --
      -- question_id IS NOT NULL is a hard requirement: runFeedbackAnalysis prompts on the stem, the
      -- wines and the model answer, so a row with no question has nothing to analyse.
      --
      -- scope is the one that carries the intent. These agreed only for as long as every general row
      -- also had a NULL question_id; the Coach's file_bug now attaches the on-screen question to an
      -- app bug, so a question-less proxy for "is this about question quality" would sweep a footer
      -- rendering bug into the question-quality analyser — which would rule on the QUESTION (sound,
      -- therefore "reject") and could dispatch a generation-rule PR for a bug in a component. Keying
      -- on scope also matches getUserAttempts and getUserStats, so all three agree on what a
      -- question-scoped report is.
      AND question_id IS NOT NULL
      AND (scope IS DISTINCT FROM 'general')
    ORDER BY started_at ASC
    LIMIT ${limit}
  `;
  const results: { attemptId: number; status: string; recommendation?: string }[] = [];
  for (const row of stranded) {
    const attemptId = row.id as number;
    const r = await runFeedbackAnalysis({ attemptId, source: "server" });
    results.push({ attemptId, status: r.status, recommendation: r.recommendation });
  }
  // Never-analysed first, verdict-less second: both are unadjudicated feedback, and the never-analysed
  // set is the one a candidate is actively waiting on. Sharing the caller's limit keeps the whole sweep
  // inside the route's 120s maxDuration — a 31-73s analysis means a batch of 3 is already near it.
  const { retried, results: retryResults } = await retryUnadjudicatedFeedback(
    Math.max(0, limit - results.length)
  );
  results.push(...retryResults);
  return { swept: results.length - retried, reaped, retried, results };
}
