/**
 * Migration runner.
 *
 * No shebang here on purpose. This module is imported by tests/migrate.test.mjs, and Vitest wraps a
 * module body in a function before evaluating it — a `#!` line is only legal at byte 0 of a file, so
 * it becomes "SyntaxError: Invalid or unexpected token" and the whole suite collects 0 tests. It is
 * never executed directly anyway: package.json runs `node scripts/migrate.mjs`.
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
 * Checksum a migration file's contents.
 *
 * Normalise line endings first. Git is checked out with core.autocrlf=true on Windows, so the same
 * committed blob is CRLF in a Windows working tree and LF on Vercel's Linux builders. Hashing the
 * bytes as-read therefore produced a different checksum per platform: 001-013 were first applied
 * from a Windows machine and stored CRLF hashes, and every Vercel build since has recomputed the LF
 * hash and warned that thirteen unchanged files had "changed". Normalising makes the checksum a
 * property of the migration rather than of the machine that read it.
 *
 * The normalised value equals the old LF hash, so 014+ — first applied by a Linux build — keep
 * matching. The CRLF-era rows for 001-013 were re-baselined in 017_rebaseline_checksums.sql.
 */
export function checksum(body) {
  return createHash("sha256").update(body.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
}

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

/**
 * Decide whether this build is allowed to migrate the database it is pointed at.
 *
 * Preview deployments share the PRODUCTION database (there is no separate preview branch), and
 * prebuild runs this script. So every preview build of every unmerged branch was migrating
 * production. That is not theoretical: 018_generation_telemetry, 019_generation_attempt_timeouts
 * and 026_bank_batch_family all reached the production schema from branches that never merged to
 * master — one of them created a table whose writer did not exist in production for a day.
 *
 * All three happened to be additive. A branch carrying a DROP COLUMN, a NOT NULL backfill or a data
 * rewrite would have silently mutated production from an experiment nobody had approved. The
 * migration runner exists to stop code and schema arriving separately; a preview writing to prod is
 * the same failure wearing different clothes.
 *
 * So: production deploys migrate. Previews do not. A preview whose code needs a new column will
 * fail against the production schema — which is the correct outcome, and a far cheaper one than
 * discovering the reverse.
 *
 * Off-Vercel runs (no VERCEL_ENV) still migrate: `npm run migrate` and local builds are a human
 * acting deliberately, and that is the documented manual path.
 *
 * MIGRATE_ALLOW_NON_PRODUCTION=1 forces it on. Set that if previews are ever given their OWN
 * database — at that point they should migrate it, and this guard becomes the wrong default.
 */
export function shouldRunMigrations(env = process.env) {
  if (env.MIGRATE_ALLOW_NON_PRODUCTION === "1") {
    return { run: true, reason: "MIGRATE_ALLOW_NON_PRODUCTION=1" };
  }
  if (!env.VERCEL_ENV) return { run: true, reason: "not a Vercel build" };
  if (env.VERCEL_ENV === "production") return { run: true, reason: "production deploy" };
  return { run: false, reason: `VERCEL_ENV=${env.VERCEL_ENV}` };
}

async function main() {
  const gate = shouldRunMigrations();
  if (!gate.run) {
    console.warn(
      `[migrate] SKIPPING migrations (${gate.reason}). Preview deployments share the production ` +
        `database, so migrating from here would apply an unmerged branch's schema to production. ` +
        `If this preview needs new columns, merge to master and deploy, or set ` +
        `MIGRATE_ALLOW_NON_PRODUCTION=1 once previews have their own database.`
    );
    return;
  }

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
    const sum = checksum(body);

    if (applied.has(file)) {
      if (applied.get(file) !== sum) {
        // Editing an applied migration means environments silently disagree. Warn loudly rather
        // than fail: blocking every future deploy over a fixed typo would be worse.
        console.warn(
          `[migrate] ${file} changed since it was applied (${applied.get(file)} -> ${sum}). ` +
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
      [file, sum]
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
