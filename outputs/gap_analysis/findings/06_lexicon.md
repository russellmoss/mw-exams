# 06 — Examiner Wording: Preferred vs Penalized Language

> Gap-analysis dimension: examiner WORD/WORDING preferences and distaste — the language examiners
> praise vs penalize — so (a) answer-FEEDBACK can flag disliked wording and (b) MODEL ANSWERS mimic
> preferred wording. Sources: `outputs/heuristics/examiner_report_synthesis.md`,
> `outputs/heuristics/grading_gap_analysis.md`, `outputs/heuristics/tasting_lexicon.md`,
> `mw_exam_empirical_knowledge.md` §2/§3. Live code: `study-app/src/lib/prompts/`.
> Feeds `mw_exam_guide.md` + `exam_gap_analysis.md`.

---

## 1. What the real exam rewards / penalizes in WORDING (preferred-vs-disliked inventory)

This is the examiner-cited language signal, stripped to the wording layer (not the reasoning layer —
funnelling/cascade live in finding-set elsewhere). Cited to report year.

### PREFERRED wording (examiners reward)

| Category | Preferred language | Source |
|---|---|---|
| **Deductive connectives — graded to evidence strength** | "suggests / points to / indicative of / consistent with" for likely-but-unproven; "confirms / reveals / underlines" only when conclusive | tasting_lexicon.md "deductive rule"; funnelling reports 2017/2025 |
| **Funnel argument verbs** | "what it might have been, but was not"; "I would expect to see…"; "this rules out X because…"; "zoomed in on / narrowed to" | synthesis §3 (2017, 2024) |
| **Contextualized-quality language** | named legal/official tiers — "Grand Cru Classé", "DOCG", "Prädikat / Beerenauslese", "VORS", "Cru Bourgeois" — as the quality vocabulary | Cardinal Rule 2 (2025); §1 Rule 2 |
| **Quality-ladder positioning** | "premium / mid-market / commercial" used WITH a benchmark, "at the top of its appellation", "communicate MW-to-MW where on the scale" | synthesis Rule 2 (2023); lexicon QUALITY dim |
| **Maturity precision** | concrete timeframes — "drink now to 2030", "will improve 3–5 years, hold a decade" — not "for many years" | Cardinal Rule 5 (2023) |
| **Conviction / engagement register** | decisive commitment ("this is X"), "genuine pleasure", "under the skin of the wine", effusive-but-earned praise of great wine | synthesis §3 (2018, 2022, 2025) |
| **Structural-first phrasing** | leading with "high acid, low alcohol, no MLF…" before naming | Rule 7 (2025); funnelling pt 1 |
| **Cross-referencing language** | "unlike wine 2…", "wine 3 opens the door to…", "in contrast to the flight" | synthesis §3 (2017, 2025) |

### DISLIKED / PENALIZED wording (examiners flag)

| Category | Disliked language | Source |
|---|---|---|
| **Unprofessional slang / colloquialism** | "stonking", "icon", "Goldilocks", "hippies, beatniks and bobos" | synthesis §4 (2018); empirical §2 L228–230 |
| **Empty intensifier labels** | "PREMIUM" / "LOWER PREMIUM" in caps, used as a catch-all without context | grading_gap §P3 (2019) |
| **Bare quality words** | "good", "very good", "good quality wine" with no context/tier (one candidate used "good quality" for all 12 → many zeros) | synthesis §2 Rule 2 (2021) |
| **Cut-and-paste sameness** | near-identical wording across wines; same technique on every wine ("cold soak on virtually every wine", "whole-bunch in every wine") | synthesis §4 (2023, 2024); Cardinal Rule 9 |
| **Phantom oak / mis-detection language** | asserting oak that isn't there (or missing obvious new oak) | synthesis §4 (2018, 2023); empirical §2 |
| **Over-claim / confirmation verbs on weak evidence** | "X confirms Y" / "definitely" / "obviously" where evidence only suggests | tasting_lexicon.md deductive rule; over-claim = funnel failure |
| **Rote commercial boilerplate** | "sell it in a steakhouse", "by-the-glass to affluent connoisseurs", generic food-pairing lists | Cardinal Rule 6 (2022–2024) |
| **Stem-restatement filler** | repeating info already given ("these are traditional method, deduced by…") | Cardinal Rule 7 (2023) |
| **Vague maturity** | "matured for many years", "aged well" with no timeframe | Cardinal Rule 5 (2023) |
| **Bullet-point arguments** | "bullet points rarely make for a strong argument" | synthesis §4 (2019) |
| **Misspelled wine words** | misspelled appellation/variety/producer names | grading_gap §P3 (2017, 2021) |
| **Theory-howler phrasings** | "Tawny aged in a solera", "Amontillado at 14.5%", "VDN at 20%", "Pouilly-Fuissé in the Loire", "Meursault Grand Cru" | synthesis §4; marking-principles howler rule |

