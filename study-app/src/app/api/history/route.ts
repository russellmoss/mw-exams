import { getUser } from "@/lib/auth";
import { getUserAttempts, getUserStats } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const [attempts, stats] = await Promise.all([
      getUserAttempts(user.id, 100),
      getUserStats(user.id),
    ]);

    return Response.json({ attempts, stats });
  } catch (err) {
    console.error("History error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
