// duplicate-flight-fingerprint.test.ts — the insert-time duplicate-wine-set guards.
//
// Feedback (recurring fault cluster, 18 validated signals): the bank kept accumulating flights whose
// wine SET was byte-identical to an already-banked flight (twelve auto-sweep bins in three days), plus
// recurring two-wine sub-sets (SA Pinotage/Wolftrap, Meiomi/Ocio) users complained were "the same
// question again". The old controls — a post-hoc sweep and a per-wine recency cap — never PREVENTED
// the duplicate being written.
//
// The fix, exercised here as pure functions (no model call, no database):
//   1. computeFlightFingerprint + flightFingerprintRejection — inserting the same wine set twice
//      yields one row and a `duplicate_flight_fingerprint` rejection on the second.
//   2. winePairOverCap — a flight containing an already twice-used wine PAIR is rejected, while the
//      same wines used with different partners pass.
//   3. computeFlightFingerprint is order- and vintage-insensitive, and paper-scoped.
import { describe, it, expect } from "vitest";
import {
  computeFlightFingerprint,
  flightFingerprintRejection,
  wineCooldownId,
  FLIGHT_FINGERPRINT_SKIP_REASON,
} from "../src/lib/db";
import { winePairOverCap } from "../src/lib/question-engine";

const wine = (fullText: string) => ({ slot: 0, fullText });

const WOLFTRAP = wine("The Wolftrap, Syrah blend, Western Cape, South Africa (14%) 2021");
const PINOTAGE = wine("Kanonkop Pinotage, Stellenbosch, South Africa (14.5%) 2019");
const MEIOMI = wine("Meiomi Pinot Noir, California, USA (13.5%) 2021");
const OCIO = wine("Cono Sur Ocio Pinot Noir, Casablanca Valley, Chile (14%) 2019");
const SANCERRE = wine("Domaine C, Sancerre, Sauvignon Blanc, Loire, France (12.5%) 2021");

const idsOf = (wines: { fullText: string }[]) => wines.map((w) => wineCooldownId(w.fullText));

describe("(1) inserting the same wine set twice yields one row and a duplicate rejection", () => {
  it("the second insert of an identical wine set is rejected with duplicate_flight_fingerprint", () => {
    const banked = new Set<string>();

    // First insert: nothing banked yet → novel, so the row is written and its fingerprint recorded.
    const fp1 = computeFlightFingerprint(3, [WOLFTRAP, PINOTAGE]);
    expect(flightFingerprintRejection(fp1, banked)).toBeNull();
    banked.add(fp1);

    // Second insert of the SAME wine set (different order) → duplicate, rejected, nothing added.
    const fp2 = computeFlightFingerprint(3, [PINOTAGE, WOLFTRAP]);
    expect(flightFingerprintRejection(fp2, banked)).toBe(FLIGHT_FINGERPRINT_SKIP_REASON);
    expect(FLIGHT_FINGERPRINT_SKIP_REASON).toBe("duplicate_flight_fingerprint");

    // One row survived, not two.
    expect(banked.size).toBe(1);
  });

  it("a genuinely different wine set for the same paper is not rejected", () => {
    const banked = new Set([computeFlightFingerprint(3, [WOLFTRAP, PINOTAGE])]);
    expect(flightFingerprintRejection(computeFlightFingerprint(3, [MEIOMI, OCIO]), banked)).toBeNull();
  });
});

describe("(2) a flight with an already twice-used wine pair is rejected; different partners pass", () => {
  // The paper's banked flights: the SA Pinotage/Wolftrap pair co-occurs in TWO of them.
  const banked = [
    idsOf([WOLFTRAP, PINOTAGE]),
    idsOf([WOLFTRAP, PINOTAGE, SANCERRE]),
    idsOf([MEIOMI, SANCERRE]),
  ];

  it("rejects a third flight that reuses the twice-used pair", () => {
    expect(winePairOverCap(idsOf([WOLFTRAP, PINOTAGE, OCIO]), banked, 2)).toBe(true);
  });

  it("passes the same wines used with DIFFERENT partners", () => {
    // Wolftrap with a fresh partner, and Pinotage with a fresh partner — neither pair is over cap.
    expect(winePairOverCap(idsOf([WOLFTRAP, OCIO]), banked, 2)).toBe(false);
    expect(winePairOverCap(idsOf([PINOTAGE, MEIOMI]), banked, 2)).toBe(false);
  });

  it("a pair co-occurring only ONCE is under the cap and passes", () => {
    const once = [idsOf([MEIOMI, OCIO])];
    expect(winePairOverCap(idsOf([MEIOMI, OCIO, SANCERRE]), once, 2)).toBe(false);
  });

  it("a single-wine flight can never trip the pair cap", () => {
    expect(winePairOverCap(idsOf([WOLFTRAP]), banked, 2)).toBe(false);
  });
});

describe("(3) the fingerprint is order- and vintage-insensitive, and paper-scoped", () => {
  it("is identical regardless of wine ORDER", () => {
    expect(computeFlightFingerprint(2, [MEIOMI, OCIO])).toBe(computeFlightFingerprint(2, [OCIO, MEIOMI]));
  });

  it("collapses vintage (the same bottle in a different year is one wine)", () => {
    const a = computeFlightFingerprint(2, [
      wine("Meiomi Pinot Noir, California, USA (13.5%) 2019"),
      OCIO,
    ]);
    const b = computeFlightFingerprint(2, [
      wine("Meiomi Pinot Noir, California, USA (13.5%) 2021"),
      OCIO,
    ]);
    expect(a).toBe(b);
  });

  it("distinguishes the same wine set across different papers", () => {
    expect(computeFlightFingerprint(1, [MEIOMI, OCIO])).not.toBe(
      computeFlightFingerprint(2, [MEIOMI, OCIO])
    );
  });

  it("distinguishes a genuinely different wine set", () => {
    expect(computeFlightFingerprint(2, [MEIOMI, OCIO])).not.toBe(
      computeFlightFingerprint(2, [MEIOMI, SANCERRE])
    );
  });
});
