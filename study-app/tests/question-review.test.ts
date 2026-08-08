import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";

import {
  REVIEW_REASON_OPTIONS,
  REVIEW_REASON_LABELS,
  MAX_REVIEW_NOTE_CHARS,
  sanitizeReviewTags,
  sanitizeReviewNote,
  isReviewVerdict,
} from "@/lib/question-review-shared";
import { BIN_REASON_OPTIONS } from "@/lib/bin-reasons";

// Top level, not inside the describe: vi.hoisted/vi.mock are hoisted regardless, and nesting them
// misrepresents the execution order (and is a hard error in a future vitest).
const getUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getUser }));

const ROOT = resolve(__dirname, "..");
const ROUTES_DIR = join(ROOT, "src", "app", "api", "question-review");
const MIGRATION = join(ROOT, "migrations", "066_question_review.sql");

// ── The reason vocabulary ─────────────────────────────────────────────────────────────────────────

describe("review reason chips", () => {
  it("keeps the codes it shares with the bin vocabulary IDENTICAL", () => {
    // The whole point of reusing these short-codes is that the root-cause miner clusters an expert's
    // down-vote together with a candidate's bin for the same fault. Renaming one on either side
    // silently splits that cluster in two and nothing else would notice.
    const binCodes = new Set(BIN_REASON_OPTIONS.map((o) => o.value));
    const shared = REVIEW_REASON_OPTIONS.filter((o) => binCodes.has(o.value)).map((o) => o.value);
    expect(shared.sort()).toEqual(
      ["factually_wrong", "not_realistic", "too_easy", "too_obscure", "weak_stem", "wrong_marks"].sort()
    );
  });

  it("adds the mismatch-class faults the bin vocabulary has no code for", () => {
    const codes = REVIEW_REASON_OPTIONS.map((o) => o.value);
    expect(codes).toContain("answer_key_wrong");
    expect(codes).toContain("bad_wine_choice");
  });

  it("has a unique value, a label and a hint for every chip", () => {
    const values = REVIEW_REASON_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    for (const o of REVIEW_REASON_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.hint.length).toBeGreaterThan(0);
      expect(REVIEW_REASON_LABELS[o.value]).toBe(o.label);
    }
  });
});

describe("sanitizeReviewTags", () => {
  it("drops unknown tags and de-duplicates", () => {
    expect(sanitizeReviewTags(["weak_stem", "not_a_real_tag", "weak_stem"])).toEqual(["weak_stem"]);
  });

  it("returns null for nothing usable", () => {
    expect(sanitizeReviewTags(["nope"])).toBeNull();
    expect(sanitizeReviewTags([])).toBeNull();
    expect(sanitizeReviewTags("weak_stem")).toBeNull();
    expect(sanitizeReviewTags(undefined)).toBeNull();
  });
});

describe("sanitizeReviewNote", () => {
  it("trims and caps at the documented length", () => {
    expect(sanitizeReviewNote("  the stem is vague  ")).toBe("the stem is vague");
    expect(sanitizeReviewNote("x".repeat(MAX_REVIEW_NOTE_CHARS + 500))).toHaveLength(
      MAX_REVIEW_NOTE_CHARS
    );
  });

  it("treats whitespace-only and non-strings as absent", () => {
    // Load-bearing: the vote route refuses a down-vote whose note sanitizes to null, so "   " must
    // not slip through as a written reason.
    expect(sanitizeReviewNote("   \n  ")).toBeNull();
    expect(sanitizeReviewNote(42)).toBeNull();
    expect(sanitizeReviewNote(null)).toBeNull();
  });
});

describe("isReviewVerdict", () => {
  it("accepts exactly the three verdicts", () => {
    expect(["up", "down", "skip"].every(isReviewVerdict)).toBe(true);
    for (const bad of ["UP", "approve", "", null, 1, undefined]) {
      expect(isReviewVerdict(bad)).toBe(false);
    }
  });
});

// ── The gate ──────────────────────────────────────────────────────────────────────────────────────

