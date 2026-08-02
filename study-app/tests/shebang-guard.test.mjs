/**
 * Guard against the regression fixed in "drop shebang from migrate.mjs".
 *
 * A `#!` line is only legal at byte 0 of a script. Vitest wraps a module body in a function before
 * evaluating it, so the moment a shebanged file enters a test's import graph the whole suite dies
 * with a bare "SyntaxError: Invalid or unexpected token" — no file, no line, and the blame lands on
 * the test file rather than the module it imported. `node --check` passes on the offender, so
 * nothing local catches it either. tests/migrate.test.mjs silently ran 0 tests this way.
 *
 * Two invariants, both cheap:
 *   1. Nothing under src/ has a shebang. src is library code compiled by Next; it is never a CLI
 *      entry point, so a shebang there is always a mistake.
 *   2. Nothing reachable from a test file via relative/aliased imports has a shebang. This is the
 *      one that would have caught the original bug.
 *
 * If this test fails on a script you deliberately want runnable as `./script.mjs`, do NOT re-add the
 * shebang: move the importable logic into its own module and keep the shebanged file as a thin
 * wrapper the tests never touch.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const TESTS_DIR = import.meta.dirname;
const APP_ROOT = join(TESTS_DIR, "..");

const rel = (p) => relative(APP_ROOT, p).replace(/\\/g, "/");
const hasShebang = (file) => readFileSync(file, "utf8").startsWith("#!");

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(mjs|cjs|js|jsx|ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

// Deliberately loose: a stray match inside a comment only adds a file to the scan, which is
// harmless. Missing a real import is the failure mode worth avoiding.
function importsOf(code) {
  const re =
    /\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']|\bimport\s+["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']/g;
  const specs = [];
  let m;
  while ((m = re.exec(code))) specs.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
  return specs;
}

// Mirrors how Vitest resolves these: relative paths, and the `@/` alias from vitest.config.mts.
// Bare specifiers are node_modules and out of scope.
const CANDIDATE_SUFFIXES = ["", ".mjs", ".cjs", ".js", ".jsx", ".ts", ".tsx"];
const INDEX_SUFFIXES = ["/index.ts", "/index.tsx", "/index.mjs", "/index.js"];

function resolveSpecifier(spec, fromFile) {
  let base;
  if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else if (spec.startsWith("@/")) base = join(APP_ROOT, "src", spec.slice(2));
  else return null;

  for (const suffix of [...CANDIDATE_SUFFIXES, ...INDEX_SUFFIXES]) {
    const candidate = base + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  // Unresolvable (type-only import, generated file, etc.). Skipping keeps the guard from failing
  // for reasons unrelated to shebangs — it can under-report, but it will never cry wolf.
  return null;
}

/** Every file Vitest could evaluate, walking out from the test files. */
function testImportGraph() {
  const seen = new Set();
  const queue = walk(TESTS_DIR);
  queue.forEach((f) => seen.add(f));

  while (queue.length) {
    const file = queue.pop();
    for (const spec of importsOf(readFileSync(file, "utf8"))) {
      const resolved = resolveSpecifier(spec, file);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        queue.push(resolved);
      }
    }
  }
  return [...seen];
}

describe("shebang guard", () => {
  it("finds the test files and their imports (guard is actually looking at something)", () => {
    const graph = testImportGraph();
    // Without this, a silent break in resolveSpecifier would collapse the graph to just tests/ and
    // the two assertions below would pass vacuously forever — the same failure mode as the bug.
    expect(graph.length).toBeGreaterThan(walk(TESTS_DIR).length);
    expect(
      graph.map(rel),
      "canary: tests/migrate.test.mjs imports scripts/migrate.mjs, so it must appear in the graph. " +
        "If that import was legitimately renamed or removed, point this canary at another " +
        "test-imported module — do not just delete the assertion."
    ).toContain("scripts/migrate.mjs");
  });

  it("no file under src/ starts with a shebang", () => {
    const offenders = walk(join(APP_ROOT, "src")).filter(hasShebang).map(rel);
    expect(offenders, `shebang in library code: ${offenders.join(", ")}`).toEqual([]);
  });

  it("no module reachable from a test starts with a shebang", () => {
    const offenders = testImportGraph().filter(hasShebang).map(rel);
    expect(
      offenders,
      `these are imported (directly or transitively) by a test and will break the suite ` +
        `with "SyntaxError: Invalid or unexpected token": ${offenders.join(", ")}`
    ).toEqual([]);
  });
});
