import { getUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    return Response.json({ user });
  } catch (err) {
    console.error("Auth me error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
