import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeKeyFormatProblem, looksLikeElevenLabsKey } from "@/lib/elevenlabs-key";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => fs.readFileSync(path.join(appDir, p), "utf8");

// Which keys an account must have, and which it may have. Getting this backwards in either
// direction is a real failure: required-but-missing creates an account that cannot study, and
// optional-but-enforced turns voice into a paywall on the whole app.

describe("key requirements at signup", () => {
  const register = read("src/app/api/auth/register/route.ts");

  it("refuses an account with no Anthropic key", () => {
    expect(register).toMatch(/if \(!apiKey \|\| !String\(apiKey\)\.trim\(\)\)/);
    expect(register).toMatch(/An Anthropic API key is required/);
  });

  it("refuses an account with no Tavily key", () => {
    expect(register).toMatch(/if \(!tavilyKey \|\| !String\(tavilyKey\)\.trim\(\)\)/);
    expect(register).toMatch(/A Tavily API key is required/);
  });

  it("does NOT require ElevenLabs — voice is a capability, not an entry fee", () => {
    const guard = register.match(/if \(!elevenlabsKey[^)]*\)\s*\{[\s\S]{0,200}?status: 400/);
    expect(guard).toBeNull();
    // It is still stored when offered.
    expect(register).toMatch(/VALUES \(\$\{newUser\.id\}, 'elevenlabs'/);
  });

  it("validates an ElevenLabs key that IS offered, rather than storing it blind", () => {
    // A wrong key stored silently is how this app lost two days of narration.
    expect(register).toMatch(/validateElevenLabsKey/);
  });

  it("asks the signup form for all three, and marks only two required", () => {
    const login = read("src/app/login/page.tsx");
    expect(login).toMatch(/elevenlabsKey: regElevenKey \|\| undefined/);
    expect(login).toMatch(/placeholder="sk-ant-\.\.\." required/);
    expect(login).toMatch(/placeholder="tvly-\.\.\." required/);
    // The ElevenLabs input must NOT carry `required`.
    const elevenInput = login.match(/id="reg-eleven-key"[\s\S]*?\/>/)?.[0] ?? "";
    expect(elevenInput).toBeTruthy();
    expect(elevenInput).not.toMatch(/\brequired\b/);
  });

  it("points at the page that actually issues keys", () => {
    expect(read("src/app/login/page.tsx")).toContain("https://elevenlabs.io/app/developers/api-keys");
  });
});

describe("ElevenLabs key format", () => {
  it("accepts a real key", () => {
    expect(looksLikeElevenLabsKey("sk_abc123")).toBe(true);
    expect(describeKeyFormatProblem("sk_abc123")).toBeNull();
  });

  it("names the key-ID trap instead of just saying invalid", () => {
    // The dashboard shows a key ID beside every key and it looks like a credential. This app ran on
    // one for two days, so the message has to identify the mistake, not report failure.
    const problem = describeKeyFormatProblem("a1b2c3d4e5f6a7b8c9d0e1f2");
    expect(problem).toMatch(/key ID/);
    expect(problem).toMatch(/sk_/);
  });

  it("treats an empty field as an empty field", () => {
    expect(describeKeyFormatProblem("   ")).toMatch(/blank/);
  });
});

// Live-response handling, pinned against the real API's shapes. This got it wrong twice in
// opposite directions, so both are asserted rather than described.
describe("ElevenLabs live validation reads the right field", () => {
  const src = read("src/lib/elevenlabs-key.ts");

  it("accepts a key that authenticated but lacks the probe's permission", () => {
    // A key scoped to text-to-speech and nothing else is exactly what a careful user creates for
    // this app; /v1/user answers it 401 missing_permissions, which PROVES the key is real.
    expect(src).toMatch(/missing_permissions/);
    expect(src).toMatch(/if \(\/missing_permissions[\s\S]{0,60}\) return null;/);
  });

  it("rejects an invalid key even though it arrives as 400, not 401", () => {
    expect(src).toMatch(/invalid_api_key/);
  });

  it("does not decide on `type`, which is identical for both cases", () => {
    // Both responses are type: "authentication_error" — matching on it rejected a working key.
    expect(src).not.toMatch(/test\(.*authentication_error/);
  });
});

// ── BYOK ─────────────────────────────────────────────────────────────────────────────────────────

describe("voice is BYOK, with the server key reserved for admins", () => {
  const keyLib = read("src/lib/elevenlabs-key.ts");
  const speak = read("src/app/api/coach/speak/route.ts");
  const transcribe = read("src/app/api/coach/transcribe/route.ts");

  it("prefers the user's own key, even for an admin", () => {
    // Same order as the Anthropic and Tavily resolvers: stored key wins outright.
    const userBranch = keyLib.indexOf("source: \"user\"");
    const adminBranch = keyLib.indexOf("r?.is_admin && process.env.ELEVENLABS_API_KEY");
    expect(userBranch).toBeGreaterThan(-1);
    expect(adminBranch).toBeGreaterThan(userBranch);
  });

  it("only falls back to the server key for admins", () => {
    // Without the is_admin guard every candidate's speech would be billed to us.
    expect(keyLib).toMatch(/if \(!result && r\?\.is_admin && process\.env\.ELEVENLABS_API_KEY\)/);
  });

  it("bills both voice routes to the resolved key, not the environment", () => {
    expect(speak).toMatch(/getElevenLabsKeyForUserId\(user\.id\)/);
    expect(speak).toMatch(/apiKey: resolved\.key/);
    expect(transcribe).toMatch(/getElevenLabsKeyForUserId\(user\.id\)/);
    expect(transcribe).toMatch(/apiKey: resolved\.key/);
  });

  it("answers 402, not 503, when the user simply has no key", () => {
    // 503 says "we are broken"; 402 says "this is yours to fix", which is what the client offers.
    for (const [name, src] of [["speak", speak], ["transcribe", transcribe]] as const) {
      expect(src, name).toMatch(/status: 402/);
      expect(src, name).toMatch(/Settings/);
    }
  });

  it("leaves our own background narration on the server key", () => {
    // The feedback-verdict narration runs from a cron with no user in scope — it is our feature, so
    // billing it to whichever candidate happened to trigger the analysis would be wrong.
    const analysis = read("src/lib/feedback-analysis.ts");
    expect(analysis).toMatch(/isElevenLabsConfigured\(\)/);
    expect(analysis).not.toMatch(/getElevenLabsKeyForUserId/);
  });

  it("drops the cached resolution when the key changes", () => {
    // The resolver memoizes for 60s; without this, saving a key in Settings appears not to work.
    const route = read("src/app/api/user/api-key/route.ts");
    expect(route.match(/invalidateElevenLabsKeyCache\(user\.id\)/g) ?? []).toHaveLength(2);
  });

  it("manages all three providers through the one endpoint", () => {
    const route = read("src/app/api/user/api-key/route.ts");
    expect(route).toMatch(/type Provider = "anthropic" \| "tavily" \| "elevenlabs"/);
    expect(route).toMatch(/if \(raw === "elevenlabs"\) return "elevenlabs"/);
  });
});

// ── The OAuth hole ───────────────────────────────────────────────────────────────────────────────
//
// The signup form can refuse to create an account without keys. Google cannot: it hands us a
// verified identity and the account exists before anyone has typed anything. So the requirement has
// to be enforced after the fact, and if it is enforced in only one of the two places it is enforced
// in neither.

describe("Google sign-ups are held to the same requirement", () => {
  const onboarding = read("src/app/onboarding/page.tsx");
  const gate = read("src/app/components/RequireKeysGate.tsx");
  const layout = read("src/app/layout.tsx");
  const me = read("src/app/api/auth/me/route.ts");
  const callback = read("src/app/api/auth/google/callback/route.ts");

  it("sends a brand-new Google account to onboarding", () => {
    expect(callback).toMatch(/action\.kind === "create" \? "\/onboarding" : "\/"/);
  });

  it("will not let onboarding continue without the two required keys", () => {
    expect(onboarding).toMatch(/const hasRequiredKeys = user\.hasApiKey && user\.hasTavilyKey !== false/);
    expect(onboarding).toMatch(/disabled=\{!hasRequiredKeys\}/);
  });

  it("does not offer a way past the keys step", () => {
    // "Skip for now" exists on the DEFAULTS step — those are preferences. The keys are not.
    const keysStep = onboarding.match(/if \(step === "keys"[\s\S]*?^  \}/m)?.[0] ?? "";
    expect(keysStep).toBeTruthy();
    expect(keysStep).not.toMatch(/Skip for now/);
    expect(keysStep).toMatch(/ApiKeySetup/);
  });

  it("still asks for ElevenLabs, and still does not require it", () => {
    const setup = read("src/app/components/ApiKeySetup.tsx");
    expect(setup).toMatch(/id: "elevenlabs"/);
    const eleven = setup.match(/\{\s*id: "elevenlabs"[\s\S]*?\},/)?.[0] ?? "";
    expect(eleven).toMatch(/required: false/);
    expect(eleven).toContain("https://elevenlabs.io/app/developers/api-keys");
    // And the trap is named here too, not just on the signup form.
    expect(eleven).toMatch(/key ID/);
  });

  it("bounces a keyless user who navigates around onboarding", () => {
    // A bookmark or the back button would otherwise walk straight into an app where every call 402s.
    expect(layout).toMatch(/<RequireKeysGate \/>/);
    expect(gate).toMatch(/router\.replace\("\/onboarding"\)/);
    expect(gate).toMatch(/!user\.hasApiKey \|\| user\.hasTavilyKey === false/);
  });

  it("never bounces someone out of the pages where keys can be fixed", () => {
    // Redirecting away from /settings would make a recoverable state unrecoverable.
    for (const route of ["/onboarding", "/settings", "/login", "/reset-password"]) {
      expect(gate, route).toContain(`"${route}"`);
    }
  });

  it("treats an unknown answer as fine, so a stale client cannot lock anyone out", () => {
    expect(gate).toMatch(/hasTavilyKey === false/);
    expect(gate).not.toMatch(/!user\.hasTavilyKey\b/);
  });

  it("reports all three providers, with the admin fallback applied per provider", () => {
    expect(me).toMatch(/provider IN \('anthropic', 'tavily', 'elevenlabs'\)/);
    expect(me).toMatch(/hasTavilyKey/);
    expect(me).toMatch(/hasVoiceKey/);
    // Per-provider, so an admin missing one is not treated as missing all three.
    expect(me).toMatch(/user\.isAdmin && !!process\.env\.TAVILY_API_KEY/);
    expect(me).toMatch(/user\.isAdmin && !!process\.env\.ELEVENLABS_API_KEY/);
  });
});

describe("the client does not offer voice it cannot deliver", () => {
  const chat = read("src/app/components/coach/CoachChat.tsx");

  it("checks for a key before opening the mic", () => {
    // Otherwise the candidate speaks a whole sentence and only then learns they have no key.
    expect(chat).toMatch(/api\/user\/api-key\?provider=elevenlabs/);
    expect(chat).toMatch(/voiceAvailable === false/);
  });

  it("stays enabled when the probe itself fails", () => {
    // Unreachable is not unconfigured — hiding voice on a flaky probe would be worse than letting
    // the route explain itself.
    expect(chat).toMatch(/if \(!cancelled\) setVoiceAvailable\(true\)/);
  });

  it("says why, rather than presenting a dead control", () => {
    expect(chat).toMatch(/Add an ElevenLabs key in Settings to talk to the Coach/);
    expect(chat).toMatch(/Add an ElevenLabs key in Settings to have answers read aloud/);
  });
});
