import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { signToken, createSessionCookie } from "@/lib/auth";
import { encrypt } from "@/lib/encryption";
import Anthropic from "@anthropic-ai/sdk";
import { logClaudeUsage } from "@/lib/usage-log";
import { validateTavilyKey } from "@/lib/tavily-key";
import { validateElevenLabsKey } from "@/lib/elevenlabs-key";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const {
      name, email, password, streetAddress, city, state, country, address, business, jobTitle,
      apiKey, tavilyKey, elevenlabsKey,
    } = await request.json();

    // Structured address (street/city/state/country). city+country double as the user's Live
    // Tasting market so the buy-local flow works from day one. The legacy single `address` field
    // is still accepted so an old client (or the admin create-user path) keeps working.
    const structured = !!(streetAddress?.trim() && city?.trim() && country?.trim());
    if (!name || !email || !password || (!structured && !address)) {
      return Response.json(
        { error: "Name, email, password, street address, city, and country are required" },
        { status: 400 }
      );
    }

    // ANTHROPIC AND TAVILY ARE REQUIRED; ELEVENLABS IS NOT.
    //
    // The app is BYOK: without an Anthropic key nothing generates or grades, and without Tavily the
    // research the answers are built on cannot run — an account missing either is an account that
    // cannot study, so it is better refused at the door than created and immediately broken.
    // ElevenLabs is optional because it buys exactly one thing: being able to talk to the Coach and
    // be talked back to. Everything else works without it.
    //
    // NOTE this only guards the email/password form. Google sign-up has no form to require them in,
    // so those accounts still land keyless and are caught by the "add your key" banner instead.
    if (!apiKey || !String(apiKey).trim()) {
      return Response.json(
        { error: "An Anthropic API key is required — the app cannot generate or grade without one." },
        { status: 400 }
      );
    }
    if (!tavilyKey || !String(tavilyKey).trim()) {
      return Response.json(
        { error: "A Tavily API key is required — it powers the wine research behind every answer." },
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
          return Response.json(
            { error: "API key validation failed. Please check your key." },
            { status: 400 }
          );
        }
      }
    }

    // Validate Tavily key if provided
    if (tavilyKey && tavilyKey.trim()) {
      const trimmedTavily = tavilyKey.trim();
      if (!trimmedTavily.startsWith("tvly-")) {
        return Response.json(
          { error: "Invalid Tavily key format. Tavily keys start with tvly-" },
          { status: 400 }
        );
      }
      const tavilyError = await validateTavilyKey(trimmedTavily, null);
      if (tavilyError) {
        return Response.json({ error: tavilyError }, { status: 400 });
      }
    }

    // Validate the ElevenLabs key if one was offered. Optional, so an empty field is fine — but a
    // key that is present and wrong is rejected now rather than failing silently the first time
    // someone taps Talk. That is not hypothetical: this app ran for two days on a key ID instead of
    // a key, and every synthesis failed invisibly because a missing clip just means no audio.
    if (elevenlabsKey && String(elevenlabsKey).trim()) {
      const elevenError = await validateElevenLabsKey(String(elevenlabsKey).trim());
      if (elevenError) {
        return Response.json({ error: elevenError }, { status: 400 });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const fullAddress = structured
      ? [streetAddress.trim(), city.trim(), state?.trim() || null, country.trim()]
          .filter(Boolean)
          .join(", ")
      : address.trim();
    const rows = await sql`
      INSERT INTO users (
        email, name, password_hash, address, business, job_title, is_admin, is_active,
        live_city, live_state, live_country
      )
      VALUES (
        ${email.toLowerCase().trim()},
        ${name.trim()},
        ${passwordHash},
        ${fullAddress},
        ${business?.trim() || null},
        ${jobTitle?.trim() || null},
        false,
        true,
        ${structured ? city.trim() : null},
        ${structured ? state?.trim() || null : null},
        ${structured ? country.trim() : null}
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

    // Save Tavily key if provided
    if (tavilyKey && tavilyKey.trim()) {
      const trimmedTavily = tavilyKey.trim();
      const encryptedTavily = encrypt(trimmedTavily);
      const tavilyHint = "..." + trimmedTavily.slice(-4);
      await sql`
        INSERT INTO user_api_keys (user_id, provider, encrypted_key, key_hint)
        VALUES (${newUser.id}, 'tavily', ${encryptedTavily}, ${tavilyHint})
      `;
    }

    // Save the ElevenLabs key if they gave one. Same encrypted-at-rest storage as the other two.
    if (elevenlabsKey && String(elevenlabsKey).trim()) {
      const trimmedEleven = String(elevenlabsKey).trim();
      const encryptedEleven = encrypt(trimmedEleven);
      const elevenHint = "..." + trimmedEleven.slice(-4);
      await sql`
        INSERT INTO user_api_keys (user_id, provider, encrypted_key, key_hint)
        VALUES (${newUser.id}, 'elevenlabs', ${encryptedEleven}, ${elevenHint})
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
