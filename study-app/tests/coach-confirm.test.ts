import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProposalToken, verifyProposalToken, proposal, asProposal } from "@/lib/coach/confirm";
import { proposalArgs } from "@/lib/coach/run";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-coach-proposals";
});

const BASE = { tool: "submit_feedback", args: { body: "hello" }, userId: 7 };

describe("proposal tokens", () => {
  it("round-trips a valid token", () => {
    const r = verifyProposalToken(createProposalToken(BASE), { userId: 7 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.tool).toBe("submit_feedback");
      expect(r.payload.args).toEqual({ body: "hello" });
    }
  });

  it("rejects a token whose arguments were swapped after issue", () => {
    // The attack the signature exists to stop: approve "send feedback saying X", submit "…saying Y".
    const token = createProposalToken(BASE);
    const [body] = token.split(".");
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    decoded.args.body = "something else entirely";
    const forged =
      Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url") + "." + token.split(".")[1];
    expect(verifyProposalToken(forged, { userId: 7 })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a token issued to a different user", () => {
    // Cellarhand relies on tenant re-scoping for this; with no tenant layer the binding must be in
    // the payload, or one account's card is another account's write (plan H5).
    const r = verifyProposalToken(createProposalToken(BASE), { userId: 8 });
    expect(r).toEqual({ ok: false, reason: "wrong_user" });
  });

  it("rejects an expired token", () => {
    const token = createProposalToken({ ...BASE, ttlMs: -1 });
    expect(verifyProposalToken(token, { userId: 7 })).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses a resume token on the commit path", () => {
    const token = createProposalToken({ ...BASE, kind: "resume" });
    expect(verifyProposalToken(token, { userId: 7, kind: "commit" })).toEqual({
      ok: false,
      reason: "wrong_kind",
    });
  });

  it("rejects malformed input rather than throwing", () => {
    expect(verifyProposalToken("", { userId: 7 }).ok).toBe(false);
    expect(verifyProposalToken("nonsense", { userId: 7 }).ok).toBe(false);
    expect(verifyProposalToken("a.b.c", { userId: 7 }).ok).toBe(false);
  });

  it("issues a distinct nonce per token, so one approval cannot be replayed as two", () => {
    const a = verifyProposalToken(createProposalToken(BASE), { userId: 7 });
    const b = verifyProposalToken(createProposalToken(BASE), { userId: 7 });
    expect(a.ok && b.ok && a.payload.nonce !== b.payload.nonce).toBe(true);
  });
});

describe("proposal shape", () => {
  it("recognises a proposal and ignores an ordinary tool result", () => {
    expect(asProposal(proposal({ preview: "x", details: [] }))).toBeTruthy();
    expect(asProposal({ matched: 3 })).toBeNull();
    expect(asProposal(null)).toBeNull();
  });
});

describe("write path source guards", () => {
  it("burns the nonce before running the committer", () => {
    // Insert-then-run, not check-then-run: a check-then-act leaves a window in which a double
    // submit files two reports.
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/commit.ts"), "utf8");
    const insertAt = src.indexOf("INSERT INTO coach_confirmations");
    const runAt = src.indexOf("await committer(");
    expect(insertAt).toBeGreaterThan(-1);
    expect(runAt).toBeGreaterThan(insertAt);
    expect(src).toMatch(/23505/);
  });

  it("resolves committers from a closed map, never by name from the model", () => {
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/commit.ts"), "utf8");
    expect(src).toMatch(/COMMITTERS\[tool\]/);
    expect(src).toMatch(/no committer registered/);
  });

  it("gives every write tool a committer, and every committer a tool", () => {
    // A tool without a committer is an offer that can never be honoured; the reverse is dead code
    // that still holds a live write.
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/tools/write-tools.ts"), "utf8");
    const tools = [...src.matchAll(/^\s{2}name: "(\w+)",$/gm)].map((m) => m[1]).sort();
    const committers = [...src.matchAll(/^\s{2}async (\w+)\(ctx, args\)/gm)].map((m) => m[1]).sort();
    expect(tools.length).toBeGreaterThan(0);
    expect(committers).toEqual(tools);
  });

  it("shares the Feedback tab's rate limit rather than opening a second allowance", () => {
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/tools/write-tools.ts"), "utf8");
    expect(src).toMatch(/countRecentTabFeedback/);
    // Every committer must check it — the Coach makes filing much easier, so this is the throttle.
    const committerBodies = src.slice(src.indexOf("export const COMMITTERS"));
    const checks = committerBodies.match(/assertUnderRateLimit/g) || [];
    expect(checks.length).toBe(4);
  });

  // ── The defect path ──
  //
  // The Coach's judgement decides ONE thing: whether the question keeps being served. The durable
  // fix goes through the existing EK-grounded analysis and its auto-apply gate. These assertions
  // exist so a later refactor cannot quietly promote the Coach from "pulls a question" to "decides
  // a code change".

  it("withdraws the question through the shared flag transaction, not its own SQL", () => {
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/tools/write-tools.ts"), "utf8");
    // createQuestionFlag is the one place that flags, withdraws from rotation, stamps the attempt
    // and notifies admins atomically. Reimplementing any part of that would drift.
    expect(src).toMatch(/createQuestionFlag\(/);
    // Comments stripped first: the prose above explains what createQuestionFlag sets, and matching
    // that would fail the test for describing the code correctly.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toMatch(/UPDATE generated_questions/);
    expect(code).not.toMatch(/review_state\s*=/);
  });

  it("hands the verdict to the existing analysis rather than deciding it", () => {
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/tools/write-tools.ts"), "utf8");
    expect(src).toMatch(/runFeedbackAnalysis\(/);
    // The Coach must never consult or override the auto-apply switch — runFeedbackAnalysis owns it.
    expect(src).not.toMatch(/isAutoApplyEnabled/);
    expect(src).not.toMatch(/dispatchFeatureBuild|github-dispatch/);
  });

  it("defers the analysis so Confirm returns immediately", () => {
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/tools/write-tools.ts"), "utf8");
    expect(src).toMatch(/if \(ctx\.defer\) ctx\.defer\(work\)/);
    // A failed analysis must not fail the write — the sweeper retries stranded feedback.
    expect(src).toMatch(/sweeper will retry/);
  });

  it("adjudicates every question-scoped report, not only the defect path", () => {
    // report_question used to write the row and leave it to the nightly sweeper, which takes three
    // per run — so a report filed in conversation could sit for days while the candidate had just
    // been told a review would happen. Both question-scoped committers now start it.
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/tools/write-tools.ts"), "utf8");
    const calls = src.match(/startAdjudication\(ctx, id, "/g) || [];
    expect(calls.length).toBe(2);
    expect(src).toMatch(/startAdjudication\(ctx, id, "report"\)/);
    expect(src).toMatch(/startAdjudication\(ctx, id, "defect"\)/);
  });

  it("only promises a verdict where an adjudication actually runs", () => {
    // awaitingVerdict makes the card poll. Setting it on general feedback or a bug — neither of
    // which runFeedbackAnalysis can analyse, since it joins generated_questions — would leave the
    // card waiting through its whole budget for a ruling that was never coming.
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/tools/write-tools.ts"), "utf8");
    const bodies = src.split(/async (?=\w+\(ctx, args\))/);
    for (const body of bodies) {
      const name = body.match(/^(\w+)\(ctx, args\)/)?.[1];
      if (!name || !(name in { report_question: 1, submit_feedback: 1, flag_defect: 1, file_bug: 1 })) continue;
      const adjudicates = /startAdjudication\(/.test(body);
      expect(/awaitingVerdict: true/.test(body), `${name}`).toBe(adjudicates);
    }
  });

  it("keeps the detached analysis alive with after()", () => {
    // Without the keepalive the promise dies with the serverless response, which is exactly the
    // bug the Live Tasting engine hit with its background model-answer work.
    const route = fs.readFileSync(path.join(appDir, "src/app/api/coach/confirm/route.ts"), "utf8");
    expect(route).toMatch(/after\(work\)/);
    expect(route).toMatch(/from "next\/server"/);
  });

  // ── The card and the commit must name the same question ────────────────────────────────────────
  //
  // The write tools resolve their target as `input.questionId || screen.questionId` and DISPLAY that
  // on the card. If the signed args resolved it the other way round, the card would show one question
  // and the commit would file against another — which is the one failure a confirmation card is
  // supposed to make impossible, and it would look completely correct on screen.
  describe("signed identifiers", () => {
    const SCREEN = { route: "/study", questionId: "q_onscreen", attemptId: 99 };

    it("uses the screen's question when the model names none", () => {
      expect(proposalArgs("report_question", { body: "x" }, { screen: SCREEN })).toEqual({
        questionId: "q_onscreen",
        attemptId: 99,
      });
    });

    it("keeps the model's question when it names one, matching what the card showed", () => {
      // Echoed explicitly rather than left to the spread, so the signed payload is self-contained.
      // And critically NOT paired with the on-screen attempt, which belongs to a different question.
      expect(proposalArgs("report_question", { questionId: "q_earlier" }, { screen: SCREEN })).toEqual({
        questionId: "q_earlier",
      });
    });

    it("still attaches the attempt when the model names the question already on screen", () => {
      expect(proposalArgs("flag_defect", { questionId: "q_onscreen" }, { screen: SCREEN })).toEqual({
        questionId: "q_onscreen",
        attemptId: 99,
      });
    });

    it("adds nothing for general feedback, which is about no question", () => {
      expect(proposalArgs("submit_feedback", { body: "x" }, { screen: SCREEN })).toEqual({});
    });

    it("adds nothing when there is no screen at all", () => {
      expect(proposalArgs("report_question", { body: "x" }, { screen: null })).toEqual({});
    });

    // ── file_bug attaches the question as context ────────────────────────────────────────────────
    //
    // It used to be grouped with submit_feedback as "has no question", so its committer filed every
    // bug with question_id NULL. A bug about a specific question's RENDERING (the marks footer
    // summing wrong) then reached the admin queue as "General feedback", identifiable only by
    // whatever the model happened to write in the body.

    it("attaches the on-screen question to a bug", () => {
      expect(proposalArgs("file_bug", { body: "footer total is wrong" }, { screen: SCREEN })).toEqual({
        questionId: "q_onscreen",
      });
    });

    it("never attaches an attempt to a bug", () => {
      // The row is filed scope='general', which is never hung off an attempt — so an attemptId here
      // would be a signed field with no reader, and an invitation for a later refactor to honour it.
      expect(proposalArgs("file_bug", { body: "x" }, { screen: SCREEN })).not.toHaveProperty("attemptId");
    });

    it("ignores a model-named question on a bug, taking only the screen's", () => {
      // fileBug's schema has no questionId property, so this input cannot occur through the model.
      // Asserted anyway: the screen's id is server-resolved and safe on the row's foreign key,
      // whereas an invented one would fail the FK at commit and lose the whole bug report.
      expect(proposalArgs("file_bug", { questionId: "q_invented" }, { screen: SCREEN })).toEqual({
        questionId: "q_onscreen",
      });
    });

    it("files a bug with no question when there is none on screen", () => {
      expect(proposalArgs("file_bug", { body: "x" }, { screen: { route: "/library" } })).toEqual({});
    });
  });

  it("keeps file_bug's schema free of questionId, so only the screen can supply one", () => {
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/tools/write-tools.ts"), "utf8");
    const fileBug = src.slice(src.indexOf("export const fileBug"), src.indexOf("export const flagDefect"));
    const schema = fileBug.slice(fileBug.indexOf("inputSchema"), fileBug.indexOf("async run"));
    // Comments stripped first, same as the createQuestionFlag guard above: the schema carries a note
    // explaining WHY questionId is absent, and matching that would fail the test for documenting the
    // very property it asserts.
    const code = schema.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toMatch(/questionId/);
  });

  it("keeps app bugs out of the question-quality analyser", () => {
    // runFeedbackAnalysis rules on whether the QUESTION is sound. A footer that renders 44 for a
    // question correctly totalling 50 is not a claim about the question, so adjudicating it would
    // produce a "reject" that reads as "your bug report was wrong" — or an "accept" that dispatches a
    // generation-rule PR for a bug in a React component. Now that file_bug attaches a question_id,
    // the sweeper can no longer use "has a question" as a proxy for "is about question quality".
    const src = fs.readFileSync(path.join(appDir, "src/lib/feedback-analysis.ts"), "utf8");
    const sweep = src.slice(src.indexOf("export async function sweepStrandedFeedback"));
    expect(sweep).toMatch(/scope IS DISTINCT FROM 'general'/);
    expect(sweep).toMatch(/question_id IS NOT NULL/);
  });

  it("writes through the shared feedback store, not a private Coach table", () => {
    const src = fs.readFileSync(path.join(appDir, "src/lib/coach/tools/write-tools.ts"), "utf8");
    expect(src).toMatch(/recordTabFeedback/);
    expect(src).not.toMatch(/INSERT INTO coach_/);
  });
});
