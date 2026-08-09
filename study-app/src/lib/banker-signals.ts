// banker-signals.ts — loads data/banker_signals.json, the single source of truth for what reads as a
// BANKER (a classic benchmark expression that gives a candidate a route to the country) and what reads
// as a CURVEBALL.
//
// The table used to be a `BankerSignal[]` literal inside question-validator.ts, and the generator's
// banker guidance was unrelated prose in question-generation-prompt.ts. So the rule that REJECTED a
// flight and the instruction that BUILT one were two different bodies of wine knowledge that could
// only be kept in agreement by hand. They weren't: the prompt tells the model Alsace anchors on the
// four noble grapes, and until this refactor the validator agreed only by coincidence.
//
// Now both read this file. An expert's upheld role ruling edits it once and both ends move together.
//
// WHY A FILE READ AND NOT A `import … from "…json"`. The JSON lives at the REPO ROOT (data/), outside
// the Vercel Root Directory (study-app), so a static import cannot resolve it in a production build.
// The established answer in this codebase is scripts/sync-stem-data.mjs, a prebuild step that copies
// the root data/ files into study-app/public/data/ — the same mechanism variety_lexicon.json and
// appellation_varieties.json already use. banker_signals.json is on that list.
//
// SERVER-ONLY. `fs` in this module's graph means anything a "use client" file imports must not reach
// it (tests/client-server-boundary.test.ts). question-validator.ts is already server-only for the same
// reason, so nothing changes for its callers.

import { readFileSync } from "fs";
import { join } from "path";

/**
 * One benchmark expression. `region` is tested against the wine's region + country + raw label;
 * `variety` against the RESOLVED, canonicalised varieties; `exclude` against the same string as
 * `region`, and it VETOES the match.
 */
export interface BankerSignal {
  id: string;
  region: RegExp;
  variety?: RegExp;
  exclude?: RegExp;
  note?: string;
  /** "seed" for the migrated in-code table; "ruling:<id>" for an upheld reviewer role ruling. */
  source: string;
}

/** A wine or wine class a reasonable examiner would NOT call a banker, and the reason why. */
export interface BankerExclusion {
  id: string;
  label: string;
  why: string;
  source: string;
}

interface RawSignal {
  id?: unknown;
  region?: unknown;
  variety?: unknown;
  exclude?: unknown;
  note?: unknown;
  source?: unknown;
}

export interface BankerSignalTable {
  version: number;
  signals: BankerSignal[];
  notCounted: BankerExclusion[];
}

// THE READ IS A SINGLE INLINE EXPRESSION, AND BOTH HALVES OF THAT MATTER TO THE BUILD.
//
// The first version tried three candidate paths from a helper, including `join(cwd, "..", "data", …)`
// as a convenience for scripts run before a sync. Turbopack's build failed it with "Encountered
// unexpected file in NFT list — a file was traced that indicates the whole project was traced
// unintentionally": the `".."` escapes the Vercel Root Directory, so a filesystem read it cannot
// statically bound drags everything above the root into the serverless bundle.
//
// Dropping the `".."` was not enough on its own. A path built by a helper that returns an array is
// still opaque to the tracer — it has to see the literal. So this is written exactly the way
// appellation-resolver.ts and stem-answer-key.ts already write it: one inline
// join(process.cwd(), "public", "data", "<name>.json"), statically scoped to a subfolder.
//
// public/data is guaranteed by scripts/sync-stem-data.mjs at prebuild, which hard-fails on this file
// specifically. A script run before a sync gets the actionable error below rather than a silently
// different calibration read from a second copy.

/**
 * Compile one raw entry. Throws on a malformed pattern rather than skipping it.
 *
 * A DROPPED SIGNAL IS INVISIBLE AND EXPENSIVE. isBanker() defaults to "curveball", so a signal that
 * silently failed to compile does not produce an error — it produces a bank in which Chablis is a
 * curveball, every flight containing it trips flight-composition, and the nightly audit quarantines
 * questions that were never wrong. Failing the load is loud, immediate and recoverable; failing open
 * is neither.
 */
function compile(raw: RawSignal, index: number): BankerSignal {
  const where = `banker_signals.json signals[${index}]${raw?.id ? ` (${String(raw.id)})` : ""}`;
  if (!raw || typeof raw !== "object") throw new Error(`${where}: not an object`);
  if (typeof raw.id !== "string" || !raw.id.trim()) throw new Error(`${where}: missing id`);
  if (typeof raw.region !== "string" || !raw.region.trim()) {
    throw new Error(`${where}: missing region pattern`);
  }
  const re = (pattern: unknown, field: string): RegExp | undefined => {
    if (pattern == null) return undefined;
    if (typeof pattern !== "string") throw new Error(`${where}: ${field} must be a string pattern`);
    try {
      return new RegExp(pattern);
    } catch (err) {
      throw new Error(`${where}: ${field} is not a valid regex — ${(err as Error).message}`);
    }
  };
  return {
    id: raw.id,
    region: re(raw.region, "region")!,
    variety: re(raw.variety, "variety"),
    exclude: re(raw.exclude, "exclude"),
    note: typeof raw.note === "string" ? raw.note : undefined,
    source: typeof raw.source === "string" ? raw.source : "seed",
  };
}

