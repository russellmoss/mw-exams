import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { encrypt } from "@/lib/encryption";
import Anthropic from "@anthropic-ai/sdk";
import { logClaudeUsage } from "@/lib/usage-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user || !user.isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const users = await sql`
      SELECT
        u.id, u.email, u.name, u.is_admin, u.is_active, u.created_at,
        u.address, u.business, u.job_title,
        CASE WHEN k.id IS NOT NULL THEN true ELSE false END as has_own_key,
        k.key_hint,
        COUNT(DISTINCT a.id)::int as attempt_count,
        COUNT(DISTINCT CASE WHEN a.completed_at IS NOT NULL THEN a.id END)::int as completed_count
      FROM users u
      LEFT JOIN user_api_keys k ON u.id = k.user_id AND k.provider = 'anthropic'
      LEFT JOIN user_attempts a ON u.id = a.user_id
      GROUP BY u.id, u.email, u.name, u.is_admin, u.is_active, u.created_at, u.address, u.business, u.job_title, k.id, k.key_hint
      ORDER BY u.created_at ASC
    `;

    return Response.json({ users });
  } catch (err) {
    console.error("GET admin/users error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser(request);
    if (!user || !user.isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { email, name, password, address, business, jobTitle, apiKey, isAdmin } = await request.json();
    if (!email || !name || !password) {
      return Response.json({ error: "Email, name, and password are required" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase().trim()}`;
    if (existing.length > 0) {
      return Response.json({ error: "Email already registered" }, { status: 409 });
    }

    // Validate API key if provided
    if (apiKey && apiKey.trim()) {
      const trimmedKey = apiKey.trim();
      if (!trimmedKey.startsWith("sk-ant-")) {
        return Response.json({ error: "Invalid API key format. Keys start with sk-ant-" }, { status: 400 });
      }
      try {
        const client = new Anthropic({ apiKey: trimmedKey });
        const validation = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        });
        logClaudeUsage(
          { taskType: "key_validation", model: "claude-haiku-4-5-20251001", source: "user", userId: null },
          validation.usage
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("401") || msg.includes("authentication") || msg.includes("invalid")) {
          return Response.json({ error: "API key validation failed" }, { status: 400 });
        }
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const rows = await sql`
      INSERT INTO users (email, name, password_hash, address, business, job_title, is_admin, is_active)
      VALUES (
        ${email.toLowerCase().trim()}, ${name.trim()}, ${passwordHash},
        ${address?.trim() || null}, ${business?.trim() || null}, ${jobTitle?.trim() || null},
        ${!!isAdmin}, true
      )
      RETURNING id, email, name, is_admin, is_active, created_at
    `;

    // Save API key if provided
    if (apiKey && apiKey.trim()) {
      const trimmedKey = apiKey.trim();
      const encryptedKey = encrypt(trimmedKey);
      const keyHint = "..." + trimmedKey.slice(-4);
      await sql`
        INSERT INTO user_api_keys (user_id, provider, encrypted_key, key_hint)
        VALUES (${rows[0].id}, 'anthropic', ${encryptedKey}, ${keyHint})
      `;
    }

    return Response.json({ user: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("POST admin/users error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
