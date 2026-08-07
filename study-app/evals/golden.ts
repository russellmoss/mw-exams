// evals/golden.ts — the human-labelled golden set: load, freeze, verify.
//
// 466 real review decisions (309 kept / 157 binned) are the only human signal in this system, and
// they were previously used for exactly one thing (mining bin-fix proposals). Here they become the
// set the judge is calibrated against and the set a CI replay runs over.
//
// ── The splits, and why there are four ──────────────────────────────────────────────────────────
//
//   calibration     tune the judge rubric against these
//   holdout         MEASURE the judge against these; never tuned on. The number that counts.
//   regression      CI replay — deterministic validator/prompt-builder runs, no model calls
//   synthetic_floor 20 deliberately-corrupted questions; objectively wrong regardless of taste
//
// The synthetic floor is the load-bearing one. Every other split inherits a single expert's
// judgement on a subjective craft, so a judge that matches them perfectly has learned that person,
// not the exam. The floor questions are wrong in ways nobody could defend — marks that don't sum, a
// red wine in Paper 1, a stem contradicting its own wine list. A judge that misses those is unfit
// at any κ, and that verdict needs no reviewer to arbitrate it.
//
// ── Why the file is frozen and hashed ───────────────────────────────────────────────────────────
//
// The bank grows daily. If the golden set were a live query, every eval would score against a
// different set and no two runs would be comparable — the ratchet would have no teeth. So it is a
// committed artifact with a content hash, and a run that finds the hash changed says so loudly.

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type GoldenSplit = "calibration" | "holdout" | "regression" | "synthetic_floor";

/** The human verdict. `bin` is the expensive-to-miss class, so it drives recall, not accuracy. */
export type GoldenVerdict = "keep" | "bin";

export interface GoldenItem {
  questionId: string;
  split: GoldenSplit;
  paper: number;
  family: string | null;
  verdict: GoldenVerdict;
  /** Reviewer's tags, e.g. ["too_obscure"]. Empty for kept items and for synthetic ones. */
  reasonTags: string[];
  /** Reviewer's free text, where given. Never shown to the judge — that would leak the answer. */
  reasonNote: string | null;
  questionText: string;
  wines: { slot: number; fullText: string }[];
  totalMarks: number | null;
  modelAnswer: string | null;
  /**
   * Synthetic items only: what was deliberately broken. Lets a failing judge be diagnosed
   * ("misses arithmetic" vs "misses scope") instead of just scored.
   */
  corruption?: string;
}

export interface GoldenSet {
  /** sha256 over the canonical item list. Changes ⇒ scores are not comparable to earlier runs. */
  hash: string;
  builtAt: string;
  items: GoldenItem[];
}

export const GOLDEN_PATH = join(process.cwd(), "evals", "golden", "questions.jsonl");
export const GOLDEN_META_PATH = join(process.cwd(), "evals", "golden", "meta.json");

/**
 * Canonical hash of the set's CONTENT.
 *
 * Hashes only the fields that change what a run measures — id, split, verdict — sorted by id, so
 * re-serialising or reordering the file does not invalidate a baseline while a genuine relabel
 * does. Hashing raw file bytes would make the ratchet fire on whitespace.
 */
