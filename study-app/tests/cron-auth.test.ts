import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// getUser reaches for the DB; the bearer path must never need it, and the fallback path is
// exercised here with a stub rather than a live session.
const getUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getUser }));

const { isCronAuthorized } = await import("@/lib/cron-auth");

const req = (auth?: string) =>
  new Request("https://example.test/api/cron/bank-worker", {
    headers: auth ? { authorization: auth } : {},
  });

describe("isCronAuthorized", () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue(null);
    process.env.CRON_SECRET = "s3cret-value";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CRON_SECRET;
  });

  it("accepts the matching bearer without touching the session", async () => {
    await expect(isCronAuthorized(req("Bearer s3cret-value"))).resolves.toBe(true);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer, a bare secret, and a missing header", async () => {
    for (const header of ["Bearer wrong", "s3cret-value", undefined]) {
      await expect(isCronAuthorized(req(header))).resolves.toBe(false);
    }
  });

  it("falls back to an admin session", async () => {
    getUser.mockResolvedValue({ isAdmin: true });
    await expect(isCronAuthorized(req())).resolves.toBe(true);

    getUser.mockResolvedValue({ isAdmin: false });
    await expect(isCronAuthorized(req())).resolves.toBe(false);
  });

  describe("when CRON_SECRET is unset", () => {
    beforeEach(() => {
      delete process.env.CRON_SECRET;
    });

    it("rejects every bearer rather than matching an empty secret", async () => {
      // The bug this guards: `Bearer undefined` / `Bearer ` must not slip through.
      for (const header of ["Bearer ", "Bearer undefined", "Bearer s3cret-value"]) {
        await expect(isCronAuthorized(req(header))).resolves.toBe(false);
      }
    });

    it("logs the misconfiguration instead of failing silently", async () => {
      await isCronAuthorized(req("Bearer anything"));
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("CRON_SECRET is not set"));
    });
  });
});
