import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Structural invariants of the IA redesign (docs/design/2026-08-06-shell-redesign/). These are
// source-level checks in the theory-mode-guard style: they stop a well-meaning refactor from
// silently undoing an owner decision.

const APP_ROOT = process.cwd();
const read = (path: string) => readFileSync(join(APP_ROOT, path), "utf8");

describe("two-pillar navigation", () => {
  const navbar = read("src/app/components/NavBar.tsx");

  it("carries the four top-level destinations", () => {
    for (const href of ['href="/theory"', 'href="/practical"', 'href="/library"', 'href="/history"']) {
      expect(navbar).toContain(href);
    }
  });

  it("lists both drills in the Practical flyout", () => {
    expect(navbar).toContain('href="/practical/dry-flights"');
    expect(navbar).toContain('href="/live-tasting"');
  });

  it("does not link Stem Sniper (owner decision 2026-08-06: page stays, nav link goes)", () => {
    expect(navbar).not.toContain('href="/stem-sniper"');
    expect(existsSync(join(APP_ROOT, "src/app/stem-sniper/page.tsx"))).toBe(true);
  });

  it("still counts Stem Sniper and the session screens as Practical for active state", () => {
    for (const prefix of ["/stem-sniper", "/study", "/flash-notes", "/live-tasting"]) {
      expect(navbar).toContain(`"${prefix}"`);
    }
  });
});

describe("route moves", () => {
  it("keeps the Dry Flights wizard at /practical/dry-flights and the launcher at /", () => {
    expect(existsSync(join(APP_ROOT, "src/app/practical/dry-flights/page.tsx"))).toBe(true);
    const launcher = read("src/app/page.tsx");
    expect(launcher).toContain("ShellOnboarding");
    // The launcher must never regrow into the wizard: the wizard's acquire step stays out of /.
    expect(launcher).not.toContain("handleBankedQuestion");
  });

  it("redirects /diagrams to /library", () => {
    expect(read("src/app/diagrams/page.tsx")).toContain('redirect("/library")');
    expect(read("src/app/library/page.tsx")).toContain("/diagrams/index.html");
  });
});

describe("shell prefs migration", () => {
  const migration = read("migrations/050_shell_prefs.sql");

  it("is idempotent (ADD COLUMN IF NOT EXISTS on every column)", () => {
    const addColumns = migration.match(/ALTER TABLE users ADD COLUMN/g) ?? [];
    const idempotent = migration.match(/ADD COLUMN IF NOT EXISTS/g) ?? [];
    expect(addColumns.length).toBeGreaterThan(0);
    expect(idempotent.length).toBe(addColumns.length);
  });

  it("covers the four shell preferences", () => {
    for (const column of ["intro_seen", "tour_seen", "exam_date", "last_drill_config"]) {
      expect(migration).toContain(column);
    }
  });
});

describe("theory browse surface", () => {
  it("never widens the corpus beyond rubric-backed questions", () => {
    // The questions route must build from listTheoryRubrics() — the 54 report-less questions
    // (2015/2026) are hidden silently, per the recorded product decision.
    const route = read("src/app/api/theory/questions/route.ts");
    expect(route).toContain("listTheoryRubrics()");
  });
});
