import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The migration-number gate.
 *
 * `scripts/migrate.mjs` applies migrations in FILENAME order and records `version` as the full
 * filename. Two files sharing a number therefore both apply and are both tracked — nothing breaks —
 * but which one runs first is decided by the rest of the filename sorting alphabetically, not by
 * intent. Six such pairs already exist on master, each the result of two parallel feature branches
 * taking "the next number" and both landing:
 *
 *   041 bin_reason_check / live_tasting        043 bin_reason_rebuttal / live_tasting_byo
 *   042 bin_fix_proposals / live_tasting_radius  047 paper_feedback / study_defaults
 *   050 shell_prefs / theory_attempt_questions   054 coach / general_feedback_no_question
 *
 * All six are safe by luck: no pair touches the same table, so their relative order is immaterial
 * (verified against production 2026-08-08 — all twelve rows present in `schema_migrations`, all
 * checksums matching the committed files, and no pair applied inverted). A future pair where one
 * member depends on the other — a column added by one and backfilled by the other, a constraint
 * dropped and re-added — would apply in whichever order `b` sorts against `l`, with no warning and
 * no failing build. That is the hazard this file exists to prevent.
 *
 * The fix is forward-only. The six pairs are grandfathered below and CANNOT be cleaned up:
 * `schema_migrations` keys on the filename, so renaming an applied migration makes the runner treat
 * it as new and re-apply it against production. See the "prod schema drift" history in CLAUDE.md.
 *
 * A NEW migration takes max(existing) + 1. Nothing else.
 *
 * One gap worth knowing: this gate sees FILES, not the ledger. Production also carries four rows
 * whose file never merged (018, 019, 026 and 027 all have a preview-branch twin — see CLAUDE.md), so
 * numbers 018/019/026/027 are each spent twice in `schema_migrations` while looking single here.
 * max+1 keeps you clear of them regardless; only a deliberate backfill into a low number could
 * collide with one, and there is no reason to write one.
 */

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "migrations");

/**
 * The six pre-existing collisions, keyed by number.
 *
 * This list may only SHRINK, and in practice it will never shrink either — every entry is already
 * applied to production and so is unrenamable. Adding an entry means you are about to ship the
 * ordering hazard described above; renumber your migration to max+1 instead.
 */
const GRANDFATHERED_DUPLICATES: Record<number, string[]> = {
  41: ["041_bin_reason_check.sql", "041_live_tasting.sql"],
  42: ["042_bin_fix_proposals.sql", "042_live_tasting_radius.sql"],
  43: ["043_bin_reason_rebuttal.sql", "043_live_tasting_byo.sql"],
  47: ["047_paper_feedback.sql", "047_study_defaults.sql"],
  50: ["050_shell_prefs.sql", "050_theory_attempt_questions.sql"],
  54: ["054_coach.sql", "054_general_feedback_no_question.sql"],
};

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Number -> files carrying it, for every number carried by more than one file. */
function duplicatesOnDisk(): Map<number, string[]> {
  const byNumber = new Map<number, string[]>();
  for (const file of migrationFiles()) {
    const n = Number(file.slice(0, 3));
    byNumber.set(n, [...(byNumber.get(n) ?? []), file]);
  }
  return new Map([...byNumber].filter(([, files]) => files.length > 1));
}

describe("migration numbering", () => {
  it("names every migration NNN_snake_case.sql", () => {
    // The gate reads the number off the first three characters, so a migration named any other way
    // would silently escape it (`Number("live")` is NaN, and NaN never collides with anything).
    for (const file of migrationFiles()) {
      expect(file, `${file} must be NNN_snake_case.sql`).toMatch(/^\d{3}_[a-z0-9_]+\.sql$/);
    }
  });

  it("introduces no new duplicate migration number", () => {
    for (const [n, files] of duplicatesOnDisk()) {
      const grandfathered = GRANDFATHERED_DUPLICATES[n];
      expect(
        grandfathered,
        `Migration number ${n} is used by ${files.length} files (${files.join(", ")}). ` +
          `Two files with one number apply in filename order, not dependency order. ` +
          `Renumber the new one to ${Math.max(...migrationFiles().map((f) => Number(f.slice(0, 3)))) + 1} ` +
          `— do NOT add it to GRANDFATHERED_DUPLICATES, and do NOT renumber the existing file ` +
          `(it is applied to production and keyed by filename).`
      ).toBeDefined();
      expect(files, `the files sharing number ${n} changed`).toEqual(grandfathered);
    }
  });

  it("keeps the grandfather list honest — every entry is still a real collision", () => {
    // Stops the list being padded with numbers that aren't actually duplicated, which would
    // pre-authorise a future collision instead of recording a past one.
    const duplicates = duplicatesOnDisk();
    for (const [n, files] of Object.entries(GRANDFATHERED_DUPLICATES)) {
      expect(
        duplicates.get(Number(n)),
        `GRANDFATHERED_DUPLICATES[${n}] is stale — number ${n} is no longer duplicated on disk. ` +
          `Delete the entry; this list is only allowed to shrink.`
      ).toEqual(files);
    }
  });

  it("grandfathers exactly the six known pairs", () => {
    // A literal count, so growing the allowlist means editing this number too — which is a much
    // louder thing to review than one more line in a map.
    expect(Object.keys(GRANDFATHERED_DUPLICATES)).toHaveLength(6);
  });

  it("leaves the highest number unique, so the next migration is unambiguously max+1", () => {
    const numbers = migrationFiles().map((f) => Number(f.slice(0, 3)));
    const max = Math.max(...numbers);
    expect(
      numbers.filter((n) => n === max),
      `migration ${max} is the highest number and is used twice, so "the next number" is ambiguous`
    ).toHaveLength(1);
  });
});
