import { getUser } from "@/lib/auth";
import { getUserNotifications } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Auth required" }, { status: 401 });
    }

    const notifications = await getUserNotifications(user.id);
    return Response.json(notifications);
  } catch (err) {
    console.error("feedback-notifications error:", err);
    return Response.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
