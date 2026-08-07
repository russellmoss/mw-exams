/**
 * Route-level integration tests for account deletion, against a real Postgres database.
 *
 * The sibling suite (user-deletion.integration.test.ts) proves the data layer: what cascades,
 * what is anonymized, when the purge fires. This one proves the guards around it, which is where
 * a destructive endpoint actually goes wrong — wrong confirmation accepted, an admin deleting
 * themselves, the last admin being removed, a queued account quietly re-enabled, an unauthenticated
 * caller getting through.
 *
 * It calls the exported route handlers directly with real Request objects rather than going
 * through a dev server: same code path, no port, no browser session to keep alive.
 *
 * Requires TEST_DATABASE_URL pointing at a DISPOSABLE Neon branch — never production.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { neon } from "@neondatabase/serverless";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeIf = TEST_DB ? describe : describe.skip;

// The route modules read these lazily, so they must be set before the dynamic imports below.
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.JWT_SECRET = process.env.JWT_SECRET || "vitest-secret-not-used-anywhere-real";
  process.env.CRON_SECRET = process.env.CRON_SECRET || "vitest-cron-secret";
}

const { signToken } = await import("../src/lib/auth");
const { DELETE: adminDelete, PATCH: adminPatch } = await import(
  "../src/app/api/admin/users/[id]/route"
);
const { POST: adminRestore } = await import("../src/app/api/admin/users/[id]/restore/route");
const { DELETE: selfDelete } = await import("../src/app/api/user/account/route");
const { GET: cronPurge } = await import("../src/app/api/cron/purge-deleted-users/route");
const { SELF_DELETE_CONFIRMATION_PHRASE, DELETION_GRACE_DAYS } = await import(
  "../src/lib/user-deletion"
);

const ADMIN_EMAIL = "vitest-routes-admin@example.invalid";
const TARGET_EMAIL = "vitest-routes-target@example.invalid";

describeIf("account deletion routes (real database)", () => {
  const sql = TEST_DB ? neon(TEST_DB) : (undefined as unknown as ReturnType<typeof neon<false, false>>);

  let adminId: number;
  let targetId: number;

  /** A request carrying a valid session cookie for the given user. */
  function as(user: { id: number; email: string; name: string; isAdmin: boolean }, body?: unknown) {
    return new Request("http://localhost/test", {
      method: "POST",
      headers: {
        cookie: `mw-session=${signToken(user)}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  const adminUser = () => ({ id: adminId, email: ADMIN_EMAIL, name: "Admin", isAdmin: true });
  const targetUser = () => ({ id: targetId, email: TARGET_EMAIL, name: "Target", isAdmin: false });
  const routeParams = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

  async function cleanup() {
    await sql`DELETE FROM users WHERE email IN (${ADMIN_EMAIL}, ${TARGET_EMAIL})`;
  }

  beforeAll(async () => {
    await cleanup();
    const admins = (await sql`
      INSERT INTO users (email, name, is_admin, is_active) VALUES (${ADMIN_EMAIL}, 'Admin', true, true)
      RETURNING id
    `) as { id: number }[];
    adminId = admins[0].id;
  });

  afterAll(cleanup);

  beforeEach(async () => {
    await sql`DELETE FROM users WHERE email = ${TARGET_EMAIL}`;
    const rows = (await sql`
      INSERT INTO users (email, name, is_admin, is_active) VALUES (${TARGET_EMAIL}, 'Target', false, true)
      RETURNING id
    `) as { id: number }[];
    targetId = rows[0].id;
    // Keep the admin usable across tests that flip is_active on other rows.
    await sql`UPDATE users SET is_active = true, deleted_at = NULL WHERE id = ${adminId}`;
  });

  describe("DELETE /api/admin/users/[id]", () => {
    it("rejects a caller who is not an admin", async () => {
      const res = await adminDelete(as(targetUser(), { confirmation: TARGET_EMAIL }), routeParams(targetId));
      expect(res.status).toBe(403);
    });

    it("rejects an unauthenticated caller", async () => {
      const bare = new Request("http://localhost/test", {
        method: "DELETE",
        body: JSON.stringify({ confirmation: TARGET_EMAIL }),
      });
      const res = await adminDelete(bare, routeParams(targetId));
      expect(res.status).toBe(403);
    });

    it("refuses a confirmation that does not match the target's email", async () => {
      const res = await adminDelete(
        as(adminUser(), { confirmation: "someone-else@example.invalid" }),
        routeParams(targetId)
      );
      expect(res.status).toBe(400);
      // The account must be untouched.
      const rows = (await sql`SELECT deleted_at FROM users WHERE id = ${targetId}`) as {
        deleted_at: string | null;
      }[];
      expect(rows[0].deleted_at).toBeNull();
    });

    it("refuses an admin deleting their own account here", async () => {
      const res = await adminDelete(as(adminUser(), { confirmation: ADMIN_EMAIL }), routeParams(adminId));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/Settings/i);
    });

    it("deletes another admin while an admin still remains", async () => {
      await sql`UPDATE users SET is_admin = true WHERE id = ${targetId}`;

      const res = await adminDelete(
        as(adminUser(), { confirmation: TARGET_EMAIL }),
        routeParams(targetId)
      );
      expect(res.status).toBe(200);

      // The last-admin guard must not fire here — the caller is still an active admin. (The case
      // where it DOES fire is self-deletion; see the DELETE /api/user/account block below, since
      // an admin can never be the last one while deleting somebody else.)
      const rows = (await sql`SELECT deleted_at FROM users WHERE id = ${targetId}`) as {
        deleted_at: string | null;
      }[];
      expect(rows[0].deleted_at).not.toBeNull();
    });

    it("schedules the deletion when the email is typed correctly", async () => {
      // Case-insensitive: the admin retyping the address should not be tripped by capitalisation.
      const res = await adminDelete(
        as(adminUser(), { confirmation: TARGET_EMAIL.toUpperCase() }),
        routeParams(targetId)
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.graceDays).toBe(DELETION_GRACE_DAYS);
      expect(new Date(body.purgeDate).getTime()).toBeGreaterThan(Date.now());

      const rows = (await sql`
        SELECT is_active, deleted_at, deleted_by FROM users WHERE id = ${targetId}
      `) as { is_active: boolean; deleted_at: string | null; deleted_by: number | null }[];
      expect(rows[0].is_active).toBe(false);
      expect(rows[0].deleted_at).not.toBeNull();
      expect(rows[0].deleted_by).toBe(adminId);
    });
  });

  describe("PATCH /api/admin/users/[id] while a deletion is pending", () => {
    it("refuses to re-enable a queued account instead of silently un-deleting it", async () => {
      await adminDelete(as(adminUser(), { confirmation: TARGET_EMAIL }), routeParams(targetId));

      const res = await adminPatch(as(adminUser(), { isActive: true }), routeParams(targetId));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/restore/i);

      // Still queued — the toggle must not have partially applied.
      const rows = (await sql`
        SELECT is_active, deleted_at FROM users WHERE id = ${targetId}
      `) as { is_active: boolean; deleted_at: string | null }[];
      expect(rows[0].is_active).toBe(false);
      expect(rows[0].deleted_at).not.toBeNull();
    });
  });

  describe("POST /api/admin/users/[id]/restore", () => {
    it("cancels a pending deletion", async () => {
      await adminDelete(as(adminUser(), { confirmation: TARGET_EMAIL }), routeParams(targetId));

      const res = await adminRestore(as(adminUser()), routeParams(targetId));
      expect(res.status).toBe(200);

      const rows = (await sql`
        SELECT is_active, deleted_at FROM users WHERE id = ${targetId}
      `) as { is_active: boolean; deleted_at: string | null }[];
      expect(rows[0].is_active).toBe(true);
      expect(rows[0].deleted_at).toBeNull();
    });

    it("404s when the account was not being deleted", async () => {
      const res = await adminRestore(as(adminUser()), routeParams(targetId));
      expect(res.status).toBe(404);
    });

    it("rejects a non-admin caller", async () => {
      const res = await adminRestore(as(targetUser()), routeParams(targetId));
      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /api/user/account", () => {
    it("requires the exact confirmation phrase", async () => {
      const res = await selfDelete(as(targetUser(), { confirmation: "delete me" }));
      expect(res.status).toBe(400);

      const rows = (await sql`SELECT deleted_at FROM users WHERE id = ${targetId}`) as {
        deleted_at: string | null;
      }[];
      expect(rows[0].deleted_at).toBeNull();
    });

    it("requires authentication", async () => {
      const bare = new Request("http://localhost/test", {
        method: "DELETE",
        body: JSON.stringify({ confirmation: SELF_DELETE_CONFIRMATION_PHRASE }),
      });
      expect((await selfDelete(bare)).status).toBe(401);
    });

    it("schedules the deletion and clears the session cookie", async () => {
      const res = await selfDelete(
        as(targetUser(), { confirmation: SELF_DELETE_CONFIRMATION_PHRASE })
      );
      expect(res.status).toBe(200);
      // Without this the browser keeps a cookie for an account that can no longer authenticate.
      expect(res.headers.get("set-cookie")).toContain("Max-Age=0");

      const rows = (await sql`
        SELECT is_active, deleted_at, deleted_by FROM users WHERE id = ${targetId}
      `) as { is_active: boolean; deleted_at: string | null; deleted_by: number | null }[];
      expect(rows[0].is_active).toBe(false);
      expect(rows[0].deleted_at).not.toBeNull();
      expect(rows[0].deleted_by).toBeNull(); // self-deletion records no actor
    });

    /**
     * The guard that matters most: an admin deleting themselves when nobody else can administer
     * the app. There is no console to promote a replacement from, so this must be impossible.
     * This is the only path that can reach it — deleting *someone else* always leaves the caller.
     */
    it("refuses to delete the last active admin", async () => {
      const others = (await sql`
        SELECT id FROM users WHERE is_admin = true AND is_active = true AND id != ${targetId}
      `) as { id: number }[];
      const otherIds = others.map((r) => r.id);

      await sql`UPDATE users SET is_admin = true WHERE id = ${targetId}`;
      // Temporarily make the target the only administrator in the database.
      await sql`UPDATE users SET is_admin = false WHERE id = ANY(${otherIds})`;
      try {
        const soleAdmin = { ...targetUser(), isAdmin: true };
        const res = await selfDelete(
          as(soleAdmin, { confirmation: SELF_DELETE_CONFIRMATION_PHRASE })
        );
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/only active admin/i);

        const rows = (await sql`SELECT deleted_at FROM users WHERE id = ${targetId}`) as {
          deleted_at: string | null;
        }[];
        expect(rows[0].deleted_at).toBeNull();
      } finally {
        // Always put the branch's other admins back, even if the assertions above threw.
        await sql`UPDATE users SET is_admin = true WHERE id = ANY(${otherIds})`;
      }
    });

    it("locks the account out of getUser straight away", async () => {
      const { getUser } = await import("../src/lib/auth");
      await selfDelete(as(targetUser(), { confirmation: SELF_DELETE_CONFIRMATION_PHRASE }));
      expect(await getUser(as(targetUser()))).toBeNull();
    });
  });

  describe("GET /api/cron/purge-deleted-users", () => {
    function cronRequest(secret: string | null) {
      return new Request("http://localhost/api/cron/purge-deleted-users", {
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
      });
    }

    it("401s without the cron secret or an admin session", async () => {
      expect((await cronPurge(cronRequest("wrong-secret"))).status).toBe(401);
    });

    it("purges only accounts past the grace period", async () => {
      await selfDelete(as(targetUser(), { confirmation: SELF_DELETE_CONFIRMATION_PHRASE }));

      // Inside the window: untouched.
      let res = await cronPurge(cronRequest(process.env.CRON_SECRET!));
      expect(res.status).toBe(200);
      expect((await res.json()).purgedIds).not.toContain(targetId);
      expect(await sql`SELECT 1 FROM users WHERE id = ${targetId}`).toHaveLength(1);

      // Past the window: gone.
      await sql`
        UPDATE users SET deleted_at = now() - make_interval(days => ${DELETION_GRACE_DAYS + 1})
         WHERE id = ${targetId}
      `;
      res = await cronPurge(cronRequest(process.env.CRON_SECRET!));
      expect(res.status).toBe(200);
      expect((await res.json()).purgedIds).toContain(targetId);
      expect(await sql`SELECT 1 FROM users WHERE id = ${targetId}`).toHaveLength(0);
    });
  });
});
