import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Banked is the default question source (migration 063). That default is spread across four files
// — a migration, two server coercions and the wizard's JSX — and every one of them can drift back
// to 'fresh' independently, silently, and invisibly: the candidate would just find themselves
// waiting 30-60s and paying for a generation they never asked for. So each place is asserted here.
//
// This is a source-drift guard in the style of practical-walkthrough.test.ts, not a behavioural
// test — there is no DB in the build gate.

const APP_ROOT = process.cwd();
const read = (path: string) => readFileSync(join(APP_ROOT, path), "utf8");

const migration = read("migrations/063_banked_question_default.sql");
const db = read("src/lib/db.ts");
const me = read("src/app/api/auth/me/route.ts");
const studyDefaults = read("src/app/api/user/study-defaults/route.ts");
const wizard = read("src/app/practical/dry-flights/page.tsx");

describe("the database defaults new accounts to banked", () => {
  it("flips the column default", () => {
    expect(migration.replace(/\s+/g, " ")).toContain(
      "ALTER TABLE users ALTER COLUMN question_source_default SET DEFAULT 'banked'"
    );
  });

  it("backfills the accounts left on the old column default", () => {
    expect(migration.replace(/\s+/g, " ")).toContain(
      "UPDATE users SET question_source_default = 'banked' WHERE question_source_default = 'fresh'"
    );
  });
});

describe("the server coerces an unknown value toward banked, never toward fresh", () => {
  // The direction of the ternary IS the default: `=== "banked" ? "banked" : "fresh"` sends a null
  // row, a typo and a missing column all to the billed path.
  it("getUserStudyDefaults treats only an explicit 'fresh' as fresh", () => {
    expect(db).toContain('question_source_default === "fresh" ? "fresh" : "banked"');
  });

  it("/api/auth/me treats only an explicit 'fresh' as fresh", () => {
    expect(me).toContain('question_source_default === "fresh" ? "fresh" : "banked"');
  });

  it("the study-defaults GET error fallback is banked", () => {
    expect(studyDefaults).toContain('questionSource: "banked"');
    expect(studyDefaults).not.toContain('questionSource: "fresh", reasoningStream');
  });
});

describe("the acquire card is bank-first, with generation as the exhausted-pool fallback", () => {
  // 2026-08-09: the acquire card no longer offers "New Question" alongside the bank. While unseen
  // banked questions remain, "Start" (a banked serve) is the ONLY way in — generation quality is
  // unproven while the expert-reviewed bank is deep, so generation appears only once the pool for
  // the selection is exhausted, next to a Replay option over questions the candidate already did.

  it("serves the bank as Start, before any generation control", () => {
    const banked = wizard.indexOf("onClick={() => handleBankedQuestion(false)}");
    const fresh = wizard.indexOf("onClick={handleNewQuestion}");
    expect(banked, "the banked Start button is gone").toBeGreaterThan(-1);
    expect(fresh, "the generation fallback button is gone").toBeGreaterThan(-1);
    expect(banked, "generation now reads before the banked Start button").toBeLessThan(fresh);
  });

  it("gates generation behind an exhausted bank", () => {
    // The Start branch of the ternary comes first; handleNewQuestion may only be wired up inside
    // the empty-bank else-branch that follows it.
    const gate = wizard.indexOf("bankCount > 0 && !bankTaken ?");
    const fresh = wizard.indexOf("onClick={handleNewQuestion}");
    expect(gate, "the bank-first gate is gone from the acquire card").toBeGreaterThan(-1);
    expect(
      fresh,
      "generation is reachable outside the exhausted-bank branch"
    ).toBeGreaterThan(gate);
  });

  it("offers Replay over already-done questions when the bank runs dry", () => {
    expect(wizard).toContain("onClick={() => handleBankedQuestion(true)}");
    expect(wizard).toContain("Replay Past Questions");
  });

  it("never invokes the banked fetch outside a click", () => {
    // The buttons call the handler from onClick arrows. Any auto-serve would have to call it from
    // an effect — and a serve records the view, so it burns a pool row the candidate never asked
    // for. Every call site must sit inside an onClick.
    const calls = wizard.match(/handleBankedQuestion\((?:true|false|)\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(wizard).toContain(`onClick={() => ${call}}`);
    }
    expect(wizard).not.toContain("autoBankedRef");
  });
});
