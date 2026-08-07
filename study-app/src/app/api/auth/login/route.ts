import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { signToken, createSessionCookie } from "@/lib/auth";
import { formatPurgeDate, purgeDateFor } from "@/lib/user-deletion";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return Response.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT id, email, name, password_hash, is_admin, is_active, deleted_at FROM users WHERE email = ${email.toLowerCase().trim()}
    `;

    if (rows.length === 0) {
      return Response.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const user = rows[0];

    // A Google-only account has no password_hash. bcrypt.compare throws on null, which would
    // surface as a 500 instead of a login failure, so answer with the same generic message used
    // for a wrong password — it also avoids revealing which accounts are Google-backed.
    if (!user.password_hash) {
      return Response.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return Response.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Checked before the generic disabled message: a pending-deletion account is also inactive,
    // and "Account is disabled" would leave someone waiting for an admin to re-enable an account
    // that is actually counting down to being erased.
    if (user.deleted_at) {
      const purgeDate = formatPurgeDate(purgeDateFor(user.deleted_at as string));
      return Response.json(
        {
          error:
            `This account is scheduled for deletion and will be permanently erased on ${purgeDate}. ` +
            `Contact an administrator before then if you want it restored.`,
        },
        { status: 403 }
      );
    }

    if (user.is_active === false) {
      return Response.json({ error: "Account is disabled" }, { status: 403 });
    }

    const authUser = { id: user.id as number, email: user.email as string, name: user.name as string, isAdmin: user.is_admin as boolean };
    const token = signToken(authUser);

    return new Response(
      JSON.stringify({ user: authUser }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": createSessionCookie(token),
        },
      }
    );
  } catch (err) {
    console.error("Login error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
