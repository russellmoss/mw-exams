// audit-paper-scope-default.test.ts — the guard that keeps R-COLOUR on by default.
//
// validateQuestion() enforces the paper-scope contract unless a caller passes `{ paperScope: false }`.
// That flag exists for exactly one reason: a few unit fixtures deliberately mix wine colours to
// exercise a different rule, and no single paper number can make them coherent.
//
// It must never be used in production code. R-COLOUR was previously excluded from validateQuestion
// altogether, which made paper-scope compliance something each caller had to remember — and five of the
// six forgot, so for months NO banked question was quarantined for serving a red wine on Paper 1.
// 35 questions reached the bank that way, 23 of them still live. This test is what stops that
// regressing: the default protects production by omission, and only tests may opt out.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(entry)) out.push(p);
  }
  return out;
}

// Matches `paperScope: false` and `paperScope:false`, and the `{ paperScope: false } as const` form —
// but only in real code. Comment lines are stripped first, because question-validator.ts documents the
// flag in prose (and so does this file), and a doc mention is not an opt-out.
const OPT_OUT = /paperScope\s*:\s*false/;

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

// The declaration site itself — `opts?: { paperScope?: boolean }` — is not an opt-out either, and it
// does not match OPT_OUT (`?: boolean`, not `: false`). Only a caller passing the literal counts.

describe("R-COLOUR is on by default for every production caller", () => {
  it.each(["src", "scripts"])("no file under %s/ opts out of the paper-scope contract", (subdir) => {
    const offenders = walk(join(ROOT, subdir))
      .filter((f) => OPT_OUT.test(codeOnly(readFileSync(f, "utf-8"))))
      .map((f) => f.slice(ROOT.length + 1).replace(/\\/g, "/"));

    expect(
      offenders,
      `These files disable the paper-scope contract. A production caller must never opt out — ` +
        `fix the wines or the paper instead:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("only the known colour-incoherent fixtures opt out", () => {
    const allowed = [
      // Fixtures that deliberately mix colours to exercise a different rule.
      "tests/flight-composition.test.ts",
      "tests/wine-reference-shape.test.ts",
      // Asserts the opt-out flag itself works.
      "tests/paper-colour.test.ts",
    ];
    const optedOut = walk(join(ROOT, "tests"))
      .filter((f) => OPT_OUT.test(codeOnly(readFileSync(f, "utf-8"))))
      .map((f) => f.slice(ROOT.length + 1).replace(/\\/g, "/"))
      // This file quotes the pattern in its own source; exclude it.
      .filter((f) => f !== "tests/audit-paper-scope-default.test.ts");

    // A new entry here is a decision, not an accident: it means a fixture cannot be made
    // colour-coherent. Prefer fixing the fixture's paper number first.
    expect(optedOut.sort()).toEqual(allowed.sort());
  });
});
