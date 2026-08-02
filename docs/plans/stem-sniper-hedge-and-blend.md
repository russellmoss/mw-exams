# Hedge & Blend — Stem Sniper multi-tag grapes and countries

Status: implemented (supersedes the original feature-build #5 / PR #11 draft)
Date: 2026-08-02

## Why this was rewritten

The first build of this feature (PR #10, `feature-request/5`) was cut before
"[feature-build #6] Two Marks, Not Three" landed on `master`, and was written against the
scoring model #6 deliberately removed.

#6 rewrote Stem Sniper to mark **exactly two axes — grape and country — and never region**:
a new `scoreStemSniper`, three verdicts (HIT / NEAR / MISS), one mark per wine, and a card
that tells the candidate outright that "Region isn't marked — country is enough."

The original Hedge & Blend built the opposite: multi-**origin** chips scored through the
legacy five-grade `scorePredictions`, where `HIT = variety + region` and
`NEAR = variety + country`. Region credit was its central premise.

Worse, the two would have merged *quietly*. `stem-scoring.ts` auto-merges clean — #6 appended
a new scorer while #5 edited the old one, so there is no textual overlap. Resolving the two
component conflicts by hand yields something that compiles and ships a card emitting
`{variety, region: "Barossa, McLaren Vale", regions: [...]}` into master's submit route, which
coerces `country ← p.region`. Comma-joined origins would be compared as a country string, and
every `varieties` / `varietyMode` / `leadVarietyIndex` code path would be dead for Stem Sniper
(only Reverse Tasting still calls `scorePredictions`).

The underlying idea is good and worth keeping. This document re-specs it on the two-axis model.

## What the feature is for

Two things candidates actually do that the drill currently cannot express:

1. **Hedging.** "It's Chenin or Riesling." That is real narrowing and deserves partial credit —
   but not full credit, because the candidate did not commit.
2. **Blend ranking.** Master already gives full grape credit for naming *any* component of a
   blend, so "it's a Bordeaux blend" scores exactly the same as "it's Cabernet-dominant".
   Declaring a lead grape lets a candidate prove the harder knowledge and be marked on it.

## Scoring rules

Each axis produces a **credit** in `[0, 1]` instead of a boolean.

### Grape axis

"Correct" keeps master's existing definition unchanged: the dominant grape, any listed
component, a conventional blend name (for blends), or — on Paper 3 — the style/method.
Synonyms and typos are tolerated exactly as before.

**Hedge ladder** (`grapeMode: "any"`, the default — chips are OR'd):

| Grapes tagged | Credit if one is correct |
|---|---|
| 1 | 1.0 |
| 2 | 0.75 |
| 3 | 0.5 |

Tagging is capped at 3, enforced **server-side** in the chip extractor — a crafted request
listing twenty grapes has everything past the third dropped, so a shotgun cannot buy credit.

**Lead blend** (`grapeMode: "blend"`, opt-in, requires ≥2 chips). The candidate marks one chip
as the lead: "these grapes, this one dominant". That is a commitment, not a hedge, so it is
**not** hedge-discounted:

| Situation | Credit |
|---|---|
| lead is the wine's dominant grape | 1.0 |
| lead is a genuine component, just not dominant | 0.75 |
| lead is absent, but another tagged chip is the dominant grape | 0.75 |
| none of the tagged chips is in the wine | 0 |

**Floor guarantee:** blend mode never scores below what plain hedging would have given the same
chips. Opting in can only help, so it is never a trap.

### Country axis

Same hedge ladder (1 / 0.75 / 0.5, capped at 3). Always OR — there is no blend concept for
origin. Each chip still resolves region → country, so being *more specific* than the country
continues to cost nothing.

### Per wine

```
points  = 10 × (grapeCredit + countryCredit) / 2
verdict = HIT  if both credits > 0
          NEAR if exactly one > 0
          MISS if neither
```

Round mark stays **1 per wine**. An unhedged, non-blend answer produces credits of exactly 1 or
0 and therefore scores byte-identically to today — this feature is strictly additive.

Prediction-to-wine assignment keeps master's best-first claim ordering, with the rank
generalised to `grapeCredit × 2 + countryCredit` (the same ordering as `(g?2:0)+(c?1:0)` when
unhedged).

## Interaction

The card's Grape and Country fields become chip inputs, designed so a candidate who never
notices the feature sees no change at all:

- **Plain typing still works.** Uncommitted text is auto-committed on submit, so typing one
  grape and hitting submit behaves exactly as it does today.
- **Comma commits a chip** — "Chenin, Riesling" is how people already write a hedge.
- **Backspace on an empty input** removes the last chip.
- **Enter still adds a wine row. Ctrl/⌘+Enter still submits.** No existing muscle memory
  changes; Stem Sniper is a speed drill and entry must not get slower.
- With ≥2 grape chips, an **"Any of these / Lead blend"** toggle appears. In lead-blend mode,
  clicking a chip makes it the lead.
- **The cost of hedging is shown live** next to the field label ("¾ credit", "½ credit").
  Making the trade-off visible *before* submitting is the whole pedagogical point — the drill
  should teach commitment, not quietly tax it.

Result read-out shows every chip with the matching one highlighted, the credit fraction when it
is less than full, and the Lead badge.

## Compatibility

- `grape` and `country` scalars stay populated (lead/first chip, and comma-joined) so the submit
  route's legacy coercion, `HistoryView`, and every stored `drill_payload` keep rendering.
- All new fields are optional. Attempts recorded before this change render with credit derived
  from the existing booleans.
- A legacy scalar `country` is treated as **one** chip and never split on its comma — otherwise
  a stored "Santa Barbara County, California" would retroactively read as a two-way hedge and
  lose a quarter of its credit.
- Reverse Tasting is untouched; it still uses the legacy `scorePredictions`.