export function hashItems(items: GoldenItem[]): string {
  const canonical = items
    .map((i) => `${i.questionId}\t${i.split}\t${i.verdict}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export function parseGolden(jsonl: string, builtAt = ""): GoldenSet {
  const items = jsonl
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as GoldenItem);
  return { hash: hashItems(items), builtAt, items };
}

export function serialiseGolden(items: GoldenItem[]): string {
  return items.map((i) => JSON.stringify(i)).join("\n") + "\n";
}

export function loadGolden(path = GOLDEN_PATH, metaPath = GOLDEN_META_PATH): GoldenSet | null {
  if (!existsSync(path)) return null;
  const meta = existsSync(metaPath)
    ? (JSON.parse(readFileSync(metaPath, "utf-8")) as { builtAt?: string; hash?: string })
    : {};
  const set = parseGolden(readFileSync(path, "utf-8"), meta.builtAt ?? "");
  if (meta.hash && meta.hash !== set.hash) {
    throw new Error(
      `Golden set hash mismatch: meta.json says ${meta.hash}, contents hash to ${set.hash}. ` +
        `The set was edited without rebuilding — earlier baselines are no longer comparable. ` +
        `Re-run scripts/build-golden-set.mjs and re-baseline, or restore the file.`
    );
  }
  return set;
}

export function bySplit(set: GoldenSet, split: GoldenSplit): GoldenItem[] {
  return set.items.filter((i) => i.split === split);
}

// ── Stratified splitting ────────────────────────────────────────────────────────────────────────

/**
 * Assign splits, stratified by (paper × family × verdict).
 *
 * Stratification matters more than usual here because the bin rate varies by paper and family: a
 * random split can easily hand the holdout 30 negatives instead of 50, and the confidence interval
 * on bin-recall — already the binding constraint at ~50 — becomes uselessly wide.
 *
 * Deterministic given the same input order and seed, so rebuilding from an unchanged bank
 * reproduces the same set rather than silently reshuffling every question into a new split.
 */
export function assignSplits<T extends { paper: number; family: string | null; verdict: GoldenVerdict }>(
  items: T[],
  weights: { calibration: number; holdout: number; regression: number },
  rand: () => number
): (T & { split: GoldenSplit })[] {
  const strata = new Map<string, T[]>();
  for (const item of items) {
    const key = `${item.paper}|${item.family ?? "-"}|${item.verdict}`;
    const bucket = strata.get(key);
    if (bucket) bucket.push(item);
    else strata.set(key, [item]);
  }

  const total = weights.calibration + weights.holdout + weights.regression;
  const out: (T & { split: GoldenSplit })[] = [];

  // Sort strata keys so iteration order does not depend on Map insertion (i.e. on DB row order).
  for (const key of [...strata.keys()].sort()) {
    const bucket = strata.get(key)!.slice();
    // Seeded shuffle within the stratum.
    for (let i = bucket.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
    }
    const nCal = Math.round((bucket.length * weights.calibration) / total);
    const nHold = Math.round((bucket.length * weights.holdout) / total);
    bucket.forEach((item, i) => {
      const split: GoldenSplit =
        i < nCal ? "calibration" : i < nCal + nHold ? "holdout" : "regression";
      out.push({ ...item, split });
    });
  }
  return out;
}

// ── Health checks ───────────────────────────────────────────────────────────────────────────────

export interface GoldenHealth {
  ok: boolean;
  counts: Record<GoldenSplit, { total: number; bin: number; keep: number }>;
  warnings: string[];
}

/** Below this many negatives, the CI on bin-recall is too wide for the split to gate anything. */
export const MIN_HOLDOUT_NEGATIVES = 40;
export const SYNTHETIC_FLOOR_SIZE = 20;

export function checkGoldenHealth(set: GoldenSet): GoldenHealth {
  const splits: GoldenSplit[] = ["calibration", "holdout", "regression", "synthetic_floor"];
  const counts = Object.fromEntries(
    splits.map((s) => {
      const items = bySplit(set, s);
      return [
        s,
        {
          total: items.length,
          bin: items.filter((i) => i.verdict === "bin").length,
          keep: items.filter((i) => i.verdict === "keep").length,
        },
      ];
    })
  ) as GoldenHealth["counts"];

  const warnings: string[] = [];
  if (counts.holdout.bin < MIN_HOLDOUT_NEGATIVES) {
    warnings.push(
      `Holdout has ${counts.holdout.bin} negatives (< ${MIN_HOLDOUT_NEGATIVES}). The 95% CI on ` +
        `bin-recall will be too wide to gate on — the judge stays advisory until the label base grows.`
    );
  }
  if (counts.synthetic_floor.total !== SYNTHETIC_FLOOR_SIZE) {
    warnings.push(
      `Synthetic floor has ${counts.synthetic_floor.total} items, expected ${SYNTHETIC_FLOOR_SIZE}. ` +
        `This split is the only objective check on the judge; it must not be short.`
    );
  }
  if (counts.synthetic_floor.keep > 0) {
    warnings.push(
      `${counts.synthetic_floor.keep} synthetic-floor items are labelled 'keep'. Every floor item ` +
        `is deliberately corrupted and must be labelled 'bin'.`
    );
  }
  const ids = set.items.map((i) => i.questionId);
  if (new Set(ids).size !== ids.length) {
    warnings.push("Duplicate questionIds — an item in two splits leaks the holdout into calibration.");
  }

  return { ok: warnings.length === 0, counts, warnings };
}
