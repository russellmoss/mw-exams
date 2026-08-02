import Anthropic from "@anthropic-ai/sdk";
import { requireApiKey } from "@/lib/api-key";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import { isAutoFeatureEnabled } from "@/lib/settings";
import { dispatchFeatureBuild } from "@/lib/github-dispatch";
import { buildFeatureRequestSystem, buildMockupSystem, getMockupCss } from "@/lib/prompts/feature-request-prompt";
import {
  createFeatureRequest,
  getFeatureRequest,
  listFeatureRequests,
  updateFeatureRequest,
  getEmpiricalKnowledgeDigest,
  type FeatureRequest,
} from "@/lib/db";

export const runtime = "nodejs";
// The dialog turn and the mockup renders run back to back in this one request.
export const maxDuration = 300;

const SENTINEL = "<<<META>>>";

type Mockup = { title: string; html: string };
type Screen = { title: string; brief: string };
type Meta = {
  phase: "clarifying" | "proposing";
  readyToBuild: boolean;
  title: string;
  technicalSpec: string;
  screens: Screen[];
  mockups: Mockup[]; // only ever populated by a legacy reply that inlined the HTML itself
};

// Inject the Cellar stylesheet into each mockup so it renders looking like the real app, and harden
// it (the model is told not to, but enforce: no scripts survive — the iframe sandbox also blocks them).
function dressMockup(m: Mockup): Mockup {
  let html = String(m.html || "");
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const styleTag = `<style>${getMockupCss()}</style>`;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (h) => `${h}\n${styleTag}`);
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, (h) => `${h}<head>${styleTag}</head>`);
  } else {
    html = `<!doctype html><html><head>${styleTag}</head><body>${html}</body></html>`;
  }
  return { title: String(m.title || "Mockup").slice(0, 80), html };
}

