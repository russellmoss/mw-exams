import { buildAuthUrl, createState, createStateCookie } from "@/lib/google-oauth";

export const runtime = "nodejs";

/** Entry point for "Continue with Google" — mints CSRF state and bounces to Google's consent screen. */
export async function GET(request: Request) {
  try {
    const state = createState();
    return new Response(null, {
      status: 302,
      headers: {
        Location: buildAuthUrl(request, state),
        "Set-Cookie": createStateCookie(state),
      },
    });
  } catch (err) {
    console.error("google oauth start error:", err);
    return new Response(null, {
      status: 302,
      headers: { Location: "/login?error=google_unavailable" },
    });
  }
}