/** Parse an already-read JSON object. Exported so tests can compile the file without a filesystem. */
export function parseBankerSignalTable(parsed: unknown): BankerSignalTable {
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const rawSignals = obj.signals;
  if (!Array.isArray(rawSignals) || rawSignals.length === 0) {
    throw new Error("banker_signals.json: `signals` must be a non-empty array");
  }
  const signals = rawSignals.map((s, i) => compile(s as RawSignal, i));

  const seen = new Set<string>();
  for (const s of signals) {
    if (seen.has(s.id)) throw new Error(`banker_signals.json: duplicate signal id "${s.id}"`);
    seen.add(s.id);
  }

  const rawExclusions = Array.isArray(obj.notCounted) ? obj.notCounted : [];
  const notCounted: BankerExclusion[] = rawExclusions.map((e, i) => {
    const r = (e ?? {}) as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.label !== "string" || typeof r.why !== "string") {
      throw new Error(`banker_signals.json notCounted[${i}]: id, label and why are all required`);
    }
    return {
      id: r.id,
      label: r.label,
      why: r.why,
      source: typeof r.source === "string" ? r.source : "seed",
    };
  });

  return {
    version: typeof obj.version === "number" ? obj.version : 0,
    signals,
    notCounted,
  };
}

let cached: BankerSignalTable | null = null;

/**
 * The compiled table. Read once per process — the file is static per deploy, and isBanker() runs once
 * per wine per validation, which is a hot enough path that a per-call file read would show.
 */
export function bankerSignalTable(): BankerSignalTable {
  if (cached) return cached;
  let text: string;
  try {
    text = readFileSync(join(process.cwd(), "public", "data", "banker_signals.json"), "utf8");
  } catch {
    throw new Error(
      "banker_signals.json not found in public/data. It is written by scripts/sync-stem-data.mjs at " +
        "prebuild; run `node scripts/sync-stem-data.mjs` from study-app/ to refresh it."
    );
  }
  // A file that EXISTS but does not parse throws from here, deliberately unhandled: a broken
  // calibration must stop the process, not fall back to anything.
  cached = parseBankerSignalTable(JSON.parse(text));
  return cached;
}

/** Test seam — drop the memoised table so a test can point the loader at a different fixture. */
export function resetBankerSignalCache(): void {
  cached = null;
}

// ── Rendering the calibration for a prompt ────────────────────────────────────────────────────────

/**
 * Turn a matching pattern back into readable prose.
 *
 * DERIVED, never hand-written. A `label` field alongside each regex would read better, but it could
 * drift from the pattern it describes — and a generator told "Alsace anchors on the noble grapes"
 * while the validator quietly matches something else is the exact failure this file was created to
 * end. Prettifying the regex cannot drift, because it IS the rule.
 */
export function describePattern(re: RegExp): string {
  return re.source
    .replace(/\\b/g, "")
    .replace(/\\s\*/g, " ")
    .replace(/-\?/g, "-")
    .replace(/\(\?<!.*?\)/g, "")
    .replace(/\(\?!.*?\)/g, "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" / ");
}

/**
 * The calibration as prompt text: the exact benchmark expressions the validator will accept as a
 * flight's anchor, and the wines it deliberately will not.
 *
 * This is injected into the generation prompt so the model builds flights against the SAME table that
 * judges them. Before it existed, the prompt asserted a handful of examples in prose and the validator
 * consulted a 48-entry regex list, so a generator could satisfy every written instruction and still be
 * hard-rejected for a bankerless flight — with a rejection message naming a rule it had never seen.
 */
export function renderBankerCalibration(): string {
  const { signals, notCounted } = bankerSignalTable();
  const lines = signals.map((s) => {
    const region = describePattern(s.region);
    const variety = s.variety ? ` — but only as ${describePattern(s.variety)}` : "";
    const exclude = s.exclude ? ` (NOT ${describePattern(s.exclude)})` : "";
    return `- ${region}${exclude}${variety}`;
  });
  const excluded = notCounted.map((e) => `- ${e.label} — ${e.why.split(/(?<=\.)\s/)[0]}`);
  return [
    "These are the ONLY origins the automated check will accept as a flight's banker. It matches the",
    "wine's region, country and label text against each line; where a line names varieties, the wine's",
    "grape must be one of them. Anything not on this list is scored as a CURVEBALL, including wines the",
    "check cannot place at all — so an anchor you cannot express in these terms is not an anchor.",
    "",
    ...lines,
    "",
    "DELIBERATELY NOT BANKERS — these are curveballs however famous they sound, and using one as your",
    "flight's only anchor will fail the check:",
    ...excluded,
  ].join("\n");
}
