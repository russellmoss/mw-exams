import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  bankerSignalTable,
  parseBankerSignalTable,
  describePattern,
  renderBankerCalibration,
} from "@/lib/banker-signals";
import { isBanker, matchingBankerSignal } from "@/lib/question-validator";

/**
 * data/banker_signals.json is the single source of truth for banker vs curveball, and it is edited by
 * an automated pipeline: an upheld reviewer role ruling opens a PR against it. That makes it the one
 * data file in this repo a machine writes and a human only skims, so its integrity has to be a test
 * rather than a convention.
 *
 * Three things are pinned here:
 *   1. the file loads, every pattern compiles, and ids are unique — a signal that silently failed to
 *      compile would not error, it would make a benchmark wine read as a curveball and hard-reject
 *      every flight containing it;
 *   2. a malformed edit FAILS THE BUILD instead of degrading quietly;
 *   3. the calibration itself, on the wines a reviewer has actually ruled on. tests/flight-composition
 *      already pins the composition rule; this pins the table that feeds it.
 */

const ROOT_COPY = join(__dirname, "..", "..", "data", "banker_signals.json");
const PUBLIC_COPY = join(__dirname, "..", "public", "data", "banker_signals.json");

function wine(varieties: string[], region: string, country: string, fullText = "") {
  return { slot: 1, varieties, region, country, fullText: fullText || `${region} ${varieties.join(" ")}` };
}

describe("banker_signals.json — integrity", () => {
  it("loads, and every pattern compiles", () => {
    const table = bankerSignalTable();
    expect(table.signals.length).toBeGreaterThan(40);
    for (const s of table.signals) {
      expect(s.region).toBeInstanceOf(RegExp);
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      expect(s.source).toBeTruthy();
    }
  });

  it("has unique signal ids", () => {
    const ids = bankerSignalTable().signals.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * The prebuild copy is what a deployed build actually reads (scripts/sync-stem-data.mjs). If a PR
   * edits the root file and the copy is stale, production enforces the OLD calibration while every
   * test here passes against the new one — the exact class of drift this file exists to prevent.
   */
  it("the public/data copy matches the repo-root source of truth", () => {
    const root = JSON.parse(readFileSync(ROOT_COPY, "utf8"));
    const pub = JSON.parse(readFileSync(PUBLIC_COPY, "utf8"));
    expect(pub.signals).toEqual(root.signals);
    expect(pub.notCounted).toEqual(root.notCounted);
  });

  it("rejects a malformed edit loudly rather than dropping the signal", () => {
    expect(() =>
      parseBankerSignalTable({ signals: [{ id: "broken", region: "chablis(" }] })
    ).toThrow(/not a valid regex/);
    expect(() => parseBankerSignalTable({ signals: [{ region: "chablis" }] })).toThrow(/missing id/);
    expect(() => parseBankerSignalTable({ signals: [] })).toThrow(/non-empty array/);
    expect(() =>
      parseBankerSignalTable({
        signals: [
          { id: "dupe", region: "a" },
          { id: "dupe", region: "b" },
        ],
      })
    ).toThrow(/duplicate signal id/);
  });
});

describe("banker_signals.json — the calibration itself", () => {
  it("counts the textbook anchors as bankers", () => {
    expect(isBanker(wine(["chardonnay"], "Chablis", "France"))).toBe(true);
    expect(isBanker(wine(["sauvignon blanc"], "Marlborough", "New Zealand"))).toBe(true);
    expect(isBanker(wine(["nebbiolo"], "Barolo", "Italy"))).toBe(true);
    expect(isBanker(wine(["riesling"], "Mosel", "Germany"))).toBe(true);
    expect(isBanker(wine(["tempranillo"], "Rioja", "Spain"))).toBe(true);
  });

  it("keeps the reviewer-calibrated curveballs OUT", () => {
    // Each of these is in `notCounted` with a cited reason. tests/flight-composition.test.ts pins the
    // downstream rule; this pins the table, so a ruling PR that adds one shows up as a failure here.
    expect(isBanker(wine(["malbec"], "Mendoza", "Argentina"))).toBe(false);
    expect(isBanker(wine(["assyrtiko"], "Santorini", "Greece"))).toBe(false);
    expect(isBanker(wine(["savagnin"], "Jura", "France"))).toBe(false);
    expect(isBanker(wine(["xinomavro"], "Naoussa", "Greece"))).toBe(false);
    expect(isBanker(wine(["pinot noir"], "Marlborough", "New Zealand"))).toBe(false);
  });

  it("honours the colour veto on Châteauneuf-du-Pape", () => {
    expect(isBanker(wine(["grenache"], "Châteauneuf-du-Pape", "France"))).toBe(true);
    expect(
      isBanker(wine(["grenache blanc"], "Châteauneuf-du-Pape", "France", "Château Rayas Châteauneuf-du-Pape Blanc"))
    ).toBe(false);
  });

  it("does not let an unresolved variety veto a region match", () => {
    // The single largest source of false curveballs before it was fixed — an unknown grape is
    // SKIPPED, not treated as a failed gate.
    expect(isBanker(wine([], "Stellenbosch", "South Africa"))).toBe(true);
  });

  it("names which signal did the work", () => {
    expect(matchingBankerSignal(wine(["chardonnay"], "Chablis", "France"))?.id).toBe(
      "fr-burgundy-white-cotedebeaune"
    );
    expect(matchingBankerSignal(wine(["malbec"], "Mendoza", "Argentina"))).toBeNull();
  });
});

describe("rendering the calibration for the generator", () => {
  it("describes a pattern without regex syntax leaking into the prompt", () => {
    expect(describePattern(/\bsancerre\b|pouilly-?fume/)).toBe("sancerre / pouilly-fume");
  });

  it("renders every signal and every deliberate exclusion", () => {
    const text = renderBankerCalibration();
    const table = bankerSignalTable();
    expect(text).toContain("chablis");
    expect(text).toContain("DELIBERATELY NOT BANKERS");
    for (const e of table.notCounted) expect(text).toContain(e.label);
    // No unescaped regex metacharacters — the generator reads this as prose.
    expect(text).not.toMatch(/\\b/);
  });
});
