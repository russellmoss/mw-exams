import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";
import { encrypt } from "@/lib/encryption";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT key_hint, provider, updated_at FROM user_api_keys
      WHERE user_id = ${user.id} AND provider = 'anthropic'
    `;

    if (rows.length === 0) {
      return Response.json({
        hasKey: false,
        keyHint: null,
        provider: "anthropic",
        usingServerKey: user.isAdmin && !!process.env.ANTHROPIC_API_KEY,
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

    const { apiKey } = await request.json();
    if (!apiKey || typeof apiKey !== "string") {
      return Response.json({ error: "API key is required" }, { status: 400 });
    }

    const trimmed = apiKey.trim();
    if (!trimmed.startsWith("sk-ant-")) {
      return Response.json(
        { error: "Invalid key format. Anthropic keys start with sk-ant-" },
        { status: 400 }
      );
    }

    // Validate the key with a lightweight API call
    try {
      const client = new Anthropic({ apiKey: trimmed });
      await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("401") || msg.includes("authentication") || msg.includes("invalid")) {
        return Response.json({ error: "Invalid API key. Authentication failed." }, { status: 400 });
      }
      // Other errors (rate limit, etc.) mean the key is probably valid
    }

    const encryptedKey = encrypt(trimmed);
    const keyHint = "..." + trimmed.slice(-4);

    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      INSERT INTO user_api_keys (user_id, provider, encrypted_key, key_hint, updated_at)
      VALUES (${user.id}, 'anthropic', ${encryptedKey}, ${keyHint}, NOW())
      ON CONFLICT (user_id, provider) DO UPDATE SET
        encrypted_key = ${encryptedKey},
        key_hint = ${keyHint},
        updated_at = NOW()
    `;

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

    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      DELETE FROM user_api_keys WHERE user_id = ${user.id} AND provider = 'anthropic'
    `;

    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE api-key error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
