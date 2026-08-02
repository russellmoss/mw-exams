import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import { verifyResetToken, consumeResetToken } from "@/lib/reset-tokens";
import { signToken, createSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 6; // matches register + change-password

/** GET — does this token still work? Lets the page show a clear error instead of a dead form. */
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return Response.json({ valid: false, reason: "not_found" }, { status: 400 });

    const result = await verifyResetToken(token);
    if (!result.ok) {
      return Response.json({ valid: false, reason: result.reason }, { status: 400 });
    }
    // Echo the email so the form can show whose password is being reset — reassuring, and it
    // catches the case where someone opens a link meant for a different account.
    return Response.json({ valid: true, email: result.email });
  } catch (err) {
    console.error("reset-password GET error:", err);
    return Response.json({ valid: false, reason: "not_found" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json();

    if (!token || typeof token !== "string") {
      return Response.json({ error: "Reset token is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return Response.json({ error: "New password is required" }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return Response.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await consumeResetToken(token, passwordHash);

    if (!result.ok) {
      const message =
        result.reason === "expired"
          ? "This reset link has expired. Please request a new one."
          : result.reason === "used"
            ? "This reset link has already been used. Please request a new one."
            : "This reset link is not valid. Please request a new one.";
      return Response.json({ error: message, reason: result.reason }, { status: 400 });
    }

    // Sign the user straight in. They have just proven control of the inbox and chosen a
    // password; making them retype it immediately adds friction without adding security.
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT id, email, name, is_admin FROM users WHERE id = ${result.userId}
    `;
    const user = rows[0];
    const authUser = {
      id: user.id as number,
      email: user.email as string,
      name: user.name as string,
      isAdmin: user.is_admin as boolean,
    };

    return new Response(JSON.stringify({ success: true, user: authUser }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": createSessionCookie(signToken(authUser)),
      },
    });
  } catch (err) {
    console.error("reset-password POST error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
