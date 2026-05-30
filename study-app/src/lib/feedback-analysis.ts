import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { buildFeedbackAnalysisPrompt } from "@/lib/prompts/feedback-analysis-prompt";
import { createFeedbackAnalysis, updateFeedbackAnalysis, reviewFeedback } from "@/lib/db";
import { selectModel } from "@/lib/model-selector";
import { isAutoApplyEnabled } from "@/lib/settings";
import { applyFeedbackChange } from "@/lib/apply-change";
import { logClaudeUsage, logTavilyUsage } from "@/lib/usage-log";

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
  error?: string;
}

async function tavilyFactCheck(
  wines: { slot: number; fullText: string }[],
  feedback: string,
  userId: number | null
): Promise<string> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) return "";

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyKey, query, max_results: 3, search_depth: "basic" }),
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
 * Analyze one attempt's feedback and, when Auto-Apply is on, act on the verdict.
 * Idempotent against concurrent runs (skips if an analysis is already in flight).
 */
export async function runFeedbackAnalysis(opts: {
  attemptId: number;
  apiKey?: string;
  source?: "user" | "server";
  /** Skip the auto-apply step (used when we only want the analysis row). */
  skipAutoApply?: boolean;
}): Promise<RunFeedbackAnalysisResult> {
  const { attemptId } = opts;
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const source = opts.source ?? "server";
  if (!apiKey) return { status: "no_api_key" };

  const sql = neon(process.env.DATABASE_URL!);
  const attempts = await sql`
    SELECT a.id, a.user_feedback, a.user_answer, a.user_id,
      q.question_text, q.wines, q.paper, q.family, q.family_label, q.model_answer, q.metadata,
      u.name as user_name
    FROM user_attempts a
    JOIN generated_questions q ON a.question_id = q.question_id
    JOIN users u ON a.user_id = u.id
    WHERE a.id = ${attemptId}
  `;
  if (!attempts[0]) return { status: "not_found" };

  const attempt = attempts[0];
  const feedbackText = attempt.user_feedback as string | null;
  if (!feedbackText || !feedbackText.trim()) return { status: "no_feedback" };

  // Concurrency guard — never run two analyses for the same attempt at once.
  const inFlight = await sql`
    SELECT id FROM feedback_analyses WHERE attempt_id = ${attemptId} AND status = 'analyzing'
  `;
  if (inFlight.length > 0) {
    return { status: "already_analyzing", analysisId: inFlight[0].id as number };
  }

  // createFeedbackAnalysis also stamps user_attempts.auto_analysis_id, which moves the
  // item out of the "stranded / never analyzed" set the sweeper looks for.
  const analysis = await createFeedbackAnalysis(attemptId, attempt.user_id as number);

  try {
    const wines = typeof attempt.wines === "string" ? JSON.parse(attempt.wines) : attempt.wines;
    const metadata =
      typeof attempt.metadata === "string" ? JSON.parse(attempt.metadata) : attempt.metadata;

    const factCheckContext = await tavilyFactCheck(
      wines,
      feedbackText,
      (attempt.user_id as number) ?? null
    );

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
      questionMetadata: metadata as Record<string, unknown> | null,
    });

    const client = new Anthropic({ apiKey });
    const { model, abGroup } = await selectModel("feedback_analysis", apiKey, "opus");
    const t0 = Date.now();
    const message = await client.messages.create({
      model,
      max_tokens: 4000,
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

    const recommendation = /recommendation:\s*\*?\*?accept/i.test(analysisText)
      ? "accept"
      : /recommendation:\s*\*?\*?reject/i.test(analysisText)
        ? "reject"
        : /recommendation:\s*\*?\*?partial/i.test(analysisText)
          ? "partial"
          : "pending";

    const thread = [
      { role: "system" as const, content: analysisText, timestamp: new Date().toISOString() },
    ];

    await updateFeedbackAnalysis(analysis.id, { status: "complete", recommendation, thread });

    // Auto-Apply: the AI's recommendation is authoritative and the item leaves the open queue.
    let autoApplied = false;
    let autoRejected = false;
    let autoPartial = false;
    if (!opts.skipAutoApply && (await isAutoApplyEnabled())) {
      if (recommendation === "accept") {
        try {
          await applyFeedbackChange({ attemptId, appliedBy: "auto" });
          autoApplied = true;
        } catch (applyErr) {
          console.error("auto-apply dispatch failed:", applyErr);
        }
      } else if (recommendation === "reject") {
        try {
          await reviewFeedback(
            attemptId,
            "rejected",
            "Auto-rejected by Auto-Apply — analysis recommended reject.",
            "auto"
          );
          autoRejected = true;
        } catch (rejErr) {
          console.error("auto-reject failed:", rejErr);
        }
      } else if (recommendation === "partial") {
        try {
          await reviewFeedback(
            attemptId,
            "partial",
            "Auto-marked partial by Auto-Apply — some points valid; review recommended (no code shipped).",
            "auto"
          );
          autoPartial = true;
        } catch (partErr) {
          console.error("auto-partial failed:", partErr);
        }
      }
    }

    return { status: "complete", analysisId: analysis.id, recommendation, autoApplied, autoRejected, autoPartial };
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
 * Find feedback that was submitted but never analyzed (the stranded set the original
 * client-fire-and-forget bug produced) and analyze it. Drives the cron sweeper and an
 * opportunistic sweep when the admin opens the feedback dashboard.
 */
export async function sweepStrandedFeedback(
  limit = 3
): Promise<{ swept: number; results: { attemptId: number; status: string; recommendation?: string }[] }> {
  const sql = neon(process.env.DATABASE_URL!);
  const stranded = await sql`
    SELECT id FROM user_attempts
    WHERE user_feedback IS NOT NULL AND trim(user_feedback) <> ''
      AND auto_analysis_id IS NULL
      AND feedback_status IS NULL
    ORDER BY started_at ASC
    LIMIT ${limit}
  `;
  const results: { attemptId: number; status: string; recommendation?: string }[] = [];
  for (const row of stranded) {
    const attemptId = row.id as number;
    const r = await runFeedbackAnalysis({ attemptId, source: "server" });
    results.push({ attemptId, status: r.status, recommendation: r.recommendation });
  }
  return { swept: results.length, results };
}
