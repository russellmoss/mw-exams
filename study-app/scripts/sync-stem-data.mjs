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
  // The banker/curveball calibration (src/lib/banker-signals.ts). Unlike the four above, a MISSING
  // copy of this one is not a degraded derivation — isBanker() throws rather than defaulting, because
  // silently failing open would make every wine a curveball and hard-reject the entire bank. So the
  // warn below is not cosmetic for this file: a skipped copy is a broken deploy.
  "banker_signals.json",
  // The 540 real IMW exam wines with their expert benchmark_status / question_role / curveball_level.
  // This is the COUNTER-EVIDENCE a role dispute is adjudicated against: when a reviewer asserts a wine
  // is a banker, the adjudicator is shown how the Institute has actually used that region across ten
  // years before it rules. Without it the adjudicator has only the reviewer's assertion and its own
  // recall, and it defers — which makes the whole loop an expensive way to rubber-stamp one opinion.
  "historical_wine_classification.json",
];

// Files whose absence must FAIL the build rather than warn. The four lexicon files degrade the
// stem-key derivation when missing, which is bad but recoverable; banker_signals.json does not
// degrade — isBanker() throws on a missing table (deliberately, since failing open would classify
// every wine a curveball and hard-reject the whole bank), so a skipped copy is a deploy that 500s on
// the first validation instead of a deploy that is merely worse.
const REQUIRED = new Set(["banker_signals.json"]);

let copied = 0;
for (const f of FILES) {
  const src = join(srcDir, f);
  if (existsSync(src)) {
    copyFileSync(src, join(dstDir, f));
    copied++;
  } else if (REQUIRED.has(f)) {
    console.error(`sync-stem-data: REQUIRED source missing: ${src}`);
    process.exit(1);
  } else {
    console.warn(`sync-stem-data: source missing, skipped ${f}`);
  }
}
console.log(`sync-stem-data: ${copied}/${FILES.length} stem data files synced to public/data`);
