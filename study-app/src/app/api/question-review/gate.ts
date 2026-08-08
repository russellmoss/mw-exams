// The server-side gate for every /api/question-review/* route.
//
// The header link is hidden for everyone else, but a hidden link is not a gate — these routes expose
// the full model answer and the generator's private reasoning trace for the whole bank, which is
// exactly the material a candidate must never see. So the check lives here and every route calls it.

import { getUser, type AuthUser } from "@/lib/auth";

export async function requireReviewer(request: Request): Promise<AuthUser | Response> {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  // Deliberately NOT `|| user.isAdmin`: almost every account here is an admin, so an admin fallback
  // would silently widen this to the whole user base — the exact thing the flag exists to prevent.
  if (!user.canReviewQuestions) return Response.json({ error: "Forbidden" }, { status: 403 });
  return user;
}
