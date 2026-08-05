import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";

/**
 * A "use client" module and everything it imports is bundled for the BROWSER. If any module in that
 * graph imports `fs`, `path` or the Neon driver, the production build fails with
 * "Module not found: Can't resolve 'fs'".
 *
 * Nothing else in this project catches it. `tsc --noEmit` type-checks without bundling and vitest
 * runs in Node, where `fs` resolves fine — so both pass while the deploy breaks. That is exactly what
 * happened when WineReveal (a client component) imported `describeSource` from wine-bank-lookup,
 * which reads the seed bank off disk: green locally, red on Vercel.
 *
 * This walks the real import graph from every client component and fails with the offending chain.
 */

const SRC = resolve(__dirname, "..", "src");
const SERVER_ONLY = ["fs", "path", "node:fs", "node:path", "@neondatabase/serverless", "fs/promises"];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** Local (non-package) imports, resolved to a file on disk. */
function localImports(file: string): string[] {
  const src = readFileSync(file, "utf-8");
  const specs = [...src.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]);
  const out: string[] = [];
  for (const spec of specs) {
    let base: string | null = null;
    if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(file), spec);
    if (!base) continue;
    for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx"), base]) {
      if (existsSync(cand) && /\.(ts|tsx)$/.test(cand)) { out.push(cand); break; }
    }
  }
  return out;
}

function serverOnlyImportsIn(file: string): string[] {
  const src = readFileSync(file, "utf-8");
  return [...src.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)]
    .map((m) => m[1])
    // A type-only import is erased at compile time and never reaches the bundle.
    .filter((spec, i) => SERVER_ONLY.includes(spec) && !/import\s+type/.test(
      src.slice(Math.max(0, src.indexOf(`"${spec}"`) - 80), src.indexOf(`"${spec}"`))
        .split("\n").pop() ?? ""
    ) && i >= 0);
}

/** BFS from a client entry; returns the first chain that reaches a server-only import. */
function findServerLeak(entry: string): string[] | null {
  const seen = new Set<string>();
  const queue: string[][] = [[entry]];
  while (queue.length) {
    const chain = queue.shift()!;
    const file = chain[chain.length - 1];
    if (seen.has(file)) continue;
    seen.add(file);
    const bad = serverOnlyImportsIn(file);
    if (bad.length) return [...chain, `(imports ${bad.join(", ")})`];
    for (const next of localImports(file)) queue.push([...chain, next]);
  }
  return null;
}

describe("client/server module boundary", () => {
  const clientFiles = walk(SRC).filter((f) => {
    const head = readFileSync(f, "utf-8").slice(0, 200);
    return /^\s*["']use client["']/m.test(head);
  });

  it("finds the client components to check", () => {
    expect(clientFiles.length).toBeGreaterThan(5);
  });

  it("no client component reaches fs/path/neon through its imports", () => {
    const leaks = clientFiles
      .map((f) => ({ f, chain: findServerLeak(f) }))
      .filter((r) => r.chain)
      .map((r) => r.chain!.map((p) => p.replace(SRC, "src")).join("\n    -> "));
    expect(leaks, `server-only module reachable from a client component:\n\n${leaks.join("\n\n")}`)
      .toEqual([]);
  });
});
