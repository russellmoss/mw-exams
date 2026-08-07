import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import {
  splitStatements,
  checksum,
  shouldRunMigrations,
  orphanedVersions,
  KNOWN_ORPHANS,
} from "../scripts/migrate.mjs";

describe("checksum", () => {
  // The bug this guards: hashing bytes as-read made the checksum depend on the checkout platform
  // (core.autocrlf=true gives CRLF on Windows, LF on Vercel's Linux builders), so thirteen unchanged
  // migrations warned "changed since it was applied" on every production build.
  it("is identical for CRLF and LF versions of the same file", () => {
    const lf = "CREATE TABLE t (\n  id INT\n);\n";
    expect(checksum(lf.replace(/\n/g, "\r\n"))).toBe(checksum(lf));
  });

  it("still changes when the SQL itself changes", () => {
    expect(checksum("SELECT 1;\n")).not.toBe(checksum("SELECT 2;\n"));
  });

  it("matches the LF hashes already stored for migrations applied on Linux", () => {
    // 014-016 were first applied by a Vercel build, so their ledger rows are the LF hashes. The
    // normalised checksum must keep agreeing with them or it would re-drift what is already correct.
    const dir = join(import.meta.dirname, "..", "migrations");
    expect(checksum(readFileSync(join(dir, "014_oauth_and_reset.sql"), "utf8"))).toBe(
      "7e5ff4a29afb8ca3"
    );
    expect(checksum(readFileSync(join(dir, "015_p3_category.sql"), "utf8"))).toBe(
      "e1d4c2a770851096"
    );
    expect(checksum(readFileSync(join(dir, "016_knowledge_corpus.sql"), "utf8"))).toBe(
      "5f387a124f27c89c"
    );
  });

  it("matches the values 017 re-baselines 001-013 to", () => {
    // If a 001-013 file is ever edited, this fails and points at 017 rather than letting the
    // re-baseline quietly encode a stale hash.
    const dir = join(import.meta.dirname, "..", "migrations");
    const rebaseline = readFileSync(join(dir, "017_rebaseline_checksums.sql"), "utf8");
    const rows = [...rebaseline.matchAll(/\('(\d{3}_[\w.]+\.sql)', '\w+', '(\w+)'\)/g)];
    expect(rows).toHaveLength(13);
    for (const [, file, expected] of rows) {
      expect(checksum(readFileSync(join(dir, file), "utf8")), file).toBe(expected);
    }
  });
});

