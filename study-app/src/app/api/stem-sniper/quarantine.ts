// Stem Sniper serve-pool quarantine.
//
// A banked question reaches a Stem Sniper drill through two serve paths — next/route.ts and the
// pickBankedDrill() in drill/produce.ts. Both already gate on the DB bank-review flag
// (review_state = 'kept'), so a reviewer-binned question is normally excluded there. This list is a
// code-level, belt-and-suspenders exclusion for individual banked questions that must NEVER reach a
// drill regardless of DB state — e.g. one a reviewer rejected for a design fault the answer-key
// derivation itself cannot see (the key is a per-wine variety/origin artifact; it has no view of a
// flight's curveball DENSITY).
//
// gen_p2_F2_1786071519959 — rejected in direct bank review (M. Juergens). A same-country Italy P2
// flight (Aglianico del Vulture · Gaglioppo/Cirò · Valpolicella · Montepulciano d'Abruzzo) with three
// of four wines at medium-or-hard identification difficulty against a single modest anchor (a standard
// Allegrini Valpolicella). Gaglioppo/Cirò is a zero-corpus identification target; the flight's
// curveball density exceeds the P2 budget and it carries no classified-level banker. The real exam's
// all-Italy precedents (2017 P2 Q2, 2023 P2 Q1) anchor each flight with a cold-call classic (Barolo,
// Chianti Classico Riserva) and test depth with at most one or two harder wines. Quarantined from the
// drill pool pending regeneration with a recognisable anchor.
//
// gen_p2_any_1780197953533 — rejected in direct bank review (M. Juergens). A same-variety two-wine F1
// flight whose mark allocation is structurally invalid: part a) 10 (shared) + part b) 2×7.5 + part c)
// 2×10 + part d) 2×10 = 65 marks, i.e. 32.5 marks/wine. The IMW rule is exactly 25 marks per wine
// (50 for a two-wine flight, per EK-0041), and it never uses fractional sub-part tariffs — the 7.5-mark
// part b) is both fractional and part of a 15-mark overrun. The answer-key derivation is a per-wine
// variety/origin artifact and has no view of a flight's total tariff, so this fault is invisible to
// serve-time key checks; quarantined from the drill pool pending regeneration with a valid whole-mark
// 50-total structure. (The submitter's personal remark about a third party is unrelated to question
// validity and is disregarded.)
//
// gen_p1_F2_1786319324532 — rejected in direct bank review (M. Juergens). A same-region P1 F2 flight
// built entirely around Rully (Côte Chalonnaise): a Rully Chardonnay against a Rully Aligoté. Neither
// wine functions as a banker — the shape a same-origin flight consistently honours is at least one
// wine the candidate can name from the glass alone (the corpus anchors same-region Burgundy flights on
// Côte d'Or classics: Meursault, Corton-Charlemagne, Puligny-Montrachet, or a Chablis 1er Cru). Rully
// has zero precedent as the ORGANISING PREMISE of a same-origin question, and both wines here sit at
// medium-high identification difficulty (Rully Blanc reads as a range of Chalonnaise/Mâconnais whites;
// Rully Aligoté is a high curveball in any practical context). That inverts the family's distribution:
// the identification marks (8 for region + 2×5 for variety) rest on a call effectively unreachable by
// most candidates. The answer-key derivation is a per-wine variety/origin artifact with no view of a
// flight's banker provision or curveball density, so this fault is invisible to serve-time key checks;
// quarantined from the drill pool pending regeneration with at least one clearly-anchored wine from a
// better-mapped appellation. (The submitter's personal remark about a third party carries no
// wine-content signal and is disregarded.)
export const STEM_SNIPER_QUARANTINE: string[] = [
  "gen_p2_F2_1786071519959",
  "gen_p2_any_1780197953533",
  "gen_p1_F2_1786319324532",
];
