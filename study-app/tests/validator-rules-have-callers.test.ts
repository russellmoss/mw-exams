// Every validator rule must actually run.
//
// The bin-fix miner has now three times produced a PR that adds a rule nobody calls: #60 and #71 both
// added an exported-but-uncalled `validateTastingNoteSchema`, and #103 added `validateAnswerKeyClaims`
// reachable only from `regenerateFeedbackOnce`, which nothing calls either. Such a PR passes review and
// passes its own unit tests — the rule is correct, it simply never executes — and merging it RETIRES
// the feedback rows that motivated it from the prompt feeds. The signal stops nagging and the defect
// stays. That is strictly worse than never having merged it.
//
// So: a rule-shaped export under src/lib must be reachable from outside src/lib. "Reachable" is
// transitive on purpose — a same-file helper calling it is not enough, because that is exactly the
// #103 shape.
//
// The analysis deliberately OVER-approximates reachability (comments stripped, then any bare mention of
// the name inside a reachable declaration counts). A gate that cries wolf gets deleted; this one only
// fires when a name appears nowhere a running code path could see it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = process.cwd();
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs"]);

/**
 * Known-dead rules that predate this gate. These are NOT exemptions — each is a real defect kept
 * visible here rather than silently tolerated, and the list must only ever shrink:
 *
 *  • question-validator.checkNoteCompleteness — the KEY-stage wrapper shipped by #64. The note rules
 *    themselves DO run, via tasting.ts → validateTastingNotes → noteCompletenessViolations, so notes
 *    are still checked at generation. What never runs is the audit/analysis-side rejection, which is
 *    why the corpus sweep has never quarantined a question for a missing alcohol or acidity reading.
 *  • question-validator.assertServedQuestionIntegrity — shipped by #73 (proposal 19) and called from
 *    produceQuestion() in that PR; there is no call site on master today.
 *  • live-tasting-paper.validateComposition — scripts/live-tasting-paper-qa.mjs re-checks the same
 *    contract off the DB row instead of calling it.
 */
const KNOWN_DEAD = new Set([
  "checkNoteCompleteness",
  "assertServedQuestionIntegrity",
  "validateComposition",
]);

const RULE_EXPORT = /^\s*export\s+(?:async\s+)?function\s+((?:validate|check|assert|enforce)[A-Z]\w*)/;
// Top-level declaration boundaries: a chunk runs from one column-0 declaration to the next.
const TOP_LEVEL_DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\r\n]*/g, "$1 ");
}

/** Split a module into its top-level declarations, so reachability can be per-function not per-file. */
export function topLevelChunks(source: string): { name: string; body: string }[] {
  const lines = source.split(/\r?\n/);
  const starts: { name: string; line: number }[] = [];
  lines.forEach((text, i) => {
    const m = text.match(TOP_LEVEL_DECL);
    if (m) starts.push({ name: m[1], line: i });
  });
  return starts.map((s, i) => ({
    name: s.name,
    body: lines.slice(s.line, i + 1 < starts.length ? starts[i + 1].line : lines.length).join("\n"),
  }));
}

/**
 * Rule-shaped exports under src/lib that no running code path can reach.
 * `files` are {path, text} pairs with repo-relative, forward-slashed paths.
 */
