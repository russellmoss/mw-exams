// anchor-pairing.test.ts — a banker is a VARIETY×ORIGIN classic, never a banker grape on its own.
//
// A Paper 1 reviewer fault cluster (10 validated signals — fb_433/434/435/438/440/441/451/461/468/483)
// all reduce to ONE mistake: the flight's variety is a "banker grape" (Riesling, Chardonnay, Sauvignon
// Blanc, Chenin) but EVERY origin is atypical for it, so there is no real anchor. Riesling from
// Austria + Canada with no Germany/Alsace; four Chardonnays with none of the origins classic, no
// Burgundy or Napa; three New World Sauvignon Blancs with no Old World; Chenin as Montlouis + two South
// Africans. The fix: banker status must key on (variety, region), so the grape alone never qualifies.
import { describe, it, expect } from "vitest";
import {
  matchesAnchorPair,
  matchingAnchorPair,
  flightAnchorPairingViolations,
  ANCHOR_PAIRS,
  type AuditWine,
} from "../src/lib/question-validator";
import "../src/lib/appellation-resolver";

const wine = (slot: number, w: Partial<AuditWine>): AuditWine => ({
  slot,
  varieties: [],
  region: "",
  ...w,
});

describe("matchesAnchorPair — the variety×origin pairing", () => {
  it("counts Marlborough Sauvignon Blanc as an anchor", () => {
    expect(
      matchesAnchorPair(
        wine(1, { varieties: ["Sauvignon Blanc"], region: "Marlborough", country: "New Zealand" }),
      ),
    ).toBe(true);
  });

  it("does NOT count a New Zealand Gewürztraminer as an anchor", () => {
    // Reviewer attempt #459: "the Gewurztraminer … pretty big curve balls for New Zealand". The grape
    // is fine, the origin is not classic for it — Gewürztraminer only anchors in Alsace.
    expect(
      matchesAnchorPair(
        wine(1, { varieties: ["Gewürztraminer"], region: "Gisborne", country: "New Zealand" }),
      ),
    ).toBe(false);
  });

  it("counts Riesling from the Mosel, but not from Okanagan (grape alone is not enough)", () => {
    expect(matchingAnchorPair(wine(1, { varieties: ["Riesling"], region: "Mosel", country: "Germany" }))).not.toBeNull();
    expect(matchesAnchorPair(wine(1, { varieties: ["Riesling"], region: "Okanagan Valley", country: "Canada" }))).toBe(false);
  });

  it("counts Chardonnay from Burgundy and Napa, but not from Marlborough", () => {
    expect(matchesAnchorPair(wine(1, { varieties: ["Chardonnay"], region: "Chablis", country: "France" }))).toBe(true);
    expect(matchesAnchorPair(wine(1, { varieties: ["Chardonnay"], region: "Napa Valley", country: "USA" }))).toBe(true);
    expect(matchesAnchorPair(wine(1, { varieties: ["Chardonnay"], region: "Marlborough", country: "New Zealand" }))).toBe(false);
  });

  it("ignores a stored banker role — only the pairing decides", () => {
    // fb_483: a Rolle from Provence was labelled a banker; the pairing does not exist, so it is not one.
    const flagged = wine(1, { varieties: ["Rolle"], region: "Provence", country: "France", role: "banker" });
    expect(matchesAnchorPair(flagged)).toBe(false);
  });
});

describe("flightAnchorPairingViolations — NO_ANCHOR_PAIRING", () => {
  it("fails a 4-wine same-variety Chardonnay flight with no Burgundy/Napa wine", () => {
    // fb_433 / fb_440: "four curveballs would be weird … we'd have at least one Burgundy or Napa."
    const flight: AuditWine[] = [
      wine(1, { varieties: ["Chardonnay"], region: "Casablanca Valley", country: "Chile" }),
      wine(2, { varieties: ["Chardonnay"], region: "Mendoza", country: "Argentina" }),
      wine(3, { varieties: ["Chardonnay"], region: "Marlborough", country: "New Zealand" }),
      wine(4, { varieties: ["Chardonnay"], region: "Adelaide Hills", country: "Australia" }),
    ];
    const v = flightAnchorPairingViolations(flight);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("NO_ANCHOR_PAIRING");
    expect(v[0].severity).toBe("hard");
  });

  it("passes a flight of Riesling Mosel + Riesling Okanagan (one classic pairing is enough)", () => {
    const flight: AuditWine[] = [
      wine(1, { varieties: ["Riesling"], region: "Mosel", country: "Germany" }),
      wine(2, { varieties: ["Riesling"], region: "Okanagan Valley", country: "Canada" }),
    ];
    expect(flightAnchorPairingViolations(flight)).toEqual([]);
  });

  it("does not over-reach onto a genuine Wachau/Kamptal Riesling pairing", () => {
    // The Wachau/Kamptal is a documented Riesling home, so this pair HAS an anchor and passes — the
    // rule fires on absent anchors, not on any New World wine sitting beside an Old World one.
    const flight: AuditWine[] = [
      wine(1, { varieties: ["Riesling"], region: "Kamptal", country: "Austria" }),
      wine(2, { varieties: ["Riesling"], region: "Okanagan Valley", country: "Canada" }),
    ];
    expect(flightAnchorPairingViolations(flight)).toEqual([]);
  });

  it("leaves single-wine questions untouched", () => {
    expect(flightAnchorPairingViolations([wine(1, { varieties: ["Rolle"], region: "Provence" })])).toEqual([]);
  });

  it("ANCHOR_PAIRS is a non-empty curated table", () => {
    expect(ANCHOR_PAIRS.length).toBeGreaterThan(10);
    for (const p of ANCHOR_PAIRS) expect(typeof p.label).toBe("string");
  });
});
