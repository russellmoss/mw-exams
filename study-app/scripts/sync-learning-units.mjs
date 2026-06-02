// Sync published learning-unit chapters from the canonical source (repo-root outputs/learning_units/)
// into study-app/public/learning_units/ so the /learn reader can serve them. Runs in prebuild and can
// be run manually after editing a chapter. The canonical content lives in outputs/; this is a copy.
//
// IMPORTANT (NO-BACKSTAGE, defense-in-depth): we STRIP the internal-only fields before publishing —
// each citation's `ref` (the EK/finding/file audit trail), and the top-level `sources` + `meta`
// (internal provenance). The reader only ever receives reader-facing `source` labels. Even if a chapter
// JSON carries internal ids in those fields, they never reach the client.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, "..", "..", "outputs", "learning_units");
const outDir = join(__dirname, "..", "public", "learning_units");

mkdirSync(outDir, { recursive: true });

let files = [];
try {
  files = readdirSync(srcDir).filter((f) => /^ch\d+_.*\.json$/.test(f));
} catch {
  console.log("sync-learning-units: no outputs/learning_units/ source dir; nothing to sync.");
  writeFileSync(join(outDir, "index.json"), "[]");
  process.exit(0);
}

const index = [];
for (const f of files) {
  let ch;
  try {
    ch = JSON.parse(readFileSync(join(srcDir, f), "utf8"));
  } catch {
    console.error(`sync-learning-units: SKIP ${f} (invalid JSON)`);
    continue;
  }

  // Strip internal-only provenance so it can never reach the client.
  delete ch.sources;
  delete ch.meta;
  if (Array.isArray(ch.citations)) {
    ch.citations = ch.citations.map((c) => {
      const clean = { ...c };
      delete clean.ref;
      return clean;
    });
  }

  const slug = ch.slug;
  if (!slug) {
    console.error(`sync-learning-units: SKIP ${f} (no slug)`);
    continue;
  }
  writeFileSync(join(outDir, `${slug}.json`), JSON.stringify(ch));
  index.push({
    chapter: ch.chapter,
    slug,
    title: ch.title,
    subtitle: ch.subtitle ?? null,
    summary: ch.summary ?? "",
    estReadingMinutes: ch.estReadingMinutes ?? null,
    anchorVisual: ch.anchorVisual ?? null,
    status: ch.status ?? "draft",
    sectionCount: Array.isArray(ch.sections) ? ch.sections.length : 0,
  });
}

index.sort((a, b) => a.chapter - b.chapter);
writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2));
console.log(`sync-learning-units: synced ${index.length} chapter(s) -> public/learning_units/`);
