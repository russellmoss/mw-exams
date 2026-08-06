# Routing-Mechanics Sweep — POST-FIX audit, 2026-08-06

Companion to `routing_sweep_2026-08-06.md` (the baseline sweep and defect catalog D1–D8). This
report documents the fix pass applied the same day and the identical re-sweep run against the
edited trees. Raw post-fix records: `routing_sweep_2026-08-06_postfix_results.json`.

## What was changed

Three per-paper fix agents applied the defect classes to the master trees + family packs
(~125 edits: P1 40, P2 36, P3 49; changelogs preserved in the session scratchpad), followed by one
surgical residual round (18 edits) and a targeted verification. Highlights:

- **D4/D3 mechanical passes:** every leaf now contains the wines of the questions it cites;
  mis-filed evidence relocated (incl. four multi-country stems out of P2 "same country"); the
  Branch 6.2 answer-key misrecord corrected (2023_p2_q3 was a crossed grid); P3 factual errors
  fixed (Coutet, Cinsault/Mourvèdre pairings, 7.3's self-contradicted hierarchy rule).
- **New structure:** "same region, different varieties" sub-branches in P1+P2; P1 same-producer
  branch (Wachau ladder); P1 paired-grid home; P2 cross-country blend pointer (Branch 6.4 → F3);
  P2 gate signal 3 precedence rule + scope limit; P3 Branch 7.8 same-single-variety; P3 Branch 4
  vs 7.3 deciding gate; P3 rosé leaf; 7.1 fortified-default guard; 7.2 generalized from
  Grenache-locked to shared-lead-grape.
- **D7 knowledge back-fill, tier-disciplined:** ≥3 attestations → STRONG eligible, 2 → PLAUSIBLE,
  1 → CURVEBALL flag. NZ (the #1 missed country at 14/81), dry Alsace Muscat, Corvina/Valpolicella,
  Madeira pairs, Australian secondaries, Piedmont secondary whites/reds, rosé roster, and the P2
  named benchmark roster (Rioja Reserva/GR, mature Bordeaux blends, Shiraz commodity-to-benchmark,
  Beaujolais cru) in breadth leaves.

## Before → after (identical 162-question, 540-wine methodology)

| Metric | Baseline | Post-fix |
|---|---|---|
| Routed CLEAN | 130 (80%) | **152 (94%)** |
| AMBIGUOUS | 30 | **10** |
| UNROUTED | 2 | 0 |
| Wine MISS | 81 (15.0%) | **2 (0.4%)** after residual round¹ |
| — routing_bug | 52 | 0¹ |
| — knowledge_gap | 29 | **0** |
| Variety-hit | 86% | 97%+ |
| Region-hit | 85% | 96%+ |

¹ The re-sweep proper left 18 misses (3.3%), all routing bugs of one family — P2 breadth/mixed-bag
leaves not naming benchmarks the tree knew elsewhere (Rioja ×5, Gamay ×2, mature Bordeaux ×2, the
2014 Spain tour ×4 via a gate mis-route) plus three P1 stragglers. The residual round back-filled
all 18; a targeted verification re-routed the 8 affected questions and confirmed **all 16 remaining
missed wines contained with zero regressions** (2 of the original 18 were two slots of one wine
pair). Post-fix numbers in the table above reflect the verified state.

## Remaining known issues (documented, deliberately not chased)

1. **10 AMBIGUOUS stems remain** (2012_p1_q1, 2013_p1_q5, 2023_p1_q2, 2014_p2_q3², 2019_p2_q3,
   2025_p2_q2, 2014_p3_q2, 2017_p3_q2³, 2019_p3_q4, 2022_p3_q2) — most resolve to the right
   default and several are ambiguous by design (2018_p3_q2-class "hold until the glasses rule").
   ² fixed to CLEAN in the residual round's gate scope-limit, verified. ³ single-wine isolation:
   unroutable by design; graded AMBIGUOUS by the strict re-sweep, which is acceptable.
2. **Stale pack taxonomy tags** in P2 (2017_p2_q1, 2018_p2_q4, 2019_p2_q2, 2021_p2_q3 still carry
   F4 tags the master tree relocated). Covered by the §6.3 stem-wins rule; cosmetic.
3. **P1 method/style-dominant gate has no marks floor** — 2013_p1_q5 resolves via an in-text
   routing claim rather than a numeric threshold. One more attestation would justify a floor.
4. **Branch 6.1 tier disagreement** (Argentina/Uruguay differ between its country and variety
   leaves) — harmless, flagged for the next resynthesis.

## Caveats — read before trusting these numbers

- **This is an iterated in-sample audit.** The corpus was swept, the trees were patched from the
  miss list, and the same corpus was re-swept. The containment gain is partly *fitting*, by
  construction. What the post-fix numbers legitimately prove: the plumbing is now consistent —
  stems reach branches whose leaves contain their own cited history, gates and leaves agree, and
  the evidence lists are truthful. They do NOT prove better prediction on unseen exams.
- **The held-out re-validation was run same-day** on the one corpus the fix pass never touched —
  the 2000–2010 blind test (`era1_blind_rerun_2026-08-06.md`): unroutable stems 29% → 5%, variety
  top-3 52% → 58%, variety in-set 69% → 80%, country in-set 83% → 90%. The structural fixes
  transfer. The 2015–2026 LOYO folds can no longer be honestly held out (every year is now
  training material); the 2027 sit remains the next true holdout. The D7 tier additions were
  deliberately capped at PLAUSIBLE/CURVEBALL for thin attestation to limit overfit.
- Ground-truth variety/region for the 540 wines was inferred from wine names by the sweep agents;
  a handful of blend compositions are flagged as uncertain in the JSON.
