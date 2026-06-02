import Anthropic from "@anthropic-ai/sdk";
import { requireApiKey } from "@/lib/api-key";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import { isAutoFeatureEnabled } from "@/lib/settings";
import { dispatchFeatureBuild } from "@/lib/github-dispatch";
import { FEATURE_REQUEST_SYSTEM } from "@/lib/prompts/feature-request-prompt";
import {
  createFeatureRequest,
  getFeatureRequest,
  listFeatureRequests,
  updateFeatureRequest,
  type FeatureRequest,
} from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

type ModelReply = {
  phase: "clarifying" | "proposing";
  message: string;
  readyToBuild: boolean;
  title: string;
  technicalSpec: string;
};

// Tolerant JSON extraction — strip ```json fences / surrounding prose, else treat the whole text as a
// clarifying message so a malformed reply never breaks the conversation.
function parseModelReply(text: string): ModelReply {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1));
      return {
        phase: obj.phase === "proposing" ? "proposing" : "clarifying",
        message: typeof obj.message === "string" ? obj.message : text,
        readyToBuild: obj.readyToBuild === true,
        title: typeof obj.title === "string" ? obj.title : "",
        technicalSpec: typeof obj.technicalSpec === "string" ? obj.technicalSpec : "",
      };
    } catch {
      /* fall through */
    }
  }
  return { phase: "clarifying", message: text, readyToBuild: false, title: "", technicalSpec: "" };
}

// Run one Opus turn over the running thread and persist the result onto the feature_requests row.
async function advance(
  fr: FeatureRequest,
  apiKey: string,
  source: "user" | "server",
  userId: number
): Promise<FeatureRequest> {
  const messages = fr.thread.map((t) => ({
    role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: t.content,
  }));

  const client = new Anthropic({ apiKey });
  const { model, abGroup } = await selectModel("feature_request", apiKey, "opus");
  const t0 = Date.now();
  const res = await client.messages.create({
    model,
    max_tokens: 3500,
    system: FEATURE_REQUEST_SYSTEM,
    messages,
  });
  logClaudeUsage(
    { taskType: "feature_request", model, source, userId, abGroup },
    res.usage,
    { latencyMs: Date.now() - t0 }
  );
  const raw = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  const reply = parseModelReply(raw);

  const thread = [...fr.thread, { role: "assistant" as const, content: reply.message, timestamp: new Date().toISOString() }];
  const status = reply.phase === "proposing" ? "proposed" : "clarifying";
  return updateFeatureRequest(fr.id, {
    thread,
    status,
    title: reply.title || fr.title || undefined,
    ...(reply.phase === "proposing" ? { user_facing_proposal: reply.message, technical_spec: reply.technicalSpec } : {}),
  });
}

// Shape sent to the client — never leaks technical_spec.
function publicView(fr: FeatureRequest) {
  const last = [...fr.thread].reverse().find((t) => t.role === "assistant");
  return {
    id: fr.id,
    title: fr.title,
    status: fr.status,
    thread: fr.thread,
    message: last?.content ?? "",
    readyToBuild: fr.status === "proposed" && !!fr.technical_spec,
    hasSpec: !!fr.technical_spec,
    // Admin-only debug surface — the stored spec/plan ("what it thought and did"). Never shown in
    // the live conversation UI (which renders only `message`); exposed here for the debug detail.
    technicalSpec: fr.technical_spec,
    apply_status: fr.apply_status,
    work_branch: fr.work_branch,
    commit_sha: fr.commit_sha,
    pr_url: fr.pr_url,
    created_at: fr.created_at,
    updated_at: fr.updated_at,
  };
}

export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;
    if (!keyResult.user.isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const userId = keyResult.user.id;
    const body = await request.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "start") {
      const text = (body.request as string || "").trim();
      if (!text) return Response.json({ error: "request text required" }, { status: 400 });
      const created = await createFeatureRequest(
        userId,
        text.slice(0, 80),
        [{ role: "user", content: text, timestamp: new Date().toISOString() }],
        "drafting"
      );
      const fr = await advance(created, keyResult.apiKey, keyResult.source, userId);
      return Response.json({ featureRequest: publicView(fr) });
    }

    if (action === "reply") {
      const id = Number(body.id);
      const text = (body.message as string || "").trim();
      if (!id || !text) return Response.json({ error: "id and message required" }, { status: 400 });
      const existing = await getFeatureRequest(id);
      if (!existing) return Response.json({ error: "not found" }, { status: 404 });
      const withTurn = await updateFeatureRequest(id, {
        thread: [...existing.thread, { role: "user", content: text, timestamp: new Date().toISOString() }],
      });
      const fr = await advance(withTurn, keyResult.apiKey, keyResult.source, userId);
      return Response.json({ featureRequest: publicView(fr) });
    }

    if (action === "confirm" || action === "build-now") {
      const id = Number(body.id);
      if (!id) return Response.json({ error: "id required" }, { status: 400 });
      const fr = await getFeatureRequest(id);
      if (!fr) return Response.json({ error: "not found" }, { status: 404 });
      if (!fr.technical_spec) {
        return Response.json({ error: "No proposal yet — keep refining until there is a proposal to build." }, { status: 400 });
      }
      // "confirm" honours the Auto-Feature master toggle; "build-now" is the manual override
      // (exempt from the toggle, like the manual "Apply & ship" for feedback).
      const dispatchNow = action === "build-now" || (await isAutoFeatureEnabled());
      if (!dispatchNow) {
        const saved = await updateFeatureRequest(id, { status: "ready" });
        return Response.json({ featureRequest: publicView(saved), dispatched: false });
      }
      await dispatchFeatureBuild({
        featureRequestId: fr.id,
        title: fr.title || `Feature ${fr.id}`,
        technicalSpec: fr.technical_spec,
        appliedBy: `admin:${userId}`,
      });
      const updated = await updateFeatureRequest(id, { status: "building", applied_by: `admin:${userId}` });
      return Response.json({ featureRequest: publicView(updated), dispatched: true });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("feature-request error:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  if (!keyResult.user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const list = await listFeatureRequests(50);
  return Response.json({ featureRequests: list.map(publicView) });
}
