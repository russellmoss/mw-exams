import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { splitStatements } from "../scripts/migrate.mjs";

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
