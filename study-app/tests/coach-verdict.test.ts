import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reasonFrom } from "@/app/api/coach/verdict/route";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A realistic analysis body, in the shape the feedback-analysis prompt specifies. */
const ANALYSIS = `### Claim Analysis
The candidate asserts the IMW would never set Semillon across two countries.

### Evidence from Past MW Exams (2011–2025)
2014 Paper 1 Question 1 did exactly this — Australia and Bordeaux.

### Factual Check on User's Claims
The claim that this has never been set is incorrect.

### Recommendation: REJECT

**Reasoning:** The pairing has precedent: 2014 Paper 1 set Semillon from Hunter Valley
against Bordeaux. The flight is orthodox rather than unusual.

**What this means for you:**
Worth revisiting the 2014 paper — it is the clearest instance.

[[INTERNAL]]

### Current Pipeline Check
EK-0042 covers this. Fix would land in src/lib/question-rules.mjs.
Kind: none`;

const threadOf = (content: string) => [{ role: "system", content, timestamp: "2026-08-07T00:00:00Z" }];

describe("verdict reason extraction", () => {
  it("returns the candidate-facing reasoning paragraph", () => {
    const reason = reasonFrom(threadOf(ANALYSIS));
    expect(reason).toMatch(/precedent/);
    expect(reason).toMatch(/2014 Paper 1/);
  });

  it("stops at the next bold label, so the whole tail is not swept in", () => {
    expect(reasonFrom(threadOf(ANALYSIS))).not.toMatch(/What this means for you/);
  });

  // The load-bearing one. Everything after [[INTERNAL]] is engineering-only — EK ids, file paths,
  // the proposed code change, the Kind routing line — and a candidate must never be shown it.
  it("never leaks anything from the internal half", () => {
    const reason = reasonFrom(threadOf(ANALYSIS)) || "";
    expect(reason).not.toMatch(/EK-\d+/);
    expect(reason).not.toMatch(/src\//);
    expect(reason).not.toMatch(/Kind:/);
    expect(reason).not.toMatch(/\[\[INTERNAL\]\]/);
  });

  it("leaks nothing when the Reasoning label sits AFTER the marker", () => {
    // A malformed analysis that puts the label only in the internal half must yield nothing rather
    // than reaching past the cut to find it.
    const reason = reasonFrom(threadOf("### Recommendation: ACCEPT\n[[INTERNAL]]\n**Reasoning:** EK-0042 says so."));
    expect(reason).toBeNull();
  });

  it("returns null rather than guessing when there is no reasoning paragraph", () => {
    expect(reasonFrom(threadOf("### Recommendation: ACCEPT\nNo reasoning section here."))).toBeNull();
  });

  it("survives the shapes a half-written row can take", () => {
    expect(reasonFrom(null)).toBeNull();
    expect(reasonFrom([])).toBeNull();
    expect(reasonFrom("not an array")).toBeNull();
    expect(reasonFrom([{ role: "system" }])).toBeNull();
    expect(reasonFrom([{ role: "system", content: null }])).toBeNull();
  });

  // The cap is 900, set from the real corpus: the 56 completed analyses in the database run 272–832
  // characters, so nothing real is truncated. These cover the synthetic over-long case.
  it("passes a real-length paragraph through untouched", () => {
    const real = "x".repeat(832);
    expect(reasonFrom(threadOf(`**Reasoning:** ${real}`))).toBe(real);
  });

  it("ends an over-long reason on a sentence, not mid-clause", () => {
    const reason = reasonFrom(threadOf(`**Reasoning:** ${"word ".repeat(160)}Done. ${"tail ".repeat(60)}`));
    expect(reason).toMatch(/Done\.$/);
    expect(reason!.length).toBeLessThanOrEqual(900);
  });

  it("falls back to a word boundary when there is no sentence to end on", () => {
    // One 1200-character clause with no full stop — cutting mid-word would look like corruption.
    const reason = reasonFrom(threadOf(`**Reasoning:** ${"alpha ".repeat(200)}`)) || "";
    expect(reason.length).toBeLessThanOrEqual(901); // 900 + the ellipsis
    expect(reason).toMatch(/alpha…$/);
  });
});

describe("verdict route guards", () => {
  const src = fs.readFileSync(
    path.join(appDir, "src/app/api/coach/verdict/route.ts"),
    "utf8"
  );

  it("does not mark the analysis read", () => {
    // The reason this route exists rather than reusing /api/feedback-analysis/[id]: that one flips
    // is_read as a side effect of being fetched, so polling it would consume the notification the
    // candidate has not read yet.
    expect(src).not.toMatch(/is_read/);
    expect(src).not.toMatch(/updateFeedbackAnalysis/);
  });

  it("is read-only", () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
  });

  it("scopes ownership to the attempt, not to the analysis", () => {
    // The analysis row may not exist yet when the card starts polling, so ownership has to be
    // proven against the attempt — otherwise "no row" would be reachable for someone else's id.
    expect(src).toMatch(/FROM user_attempts WHERE id = \$\{attemptId\}/);
    expect(src).toMatch(/user_id !== user\.id && !user\.isAdmin/);
  });

  it("selects named columns, never the whole analysis row", () => {
    expect(src).toMatch(/SELECT status, recommendation, thread/);
    expect(src).not.toMatch(/SELECT \*/);
  });
});

describe("verdict rendering", () => {
  const chat = fs.readFileSync(
    path.join(appDir, "src/app/components/coach/CoachChat.tsx"),
    "utf8"
  );

  it("renders every terminal verdict, including endorse", () => {
    // `endorse` is the one that gets forgotten — it was added so praise stopped being auto-rejected,
    // and it is live in the database. A missing entry fails SILENTLY: the card reports a decided
    // ruling as "still under review". "pending" is deliberately absent; it is not a ruling.
    const map = chat.match(/const VERDICT[\s\S]*?\n\};/)?.[0] || "";
    for (const rec of ["accept", "partial", "reject", "endorse"]) {
      expect(map, rec).toMatch(new RegExp(`\\b${rec}:`));
    }
    expect(map).not.toMatch(/\bpending:/);
  });

  it("renders the reason as markdown, since the analyses bold their key phrase", () => {
    expect(chat).toMatch(/<ReactMarkdown>\{verdict\.reason\}<\/ReactMarkdown>/);
  });

  it("only polls when the committer said a verdict is coming", () => {
    // Polling unconditionally would spin for the full budget on a bug report or general feedback,
    // neither of which is adjudicated, and show "Reviewing…" for a review that never runs.
    expect(chat).toMatch(/data\?\.data\?\.awaitingVerdict/);
  });
});
