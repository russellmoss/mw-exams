# Adjudication — disputed factual claims, calibration run 2026-08-07

**Judge:** Gemini 3.1 Pro (cross-family) · **Split:** calibration, 60 real + 20 synthetic
**Golden hash:** `3be7665113dbfc58`

A *disputed* claim is one where the **human reviewer kept** a question and the **judge binned it**
while scoring `factual_accuracy ≤ 2`. Those are not judge errors until a person rules on them —
counting them as errors would disqualify a judge for out-performing its own reference. This file is
that ruling.

**17 disputed claims surfaced. 5 adjudicated so far against independent tier-1 sources.
All 5 uphold the judge.**

---

## Method

For each claim: what the generated question asserted → what the judge said → what independent
sources say → verdict. Sources are producer sheets, importers and trade references, never the
model's own recall. A claim I could not settle from sources is recorded `UNRESOLVED`, not guessed.

---

## 1. `gen_p1_F2_1785952980770` — **JUDGE RIGHT** ⚠️ most serious

**Generated:** `Thierry Germain, Saumur Blanc Les Memoires, 2021. Loire Valley, France. (13.5%)`
in a **Paper 1 (white-only)** flight.

**Judge:** *"Thierry Germain's 'Les Mémoires' is a renowned old-vine Cabernet Franc
(Saumur-Champigny), not a Saumur Blanc."*

**Sources:** Kermit Lynch lists *2022 Saumur-Champigny "Les Mémoires"* — Wine Type **red**, Blend
**Cabernet Franc**, Appellation **Saumur-Champigny**, 13.5%, aged 12 months in 2500L foudre.
Radford Dale and JJ Buckley concur; Lewin on Wine describes the parcel as 118-year-old Cabernet
Franc bush vines on the Dampierre plateau.

**Verdict: JUDGE RIGHT.** The wine does not exist as a white. A real cuvée name was welded to the
wrong colour and appellation — and the result is a **red wine in a white-only paper**, which is
also a scope violation `paperScope` should have caught but did not, because the label *says*
"Saumur Blanc". A validator reading strings cannot know the cuvée is red; only wine knowledge can.

---

## 2. `gen_p1_F1_1785882740206` — **JUDGE RIGHT**

**Generated:** `Felton Road Block 1 Riesling 2023. Central Otago, New Zealand. (13.0%)`

**Judge:** *"Felton Road's Block 1 Riesling is famously made in a sweet, low-alcohol Spätlese style
(typically around 8.5–9% ABV)."*

**Sources:** Wine Anorak's vertical notes give Block 1 Riesling at **8.5% alcohol, 67 g/L residual
sugar, TA 9.6 g/L** — the estate's deliberately sweet cuvée, distinct from their dry Riesling
(12%, "Trocken style").

**Verdict: JUDGE RIGHT.** 13.0% is not a plausible ABV for this wine; a candidate taught to expect
a dry 13% Block 1 would be actively mis-trained. (Noted separately: slot 1 of this flight is a
**Domaine Weinbach** — the producer the reviewer has asked three times to stop seeing.)

---

## 3. `gen_p1_F2_1785952815082` — **JUDGE RIGHT**

**Judge:** *"Contino Blanco is predominantly Viura, not Garnacha Blanca."*

**Sources:** Producer tech sheet (Arano/CVNE) 2019: **82% Viura / 18% Garnacha Blanca**. CVNE's own
site, 2021: **90% Viura / 10% Garnacha Blanca**. 67 Wine, 2020: **80% Viura / 20% Garnacha Blanca**.
Rare Wine Co.: *"made largely from Viura grapes… with the addition of a small amount of Garnacha
Blanca and Malvasia."*

**Verdict: JUDGE RIGHT.** Viura-dominant in every vintage on record. A model answer built on
Garnacha Blanca teaches the wrong dominant variety for a wine a candidate could plausibly meet.

---

## 4. `gen_p1_F3_1785857145757` — **JUDGE RIGHT**

**Judge:** *"Bordeaux Supérieur Blanc is an appellation strictly for semi-sweet wines, so a 'Blanc
Sec' cannot be Bordeaux Supérieur."*

**Sources:** Bordeaux.com (the regional body) lists **Bordeaux Supérieur** among *moelleux*
appellations, alongside Graves Supérieures and Premières Côtes de Bordeaux. Wine Folly: *"Bordeaux
Supérieur can only be used on bottles of dry red Bordeaux and **sweet** white Bordeaux."* Bordeaux
Wine Pilgrim and Wine Cellar Insider both describe Bordeaux Supérieur Blanc as sweet/moelleux only.

**Verdict: JUDGE RIGHT.** An appellation-rules error, not a taste judgement — the stated wine
cannot legally exist. (One historical wrinkle: "Y" d'Yquem was once labelled Bordeaux Supérieur as a
dry white. It is not the norm and does not rescue the generated wine.)

---

## 5. `gen_p1_F1_1785952580192` — **JUDGE RIGHT**

**Judge:** *"The model answer incorrectly attributes stainless steel fermentation to
Koehler-Ruprecht (which is famous for traditional large oak casks)."*

**Sources:** Bowler Wine: *"All wines are spontaneously fermented on their own yeasts and aged
**entirely** in large, neutral stück (1200L oval casks) and halbstück (600L)."* Flatiron:
*"Fermentation and aging in large, old, neutral oak barrels."* Grape Guru: *"matured in old large
wooden casks… no technical intervention."* The estate's own site: *"spontaneous fermentation in
wooden barrels."*

**Verdict: JUDGE RIGHT.** Not merely inaccurate — inverted. The estate's identity *is* the refusal
of stainless steel, and this is exactly the winemaking-inference mark an examiner would test.

---

## Running tally

| | count |
|---|---|
| Disputed claims surfaced (calibration) | 17 |
| Adjudicated | **5** |
| Judge right | **5** |
| Judge wrong | 0 |
| Unresolved | 0 |
| Outstanding | 12 |

## What this establishes

1. **The disputed bucket is not judge error.** Five for five, against producer sheets and importers.
   The remaining 12 should be worked through, but the prior is now strongly against the reviewer's
   labels on factual matters.
2. **The defect class is specific and checkable.** Every one is a *named-entity* fact — cuvée
   colour, appellation rules, ABV, dominant variety, vessel type. All are verifiable
   programmatically or from a knowledge base. That is exactly what Phase 5's claims registry
   targets, and it means the fix is engineering, not judgement.
3. **String-matching validators structurally cannot catch these.** "Saumur Blanc Les Memoires"
   passes `paperScope` because the label says *Blanc*. Only wine knowledge sees the problem.
4. **Do not tune the judge toward the human on `factual_accuracy`.** On this evidence that would
   train it to stop noticing true errors — and an automated bin-fix loop would do so silently.

## Next

- Adjudicate the remaining 12 (re-run calibration to regenerate the list — an earlier smoke run
  overwrote the report; filenames are now timestamped so it cannot recur).
- Run the holdout split for an estimate on questions never used for tuning.
- Convert the confirmed defect classes into deterministic checks where possible (ABV ranges by
  style, appellation → permitted colour/variety) per plan §8b.2.