---

## 2. What our system has

### A genuine, well-built DESCRIPTOR + deductive-REGISTER lexicon
- `study-app/src/lib/prompts/tasting-lexicon.json` — single source of truth, 275 terms. Two parts:
  - `dimensions`: descriptor palette keyed by COLOUR/FRUIT/ACIDITY/TANNIN/ALCOHOL/TEXTURE/STRUCTURE/QUALITY/MATURITY/OAK/NOSE.
  - `rhetoric`: POSITIVES, NEGATIVES, SUGGESTS (inference verbs), PROVES (confirmation verbs), ODDS_AND_SODS (connective nouns).
- `study-app/src/lib/prompts/tasting-lexicon.ts` — `buildTastingLexiconGuidance()` renders the palette + the **suggest-vs-confirm deductive rule** (the one true over-claim guard we have), with an explicit anti-word-salad guardrail.
- Source-of-truth chain is clean (memory `tasting-lexicon-system`): JSON → Neon `tasting_lexicon` table (live-editable, 5-min cache, JSON fallback) → `outputs/heuristics/tasting_lexicon.md` mirror for the `mock-answer-writer` agent. `scripts/sync-tasting-lexicon.mjs` keeps them in sync.

### Where it is actually wired
- **MODEL-ANSWER generation:** `study-app/src/app/api/generate-model-answer/route.ts:27-28` builds lexicon guidance from the Neon copy and injects it via `buildModelAnswerPrompt(..., lexiconGuidance)` (`model-answer-prompt.ts:72`). So the standalone generator DOES steer toward preferred descriptors + the deductive register.
- **Disliked-wording penalties** are scattered into the GRADER prose, not the lexicon:
  - `marking-principles.ts` covers cut-and-paste (Rule 9), over/under-quality-calling (Rule 3), rote commercial + food lists (Rule 6), stem-restatement (Rule 7), vague maturity (Rule 5), theory howlers (hard rule), and a "Professionalism" paragraph naming "stonking" and caps-"PREMIUM".
  - `funnelling.ts` covers snap-call / shoehorn / hedging-without-committing.

### What's MISSING from the lexicon itself
- **No dedicated DISLIKED/penalized wording list.** The JSON has no `disliked` / `banned` block. NEGATIVES is a *valid* negative-quality register ("hollow, flabby, dull") — i.e. legitimate descriptors — NOT a list of phrases to avoid. There is no machine-usable list of {stonking, icon, Goldilocks, caps-PREMIUM, "good quality", steakhouse boilerplate, "matured for many years", "definitely/obviously", bullet points, phantom-oak phrasing}.
- **No preferred ARGUMENTATION / connective vocabulary beyond descriptors.** SUGGESTS/PROVES are deductive verbs, but there is no curated set of funnel connectives ("what it might have been but was not", "this rules out…", "unlike wine 2…", "I would expect…") or contextualized-quality phrasings (named-tier templates). The argument-wording layer lives only as prose in the reports, not as a reusable palette.

---

## 3. Meaningful gaps (prioritized, honest)

