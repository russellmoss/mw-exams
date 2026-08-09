// public-data-sync.test.ts — the repo-root data/ and study-app/public/data/ must not drift.
//
// scripts/sync-stem-data.mjs copies seven data files from the repo-root data/ (the source of truth
// that the feedback loop, the role-ruling loop and humans all edit) into study-app/public/data/ at
// PREBUILD. A deployed build reads the public copy. So a PR that edits the root file and does not run
// the sync leaves production enforcing the OLD data while every test passes against the new — the
// failure mode is silent and survives review, because the diff looks complete.
//
// It has happened. On 2026-08-09 stem_proprietary_blends.json in public/ was missing a Montevetrano
// entry the root file had, so production resolved that wine against a stale table. banker_signals.json
// had a test pinning its two copies together and was fine; every other synced file had no guard at
// all. This is that guard, for all of them.
//
// Note the asymmetry with prebuild: yes, the prebuild sync would eventually fix a stale copy on the
// next deploy. That is not a reason to skip this. The public copy is COMMITTED, so between the merge
// and the next successful production build the repo is the record of what is deployed — and a
// preview build, a local build, or any code path reading public/data/ directly gets the stale file in
// the meantime. Catching it at PR time costs nothing.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "..");
const ROOT_DATA = join(APP_ROOT, "..", "data");
const PUBLIC_DATA = join(APP_ROOT, "public", "data");
const SYNC_SCRIPT = join(APP_ROOT, "scripts", "sync-stem-data.mjs");

/**
 * The file list is READ OUT OF THE SYNC SCRIPT rather than duplicated here, so adding a file to the
 * sync automatically puts it under this guard. A hardcoded copy would be one more thing that drifts,
 * which is the exact bug being tested for.
 *
 * Parsed rather than imported: importing sync-stem-data.mjs would EXECUTE it, and it copies on import
 * — a test that silently repaired the drift it exists to detect would always pass. The parse is
 * therefore load-bearing, so `finds the file list` below asserts it actually found something; without
 * that, a refactor of the script would quietly reduce this whole file to testing nothing.
 */
function syncedFiles(): { files: string[]; required: Set<string> } {
  const src = readFileSync(SYNC_SCRIPT, "utf8");
  const filesBlock = src.match(/const FILES\s*=\s*\[([\s\S]*?)\n\];/);
  const requiredBlock = src.match(/const REQUIRED\s*=\s*new Set\(\[([\s\S]*?)\]\);/);
  const names = (block: string | undefined) =>
    block ? [...block.matchAll(/"([^"]+\.json)"/g)].map((m) => m[1]) : [];
  return {
    files: names(filesBlock?.[1]),
    required: new Set(names(requiredBlock?.[1])),
  };
}

const { files, required } = syncedFiles();

describe("public/data is in sync with the repo-root data/", () => {
  it("finds the file list in sync-stem-data.mjs", () => {
    // Guards the parse above. If the script is restructured so the regex stops matching, this fails
    // loudly instead of the suite silently checking zero files.
    expect(files.length).toBeGreaterThanOrEqual(7);
    expect(files).toContain("banker_signals.json");
    expect(required.has("banker_signals.json")).toBe(true);
  });

  it.each(files)("%s matches its repo-root source", (file) => {
    const rootPath = join(ROOT_DATA, file);
    const publicPath = join(PUBLIC_DATA, file);

    // The script skips a missing source with a warning (except for REQUIRED ones), so a root file
    // that does not exist is not automatically a failure — but it must then not exist in public
    // either, or public is carrying a file nothing maintains.
    if (!existsSync(rootPath)) {
      expect(required.has(file), `${file} is REQUIRED by the sync but missing from data/`).toBe(false);
      return;
    }

    expect(
      existsSync(publicPath),
      `public/data/${file} is MISSING. Re-run: node study-app/scripts/sync-stem-data.mjs`
    ).toBe(true);

    // Compared as parsed JSON, not bytes: both copies come out of git, so a .gitattributes or
    // checkout-EOL difference would otherwise read as drift when the content is identical. Semantic
    // equality is what actually matters — a reformat that changes nothing is not a stale deploy.
    const rootJson = JSON.parse(readFileSync(rootPath, "utf8"));
    const publicJson = JSON.parse(readFileSync(publicPath, "utf8"));
    expect(publicJson, `public/data/${file} is STALE. Re-run: node study-app/scripts/sync-stem-data.mjs`).toEqual(
      rootJson
    );
  });

  it("every REQUIRED file is present in both places", () => {
    // A missing banker_signals.json does not degrade gracefully — isBanker() throws rather than
    // defaulting, because failing open would classify every wine a curveball and hard-reject the
    // whole bank. So for these, absence is a broken deploy, not a worse one.
    for (const file of required) {
      expect(existsSync(join(ROOT_DATA, file)), `REQUIRED ${file} missing from data/`).toBe(true);
      expect(existsSync(join(PUBLIC_DATA, file)), `REQUIRED ${file} missing from public/data/`).toBe(true);
    }
  });
});
