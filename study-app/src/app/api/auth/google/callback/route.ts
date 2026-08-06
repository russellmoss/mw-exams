import { neon } from "@neondatabase/serverless";
import { signToken, createSessionCookie } from "@/lib/auth";
import {
  exchangeCodeForProfile,
  verifyState,
  clearStateCookie,
  decideAccountAction,
  STATE_COOKIE,
} from "@/lib/google-oauth";

export const runtime = "nodejs";

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key === name) return rest.join("=").trim();
  }
  return undefined;
}

function redirect(location: string, extraCookie?: string): Response {
  const headers = new Headers({ Location: location });
  headers.append("Set-Cookie", clearStateCookie());
  if (extraCookie) headers.append("Set-Cookie", extraCookie);
  return new Response(null, { status: 302, headers });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    // The user declined at the consent screen, or Google refused.
    const oauthError = url.searchParams.get("error");
    if (oauthError) {
      console.info(`[google-callback] returned error: ${oauthError}`);
      return redirect("/login?error=google_cancelled");
    }

    if (!verifyState(url.searchParams.get("state"), readCookie(request, STATE_COOKIE))) {
      console.warn("[google-callback] state mismatch — possible CSRF, refusing");
      return redirect("/login?error=google_state");
    }

    const code = url.searchParams.get("code");
    if (!code) return redirect("/login?error=google_no_code");

    const profile = await exchangeCodeForProfile(request, code);
    const sql = neon(process.env.DATABASE_URL!);

    const bySub = await sql`SELECT id FROM users WHERE google_sub = ${profile.sub}`;
    const byEmail = await sql`SELECT id FROM users WHERE email = ${profile.email}`;

    const action = decideAccountAction(
      profile,
      bySub.length ? { id: bySub[0].id as number } : null,
      byEmail.length ? { id: byEmail[0].id as number } : null
    );

    if (action.kind === "refuse") {
      console.warn(`[google-callback] refusing unverified email ${profile.email}`);
      return redirect("/login?error=google_unverified");
    }

    let userId: number;

    if (action.kind === "create") {
      const rows = await sql`
        INSERT INTO users (email, name, password_hash, google_sub, avatar_url, is_admin, is_active)
        VALUES (
          ${profile.email},
          ${profile.name},
          NULL,
          ${profile.sub},
          ${profile.picture ?? null},
          false,
          true
        )
        RETURNING id
      `;
      userId = rows[0].id as number;
      console.info(`[google-callback] created account for ${profile.email}`);
    } else {
      userId = action.userId;
      if (action.kind === "link") {
        await sql`
          UPDATE users
          SET google_sub = ${profile.sub},
              avatar_url = COALESCE(avatar_url, ${profile.picture ?? null})
          WHERE id = ${userId}
        `;
        console.info(`[google-callback] linked Google to existing account ${profile.email}`);
      }
    }

    const rows = await sql`
      SELECT id, email, name, is_admin, is_active FROM users WHERE id = ${userId}
    `;
    const user = rows[0];

    if (user.is_active === false) {
      return redirect("/login?error=account_disabled");
    }

    const authUser = {
      id: user.id as number,
      email: user.email as string,
      name: user.name as string,
      isAdmin: user.is_admin as boolean,
    };

    // Brand-new accounts pick their study defaults first; returning users go straight in.
    return redirect(
      action.kind === "create" ? "/onboarding" : "/",
      createSessionCookie(signToken(authUser))
    );
  } catch (err) {
    console.error("google callback error:", err);
    return redirect("/login?error=google_failed");
  }
}
