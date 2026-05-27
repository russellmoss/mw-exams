import { getQuestionCounts, getRecentAttempts } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const counts = await getQuestionCounts();
    const attempts = await getRecentAttempts(20);
    return Response.json({ counts, recentAttempts: attempts });
  } catch (err) {
    console.error("question-counts error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
