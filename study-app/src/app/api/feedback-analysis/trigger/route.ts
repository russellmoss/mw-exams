import Anthropic from "@anthropic-ai/sdk";
import { requireApiKey } from "@/lib/api-key";
import { buildFeedbackAnalysisPrompt } from "@/lib/prompts/feedback-analysis-prompt";
import { createFeedbackAnalysis, updateFeedbackAnalysis, reviewFeedback } from "@/lib/db";
import { neon } from "@neondatabase/serverless";
import { selectModel } from "@/lib/model-selector";
import { isAutoApplyEnabled } from "@/lib/settings";
import { applyFeedbackChange } from "@/lib/apply-change";
import { logClaudeUsage, logTavilyUsage } from "@/lib/usage-log";

export const runtime = "nodejs";
export const maxDuration = 120;

const TAVILY_API_URL = "https://api.tavily.com/search";

async function tavilyFactCheck(wines: { slot: number; fullText: string }[], feedback: string, userId: number | null): Promise<string> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) return "";

  // Search for each wine mentioned in the feedback to get real facts
  const wineNames = wines.map((w) => {
    const parts = w.fullText.split(".");
    return parts[0]?.trim() || w.fullText;
  });

  const results: string[] = [];
  // Search for the wines + key claims in the feedback
  const queries = [
    ...wineNames.slice(0, 3).map((name) => `${name} grape variety winemaking technique`),
  ];

  // Also search for specific claims in the feedback
  const claimKeywords = feedback.match(/\b(merlot|cabernet|pinot|syrah|shiraz|chardonnay|riesling|nebbiolo|sangiovese|tempranillo|grenache|palomino|whole cluster|stem inclusion|carbonic|malolactic|oak|barrel|fermentation|maceration|biodynamic|organic|natural wine)\b/gi);
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
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          max_results: 3,
          search_depth: "basic",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        ok = true;
        resultsCount = (data.results || []).length;
        for (const r of (data.results || []).slice(0, 2)) {
          if (r.content) {
            results.push(`[Source: ${r.url}]\n${r.content.slice(0, 300)}`);
          }
        }
      }
    } catch {}
    logTavilyUsage({ taskType: "feedback_factcheck", query, resultsCount, userId, success: ok });
  }

  if (results.length === 0) return "";
  return `\n\n## Web Research for Fact-Checking (from Tavily)\nThe following real-world sources were found to help verify the user's claims:\n\n${results.join("\n\n---\n\n")}`;
}

export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;

    const { attemptId, userFeedback: passedFeedback } = await request.json();
    if (!attemptId) {
      return Response.json({ error: "Missing attemptId" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const attempts = await sql`
      SELECT a.id, a.user_feedback, a.user_answer, a.user_id,
        q.question_text, q.wines, q.paper, q.family, q.family_label, q.model_answer,
        q.metadata,
        u.name as user_name
      FROM user_attempts a
      JOIN generated_questions q ON a.question_id = q.question_id
      JOIN users u ON a.user_id = u.id
      WHERE a.id = ${attemptId}
    `;

    if (!attempts[0]) {
      return Response.json({ error: "Attempt not found" }, { status: 404 });
    }

    const attempt = attempts[0];
    const feedbackText = (attempt.user_feedback as string) || passedFeedback;
    if (!feedbackText) {
      return Response.json({ error: "No feedback found" }, { status: 404 });
    }

    const existing = await sql`
      SELECT id, status FROM feedback_analyses
      WHERE attempt_id = ${attemptId} AND status = 'analyzing'
    `;
    if (existing.length > 0) {
      return Response.json({ id: existing[0].id, status: "already_analyzing" });
    }

    const analysis = await createFeedbackAnalysis(attemptId, attempt.user_id as number);

    const wines = typeof attempt.wines === "string"
      ? JSON.parse(attempt.wines)
      : attempt.wines;

    const metadata = typeof attempt.metadata === "string"
      ? JSON.parse(attempt.metadata)
      : attempt.metadata;

    // Fact-check user claims via Tavily before running analysis
    const factCheckContext = await tavilyFactCheck(wines, feedbackText, (attempt.user_id as number) ?? null);

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

    const client = new Anthropic({ apiKey: keyResult.apiKey });
    const { model, abGroup } = await selectModel("feedback_analysis", keyResult.apiKey, "opus");
    const t0 = Date.now();
    const message = await client.messages.create({
      model,
      max_tokens: 4000,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user + factCheckContext }],
    });
    logClaudeUsage(
      { taskType: "feedback_analysis", model, source: keyResult.source, userId: (attempt.user_id as number) ?? null, attemptId, abGroup },
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

    const thread = [{
      role: "system" as const,
      content: analysisText,
      timestamp: new Date().toISOString(),
    }];

    await updateFeedbackAnalysis(analysis.id, {
      status: "complete",
      recommendation,
      thread,
    });

    // Auto-Apply: when the toggle is on, the AI's recommendation is authoritative and the item
    // leaves the open queue without human review.
    //   accept  -> dispatch the verify-and-ship GitHub Action (status 'accepted')
    //   reject  -> auto-reject in place (status 'rejected')
    //   partial -> auto-mark partial (status 'partial'): some points valid but the core question
    //              is sound, so it lands in the Accepted bucket for review without shipping code.
    //   pending -> left open (the AI did not actually decide).
    // Failures here never break the analysis response.
    let autoApplied = false;
    let autoRejected = false;
    let autoPartial = false;
    if (await isAutoApplyEnabled()) {
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

    return Response.json({ id: analysis.id, status: "complete", recommendation, autoApplied, autoRejected, autoPartial });
  } catch (err) {
    console.error("feedback-analysis trigger error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
