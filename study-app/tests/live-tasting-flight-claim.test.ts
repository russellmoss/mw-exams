// live-tasting-flight-claim.test.ts — one flight per paper position, under concurrency.
//
// generateNextFlight picks the first composition position with no child session, spends 40-90s of Opus
// on it, and only then links it. Nothing coordinated concurrent callers, and the client re-POSTs
// whenever its SSE loop doesn't see a terminal frame — so a missed frame, a reload mid-generation, or a
// second tab fires another call that computes the SAME position. Paper ltpr_egt9dfy3e (2026-08-07)
// ended with three sessions on position 4: three generations billed to the candidate's own key, and a
// paper that would render one slot three times.
//
// Two layers are under test here: the TTL'd claim (stops the duplicate work) and the caller's handling
// of a lost link race (stops the orphan row, which migration 058's partial unique index makes
// impossible to create). `busy` must never surface as an error — the flight IS being built.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => ({
  claimFlightPosition: vi.fn(),
  releaseFlightPosition: vi.fn(),
  retireUnlinkedSession: vi.fn(),
  linkSessionToPaper: vi.fn(),
  getPaperSessions: vi.fn(),
  getQuestionById: vi.fn(),
  createLiveTastingPaper: vi.fn(),
}));
vi.mock("@/lib/db", () => db);

const engine = vi.hoisted(() => ({ createLiveTasting: vi.fn() }));
vi.mock("@/lib/live-tasting-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/live-tasting-engine")>();
  return { ...actual, createLiveTasting: engine.createLiveTasting };
});

const { generateNextFlight } = await import("@/lib/live-tasting-paper-engine");

// A two-flight pick-for-me paper with flight 1 already built, so `next` is position 2.
const PAPER = {
  id: "ltpr_test",
  user_id: 1,
  paper: 2,
  size: "half",
  mode: "pick-for-me",
  city: "New Hope",
  country: "United States",
  budget_currency: "USD",
  composition: [
    { position: 1, family: "F2", flightSize: 3, perBottleBudget: 30 },
    { position: 2, family: "F4", flightSize: 3, perBottleBudget: 30 },
  ],
} as unknown as Parameters<typeof generateNextFlight>[0]["paper"];

const EXISTING = [{ id: "lts_one", paper_position: 1, question_id: "gen_p2_F2_1", archetype: "same-origin" }];

const run = () => generateNextFlight({ paper: PAPER, apiKey: "sk-test" });

describe("flight generation claims its position", () => {
  beforeEach(() => {
    for (const fn of Object.values(db)) fn.mockReset();
    engine.createLiveTasting.mockReset();
    db.getPaperSessions.mockResolvedValue(EXISTING);
    db.getQuestionById.mockResolvedValue({ question_text: "Wines 1-3 …" });
    db.claimFlightPosition.mockResolvedValue(true);
    db.linkSessionToPaper.mockResolvedValue(true);
    engine.createLiveTasting.mockResolvedValue({ session: { id: "lts_new" } });
  });

  it("reports busy WITHOUT generating when another caller holds the claim", async () => {
    db.claimFlightPosition.mockResolvedValue(false);

    const out = await run();

    expect(out).toEqual({ done: false, position: 2, busy: true });
    // The whole point: no second Opus generation for a slot someone else is already building.
    expect(engine.createLiveTasting).not.toHaveBeenCalled();
    expect(db.linkSessionToPaper).not.toHaveBeenCalled();
    // A busy reply is not a failure, so it must not free the holder's claim.
    expect(db.releaseFlightPosition).not.toHaveBeenCalled();
  });

  it("claims before generating, and leaves the claim in place on success", async () => {
    const out = await run();

    expect(db.claimFlightPosition).toHaveBeenCalledWith("ltpr_test", 2);
    const claimOrder = db.claimFlightPosition.mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(engine.createLiveTasting.mock.invocationCallOrder[0]);
    expect(out).toMatchObject({ position: 2, sessionId: "lts_new" });
    expect("busy" in (out as object)).toBe(false);
    // Success needs no release — the linked child session is what makes the position skipped.
    expect(db.releaseFlightPosition).not.toHaveBeenCalled();
  });

  it("releases the claim when generation fails, so the retry is immediate", async () => {
    engine.createLiveTasting.mockResolvedValue({ error: "Generation failed." });

    const out = await run();

    expect(out).toEqual({ error: "Generation failed." });
    expect(db.releaseFlightPosition).toHaveBeenCalledWith("ltpr_test", 2);
  });

  it("retires its own session when it loses the link race, rather than orphaning it", async () => {
    // A stale-claim takeover (or any caller that skips the claim) linked position 2 first; the unique
    // index rejects this link, and this flight must not be left pointing at a slot it doesn't own.
    db.linkSessionToPaper.mockResolvedValue(false);

    const out = await run();

    expect(db.retireUnlinkedSession).toHaveBeenCalledWith("lts_new");
    expect(out).toEqual({ done: false, position: 2, busy: true });
  });

  it("does not claim anything once every position is built", async () => {
    db.getPaperSessions.mockResolvedValue([...EXISTING, { id: "lts_two", paper_position: 2, question_id: "q2" }]);

    expect(await run()).toEqual({ done: true });
    expect(db.claimFlightPosition).not.toHaveBeenCalled();
  });
});

// The claim is an optimisation; the index is the guarantee. Assert the migration carries both, and that
// it dedupes BEFORE creating the index — the other order cannot build on a database with duplicates.
describe("migration 058", () => {
  const sql = readFileSync(join(import.meta.dirname, "..", "migrations", "058_live_tasting_flight_claims.sql"), "utf8");

  it("adds flight_claims and the partial unique index, idempotently", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS flight_claims JSONB/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS live_tasting_sessions_paper_position_uniq/i);
    expect(sql).toMatch(/ON live_tasting_sessions \(paper_id, paper_position\)/i);
    // Partial: unlinked sessions (paper_id NULL) are legion and must not collide with each other.
    expect(sql).toMatch(/WHERE paper_id IS NOT NULL AND paper_position IS NOT NULL/i);
  });

  it("retires pre-existing duplicates before creating the index", () => {
    const dedupeAt = sql.search(/UPDATE live_tasting_sessions s/i);
    const indexAt = sql.search(/CREATE UNIQUE INDEX/i);
    expect(dedupeAt).toBeGreaterThan(-1);
    expect(indexAt).toBeGreaterThan(dedupeAt);
    // Unlink + soft-abandon, never DELETE: the session and its question stay auditable.
    expect(sql).not.toMatch(/DELETE FROM live_tasting_sessions/i);
    expect(sql).toMatch(/abandoned_at = COALESCE\(s\.abandoned_at, now\(\)\)/i);
  });
});