### HIGH — The FEEDBACK prompt never receives the lexicon and has no wording-detector pass
`answer-evaluation-prompt.ts` is built from `MARKING_PRINCIPLES` + `FUNNELLING_PRINCIPLE` only —
**the tasting lexicon is never injected into the grader** (`buildTastingLexiconGuidance` is imported
only by `generate-model-answer/route.ts`). Consequences:
- The disliked-wording signals exist in `MARKING_PRINCIPLES` as scattered prose, but there is **no
  explicit "scan the candidate's wording" instruction** telling the grader to surface them as a named
  feedback item. Cut-and-paste, over-claim verbs ("confirms" on weak evidence), "good quality",
  caps-PREMIUM, phantom oak, steakhouse boilerplate, and vague-maturity phrasing can all slip through
  unflagged because the grader is oriented around marks-per-sub-question, not a wording audit.
- The single most distinctive examiner wording penalty we DO encode — **over-claiming
  (confirmation-verb-on-suggestive-evidence)** — is taught to the *generator* (via the lexicon's
  deductive rule) but is **NOT** given to the *grader* as a thing to detect in the candidate's text.
  This is the highest-value gap: the asymmetry means we coach the model answer to avoid over-claim but
  never tell the candidate when THEY over-claimed.

### HIGH — No single source-of-truth WORDING lexicon; preferred-argument + disliked lists are fragmented
The wording knowledge is split three ways with no consolidation:
1. descriptor palette + deductive verbs → `tasting-lexicon.json` (generator only);
2. disliked-wording penalties → `marking-principles.ts` prose (grader only);
3. funnel/connective language → `funnelling.ts` prose + the report MDs (neither structured nor reusable).
There is no artifact a maintainer can edit in one place to change "which words examiners hate" or
"which connectives examiners reward", and no shared injection so generator and grader use the SAME
inventory. Result: drift risk and the HIGH gap above.

### MED — Model-answer generator inside the question-engine path skips the lexicon
`question-engine.ts:71` calls `buildModelAnswerPrompt(questionText, wines, paper)` **without** the
`lexiconGuidance` argument. Only the standalone `generate-model-answer` route passes it. So model
answers produced through the engine path get NO preferred-wording steering — inconsistent register
across the two generation paths.

### MED — No preferred-argumentation/connective palette for the generator
Beyond SUGGESTS/PROVES, the generator is not given the funnel connectives or named-tier
quality-phrasing templates examiners reward. It learns these only implicitly from the embedded report
synthesis prose. A small curated connective/quality-phrasing block would tighten register.

### LOW — `tasting_lexicon.md` mirror is descriptor-only
The agent-facing mirror (`outputs/heuristics/tasting_lexicon.md`) reflects only descriptors + the
deductive rule, so the `mock-answer-writer` Claude Code agent also lacks a disliked-wording list and a
connective palette. Fixed automatically once the JSON gains the new blocks and sync re-runs.

---

## 4. Recommendations

### A. Make the JSON the single source-of-truth WORDING lexicon — add two blocks `[whole-test]`
Extend `tasting-lexicon.json` (so it flows through sync → Neon → md mirror unchanged) with:

