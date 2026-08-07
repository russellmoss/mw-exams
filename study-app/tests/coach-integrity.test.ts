import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_TOOLS, toolsFor, toolDefinitions, dispatchTool } from "@/lib/coach/registry";
import type { CoachState } from "@/lib/coach/state";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const OPEN: CoachState = { state: "in_progress", openAttemptId: 42, restricted: true };
const SUBMITTED: CoachState = { state: "submitted", openAttemptId: 42, restricted: true };
const CLEAR: CoachState = { state: "none", openAttemptId: null, restricted: false };

// ── The allow-list, asserted exactly ─────────────────────────────────────────────────────────────
//
// EQUALITY, not toContain. The failure this defends against is a tool being ADDED later that reads
// a live question's answer key and forgets `restrictedWhenAttemptOpen` — a containment assertion
// would pass happily while the new tool leaked. An exact list forces every new tool to make a
// deliberate decision about which side of the gate it sits on.
//
// Note what is deliberately NOT restricted (changed 2026-08-07): the reference tools. Trees,
// diagrams, precedent and tiered rulings stay available during an attempt, because routing a live
// stem through the tree is the exercise, and all of that material is already one click away in the
// Library. The line is behavioural — coach the routing, never state the conclusion — and it lives
// in the process-mode prompt, asserted in coach-prompt-cache.test.ts.

