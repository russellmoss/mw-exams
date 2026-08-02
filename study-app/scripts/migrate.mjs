#!/usr/bin/env node
/**
 * Migration runner.
 *
 * Why this exists: migrations used to be applied to production by hand. Three times a migration
 * was merged to master and deployed while the SQL was never run — most recently 013_stem_detail,
 * which 500'd /api/auth/me for every signed-in user because the route read a column that did not
 * exist. Code and schema shipped independently, and only one of them arrived.
 *
 * This runs during the build, before Next compiles, so a merged migration self-applies. If it
 * fails, the build fails and the broken code never reaches production — a failed deploy is much
 * cheaper than a live app that nobody can sign in to.
 *
 * Contract for migration files:
 *   - Named NNN_description.sql in migrations/, applied in filename order.
 *   - MUST be idempotent (IF NOT EXISTS / guarded DO blocks). The ledger means a migration is
 *     normally applied once, but a partial failure re-runs it, and the first run against an
 *     already-hand-migrated database replays everything. All 001-013 satisfy this today.
 */

import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/**
 * Split a SQL file into individual statements.
 *
 * The neon HTTP driver rejects multi-statement queries, so we cannot hand it a whole file. A naive
 * split on ";" corrupts any function body or DO block, since those contain semicolons inside
 * dollar-quoted strings ($$ ... $$ or $tag$ ... $tag$). Migration 013 is exactly this shape. So we
 * track whether we are inside a dollar-quoted string, a single-quoted literal, or a comment, and
 * only treat a semicolon as a terminator at the top level.
 */
export function splitStatements(sql) {
  const statements = [];
  let current = "";
  let i = 0;
  let inSingle = false;
  let dollarTag = null; // e.g. "$$" or "$body$"

  while (i < sql.length) {
    const rest = sql.slice(i);

    if (dollarTag) {
      if (rest.startsWith(dollarTag)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += sql[i++];
      continue;
    }

    if (inSingle) {
      // '' is an escaped quote inside a literal, not a terminator.
      if (rest.startsWith("''")) {
        current += "''";
        i += 2;
        continue;
      }
      if (sql[i] === "'") inSingle = false;
      current += sql[i++];
      continue;
    }

    if (rest.startsWith("--")) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }

    if (rest.startsWith("/*")) {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }

    const dollar = /^\$[A-Za-z_0-9]*\$/.exec(rest);
    if (dollar) {
      dollarTag = dollar[0];
      current += dollarTag;
      i += dollarTag.length;
      continue;
    }

    if (sql[i] === "'") {
      inSingle = true;
      current += sql[i++];
      continue;
    }

    if (sql[i] === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      i++;
      continue;
    }

    current += sql[i++];
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!url) {
    // Local builds without a database are legitimate; Vercel always sets DATABASE_URL for
    // production and preview, which is where drift actually hurts.
    console.warn("[migrate] DATABASE_URL not set — skipping migrations.");
    return;
  }

  const sql = neon(url);

  await sql.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Map(
    (await sql.query("SELECT version, checksum FROM schema_migrations")).map((r) => [
      r.version,
      r.checksum,
    ])
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;

  for (const file of files) {
    const body = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const checksum = createHash("sha256").update(body).digest("hex").slice(0, 16);

    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        // Editing an applied migration means environments silently disagree. Warn loudly rather
        // than fail: blocking every future deploy over a fixed typo would be worse.
        console.warn(
          `[migrate] ${file} changed since it was applied (${applied.get(file)} -> ${checksum}). ` +
            `Applied databases will NOT have the new statements. Add a new migration instead.`
        );
      }
      continue;
    }

    const statements = splitStatements(body);
    console.log(`[migrate] applying ${file} (${statements.length} statements)`);

    for (const [n, statement] of statements.entries()) {
      try {
        await sql.query(statement);
      } catch (err) {
        console.error(`[migrate] FAILED ${file} statement ${n + 1}/${statements.length}`);
        console.error(statement.slice(0, 500));
        throw err;
      }
    }

    await sql.query(
      "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2) " +
        "ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum",
      [file, checksum]
    );
    ran++;
  }

  console.log(
    ran === 0
      ? `[migrate] up to date (${files.length} migrations already applied)`
      : `[migrate] applied ${ran} migration(s)`
  );
}

// Only run when invoked directly, so tests can import splitStatements without hitting a database.
// pathToFileURL, not string concatenation: on Windows a path is C:\... and the URL is file:///C:/...
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("[migrate] migration failed — failing the build deliberately.");
    console.error(err);
    process.exit(1);
  });
}
