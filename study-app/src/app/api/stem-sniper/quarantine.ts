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
export const STEM_SNIPER_QUARANTINE: string[] = ["gen_p2_F2_1786071519959"];
