import { getUser } from "@/lib/auth";
import { requireApiKey } from "@/lib/api-key";
import { parseProposalId } from "@/lib/bin-fix-ui";
import { getBinFixProposals, markBinFixRejected } from "@/lib/db";
import {
  mineBinFixProposals,
  dispatchBinFixProposal,
  reconcileBinFixProposals,
} from "@/lib/bin-fix-miner";

export const runtime = "nodejs";
// Mining makes one (Opus-class) Claude call over the whole ledger; give it room.
export const maxDuration = 300;

/**
 * GET /api/admin/bin/fixes — admin-only. The "Root-cause fixes" list.
 *
 * Reconciles in-flight PRs against GitHub first (pull-based, same as feedback/feature PRs): a fix PR
 * a human merged flips to shipped here, which retires its evidence rows from the prompt feeds — so
 * simply opening the admin page is what closes the codify-and-retire loop.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const reconciled = await reconcileBinFixProposals();
  const proposals = await getBinFixProposals();
  return Response.json({ proposals, reconciled });
}

/**
 * POST /api/admin/bin/fixes — admin-only. Three shapes:
 *   • { action: 'mine' }                    — run the root-cause miner now (needs a Claude key).
 *   • { action: 'dispatch', proposalId }    — fire the PR-gated auto-feedback Action for a proposal.
 *   • { action: 'reject',   proposalId }    — decline a proposal; its evidence stays in the feeds.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { action, proposalId } = body as { action?: unknown; proposalId?: unknown };

  if (action === "mine") {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;
    if (!keyResult.user.isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const result = await mineBinFixProposals({
      apiKey: keyResult.apiKey,
      userId: keyResult.user.id,
      source: "user",
    });
    return Response.json({ ok: result.status !== "error", ...result });
  }

  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = parseProposalId(proposalId);
  if (id === null) {
    return Response.json({ error: "Missing proposalId" }, { status: 400 });
  }

  if (action === "dispatch") {
    // dispatchRepositoryEvent throws on GitHub/config failures (missing GITHUB_TOKEN, API errors);
    // unwrapped, that surfaces as an opaque 500 the UI cannot explain — return the message instead.
    try {
      const result = await dispatchBinFixProposal({ proposalId: id, adminUserId: user.id });
      if (!result.dispatched) {
        return Response.json({ ok: false, error: result.error }, { status: 409 });
      }
      return Response.json({ ok: true });
    } catch (err) {
      console.error("[bin-fixes] dispatch failed:", err);
      const message = err instanceof Error ? err.message : "dispatch failed";
      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  }

  if (action === "reject") {
    const changed = await markBinFixRejected(id, user.id);
    return Response.json({ ok: true, changed });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
