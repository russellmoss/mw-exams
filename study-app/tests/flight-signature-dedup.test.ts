// flight-signature-dedup.test.ts — per-user FLIGHT-level dedup.
//
// Feedback cluster (cross-paper, 6 validated signals — fb_462/453/443 P1, fb_143/141 P3, fb_95 P2):
// identical flights re-served to the same user, including ones they already rejected. Per-question
// point fixes and wine-level reuse caps did not close it because the repeat is at the FLIGHT level and
// was never scoped to the individual user — a differently-worded question over the IDENTICAL keyed
// wine set is a new question_id, so the per-question "seen" ledger let it through.
//
// The fix is a stable per-flight signature = hash of (paper, family, sorted SET of keyed wine IDs),
// plus a per-user exclusion set (served in the last 90 days, or rejected EVER). Exercised here as pure
// functions — no model call, no database.
import { describe, it, expect } from "vitest";
import {
  computeFlightSignature,
  flightSignatureOfQuestion,
  buildExcludedFlightSignatures,
  FLIGHT_SIGNATURE_SERVED_WINDOW_DAYS,
  type GeneratedQuestion,
} from "../src/lib/db";
import { filterExcludedFlightSignatures } from "../src/lib/question-engine";

const wine = (fullText: string) => ({ slot: 0, fullText });

const CHABLIS = wine("Domaine A, Chablis 1er Cru, Chardonnay, Burgundy, France (13%) 2019");
const MEURSAULT = wine("Domaine B, Meursault, Chardonnay, Burgundy, France (13.5%) 2020");
const SANCERRE = wine("Domaine C, Sancerre, Sauvignon Blanc, Loire, France (12.5%) 2021");

// A minimal banked-row stand-in — filterExcludedFlightSignatures reads only paper/family/wines/metadata.
const q = (
  id: string,
  paper: number,
  family: string,
  wines: { slot: number; fullText: string }[],
  metadata: Record<string, unknown> = {}
): GeneratedQuestion =>
  ({ question_id: id, paper, family, wines, metadata } as unknown as GeneratedQuestion);

describe("computeFlightSignature", () => {
  it("is order- and vintage-independent over the wine SET", () => {
    const a = computeFlightSignature(1, "F1", [CHABLIS, MEURSAULT]);
    const b = computeFlightSignature(1, "F1", [MEURSAULT, CHABLIS]); // reversed order
    const c = computeFlightSignature(1, "F1", [
      wine("Domaine A, Chablis 1er Cru, Chardonnay, Burgundy, France (13%) 2015"), // different vintage
      MEURSAULT,
    ]);
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("distinguishes different papers and families", () => {
    const p1 = computeFlightSignature(1, "F1", [CHABLIS, MEURSAULT]);
    const p2 = computeFlightSignature(2, "F1", [CHABLIS, MEURSAULT]);
    const f2 = computeFlightSignature(1, "F2", [CHABLIS, MEURSAULT]);
    expect(p1).not.toBe(p2);
    expect(p1).not.toBe(f2);
  });

  it("distinguishes a genuinely different wine set", () => {
    const a = computeFlightSignature(1, "F1", [CHABLIS, MEURSAULT]);
    const b = computeFlightSignature(1, "F1", [CHABLIS, SANCERRE]);
    expect(a).not.toBe(b);
  });
});

describe("two distinct questions keying the identical wine set collide, and only one is served", () => {
  it("collides on signature and the second is filtered once the first is served", () => {
    // Two DIFFERENT question_ids (different stems) over the IDENTICAL keyed wine set.
    const q1 = q("gen_p1_F1_aaa", 1, "F1", [CHABLIS, MEURSAULT]);
    const q2 = q("gen_p1_F1_bbb", 1, "F1", [MEURSAULT, CHABLIS]);
    expect(flightSignatureOfQuestion(q1)).toBe(flightSignatureOfQuestion(q2));

    const pool = [q1, q2];
    // Nothing excluded yet → both are servable.
    expect(filterExcludedFlightSignatures(pool, new Set())).toHaveLength(2);

    // Serve q1: its signature joins the exclusion set. Now q2 (same wine set) is gone too.
    const excluded = new Set([flightSignatureOfQuestion(q1)]);
    expect(filterExcludedFlightSignatures(pool, excluded)).toHaveLength(0);
  });
});

describe("serving twice in a session returns different signatures", () => {
  it("the second serve cannot repeat the first flight's signature", () => {
    const first = q("gen_p1_F1_aaa", 1, "F1", [CHABLIS, MEURSAULT]);
    const second = q("gen_p1_F1_ccc", 1, "F1", [CHABLIS, SANCERRE]);
    const pool = [first, second];

    // First serve: pick the head of the still-eligible pool.
    const serve1 = filterExcludedFlightSignatures(pool, new Set())[0];
    const sig1 = flightSignatureOfQuestion(serve1);

    // Burn its signature (as the serve path does via question_views + the exclusion set) and re-pick.
    const excluded = new Set([sig1]);
    const remaining = filterExcludedFlightSignatures(pool, excluded);
    const serve2 = remaining[0];
    const sig2 = flightSignatureOfQuestion(serve2);

    expect(serve2).toBeDefined();
    expect(sig2).not.toBe(sig1);
  });

  it("prefers the stored signature over re-derivation when the row carries one", () => {
    const stored = q("gen_p1_F1_ddd", 1, "F1", [CHABLIS, MEURSAULT], {
      flightSignatureKeyed: "deadbeef",
    });
    expect(flightSignatureOfQuestion(stored)).toBe("deadbeef");
  });
});

describe("a rejected flight is never returned again — even after 90 days", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date("2026-08-09T00:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);

  it("served signatures age out of the window; rejected ones never do", () => {
    const excluded = buildExcludedFlightSignatures(
      [
        // Served only, WELL past the 90-day window → dropped.
        { signature: "served-stale", servedAt: daysAgo(FLIGHT_SIGNATURE_SERVED_WINDOW_DAYS + 100), rejected: false },
        // Served only, inside the window → excluded.
        { signature: "served-fresh", servedAt: daysAgo(10), rejected: false },
        // Rejected long ago and never served since → STILL excluded (no window on rejections).
        { signature: "rejected-old", servedAt: daysAgo(FLIGHT_SIGNATURE_SERVED_WINDOW_DAYS + 300), rejected: true },
        // Rejected and never served at all → still excluded.
        { signature: "rejected-never-served", servedAt: null, rejected: true },
      ],
      now
    );

    expect(excluded.has("served-stale")).toBe(false);
    expect(excluded.has("served-fresh")).toBe(true);
    expect(excluded.has("rejected-old")).toBe(true);
    expect(excluded.has("rejected-never-served")).toBe(true);
  });

  it("a rejected question is filtered out of the pool regardless of age", () => {
    const rejected = q("gen_p3_F5_zzz", 3, "F5", [CHABLIS, SANCERRE]);
    const excluded = buildExcludedFlightSignatures(
      [{ signature: flightSignatureOfQuestion(rejected), servedAt: daysAgo(400), rejected: true }],
      now
    );
    expect(filterExcludedFlightSignatures([rejected], excluded)).toHaveLength(0);
  });
});
