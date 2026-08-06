// flight-dedup.test.ts — the duplicate-wine cooldown + flight-signature dedup (feedback: recurring
// bin cluster "same wine reused across recently generated questions").
//
// Two guards, exercised here without a model call or a database:
//   1. EXACT-WINE cooldown — a specific bottle may not reappear inside the recent-question window.
//   2. FLIGHT-SIGNATURE dedup — the sorted set of (region, variety, style) triples may not repeat,
//      which catches "rated vs non-rated white Burgundy again" and same-region/same-variety repeats
//      even when the exact bottles differ.
//
// selectNovelFlight is the pure orchestrator that mirrors the inline policy in generateFreshQuestion:
// regenerate up to MAX_DEDUP_REGENERATIONS times on collision, then throw rather than emit a duplicate.
import { describe, it, expect } from "vitest";
import {
  flightSignature,
  wineCooldownId,
  wineRegionToken,
} from "../src/lib/db";
import { selectNovelFlight, MAX_DEDUP_REGENERATIONS } from "../src/lib/question-engine";

const wine = (fullText: string) => ({ fullText });

// A stable window of Burgundy whites the "recent questions" are built from.
const CHABLIS_A = wine("Domaine A, Chablis 1er Cru, Chardonnay, Burgundy, France (13%)");
const MEURSAULT_B = wine("Domaine B, Meursault, Chardonnay, Burgundy, France (13.5%)");
const SANCERRE_C = wine("Domaine C, Sancerre, Sauvignon Blanc, Loire, France (12.5%)");
const PULIGNY_D = wine("Domaine D, Puligny-Montrachet, Chardonnay, Burgundy, France (13.5%)");

const idsOf = (wines: { fullText: string }[]) => new Set(wines.map((w) => wineCooldownId(w.fullText)));

describe("region token extraction", () => {
  it("resolves the most specific appellation, not just the umbrella region", () => {
    expect(wineRegionToken(CHABLIS_A.fullText)).toBe("chablis");
    expect(wineRegionToken(MEURSAULT_B.fullText)).toBe("meursault");
    expect(wineRegionToken(SANCERRE_C.fullText)).toBe("sancerre");
  });
});

describe("exact-wine cooldown", () => {
  it("treats different vintages of one bottle as the same wine", () => {
    expect(wineCooldownId("Domaine A, Chablis 1er Cru, Chardonnay, France (13%) 2019"))
      .toBe(wineCooldownId("Domaine A, Chablis 1er Cru, Chardonnay, France (13%) 2020"));
  });

  it("selecting twice in a row does not reuse a wine id inside the recent window", () => {
    // First selection lands this flight; its bottles now occupy the cooldown window.
    const firstFlight = [CHABLIS_A, MEURSAULT_B];
    const recentWineIds = idsOf(firstFlight);

    // The second selection's model first redraws a bottle it just used, then produces a fresh flight.
    const drafts = [
      [CHABLIS_A, SANCERRE_C], // reuses CHABLIS_A → must be rejected
      [PULIGNY_D, SANCERRE_C], // novel → accepted
    ];
    const result = selectNovelFlight((n) => drafts[n], recentWineIds, new Set());

    expect(result.regenerations).toBe(1);
    for (const w of result.wines) {
      expect(recentWineIds.has(wineCooldownId(w.fullText))).toBe(false);
    }
  });
});

describe("flight-signature dedup", () => {
  it("two Chablis-Chardonnay + Meursault-Chardonnay flights collide on signature even with different bottles", () => {
    const flightA = [CHABLIS_A, MEURSAULT_B];
    const flightB = [
      wine("Domaine X, Chablis Grand Cru, Chardonnay, Burgundy, France (13.5%)"),
      wine("Domaine Y, Meursault 1er Cru, Chardonnay, Burgundy, France (14%)"),
    ];
    expect(flightSignature(flightA)).toBe(flightSignature(flightB));
  });

  it("a colliding signature triggers regeneration and then fails rather than emitting a duplicate", () => {
    const recentSignatures = new Set([flightSignature([CHABLIS_A, MEURSAULT_B])]);
    let calls = 0;
    // The model keeps returning the same (Chablis Chard + Meursault Chard) SHAPE with fresh bottles.
    const generate = () => {
      calls++;
      return [
        wine(`Producer ${calls}, Chablis, Chardonnay, Burgundy, France (13%)`),
        wine(`Estate ${calls}, Meursault, Chardonnay, Burgundy, France (13.5%)`),
      ];
    };
    expect(() => selectNovelFlight(generate, new Set(), recentSignatures)).toThrow(/non-duplicate flight/);
    // Initial draft + MAX_DEDUP_REGENERATIONS redraws, all colliding.
    expect(calls).toBe(MAX_DEDUP_REGENERATIONS + 1);
  });

  it("a flight sharing only one wine's region passes", () => {
    const recentSignatures = new Set([flightSignature([CHABLIS_A, MEURSAULT_B])]);
    // Shares the Chablis region with the recent flight, but the second wine is Sancerre Sauvignon.
    const candidate = [CHABLIS_A, SANCERRE_C];
    expect(flightSignature(candidate)).not.toBe([...recentSignatures][0]);
    const result = selectNovelFlight(() => candidate, new Set(), recentSignatures);
    expect(result.regenerations).toBe(0);
    expect(result.wines).toEqual(candidate);
  });
});