describe("splitStatements", () => {
  it("splits plain statements on semicolons", () => {
    expect(splitStatements("SELECT 1; SELECT 2;")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("ignores a trailing semicolon and blank tail", () => {
    expect(splitStatements("SELECT 1;\n\n")).toEqual(["SELECT 1"]);
  });

  it("does not split inside a dollar-quoted block", () => {
    // The bug this guards against: a naive split on ";" tears DO blocks apart mid-body and every
    // fragment then fails as invalid SQL. Migration 013 is exactly this shape.
    const sql = `
      ALTER TABLE t ADD COLUMN c TEXT;
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'x') THEN
          ALTER TABLE t ADD CONSTRAINT x CHECK (c IN ('a','b'));
        END IF;
      END $$;
    `;
    const out = splitStatements(sql);
    expect(out).toHaveLength(2);
    expect(out[1]).toContain("END IF");
    expect(out[1].startsWith("DO $$")).toBe(true);
  });

  it("handles named dollar tags", () => {
    const out = splitStatements(`DO $body$ BEGIN PERFORM 1; END $body$; SELECT 2;`);
    expect(out).toHaveLength(2);
    expect(out[1]).toBe("SELECT 2");
  });

  it("does not split on a semicolon inside a string literal", () => {
    const out = splitStatements(`INSERT INTO t VALUES ('a;b'); SELECT 1;`);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("'a;b'");
  });

  it("handles escaped quotes inside a string literal", () => {
    const out = splitStatements(`INSERT INTO t VALUES ('it''s; fine'); SELECT 1;`);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("it''s; fine");
  });

  it("strips line and block comments, including semicolons inside them", () => {
    const out = splitStatements(`-- a comment; with a semicolon\nSELECT 1;\n/* block; comment */\nSELECT 2;`);
    expect(out).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("returns nothing for a comment-only file", () => {
    expect(splitStatements("-- nothing here\n")).toEqual([]);
  });

  // Regression guard against the real corpus: every migration must split into at least one
  // statement, and none may contain an unbalanced dollar-quote.
  it("splits every real migration without unbalanced dollar quotes", () => {
    const dir = join(import.meta.dirname, "..", "migrations");
    for (const file of ["012_mode_not_null.sql", "013_stem_detail.sql"]) {
      const out = splitStatements(readFileSync(join(dir, file), "utf8"));
      expect(out.length, file).toBeGreaterThan(0);
      for (const s of out) {
        const dollars = (s.match(/\$\$/g) || []).length;
        expect(dollars % 2, `${file}: unbalanced $$ in ${s.slice(0, 40)}`).toBe(0);
      }
    }
  });

  it("splits 013 into exactly the 8 statements applied to production", () => {
    const sql = readFileSync(join(import.meta.dirname, "..", "migrations", "013_stem_detail.sql"), "utf8");
    expect(splitStatements(sql)).toHaveLength(8);
  });
});

describe("shouldRunMigrations", () => {
  // The bug this guards: previews share the PRODUCTION database and prebuild runs the migrator, so
  // every preview build of every unmerged branch was migrating production. Three migrations reached
  // the production schema that way from branches that never merged.
  it("refuses on a preview deployment", () => {
    const g = shouldRunMigrations({ VERCEL_ENV: "preview" });
    expect(g.run).toBe(false);
    expect(g.reason).toContain("preview");
  });

  it("runs on a production deployment", () => {
    expect(shouldRunMigrations({ VERCEL_ENV: "production" }).run).toBe(true);
  });

  it("runs off Vercel, where a human is driving", () => {
    // `npm run migrate` and local builds are the documented manual path.
    expect(shouldRunMigrations({}).run).toBe(true);
  });

  it("can be forced on, for when previews get their own database", () => {
    expect(
      shouldRunMigrations({ VERCEL_ENV: "preview", MIGRATE_ALLOW_NON_PRODUCTION: "1" }).run
    ).toBe(true);
  });

  it("does not treat other Vercel environments as production", () => {
    expect(shouldRunMigrations({ VERCEL_ENV: "development" }).run).toBe(false);
  });
});

describe("orphanedVersions", () => {
  // The bug this guards: on 2026-08-07 an off-Vercel run applied 054_coach.sql to production from a
  // worktree where the file was UNTRACKED. shouldRunMigrations() allows that by design (a human is
  // driving), so the only defence available is noticing afterwards that the ledger has grown a row
  // the repository cannot explain. Nothing did, and the drift was found by hand days later.
  it("reports a ledger row with no migration file", () => {
    expect(orphanedVersions(["001_a.sql", "002_b.sql"], ["001_a.sql"], new Set())).toEqual([
      "002_b.sql",
    ]);
  });

  it("stays quiet when every applied row has a file", () => {
    expect(orphanedVersions(["001_a.sql"], ["001_a.sql", "002_unapplied.sql"], new Set())).toEqual(
      []
    );
  });

  it("suppresses the documented pre-existing orphans", () => {
    expect(orphanedVersions(["019_generation_attempt_timeouts.sql"], [])).toEqual([]);
  });

  it("still reports a NEW orphan alongside a known one", () => {
    // The allowlist must not become a blanket mute — that would reintroduce the whole failure mode.
    expect(orphanedVersions(["019_generation_attempt_timeouts.sql", "099_new.sql"], [])).toEqual([
      "099_new.sql",
    ]);
  });

  it("stops reporting a known orphan once its file lands", () => {
    // So 054_coach.sql needs no cleanup when the coach branch merges: the entry goes inert by itself.
    expect(orphanedVersions(["054_coach.sql"], ["054_coach.sql"])).toEqual([]);
  });

  it("accepts a Map's keys iterator, which is what main() passes", () => {
    const applied = new Map([["001_a.sql", "abc"]]);
    expect(orphanedVersions(applied.keys(), [], new Set())).toEqual(["001_a.sql"]);
  });

  it("carries a written reason for every allowlisted version", () => {
    // A bare allowlist decays into "someone muted this once". The reason is what lets the next
    // reader tell superseded drift (027) from drift still waiting on a merge (054).
    expect(KNOWN_ORPHANS.size).toBeGreaterThan(0);
    for (const [version, reason] of KNOWN_ORPHANS) {
      expect(version.endsWith(".sql"), version).toBe(true);
      expect(reason.length, version).toBeGreaterThan(20);
    }
  });

  it("does not allowlist anything that is actually present in migrations/", () => {
    // Not a failure if it happens — such an entry is inert — but it means the list is stale, and a
    // stale list is how a real orphan eventually hides behind a name someone stopped reading.
    const files = new Set(readdirSync(join(import.meta.dirname, "..", "migrations")));
    const stale = [...KNOWN_ORPHANS.keys()].filter((v) => files.has(v));
    expect(stale, "remove these from KNOWN_ORPHANS; their files have landed").toEqual([]);
  });

  it("treats 027_model_usage_batch.sql as superseded, since master's 029 re-applies it", () => {
    // Pins the reconciliation: 029_usage_batch_attribution.sql issues the same four statements, so
    // master fully describes what production has. If 029 is ever deleted or narrowed, that stops
    // being true and this test is the note explaining why 027 was ever considered safe.
    const dir = join(import.meta.dirname, "..", "migrations");
    const sql = readFileSync(join(dir, "029_usage_batch_attribution.sql"), "utf8");
    for (const stmt of [
      "ALTER TABLE model_usage  ADD COLUMN IF NOT EXISTS batch_id UUID",
      "ALTER TABLE tavily_usage ADD COLUMN IF NOT EXISTS batch_id UUID",
    ]) {
      expect(sql, `029 must still cover: ${stmt}`).toContain(stmt);
    }
    expect(KNOWN_ORPHANS.get("027_model_usage_batch.sql")).toContain("superseded");
  });
});
