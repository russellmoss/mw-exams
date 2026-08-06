import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = process.cwd();
const SOURCE_ROOTS = [join(APP_ROOT, "src"), join(APP_ROOT, "scripts")];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const ALL_MODES_MARKER = "theory-mode-guard: all-modes";

type SqlRead = { file: string; line: number; sql: string };

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

/**
 * Neon queries in this app are tagged templates. Keep this deliberately small and conservative:
 * a new reader must either constrain `mode` in SQL or explicitly document that it is intended to
 * span every mode. That makes a code reviewer decide, rather than letting Theory silently enter a
 * practical-only aggregate.
 */
export function findUnclassifiedAttemptReads(source: string, file = "fixture.ts"): SqlRead[] {
  const reads: SqlRead[] = [];
  const taggedTemplate = /\bsql\s*`([\s\S]*?)`/g;

  for (const match of source.matchAll(taggedTemplate)) {
    const sql = match[1];
    if (!/\b(?:from|join)\s+user_attempts\b/i.test(sql) || !/\bselect\b/i.test(sql)) continue;
    if (sql.includes(ALL_MODES_MARKER)) continue;

    const withoutComments = sql
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/--[^\r\n]*/g, " ");
    const hasModePredicate = /(?:\b[a-z_]\w*\.)?mode\s*(?:=|<>|!=|\bis\b|\bin\s*\()/i.test(
      withoutComments
    );
    if (hasModePredicate) continue;

    const line = source.slice(0, match.index).split(/\r?\n/).length;
    reads.push({ file, line, sql: sql.trim() });
  }

  return reads;
}

describe("Theory mode guard", () => {
  it("excludes Theory from the admin attempt aggregates", () => {
    for (const file of [
      "src/app/api/admin/users/route.ts",
      "src/app/api/admin/users/[id]/route.ts",
    ]) {
      const source = readFileSync(join(APP_ROOT, file), "utf8");
      expect(source, file).toMatch(/JOIN user_attempts a[\s\S]*?a\.mode\s+IS\s+DISTINCT\s+FROM\s+'theory'/i);
    }
  });

  it("excludes every non-full mode from both empirical-knowledge sync paths", () => {
    const source = readFileSync(join(APP_ROOT, "scripts/sync-empirical-knowledge.mjs"), "utf8");
    const guardedReads = [...source.matchAll(/sql\s*`([\s\S]*?(?:FROM|JOIN) user_attempts[\s\S]*?)`/gi)]
      .map((match) => match[1])
      .filter((sql) => /\bselect\b/i.test(sql));

    expect(guardedReads).toHaveLength(2);
    for (const sql of guardedReads) {
      expect(sql).toMatch(/ua\.mode\s*=\s*'full'/i);
    }
  });

  it("fails closed when a new user_attempts reader has no mode decision", () => {
    const fixture = "const rows = await sql`SELECT * FROM user_attempts WHERE user_id = ${userId}`;";
    expect(findUnclassifiedAttemptReads(fixture)).toHaveLength(1);

    const violations = SOURCE_ROOTS.flatMap((dir) =>
      sourceFiles(dir).flatMap((file) =>
        findUnclassifiedAttemptReads(readFileSync(file, "utf8"), relative(APP_ROOT, file))
      )
    );
    expect(
      violations.map(({ file, line }) => `${file}:${line}`),
      `Every user_attempts reader needs a mode predicate or /* ${ALL_MODES_MARKER} -- reason */`
    ).toEqual([]);
  });
});
