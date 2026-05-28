import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { signToken, createSessionCookie } from "@/lib/auth";
import { encrypt } from "@/lib/encryption";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { name, email, password, address, business, jobTitle, apiKey } =
      await request.json();

    if (!name || !email || !password || !address) {
      return Response.json(
        { error: "Name, email, password, and address are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return Response.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);

    const existing = await sql`
      SELECT id FROM users WHERE email = ${email.toLowerCase().trim()}
    `;
    if (existing.length > 0) {
      return Response.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Validate API key if provided
    if (apiKey && apiKey.trim()) {
      const trimmedKey = apiKey.trim();
      if (!trimmedKey.startsWith("sk-ant-")) {
        return Response.json(
          { error: "Invalid API key format. Anthropic keys start with sk-ant-" },
          { status: 400 }
        );
      }

      try {
        const client = new Anthropic({ apiKey: trimmedKey });
        await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("401") || msg.includes("authentication") || msg.includes("invalid")) {
          return Response.json(
            { error: "API key validation failed. Please check your key." },
            { status: 400 }
          );
        }
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const rows = await sql`
      INSERT INTO users (email, name, password_hash, address, business, job_title, is_admin, is_active)
      VALUES (
        ${email.toLowerCase().trim()},
        ${name.trim()},
        ${passwordHash},
        ${address.trim()},
        ${business?.trim() || null},
        ${jobTitle?.trim() || null},
        false,
        true
      )
      RETURNING id, email, name, is_admin
    `;

    const newUser = rows[0];

    // Save API key if provided
    if (apiKey && apiKey.trim()) {
      const trimmedKey = apiKey.trim();
      const encryptedKey = encrypt(trimmedKey);
      const keyHint = "..." + trimmedKey.slice(-4);
      await sql`
        INSERT INTO user_api_keys (user_id, provider, encrypted_key, key_hint)
        VALUES (${newUser.id}, 'anthropic', ${encryptedKey}, ${keyHint})
      `;
    }

    const authUser = {
      id: newUser.id as number,
      email: newUser.email as string,
      name: newUser.name as string,
      isAdmin: false,
    };
    const token = signToken(authUser);

    return new Response(JSON.stringify({ user: authUser }), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": createSessionCookie(token),
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
