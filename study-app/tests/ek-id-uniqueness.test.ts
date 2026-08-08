import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Static guard for `mw_exam_empirical_knowledge.md` entry ids.
 *
 * A duplicate `ek_id` is a SILENT data loss, which is why it needs a build-time gate rather than a
 * runtime check. `study-app/scripts/sync-ek-table.mjs` rebuilds the Neon `empirical_knowledge` mirror
 * with `INSERT ... ON CONFLICT (ek_id) DO UPDATE`, so when two headings share an id only the later one
 * reaches the table. On 2026-08-07 three ids were each used twice (EK-0155, EK-0156, EK-0157); the
 * mirror read 163 rows against 166 parsed entries and three entries were invisible to the
 * feedback-analysis agent, which queries the table and never reads the doc. One of the three was the
 * product decision that blocks sparkling wine on Paper 1 entirely — a rule the generation prompt and
 * validator depend on. Nothing downstream could notice, and the sync ran green throughout.
 *
 * The sync script now hard-fails on a collision too. This test is the earlier gate: `npm test` blocks
 * feature-build.yml, so a collision is caught before it lands on master and before ek-table-sync.yml
 * would go red with the doc already committed.
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOC_PATH = path.join(APP_ROOT, "..", "mw_exam_empirical_knowledge.md");
const doc = fs.readFileSync(DOC_PATH, "utf8");
const lines = doc.split("\n");

/** Must stay identical to the heading regex in sync-ek-table.mjs — that is the parser being guarded. */
const HEADING = /^###\s*(EK-\d{4})\s*·\s*(.+?)\s*$/;

type Entry = { id: string; title: string; line: number };

const headingLines = lines
  .map((text, i) => ({ text, line: i + 1 }))
  .filter(({ text }) => /^###\s*EK-/.test(text));

const entries: Entry[] = headingLines.flatMap(({ text, line }) => {
  const m = text.match(HEADING);
  return m ? [{ id: m[1], title: m[2], line }] : [];
});

describe("mw_exam_empirical_knowledge.md entry ids", () => {
  it("parses at least one entry (the doc is findable and the regex still matches it)", () => {
    expect(entries.length).toBeGreaterThan(100);
  });

  it("gives every entry a unique ek_id", () => {
    const byId = new Map<string, Entry[]>();
    for (const e of entries) {
      if (!byId.has(e.id)) byId.set(e.id, []);
      byId.get(e.id)!.push(e);
    }
    const dupes = [...byId.entries()].filter(([, es]) => es.length > 1);
    const report = dupes
      .map(
        ([id, es]) =>
          `${id} used ${es.length}×:\n` + es.map((e) => `    line ${e.line} · ${e.title}`).join("\n")
      )
      .join("\n  ");
    // A duplicate id silently drops the EARLIER entry from the Neon mirror. Renumber all but one of
    // each pair to a fresh id (next free = max + 1) and update every cross-reference to it.
    expect(dupes.length, dupes.length ? `duplicate ek_id(s):\n  ${report}` : "").toBe(0);
  });

  it("shapes every EK heading so the sync parser can see it", () => {
    // A heading the regex misses is dropped from the mirror just as silently as a duplicate — e.g. a
    // hyphen or colon where the `·` separator belongs.
    const unparsed = headingLines
      .filter(({ text }) => !HEADING.test(text))
      .map(({ text, line }) => `line ${line}: ${text}`);
    expect(unparsed, `EK headings sync-ek-table.mjs would skip:\n  ${unparsed.join("\n  ")}`).toEqual(
      []
    );
  });

  it("resolves every EK-nnnn reference to a real entry", () => {
    // Guards the other half of a renumber: moving an id without following its cross-references leaves
    // prose pointing at an entry that no longer exists.
    const ids = new Set(entries.map((e) => e.id));
    const dangling = new Map<string, number[]>();
    lines.forEach((text, i) => {
      if (HEADING.test(text)) return;
      for (const m of text.matchAll(/EK-\d{4}/g)) {
        if (ids.has(m[0])) continue;
        if (!dangling.has(m[0])) dangling.set(m[0], []);
        dangling.get(m[0])!.push(i + 1);
      }
    });
    const report = [...dangling.entries()].map(([id, ls]) => `${id} (line ${ls.join(", ")})`);
    expect(report, `references with no matching entry: ${report.join("; ")}`).toEqual([]);
  });
});