// Returns null when the META JSON is missing or unparseable (almost always because the reply was cut
// off at max_tokens). Null means "we learned nothing this turn" — the caller must NOT treat that as a
// clarifying turn with no mockups, which is how proposals used to silently lose their spec.
function parseMeta(raw: string): Meta | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end > start) {
      const o = JSON.parse(raw.slice(start, end + 1));
      return {
        phase: o.phase === "proposing" ? "proposing" : "clarifying",
        readyToBuild: o.readyToBuild === true,
        title: typeof o.title === "string" ? o.title : "",
        technicalSpec: typeof o.technicalSpec === "string" ? o.technicalSpec : "",
        screens: Array.isArray(o.screens)
          ? o.screens
              .filter((s: unknown) => s && typeof (s as Screen).brief === "string")
              .map((s: Screen) => ({ title: String(s.title || "Screen").slice(0, 80), brief: String(s.brief) }))
              .slice(0, 4)
          : [],
        mockups: Array.isArray(o.mockups)
          ? o.mockups.filter((m: unknown) => m && typeof (m as Mockup).html === "string").map((m: Mockup) => dressMockup(m)).slice(0, 6)
          : [],
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

// Draw the screens the dialog turn asked for — one small call each, all in flight at once, so no
// single response has to carry several HTML documents. A screen that fails is dropped, not fatal:
// the proposal and its build spec still stand.
async function renderMockups(
  client: Anthropic,
  model: string,
  screens: Screen[],
  context: { title: string; proposal: string },
  usageCtx: { source: "user" | "server"; userId: number; abGroup: string | null }
): Promise<Mockup[]> {
  const system = buildMockupSystem();

  const drawn = await Promise.all(
    screens.map(async (screen) => {
      const t0 = Date.now();
      try {
        const msg = await client.messages.create({
          model,
          max_tokens: 4000,
          system,
          messages: [
            {
              role: "user",
              content: `FEATURE: ${context.title || "(untitled)"}\n\nTHE PROPOSAL THIS SCREEN BELONGS TO (context only — draw just the screen below):\n${context.proposal}\n\nSCREEN TO DRAW — "${screen.title}":\n${screen.brief}`,
            },
          ],
        });
        logClaudeUsage(
          { taskType: "feature_mockup", model, source: usageCtx.source, userId: usageCtx.userId, abGroup: usageCtx.abGroup },
          msg.usage,
          { latencyMs: Date.now() - t0 }
        );
        // Asked for bare HTML, but tolerate a stray fence or a line of preamble in front of it.
        const text = msg.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .replace(/```[a-z]*\n?/gi, "")
          .trim();
        const docAt = text.search(/<!doctype html|<html[\s>]/i);
        return dressMockup({ title: screen.title, html: docAt > 0 ? text.slice(docAt) : text });
      } catch (err) {
        console.error("feature-request mockup render failed:", err);
        return null;
      }
    })
  );

  return drawn.filter((m): m is Mockup => m !== null);
}

// Stream one Opus turn over the running thread: forward the visible markdown as it streams, then parse
// the <<<META>>> tail, persist the assistant turn (with mockups) + spec/status, and emit a final meta.
function streamTurn(
  fr: FeatureRequest,
  apiKey: string,
  source: "user" | "server",
  userId: number,
  ekDigest: string
): Response {
  const system = buildFeatureRequestSystem(ekDigest);
  const messages = fr.thread.map((t) => ({
    role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: t.content,
  }));
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const client = new Anthropic({ apiKey });
        const { model, abGroup } = await selectModel("feature_request", apiKey, "opus");
        const t0 = Date.now();
        // No HTML in this response any more (mockups are drawn separately), so 8k is ample for the
        // write-up + spec + screen briefs — but the truncation guard below still has to hold.
        const stream = await client.messages.stream({ model, max_tokens: 8000, system, messages });

        let full = "";
        let visibleSent = 0; // how many chars of the pre-sentinel visible text we've forwarded
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            const sentinelAt = full.indexOf(SENTINEL);
            // Only forward visible text up to the sentinel; once seen, stop streaming (the rest is JSON).
            const visibleEnd = sentinelAt === -1 ? full.length : sentinelAt;
            if (visibleEnd > visibleSent) {
              send({ t: full.slice(visibleSent, visibleEnd) });
              visibleSent = visibleEnd;
            }
          }
        }
        const finalMsg = await stream.finalMessage();
        logClaudeUsage(
          { taskType: "feature_request", model, source, userId, abGroup },
          finalMsg.usage,
          { latencyMs: Date.now() - t0 }
        );

        const sentinelAt = full.indexOf(SENTINEL);
        const visible = (sentinelAt === -1 ? full : full.slice(0, sentinelAt)).trim();
        const metaRaw = sentinelAt === -1 ? "" : full.slice(sentinelAt + SENTINEL.length);
        const meta = parseMeta(metaRaw);

        // Draw the proposed screens now, in parallel, from their briefs.
        let mockups: Mockup[] = meta?.mockups ?? [];
        if (meta?.phase === "proposing" && meta.screens.length && !mockups.length) {
          send({ status: `Drawing ${meta.screens.length === 1 ? "the screen" : `${meta.screens.length} screens`}…` });
          mockups = await renderMockups(
            client,
            model,
            meta.screens,
            { title: meta.title || fr.title || "", proposal: visible },
            { source, userId, abGroup }
          );
        }

        // A missing/unparseable META means the turn was cut off. Keep whatever the request already
        // had (a previously-earned "proposed" + spec must survive) and tell the admin, rather than
        // quietly demoting it to a mockup-less clarifying turn.
        const truncated = !meta;
        const status = truncated ? fr.status : meta.phase === "proposing" ? "proposed" : "clarifying";
        const thread = [
          ...fr.thread,
          { role: "assistant" as const, content: visible, timestamp: new Date().toISOString(), ...(mockups.length ? { mockups } : {}) },
        ];
        await updateFeatureRequest(fr.id, {
          thread,
          status,
          title: meta?.title || fr.title || undefined,
          ...(meta?.phase === "proposing" ? { user_facing_proposal: visible, technical_spec: meta.technicalSpec } : {}),
        });

        if (truncated) {
          send({ error: "That reply was cut off before Claude finished the proposal — ask it to try again (or to keep it shorter) and the mockups will come with it." });
        }
        send({
          meta: {
            id: fr.id,
            status,
            readyToBuild: truncated ? fr.status === "proposed" && !!fr.technical_spec : meta.phase === "proposing" && !!meta.technicalSpec,
            title: meta?.title || fr.title,
            mockups,
          },
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        send({ error: err instanceof Error ? err.message : "unknown" });
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

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
    technicalSpec: fr.technical_spec, // admin-only debug surface; never rendered in the chat
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
    if (!keyResult.user.isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });
    const userId = keyResult.user.id;
    const body = await request.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "start" || action === "reply") {
      let fr: FeatureRequest | null;
      if (action === "start") {
        const text = (body.request as string || "").trim();
        if (!text) return Response.json({ error: "request text required" }, { status: 400 });
        fr = await createFeatureRequest(
          userId,
          text.slice(0, 80),
          [{ role: "user", content: text, timestamp: new Date().toISOString() }],
          "drafting"
        );
      } else {
        const id = Number(body.id);
        const text = (body.message as string || "").trim();
        if (!id || !text) return Response.json({ error: "id and message required" }, { status: 400 });
        const existing = await getFeatureRequest(id);
        if (!existing) return Response.json({ error: "not found" }, { status: 404 });
        fr = await updateFeatureRequest(id, {
          thread: [...existing.thread, { role: "user", content: text, timestamp: new Date().toISOString() }],
        });
      }
      const ekDigest = await getEmpiricalKnowledgeDigest().catch(() => "");
      return streamTurn(fr, keyResult.apiKey, keyResult.source, userId, ekDigest);
    }

    if (action === "confirm" || action === "build-now") {
      const id = Number(body.id);
      if (!id) return Response.json({ error: "id required" }, { status: 400 });
      const fr = await getFeatureRequest(id);
      if (!fr) return Response.json({ error: "not found" }, { status: 404 });
      if (!fr.technical_spec) {
        return Response.json({ error: "No proposal yet — keep refining until there is a proposal to build." }, { status: 400 });
      }
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
  if (!keyResult.user.isAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });
  const list = await listFeatureRequests(50);
  return Response.json({ featureRequests: list.map(publicView) });
}
