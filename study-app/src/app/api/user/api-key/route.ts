import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";
import { encrypt } from "@/lib/encryption";
import Anthropic from "@anthropic-ai/sdk";
import { logClaudeUsage } from "@/lib/usage-log";
import { validateTavilyKey } from "@/lib/tavily-key";
import { invalidateElevenLabsKeyCache, validateElevenLabsKey } from "@/lib/elevenlabs-key";

export const runtime = "nodejs";

// One route, three providers. 'anthropic' stays the default so existing clients are untouched;
// 'tavily' and 'elevenlabs' share the same storage, hint, and admin-server-fallback semantics.
//
// The three are NOT equal in consequence: anthropic and tavily are required to have an account at
// all (see the register route), while elevenlabs only unlocks voice. That difference lives in the
// UI and the signup gate — here they are the same shape of secret.
type Provider = "anthropic" | "tavily" | "elevenlabs";

function parseProvider(raw: string | null | undefined): Provider {
  if (raw === "tavily") return "tavily";
  if (raw === "elevenlabs") return "elevenlabs";
  return "anthropic";
}

function serverKeyFor(provider: Provider): string | undefined {
  if (provider === "tavily") return process.env.TAVILY_API_KEY;
  if (provider === "elevenlabs") return process.env.ELEVENLABS_API_KEY;
  return process.env.ANTHROPIC_API_KEY;
}

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const provider = parseProvider(new URL(request.url).searchParams.get("provider"));
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT key_hint, provider, updated_at FROM user_api_keys
      WHERE user_id = ${user.id} AND provider = ${provider}
    `;

    if (rows.length === 0) {
      return Response.json({
        hasKey: false,
        keyHint: null,
        provider,
        usingServerKey: user.isAdmin && !!serverKeyFor(provider),
      });
    }

    return Response.json({
      hasKey: true,
      keyHint: rows[0].key_hint,
      provider: rows[0].provider,
      updatedAt: rows[0].updated_at,
      usingServerKey: false,
    });
  } catch (err) {
    console.error("GET api-key error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const provider = parseProvider(body.provider);
    const apiKey = body.apiKey;
    if (!apiKey || typeof apiKey !== "string") {
      return Response.json({ error: "API key is required" }, { status: 400 });
    }

    const trimmed = apiKey.trim();

    if (provider === "anthropic") {
      if (!trimmed.startsWith("sk-ant-")) {
        return Response.json(
          { error: "Invalid key format. Anthropic keys start with sk-ant-" },
          { status: 400 }
        );
      }

      // Validate the key with a lightweight API call
      try {
        const client = new Anthropic({ apiKey: trimmed });
        const validation = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        });
        logClaudeUsage(
          { taskType: "key_validation", model: "claude-haiku-4-5-20251001", source: "user", userId: user.id },
          validation.usage
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (msg.includes("401") || msg.includes("authentication") || msg.includes("invalid")) {
          return Response.json({ error: "Invalid API key. Authentication failed." }, { status: 400 });
        }
        // Other errors (rate limit, etc.) mean the key is probably valid
      }
    } else if (provider === "elevenlabs") {
      const elevenError = await validateElevenLabsKey(trimmed);
      if (elevenError) {
        return Response.json({ error: elevenError }, { status: 400 });
      }
    } else {
      if (!trimmed.startsWith("tvly-")) {
        return Response.json(
          { error: "Invalid key format. Tavily keys start with tvly-" },
          { status: 400 }
        );
      }
      const tavilyError = await validateTavilyKey(trimmed, user.id);
      if (tavilyError) {
        return Response.json({ error: tavilyError }, { status: 400 });
      }
    }

    const encryptedKey = encrypt(trimmed);
    const keyHint = "..." + trimmed.slice(-4);

    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      INSERT INTO user_api_keys (user_id, provider, encrypted_key, key_hint, updated_at)
      VALUES (${user.id}, ${provider}, ${encryptedKey}, ${keyHint}, NOW())
      ON CONFLICT (user_id, provider) DO UPDATE SET
        encrypted_key = ${encryptedKey},
        key_hint = ${keyHint},
        updated_at = NOW()
    `;

    // The resolver memoizes per user for 60s; without this a key saved here would not take effect
    // until that expired, which reads as "I saved it and voice still says I have no key".
    if (provider === "elevenlabs") invalidateElevenLabsKeyCache(user.id);

    return Response.json({ success: true, keyHint });
  } catch (err) {
    console.error("POST api-key error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const provider = parseProvider(new URL(request.url).searchParams.get("provider"));
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      DELETE FROM user_api_keys WHERE user_id = ${user.id} AND provider = ${provider}
    `;
    if (provider === "elevenlabs") invalidateElevenLabsKeyCache(user.id);

    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE api-key error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