```jsonc
{
  "dimensions": { /* unchanged */ },
  "rhetoric":   { /* unchanged — SUGGESTS/PROVES/POSITIVES/NEGATIVES/ODDS_AND_SODS */ },

  // NEW — examiner-penalized wording (phrases/registers to AVOID and FLAG)
  "disliked": {
    "UNPROFESSIONAL_SLANG": ["stonking", "icon", "Goldilocks", "hippies", "beatniks", "bobos"],
    "EMPTY_LABELS":         ["PREMIUM (caps, no context)", "LOWER PREMIUM", "super-premium (no tier)"],
    "BARE_QUALITY":         ["good", "very good", "good quality wine", "nice", "decent"],
    "OVER_CLAIM":           ["definitely", "obviously", "clearly X", "confirms (on suggestive evidence)", "without doubt"],
    "VAGUE_MATURITY":       ["matured for many years", "aged well", "will age", "needs time (no window)"],
    "ROTE_COMMERCIAL":      ["steakhouse", "by-the-glass to affluent connoisseurs", "pairs well with red meat", "great with cheese"],
    "STEM_RESTATEMENT":     ["as stated in the question", "since these are traditional method (re-deriving a given)"],
    "FORMAT":               ["bullet-point arguments"]
  },

  // NEW — examiner-rewarded argument/connective vocabulary (beyond descriptors)
  "preferred_argument": {
    "FUNNEL_CONNECTIVES":   ["what it might have been, but was not", "this rules out X because",
                              "I would expect to see", "narrows to", "zoom in on", "consistent with X, not Y"],
    "CROSS_REFERENCE":      ["unlike wine 2", "in contrast to the flight", "wine 3 opens the door to",
                              "compared across the four wines"],
    "QUALITY_TIER_PHRASING":["at the top of its appellation", "name the legal tier (Grand Cru Classé / DOCG / Prädikat / VORS)",
                              "positioned MW-to-MW on the quality ladder", "premium relative to its peer group"],
    "MATURITY_WINDOW":      ["drink now to {year}", "will improve {n} years then hold {n}", "currently at {age}, peaking {window}"]
  }
}
```

Add `disliked` + `preferred_argument` to the `TastingLexicon` interface and to `sync-tasting-lexicon.mjs` (and the Neon table / md mirror).

### B. Build a wording-detector block for the FEEDBACK prompt `[grading]`
Add `buildLexiconCritiqueGuidance(lex)` to `tasting-lexicon.ts` that renders ONLY the `disliked` block
plus the over-claim rule, framed as a scan instruction, and inject it into
`answer-evaluation-prompt.ts` and the `evaluate-full` route. Draft instruction:

```
## Wording audit (scan the candidate's prose, report findings in feedback)
Flag examiner-penalized language explicitly, citing the offending phrase:
- Bare quality ("good"/"very good" with no tier or benchmark) — name the official tier they should have used.
- Over-claim: a confirmation verb ("confirms"/"definitely"/"obviously") on suggestive-not-conclusive
  evidence — show the suggest-register verb that fits the evidence strength.
- Unprofessional slang ("stonking", "icon") and caps catch-alls ("PREMIUM" without context).
- Rote commercial boilerplate (steakhouse, generic food-pairing lists) — "rarely rewarded" (2022–24).
- Cut-and-paste sameness across wines, phantom-oak assertions, vague maturity ("matured for many years"),
  and stem-restatement. Note each as a minor-to-moderate credibility deduction; do not over-weight any single one.
```
This complements (does not duplicate) `MARKING_PRINCIPLES` — that scores the substance; this names the
wording. The over-claim detector is the highest-value single addition.

### C. Steer the generator AWAY from disliked wording too `[answer-gen]`
Extend `buildTastingLexiconGuidance()` to append a short "avoid these registers" line sourced from the
`disliked` block, and a "prefer these connectives" line from `preferred_argument`. So the model answer
is positively steered (descriptors + connectives) AND negatively steered (no slang/boilerplate/over-claim) from ONE lexicon.

### D. Close the engine-path gap `[answer-gen]`
In `question-engine.ts:71`, pass `lexiconGuidance` into `buildModelAnswerPrompt` (fetch via
`getTastingLexicon()` as the route does) so both generation paths use identical register steering.

### E. Question-gen note `[question-gen]`
Lower priority, but the same `disliked` list can guide mock-EXAM and Stem-Sniper/Reverse-Tasting
generators to avoid seeding boilerplate stems and to model examiner-grade stem phrasing. Reuse the
single lexicon rather than re-encoding.

**Consolidation summary:** one JSON (`tasting-lexicon.json`) becomes the source of truth for THREE
wording layers — preferred descriptors (have), preferred argument/connectives (new), disliked phrases
(new) — and that one artifact feeds BOTH the generator (steer toward/away) and the grader (detect &
flag), via the existing sync → Neon → md pipeline. Today the lexicon feeds only the generator and only
the descriptor layer.