describe("coach tool gate", () => {
  it("keeps every reference tool available while an attempt is open", () => {
    // Withholding these protected nothing and blocked the most valuable drill there is.
    // Reads only — the write set is asserted separately below, so neither assertion has to be
    // updated when the other changes.
    expect(
      toolsFor(OPEN)
        .filter((t) => t.kind === "read")
        .map((t) => t.name)
        .sort()
    ).toEqual([
      // Gated per-attempt, not globally: a finished attempt is already revealed to the candidate.
      "get_attempt_debrief",
      "get_decision_tree",
      // Present while restricted on purpose: it redacts via a column allow-list rather than being
      // withheld, so the Coach can still discuss the stem it can see. See screen-tools.ts.
      "get_screen_context",
      "query_corpus",
      "query_empirical_knowledge",
      "query_examiner_thinking",
      "query_my_performance",
      "search_wine_web",
      "search_winemaking_science",
    ]);
  });

  it("treats a submitted-but-ungraded attempt exactly like an open one", () => {
    expect(toolsFor(SUBMITTED).map((t) => t.name).sort()).toEqual(
      toolsFor(OPEN).map((t) => t.name).sort()
    );
  });

  it("allows reporting mid-attempt, because the Coach is now the only way to report", () => {
    // The standalone Feedback tab worked mid-attempt; removing it and then refusing to file until
    // the candidate finished would have been a straight regression. Opening the dock pauses the
    // study clock, so the interruption costs them nothing.
    expect(
      toolsFor(OPEN)
        .filter((t) => t.kind === "write")
        .map((t) => t.name)
        .sort()
    ).toEqual(["file_bug", "flag_defect", "report_question", "submit_feedback"]);
  });

  it("has exactly one place to file feedback, and it is the conversation", () => {
    // The dock briefly carried a second, non-conversational report form alongside the chat. It was
    // removed: two entry points for one action is the confusion the Feedback tab's removal was
    // supposed to end, and the form could not check a claim before queueing it.
    //
    // Asserted over every file in the directory rather than a fixed list, so a NEW component cannot
    // reintroduce a form-shaped path — while a component that legitimately joins the folder (the
    // walkthrough's conversation simulator, say) does not fail the test for existing.
    const coachDir = path.join(appDir, "src/app/components/coach");
    // Recursive: the folder has subdirectories now (voice/), and a form-shaped path added in one of
    // them would be exactly as wrong as one added at the top level.
    const files = fs
      .readdirSync(coachDir, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(2);
    for (const f of files) {
      const src = fs.readFileSync(path.join(coachDir, f), "utf8");
      // Nothing may post to the form endpoint; every write goes through a confirmed proposal.
      expect(src, f).not.toMatch(/"\/api\/feedback"/);
      expect(src, f).not.toMatch(/CoachReport/);
    }
  });

  it("has no floating feedback launcher anywhere in the app", () => {
    // The standalone Feedback tab went first; the floating "Feedback" pill outlived it by a release on
    // /study, /stem-sniper and both Live Tasting screens, which is how the app came to contradict its
    // own Coach prompt ("There is no feedback form anywhere in the app; the chat is it"). Both are now
    // gone, and this asserts it over the whole tree rather than a fixed list of the four old mounts —
    // a fifth mount added to a new screen is the regression that matters.
    const files = fs
      .readdirSync(path.join(appDir, "src"), { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    for (const f of files) {
      expect(f, "the pill component must not come back").not.toMatch(/FeedbackButton\.tsx$/);
      const src = fs.readFileSync(path.join(appDir, "src", f), "utf8");
      expect(src, f).not.toMatch(/FeedbackButton/);
    }
  });

  it("publishes the on-screen question as Coach context from every screen that serves one", () => {
    // THE COUPLING THIS PROTECTS. report_question and flag_defect resolve their target from
    // `screen.questionId` and raise a blocker card without one — so a screen that shows a question and
    // does not publish it here is a screen from which that question CANNOT be reported. While the
    // floating pill existed it carried its own questionId prop and hid this: only /study published
    // context, yet all four screens could still file. Removing the pill made the gap load-bearing.
    const SCREENS = [
      "src/app/study/page.tsx",
      "src/app/stem-sniper/page.tsx",
      "src/app/live-tasting/[id]/page.tsx",
      "src/app/live-tasting/paper/[id]/page.tsx",
    ];
    for (const rel of SCREENS) {
      const src = fs.readFileSync(path.join(appDir, rel), "utf8");
      expect(src, rel).toMatch(/useFeedbackContext/);
      // The id itself, not just the call — publishing a context with no questionId would satisfy the
      // import and still leave the screen unreportable.
      expect(src, rel).toMatch(/setFeedbackContext\(\{[\s\S]*?questionId:/);
      // Clearing on unmount matters as much as setting: a stale id would anchor the next screen's
      // report to the question the candidate has already left.
      expect(src, rel).toMatch(/clearFeedbackContext\(\)/);
    }
  });

  it("still pauses the study clock while the dock is open", () => {
    // Inherited from the Feedback tab and easy to lose in a refactor: without it, stopping to report
    // a broken question costs exam minutes, which is what stops people reporting at all.
    const dock = fs.readFileSync(path.join(appDir, "src/app/components/coach/CoachDock.tsx"), "utf8");
    expect(dock).toMatch(/c\.pause\(\)/);
    expect(dock).toMatch(/c\.resume\(\)/);
    expect(dock).toMatch(/pauseTimer\(\)/);
  });

  it("adds the remaining write tools once nothing is in flight", () => {
    expect(
      toolsFor(CLEAR)
        .filter((t) => t.kind === "write")
        .map((t) => t.name)
        .sort()
    ).toEqual(["file_bug", "flag_defect", "report_question", "submit_feedback"]);
    expect(toolDefinitions(CLEAR)).toHaveLength(13);
  });

  it("keeps the same read set in both states", () => {
    const reads = (s: typeof CLEAR) =>
      toolsFor(s)
        .filter((t) => t.kind === "read")
        .map((t) => t.name)
        .sort();
    expect(reads(CLEAR)).toEqual(reads(OPEN));
  });

  it("still filters a restricted tool — the gate is live, not dead code", () => {
    // Phase 1 ships nothing restricted, so without this the mechanism could rot unnoticed and
    // Phase 2's get_screen_context — which DOES read the live answer key — would arrive to a broken
    // gate. Exercise it with a synthetic tool rather than waiting for the real one.
    const probe = {
      name: "probe_secret",
      kind: "read" as const,
      restrictedWhenAttemptOpen: true,
      description: "",
      inputSchema: { type: "object" as const },
      run: async () => ({}),
    };
    ALL_TOOLS.push(probe);
    try {
      expect(toolsFor(OPEN).map((t) => t.name)).not.toContain("probe_secret");
      expect(toolsFor(CLEAR).map((t) => t.name)).toContain("probe_secret");
    } finally {
      ALL_TOOLS.pop();
    }
  });

  it("refuses to dispatch a restricted tool even if the model asks for it by name", async () => {
    const probe = {
      name: "probe_secret",
      kind: "read" as const,
      restrictedWhenAttemptOpen: true,
      description: "",
      inputSchema: { type: "object" as const },
      run: async () => ({ leaked: true }),
    };
    ALL_TOOLS.push(probe);
    try {
      const r = await dispatchTool("probe_secret", {}, { userId: 1, state: OPEN, apiKey: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/unavailable while you have a question open/i);
    } finally {
      ALL_TOOLS.pop();
    }
  });

  it("distinguishes a withheld tool from one that does not exist", async () => {
    const r = await dispatchTool("reveal_the_answer", {}, { userId: 1, state: OPEN, apiKey: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown tool/i);
  });
});

// ── get_screen_context: the one tool that reads a live question ──────────────────────────────────

describe("get_screen_context redaction", () => {
  const src = fs.readFileSync(path.join(appDir, "src/lib/coach/tools/screen-tools.ts"), "utf8");
  const safeList = src.slice(src.indexOf("const SAFE_COLUMNS"), src.indexOf("const FULL_COLUMNS"));

  // Every column on generated_questions that names or narrows the wine. If one of these ever
  // appears in the restricted SELECT, a candidate mid-attempt can ask "what am I looking at" and be
  // handed the answer.
  const IDENTITY_COLUMNS = [
    "wines",
    "model_answer",
    "wine_profiles",
    "reasoning_trace",
    "study_diagram_assist",
    "proposed_annotation",
    "wine_category",
    "p3_category",
    "curveball",
  ];

  for (const col of IDENTITY_COLUMNS) {
    it(`never selects ${col} while an attempt is open`, () => {
      expect(safeList).not.toMatch(new RegExp(`\\b${col}\\b`));
    });
  }

  it("selects an explicit allow-list, never SELECT *", () => {
    // An allow-list defaults tomorrow's new identity column to hidden; a deny-list leaks it.
    expect(src).not.toMatch(/SELECT\s+\*/i);
    expect(safeList).toMatch(/question_text/);
  });

  it("verifies the user owns the question before reading it", () => {
    // The id arrives from the browser. Without this check the tool fetches any question's answer key.
    expect(src).toMatch(/FROM user_attempts[\s\S]*?user_id = \$\{ctx\.userId\}/);
    expect(src).toMatch(/owned\.length === 0/);
  });

  it("picks the column list from server-resolved state, not from tool input", () => {
    expect(src).toMatch(/ctx\.state\.restricted \? SAFE_COLUMNS : FULL_COLUMNS/);
  });
});

describe("get_attempt_debrief", () => {
  const src = fs.readFileSync(path.join(appDir, "src/lib/coach/tools/debrief-tools.ts"), "utf8");

  it("scopes every attempt read to the requesting user", () => {
    // An attempt id is a small integer. Ownership has to be in the WHERE clause, not a later check.
    const selects = src.match(/FROM user_attempts[\s\S]*?(?=`)/g) || [];
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) expect(s).toMatch(/user_id = \$\{ctx\.userId\}/);
  });

  it("only joins the question once the attempt is finished", () => {
    // The gate is this attempt's own completion — an in-flight attempt must not surrender its key
    // even when the candidate asks for it by id.
    expect(src).toMatch(/if \(graded && a\.question_id\)/);
    expect(src).toMatch(/const graded = !!a\.completed_at/);
  });

  it("tells the model there is no numeric mark rather than letting it infer one", () => {
    expect(src).toMatch(/Do not invent one or imply a score/);
  });
});

// ── Source guards ────────────────────────────────────────────────────────────────────────────────

describe("coach source guards", () => {
  it("builds a tool list in exactly one place", () => {
    // If a second call site starts assembling tools, the assertions above stop describing reality.
    const files = fs
      .readdirSync(path.join(appDir, "src/lib/coach"), { recursive: true, encoding: "utf8" })
      .filter((f) => typeof f === "string" && f.endsWith(".ts"));
    const offenders = files.filter((f) => {
      if (f === "registry.ts") return false;
      const src = fs.readFileSync(path.join(appDir, "src/lib/coach", f), "utf8");
      return /ALL_TOOLS\s*\.\s*(filter|map)\b/.test(src);
    });
    expect(offenders, "only registry.ts may derive a tool list from ALL_TOOLS").toEqual([]);
  });

  it("resolves attempt state from the user, never from client-supplied screen context", () => {
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/state.ts"), "utf8");
    // The H2 race: state must be a per-user question, so the query keys on user_id and must not
    // accept an attempt/question id as an argument.
    expect(src).toMatch(/WHERE user_id = \$\{userId\}/);
    expect(src).not.toMatch(/resolveCoachState\([^)]*attemptId/);
  });

  it("excludes feedback rows when deciding whether an attempt is open", () => {
    // Feedback submissions are stored as user_attempts rows with completed_at NULL (migration 053).
    // Counting them jams the gate permanently shut for anyone who ever sends feedback.
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/state.ts"), "utf8");
    expect(src).toMatch(/source <> 'feedback_tab'/);
    expect(src).toMatch(/scope <> 'general'/);
  });

  it("fails closed when attempt state cannot be resolved", () => {
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/state.ts"), "utf8");
    const cat = src.slice(src.indexOf("catch"));
    expect(cat).toMatch(/restricted: true/);
    expect(cat).not.toMatch(/restricted: false/);
  });

  it("re-resolves state inside the loop, not only at turn start", () => {
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/run.ts"), "utf8");
    const occurrences = src.match(/resolveCoachState\(/g) || [];
    expect(
      occurrences.length,
      "state must be resolved at turn start AND again before dispatching tools"
    ).toBeGreaterThanOrEqual(2);
  });
});
