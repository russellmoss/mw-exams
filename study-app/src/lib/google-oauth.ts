/**
 * Google OAuth 2.0 authorization-code flow.
 *
 * Hand-rolled rather than NextAuth/Auth.js: this app already has a working session system
 * (signToken / createSessionCookie / getUser), and every protected route calls getUser(). Adopting
 * NextAuth would mean replacing session handling app-wide and re-testing every route. This flow is
 * ~150 lines, mints the same mw-session cookie the app already understands, and changes nothing
 * that already works.
 *
 * Scopes are openid/email/profile only. Those are non-sensitive, so the consent screen can be
 * published without Google review and without the 100-user cap that Testing mode imposes.
 */

import jwt from "jsonwebtoken";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const STATE_COOKIE = "mw-oauth-state";
const STATE_TTL_SECONDS = 600; // 10 minutes: long enough to sign in, short enough to be useless later

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID is not set");
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return secret;
}

function stateSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

/**
 * The redirect URI must match a value registered in the Google console byte for byte.
 * Registered: {APP_URL}/api/auth/google/callback and http://localhost:3000/... — so preview
 * deployments, which get a dynamic hostname, cannot complete this flow. That is expected.
 */
export function redirectUri(request: Request): string {
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
  return `${base}/api/auth/google/callback`;
}

/**
 * CSRF defence. A signed, short-lived state value goes into both the redirect and an HttpOnly
 * cookie; the callback requires them to match. Without this, an attacker could feed a victim a
 * callback URL carrying their own authorization code and silently link accounts.
 */
export function createState(): string {
  return jwt.sign({ n: Math.random().toString(36).slice(2) }, stateSecret(), {
    expiresIn: STATE_TTL_SECONDS,
  });
}

export function verifyState(fromQuery: string | null, fromCookie: string | undefined): boolean {
  if (!fromQuery || !fromCookie) return false;
  if (fromQuery !== fromCookie) return false;
  try {
    jwt.verify(fromQuery, stateSecret());
    return true;
  } catch {
    return false;
  }
}

export function createStateCookie(state: string): string {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${STATE_COOKIE}=${state}; HttpOnly; Path=/;${secure} SameSite=Lax; Max-Age=${STATE_TTL_SECONDS}`;
}

export function clearStateCookie(): string {
  return `${STATE_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export type AccountAction =
  /** A local account already carries this google_sub — just sign in. */
  | { kind: "signin"; userId: number }
  /** Email matches an existing password account; attach the Google identity to it. */
  | { kind: "link"; userId: number }
  /** No match — provision a new account with no password. */
  | { kind: "create" }
  /** Google has not verified this address; linking or creating on it is unsafe. */
  | { kind: "refuse"; reason: "email_unverified" };

/**
 * Decide what a Google sign-in means for our user table.
 *
 * The email_verified gate is the single most security-critical line in this feature. Google will
 * happily issue an id_token for an account whose address it has NOT verified. If we linked on
 * email alone, someone could create a Google account claiming a victim's address, sign in here,
 * and be handed that victim's existing account. So an unverified address may neither link to nor
 * create an account — while a google_sub that we have already linked is fine regardless, because
 * the trust decision was made when the link was established.
 */
export function decideAccountAction(
  profile: Pick<GoogleProfile, "emailVerified">,
  existingByGoogleSub: { id: number } | null,
  existingByEmail: { id: number } | null
): AccountAction {
  if (existingByGoogleSub) return { kind: "signin", userId: existingByGoogleSub.id };
  if (!profile.emailVerified) return { kind: "refuse", reason: "email_unverified" };
  if (existingByEmail) return { kind: "link", userId: existingByEmail.id };
  return { kind: "create" };
}

export function buildAuthUrl(request: Request, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    // Ask for the account chooser every time: without it, a user with several Google accounts is
    // silently signed in as whichever one Google last used.
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchange the authorization code for tokens and read the id_token claims.
 *
 * The id_token's signature is not separately verified against Google's JWKS, because it is
 * received directly from Google's token endpoint over authenticated TLS using the client secret —
 * the case OpenID Connect Core 3.1.3.7 explicitly allows. The claims that matter for security
 * (iss, aud, exp, email_verified) are still checked below.
 */
export async function exchangeCodeForProfile(
  request: Request,
  code: string
): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error("Google response contained no id_token");

  const claims = jwt.decode(tokens.id_token) as Record<string, unknown> | null;
  if (!claims) throw new Error("Could not decode id_token");

  const iss = String(claims.iss ?? "");
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") {
    throw new Error(`Unexpected id_token issuer: ${iss}`);
  }

  const aud = String(claims.aud ?? "");
  if (aud !== clientId()) {
    throw new Error("id_token audience does not match this client");
  }

  const exp = Number(claims.exp ?? 0);
  if (!exp || exp * 1000 < Date.now()) {
    throw new Error("id_token has expired");
  }

  const sub = String(claims.sub ?? "");
  const email = String(claims.email ?? "").toLowerCase();
  if (!sub || !email) throw new Error("id_token is missing sub or email");

  return {
    sub,
    email,
    emailVerified: claims.email_verified === true,
    name: String(claims.name ?? email.split("@")[0]),
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
  };
}