export function unreachableRules(files: { path: string; text: string }[]): string[] {
  const isLib = (p: string) => p.startsWith("src/lib/");
  const chunksByName = new Map<string, string[]>();
  const declared: { name: string; path: string }[] = [];

  for (const f of files.filter((f) => isLib(f.path))) {
    const clean = stripComments(f.text);
    for (const c of topLevelChunks(clean)) {
      if (!chunksByName.has(c.name)) chunksByName.set(c.name, []);
      chunksByName.get(c.name)!.push(c.body);
    }
    for (const line of f.text.split(/\r?\n/)) {
      const m = line.match(RULE_EXPORT);
      if (m) declared.push({ name: m[1], path: f.path });
    }
  }

  const mentions = (text: string) => new Set(text.match(/\b[A-Za-z_$][\w$]*\b/g) || []);

  // Seed with everything named outside src/lib — routes, components, scripts: the real entry points.
  const frontier: string[] = [];
  const reachable = new Set<string>();
  for (const f of files.filter((f) => !isLib(f.path)))
    for (const n of mentions(stripComments(f.text)))
      if (!reachable.has(n)) { reachable.add(n); frontier.push(n); }

  // Then close over what those declarations themselves name.
  while (frontier.length) {
    const name = frontier.pop()!;
    for (const body of chunksByName.get(name) || [])
      for (const n of mentions(body))
        if (!reachable.has(n)) { reachable.add(n); frontier.push(n); }
  }

  return declared.filter((d) => !reachable.has(d.name)).map((d) => `${d.name} (${d.path})`);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return statSync(path).isDirectory() ? sourceFiles(path) : [];
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

describe("validator rules have callers", () => {
  it("flags a rule reachable only from a same-file helper that is itself dead (the #103 shape)", () => {
    const files = [
      {
        path: "src/lib/question-validator.ts",
        text: [
          "export function validateAnswerKeyClaims(feedback: string) {",
          "  return [];",
          "}",
          "export function regenerateFeedbackOnce(feedback: string) {",
          "  return validateAnswerKeyClaims(feedback);",
          "}",
          "export function validateWired(q: Q) { return []; }",
        ].join("\n"),
      },
      { path: "src/app/api/x/route.ts", text: "import { validateWired } from '@/lib/question-validator';\nvalidateWired(q);" },
    ];
    expect(unreachableRules(files)).toEqual(["validateAnswerKeyClaims (src/lib/question-validator.ts)"]);
  });

  it("does not flag a rule a comment merely mentions", () => {
    const files = [
      { path: "src/lib/a.ts", text: "export function validateThing(q: Q) { return []; }" },
      { path: "src/app/page.tsx", text: "// validateThing is great\nexport default function P() { return null; }" },
    ];
    expect(unreachableRules(files)).toEqual(["validateThing (src/lib/a.ts)"]);
  });

  it("treats transitive reachability through a live helper as reachable", () => {
    const files = [
      {
        path: "src/lib/a.ts",
        text: "export function validateInner(q: Q) { return []; }\nexport function runAll(q: Q) { return validateInner(q); }",
      },
      { path: "scripts/audit.mjs", text: "import { runAll } from '../src/lib/a.ts';\nrunAll(q);" },
    ];
    expect(unreachableRules(files)).toEqual([]);
  });

  it("every rule-shaped export under src/lib is reachable from a running code path", () => {
    const files = [join(APP_ROOT, "src"), join(APP_ROOT, "scripts")]
      .flatMap(sourceFiles)
      .map((p) => ({ path: relative(APP_ROOT, p).split("\\").join("/"), text: readFileSync(p, "utf8") }));

    const dead = unreachableRules(files).filter((d) => !KNOWN_DEAD.has(d.split(" ")[0]));
    expect(
      dead,
      "A validator rule nothing calls passes review and passes its own tests, then retires the feedback " +
        "that motivated it while the defect stays. Wire it into a live path, or do not add it."
    ).toEqual([]);
  });

  it("the known-dead list only shrinks — a name that is now wired must be removed from it", () => {
    const files = [join(APP_ROOT, "src"), join(APP_ROOT, "scripts")]
      .flatMap(sourceFiles)
      .map((p) => ({ path: relative(APP_ROOT, p).split("\\").join("/"), text: readFileSync(p, "utf8") }));

    const stillDead = new Set(unreachableRules(files).map((d) => d.split(" ")[0]));
    const staleEntries = [...KNOWN_DEAD].filter((n) => !stillDead.has(n));
    expect(staleEntries, "These are wired now — delete them from KNOWN_DEAD.").toEqual([]);
  });
});
