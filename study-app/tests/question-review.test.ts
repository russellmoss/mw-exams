import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";

import {
  REVIEW_REASON_OPTIONS,
  REVIEW_REASON_LABELS,
  MAX_REVIEW_NOTE_CHARS,
  REVIEW_PAPERS,
  REVIEW_FAMILIES,
  FAMILY_LABELS,
  DEFAULT_REVIEW_FILTER,
  sanitizeReviewTags,
  sanitizeReviewNote,
  sanitizeReviewFilter,
  isDefaultFilter,
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

// ── Blocks and filtering ──────────────────────────────────────────────────────────────────────────

describe("the block walk", () => {
  it("covers all three papers and all SEVEN families", () => {
    // F6 is not the last one. A walk that stopped at F6 would silently never show the 43 Quality
    // hierarchy questions, and nothing on screen would say so.
    expect([...REVIEW_PAPERS]).toEqual([1, 2, 3]);
    expect([...REVIEW_FAMILIES]).toEqual(["F1", "F2", "F3", "F4", "F5", "F6", "F7"]);
    for (const f of REVIEW_FAMILIES) expect(FAMILY_LABELS[f]).toBeTruthy();
  });

  it("defaults to the whole bank, grouped", () => {
    expect(DEFAULT_REVIEW_FILTER.order).toBe("grouped");
    expect(isDefaultFilter(DEFAULT_REVIEW_FILTER)).toBe(true);
  });
});

describe("sanitizeReviewFilter", () => {
  it("reads an empty selection as EVERYTHING, never as nothing", () => {
    // The load-bearing case. An empty queue and a finished queue look identical on screen, and one
    // of them is alarming — so unticking the last paper must widen back to the whole bank.
    expect(sanitizeReviewFilter({ papers: [], families: [] })).toEqual(DEFAULT_REVIEW_FILTER);
    expect(sanitizeReviewFilter({})).toEqual(DEFAULT_REVIEW_FILTER);
    expect(sanitizeReviewFilter(null)).toEqual(DEFAULT_REVIEW_FILTER);
    expect(sanitizeReviewFilter({ papers: [9], families: ["F99"] })).toEqual(DEFAULT_REVIEW_FILTER);
  });

  it("keeps a real selection and normalises its order", () => {
    const f = sanitizeReviewFilter({ papers: [3, 1, 1], families: ["F4", "F2"], order: "random" });
    expect(f.papers).toEqual([1, 3]);
    // Families come back in canonical walk order regardless of how they were sent, so the sequence
    // is F2 then F4 — not the order the checkboxes happened to be clicked in.
    expect(f.families).toEqual(["F2", "F4"]);
    expect(f.order).toBe("random");
    expect(isDefaultFilter(f)).toBe(false);
  });

  it("only accepts 'random' as an alternative order", () => {
    for (const bad of ["shuffle", "REVERSE", "", null, 7]) {
      expect(sanitizeReviewFilter({ order: bad }).order).toBe("grouped");
    }
  });
});

describe("queue SQL", () => {
  const lib = readFileSync(join(ROOT, "src", "lib", "question-review.ts"), "utf-8");

  it("orders the grouped walk by paper, then family, then most-served", () => {
    expect(lib).toMatch(/ORDER BY generated_questions\.paper,\s*[\s\S]*?generated_questions\.family,/);
    expect(lib).toMatch(/served_count DESC NULLS LAST/);
  });

  it("does not sort a block by creation time, which served generation batches back to back", () => {
    // Mike Juergens binned gen_p1_F2_1786074180419 as "the same as the question I just saw and
    // rejected". It was a different question; it was the next card off the same generation batch,
    // because created_at DESC sorted each block into batches. The tiebreaker is a hash now.
    const groupedOrder = lib.slice(lib.indexOf("return `ORDER BY generated_questions.paper"));
    expect(groupedOrder.slice(0, 400)).not.toMatch(/created_at DESC/);
  });

  it("breaks ties on question_id so the order is total", () => {
    // Without a total order, two rows with equal served_count and created_at can swap between
    // fetches — the reviewer sees one card twice and never sees the other.
    expect(lib).toMatch(/generated_questions\.question_id\s*`/);
  });

  it("keys the shuffle on the reviewer so it is stable and uncorrelated", () => {
    // Stable: re-fetching mid-session must not reshuffle the remaining pile (same double-show bug).
    // Per-reviewer: the two of them should not walk an identical random order.
    expect(lib).toContain("md5(generated_questions.question_id ||");
    expect(lib).not.toMatch(/ORDER BY random\(\)/);
  });

  it("runs the SAME serve gate the candidate path runs", () => {
    // servableWhere() selects on database columns; the study path additionally runs
    // bankedServeRejection in-process on every question it serves. The two disagreed by exactly the
    // questions the gate refuses, so a reviewer could be handed — and spend a vote on — a flight no
    // candidate could ever see. Imported, never reimplemented, or the two sets drift again.
    // Deferred rather than static: question-engine drags the whole generation stack in, and a static
    // import made every consumer of this module pay for it (it timed out the composeReviewFeedback
    // test on the import alone). The gate must still be the engine's own function, not a copy.
    expect(lib).toMatch(/await import\("@\/lib\/question-engine"\)/);
    expect(lib).toMatch(/bankedServeRejection\(q\)/);
    expect(lib).not.toMatch(/^import \{[^}]*bankedServeRejection/m);
  });

  it("over-fetches so gating cannot silently short the page", () => {
    expect(lib).toMatch(/want \* 2/);
  });

  it("quarantines what the gate refuses instead of only skipping it", () => {
    // This is what keeps the countdown honest. The "N to go" counter and the block standings are SQL
    // COUNTs over servableWhere(); filtering the page in memory while leaving the rows servable would
    // count questions the queue will never hand over, and the remaining count would never reach zero.
    const gate = lib.slice(lib.indexOf("async function applyServeGate"));
    expect(gate).toMatch(/UPDATE generated_questions SET invalid_reasons/);
    expect(gate).toMatch(/serve-gate/);
  });

  it("merges the quarantine reason rather than replacing what another rule recorded", () => {
    const gate = lib.slice(lib.indexOf("async function applyServeGate"));
    expect(gate).toMatch(/jsonb_agg\(DISTINCT v\)/);
  });

  it("does not let a throwing rule take the review surface down", () => {
    const gate = lib.slice(lib.indexOf("async function applyServeGate"));
    expect(gate).toMatch(/catch \(err\)/);
  });

  it("reconciles the reviewer's local buffer on every vote", () => {
    // The client holds a page of 12 and tops up at 4, merging by id and only ever ADDING. So a
    // question quarantined mid-session — by a rule that just merged, by the sweep, by the serve gate
    // — stayed in their hand and got dealt anyway. During a live session the corpus is being fixed
    // BECAUSE of these votes, so that is the normal case, not an edge one.
    expect(lib).toMatch(/export async function staleBufferedIds/);
    const fn = lib.slice(lib.indexOf("export async function staleBufferedIds"));
    // It must return what to DROP, judged against the same servable predicate the queue uses.
    expect(fn.slice(0, 1200)).toContain("SERVABLE_WHERE");
    expect(fn.slice(0, 1200)).toMatch(/filter\(\(id\) => !stillGood\.has\(id\)\)/);
  });

  it("caps how many buffered ids one vote can ask about", () => {
    // The client decides this list; an unbounded ANY($2) is a free scan for anyone who can vote.
    const fn = lib.slice(lib.indexOf("export async function staleBufferedIds"));
    expect(fn.slice(0, 800)).toMatch(/slice\(0,\s*100\)/);
  });

  it("binds the filter values rather than interpolating them", () => {
    expect(lib).toMatch(/paper = ANY\(\$\{papersParam\}\)/);
    expect(lib).toMatch(/family = ANY\(\$\{familiesParam\}\)/);
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

describe("migration 067", () => {
  const sql = () =>
    readFileSync(join(ROOT, "migrations", "067_question_review_blocks.sql"), "utf-8");

  it("adds the persisted selection column", () => {
    expect(sql()).toMatch(/ADD COLUMN IF NOT EXISTS review_filter JSONB/);
  });

  it("indexes the block walk on the same predicate the queue filters by", () => {
    // A partial index whose WHERE drifts from servableWhere() silently stops being used, and the
    // queue degrades to a full scan of 942 rows on every card.
    //
    // The index's SORT tail no longer matches the query's: the grouped order now breaks ties on
    // md5(question_id || reviewer), which is per-reviewer and cannot be indexed. That is deliberate and
    // cheap — the index still supplies the WHERE and the leading (paper, family, served_count) keys,
    // and what remains to sort in memory is one paper × family block, not the bank.
    const text = sql();
    expect(text).toMatch(/CREATE INDEX IF NOT EXISTS idx_generated_questions_review_blocks/);
    expect(text).toMatch(/\(paper, family, served_count DESC, created_at DESC, question_id\)/);
    for (const clause of [
      "invalid_reasons IS NULL",
      "review_state = 'kept'",
      "is_retired IS NOT TRUE",
      "scope = 'pool'",
    ]) {
      expect(text).toContain(clause);
    }
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

describe("vote → buffer reconciliation, end to end", () => {
  const route = readFileSync(
    join(ROOT, "src", "app", "api", "question-review", "vote", "route.ts"),
    "utf-8"
  );
  const page = readFileSync(join(ROOT, "src", "app", "review", "page.tsx"), "utf-8");

  it("the route accepts the buffer and answers with what to drop", () => {
    expect(route).toMatch(/buffered: rawBuffered/);
    expect(route).toMatch(/staleBufferedIds\(gate\.id, buffered\)/);
    expect(route).toMatch(/drop,/);
  });

  it("the route does not trust the buffer's shape", () => {
    // It comes from the client. Non-strings must not reach the query.
    expect(route).toMatch(/filter\(\(x\): x is string => typeof x === "string"\)/);
  });

  it("the client sends its buffer and removes what came back", () => {
    expect(page).toMatch(/buffered: queue\.map\(\(c\) => c\.id\)/);
    expect(page).toMatch(/const drop = new Set<string>\(\[questionId, \.\.\.\(\(data\.drop as string\[\]\) \?\? \[\]\)\]\)/);
    expect(page).toMatch(/prev\.filter\(\(c\) => !drop\.has\(c\.id\)\)/);
  });

  it("tells the reviewer why cards vanished", () => {
    // Cards silently disappearing from the buffer reads as a bug. It is the opposite.
    expect(page).toMatch(/retired by a fix since you started/);
  });
});
