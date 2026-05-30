import { getUser } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import { AB_CONFIG_KEY, AB_TASKS, invalidateAbCache, type AbConfig, type ModelTier } from "@/lib/model-selector";

export const runtime = "nodejs";

const TIERS: ModelTier[] = ["opus", "sonnet", "haiku"];

export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const config = await getSetting<AbConfig>(AB_CONFIG_KEY, {});
  return Response.json({ tasks: AB_TASKS, config: config || {} });
}

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const incoming = body.config;
  if (!incoming || typeof incoming !== "object") {
    return Response.json({ error: "config (object) required" }, { status: 400 });
  }

  // Sanitise: keep only known tasks/tiers and non-negative numeric weights. Drop any task
  // whose weights are all zero so it cleanly reverts to its default tier.
  const validTasks = new Set(AB_TASKS.map((t) => t.task));
  const clean: AbConfig = {};
  for (const [task, weights] of Object.entries(incoming as Record<string, unknown>)) {
    if (!validTasks.has(task) || !weights || typeof weights !== "object") continue;
    const w: Partial<Record<ModelTier, number>> = {};
    let total = 0;
    for (const tier of TIERS) {
      const raw = (weights as Record<string, unknown>)[tier];
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) {
        w[tier] = Math.round(n);
        total += n;
      }
    }
    if (total > 0) clean[task] = w;
  }

  await setSetting(AB_CONFIG_KEY, clean);
  invalidateAbCache();
  return Response.json({ config: clean });
}
