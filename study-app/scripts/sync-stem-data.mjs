// sync-stem-data.mjs — prebuild step. Copies the stem-key lexicon/bank data from the repo-root
// data/ (the source of truth the feedback loop edits) into study-app/public/data/, so the LIVE
// stem-answer-key derivation reads the SAME data the offline CI backfill uses. Keeps the live path
// and the backfill in sync per deploy. Idempotent / safe to run repeatedly.
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "..", "data"); // repo-root data/
const dstDir = join(here, "..", "public", "data"); // study-app/public/data/
mkdirSync(dstDir, { recursive: true });

const FILES = [
  "variety_lexicon.json",
  "appellation_varieties.json",
  "stem_proprietary_blends.json",
  "stem_style_lexicon.json",
  "mock_wine_bank.json",
];

let copied = 0;
for (const f of FILES) {
  const src = join(srcDir, f);
  if (existsSync(src)) {
    copyFileSync(src, join(dstDir, f));
    copied++;
  } else {
    console.warn(`sync-stem-data: source missing, skipped ${f}`);
  }
}
console.log(`sync-stem-data: ${copied}/${FILES.length} stem data files synced to public/data`);