describe("requireReviewer", () => {
  beforeEach(() => getUser.mockReset());
  afterEach(() => vi.restoreAllMocks());

  const req = () => new Request("https://example.test/api/question-review/queue");

  it("401s an anonymous caller", async () => {
    const { requireReviewer } = await import("@/app/api/question-review/gate");
    getUser.mockResolvedValue(null);
    const res = await requireReviewer(req());
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
  });

  it("403s an ADMIN who is not a reviewer", async () => {
    // The regression that matters most: 12 of the 14 live accounts are admins, so any accidental
    // `|| user.isAdmin` in the gate would hand the whole bank's model answers to nearly everyone.
    const { requireReviewer } = await import("@/app/api/question-review/gate");
    getUser.mockResolvedValue({ id: 7, isAdmin: true, canReviewQuestions: false });
    const res = await requireReviewer(req());
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
  });

  it("passes a reviewer through, even a non-admin one", async () => {
    const { requireReviewer } = await import("@/app/api/question-review/gate");
    const user = { id: 9, isAdmin: false, canReviewQuestions: true };
    getUser.mockResolvedValue(user);
    await expect(requireReviewer(req())).resolves.toBe(user);
  });
});

describe("every question-review route is gated", () => {
  it("calls requireReviewer in each route handler", () => {
    // A new endpoint under this namespace serves the same private material (model answers, the
    // generator's reasoning trace). Forgetting the gate on one is the whole risk, so it is asserted
    // structurally rather than left to review.
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === "route.ts") routes.push(p);
      }
    };
    walk(ROUTES_DIR);

    expect(routes.length).toBeGreaterThanOrEqual(3);
    for (const r of routes) {
      expect(readFileSync(r, "utf-8"), `${r} must call requireReviewer`).toContain(
        "requireReviewer(request)"
      );
    }
  });
});

// ── The migration ─────────────────────────────────────────────────────────────────────────────────

describe("migration 066", () => {
  const sql = () => readFileSync(MIGRATION, "utf-8");

  it("exists", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    // This used to also assert that 066 was the highest number and used once. Collision-freedom is
    // now enforced corpus-wide by tests/migration-numbering.test.ts, so every future migration gets
    // the guarantee instead of just this one — and this test no longer has to be edited each time a
    // migration lands.
  });

  it("widens the user_attempts source CHECK to allow question_review", () => {
    // Without this the very first down-vote throws on INSERT: migration 053 constrained source to
    // ('feedback_tab', 'history').
    const text = sql();
    expect(text).toContain("user_attempts_feedback_source_check");
    expect(text).toMatch(/'feedback_tab',\s*'history',\s*'question_review'/);
  });

  it("adds the reviewer flag defaulting to false", () => {
    expect(sql()).toMatch(/ADD COLUMN IF NOT EXISTS can_review_questions BOOLEAN NOT NULL DEFAULT false/);
  });

  it("makes one vote per reviewer per question unique", () => {
    // The per-reviewer countdown is a plain COUNT over this table; duplicate rows would inflate it
    // and a re-vote would append instead of replacing.
    expect(sql()).toMatch(/CREATE UNIQUE INDEX[\s\S]*question_reviews \(question_id, reviewer_id\)/);
  });

  it("constrains verdict to the three the code emits", () => {
    expect(sql()).toMatch(/CHECK \(verdict IN \('up', 'down', 'skip'\)\)/);
  });
});

// ── Feedback framing ──────────────────────────────────────────────────────────────────────────────

describe("composeReviewFeedback", () => {
  it("frames the text as an expert review, not a candidate complaint", async () => {
    const { composeReviewFeedback } = await import("@/lib/question-review");
    const text = composeReviewFeedback({
      reviewerName: "Mike Juergens",
      tags: ["bad_wine_choice", "factually_wrong"],
      note: "Cannonau and Garnacha are the same grape.",
    });
    // The analyzer's prompt is written for a candidate's complaint about a question they just sat.
    // Without this framing it reads "the wines don't fit" as a candidate who found the flight hard.
    expect(text).toContain("[Question Review]");
    expect(text).toContain("Mike Juergens");
    expect(text).toContain("not as a candidate attempt");
    expect(text).toContain("Wines don't fit");
    expect(text).toContain("Factually wrong");
    expect(text).toContain("Cannonau and Garnacha are the same grape.");
  });

  it("works with no tags at all", async () => {
    const { composeReviewFeedback } = await import("@/lib/question-review");
    const text = composeReviewFeedback({ reviewerName: "Russell Moss", tags: null, note: "Too easy." });
    expect(text).toContain("Russell Moss");
    expect(text).toContain("Too easy.");
    expect(text).not.toContain("Fault(s) identified");
  });
});
