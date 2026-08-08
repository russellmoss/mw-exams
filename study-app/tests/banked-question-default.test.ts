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

describe("the acquire card leads with Banked and consumes nothing on arrival", () => {
  it("renders the Banked button before the New button", () => {
    const banked = wizard.indexOf("onClick={handleBankedQuestion}");
    const fresh = wizard.indexOf("onClick={handleNewQuestion}");
    expect(banked, "the Banked button is gone").toBeGreaterThan(-1);
    expect(fresh, "the New button is gone").toBeGreaterThan(-1);
    expect(banked, "New Question now reads first on the acquire card").toBeLessThan(fresh);
  });

  it("never invokes the banked fetch outside a click", () => {
    // The button passes the handler by reference. Any auto-serve would have to CALL it — and a
    // serve records the view, so it burns a pool row even for a candidate who came to click New.
    expect(wizard, "something is auto-serving a banked question again").not.toContain(
      "handleBankedQuestion()"
    );
    expect(wizard).not.toContain("autoBankedRef");
  });

  it("still offers both paths from the same card", () => {
    expect(wizard).toContain("Banked Question");
    expect(wizard).toContain("New Question");
  });
});
