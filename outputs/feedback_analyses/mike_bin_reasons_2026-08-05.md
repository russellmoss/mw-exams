# Mike Juergens' bin-reason corpus, synthesized — 2026-08-05

**Source:** `bank_bin_reasons` (Neon) — 115 questions binned by Mike (user id 1) in the
Fill-the-Bank review pane, of which **67 carry reason tags and/or free-text notes** (written
2026-08-04/05). This is the concrete evidence behind his verbal "~30% of questions/answers are bad"
report. It had never been analyzed: the bin pipeline (`bank_bin_reasons`) is disconnected from the
feedback pipeline (`user_attempts.user_feedback` → feedback analyses → EK ledger), so these reasons
sat unread. His 51 typed in-app feedback items, by contrast, were all processed (22 accepted,
19 rejected, 10 partial).

**Context check:** the 2026-08-05 validator work (question rules, answer-content rules, key-resolver
sweep, citation gate) independently caught and quarantined several of the questions Mike binned for
`factually_wrong` — e.g. `gen_p2_F3_1785954883937` (Barolo+Mencía under a same-variety stem) and
`gen_p1_F7_1785953515356` (duplicate Chenins under a different-varieties stem). That class is now
covered. **The classes below are what the coded rules still don't see.** Tag totals: too_obscure 18,
not_realistic 8, duplicate_wine 7, too_easy 7, weak_stem 6, factually_wrong 5, too_hard 2,
wrong_marks 2, plus singletons.

---

## Class 1 — The stem discloses what the candidate should discern (≈10 bins; too_easy / not_realistic / weak_stem)

The most generalizable finding, stated by Mike five different ways:

> "the candidate should be able to discern contrasting approaches in the winery **without being told**" (`gen_p1_F5_1785957210763`)
> "too much info in the stem - e.g. a different approach to fermentation…" (`gen_p1_F5_1785951884693`)
> "the candidate would be expected to **discern** the quality differences, not be told that they exist in the question" (`gen_p2_F7_1785950399976`)
> "biological aging is a huge clue, the user should display mastery by identifying that by what's in the glass" (`gen_p3_F5_1785940030088`)
> "'very different approaches' is vague and too much info for an exam question" (`gen_p1_F5_1785951608542`)

**Principle:** a stem may constrain the universe (country counts, same/different variety) but must
not name the discriminator the marks are for. "Made using contrasting approaches to fermentation,"
"belong to different official quality categories," "with reference to the relative roles of
oxidation and biological ageing" — each hands over the axis the tasting is supposed to reveal.

**Detectability: HIGH (deterministic).** Stem-phrase patterns: `contrasting/different approach(es)
(in the winery|to fermentation|to maturation)`, `very different routes?/approaches`, `different
official quality (categories|levels|designations)`, `with reference to the (role of|relative roles
of) (biological ageing|oxidation)`, `handled very differently in the cellar`. F5/F6 stems are the
hot zone. → Candidate for a generation validator (`stem-discloses-discriminator`) + a
generation-prompt clause.

## Class 2 — No banker / curveball overload (18 too_obscure bins + explicit notes)

> "in a flight like this we would expect at least one **banker** that would take the user to the country of origin" (`gen_p1_F2_1785957386482`)
> "a flight like this would likely have a banker" (`gen_p2_F3_1785955048521`, `gen_p2_F4_1785954379395`)
> "three out of the four wines are curveballs, normally in a flight like this you would see one curveball, two at best" (`gen_p1_F3_1785957395608`)

**Root cause is known:** `validateBankerMinimum` exists at generation but **relaxes at attempt 4**,
and the bank worker's long retry budget reaches the relaxed tiers routinely — so the bank
accumulates bankerless flights that an interactive run would rarely produce. → Candidate fix: never
relax the banker check on the bank-generation path (`saveOpts.batchId` present), only interactively.

## Class 3 — Compare/contrast stems over wines that don't contrast (≈6 bins)

> "both wines were made by the same method, so no contrast" (`gen_p3_F7_1785881099613`)
> "wine 2 and 3 are both made with traditional method sparkling, so no contrast" (`gen_p3_F5_1785894043309`)
> "method in which sweetness has been achieved is the same in each pair, typically we would see contrast within a pair" (`gen_p3_F7_1785964980721`)
> "the method of production to make these two wines is identical so there's no compare and contrast… 16 marks, the most marks possible" (`gen_p3_F6_1785881213511`)
> "palo cortado and amontillado are almost indistinguishable in blind tasting because the process is so similar" (`gen_p3_F7_1785881111283`)

**Detectability: MEDIUM-HIGH (key-stage).** The stem signal is `compare and contrast the method`, or
per-wine "mechanism by which sweetness/sparkle was achieved" over N≥2 wines. The key already derives
`style_category`/`style_tokens` per wine — if all keyed styles/methods are identical, the question
is unanswerable as designed. → Candidate rule R9 (`contrast-without-contrast`, hard or strong-soft)
in question-rules.mjs.

## Class 4 — Producer/wine over-repetition, despite repeated feedback (7 duplicate_wine bins + notes)

> "please stop including weinbach gewurztraminer - **I have told you this at least three times**" (`gen_p1_F2_1785955666141`)
> "please stop using domaine weinbach, there are many other alsatian producers to choose from, I keep telling you this" (`gen_p1_F3_1785952980853`)
> "we are way overindexed on this seppeltsfield wine - I have never seen this at any MW event ever" (`gen_p3_F5_1785881237388`)
> "we are overindexing on vin jaune and ouillé wines in general" (`gen_p3_F6_1785940796475`)
> "comparing a rated white Burgundy against a non-rated white Burgundy, we've seen a few times now" (`gen_p1_F7_1785949705903`)

**Root cause:** producer-spread exists only as a review-pane *flag* (`producer_flags`) — generation
never excludes an over-used producer, so it keeps drawing Weinbach. This is also trust-corrosive in
a specific way: the user repeats an instruction and the system visibly ignores it. → Candidate fix:
hard-exclude producers over the over-used threshold in the generation prompt's wine selection (the
tally exists — `getProducerBaseCounts`), and consider a template-level dedup for repeated
contrast-shapes (rated-vs-unrated white Burgundy).

## Class 5 — Un-MW ask phrasings (8 not_realistic bins)

> "the exam would never ask 'how bubbles were created'" (`gen_p3_F7_1785964017240`)
> "exam would never ask 'official quality designation' - candidate would be expected to know and state this" (`gen_p3_F4_1785964281304`)
> "we wouldn't see question c on an exam, at best we would see 'discuss the role of yeast'" (`gen_p3_F2_1785964017222`)
> "this question would ask for variety identification" — an origin-only stem that skipped the variety ask (`gen_p2_F2_1785968458385`)

**Detectability: MEDIUM.** Some are phrase-listable ("how the bubbles were created", "official
quality designation/category" as an *ask*); the deeper pattern (what the IMW does/doesn't ask) is
EK material for the generation prompt, not a validator. → Candidates: small stem-phrase denylist +
EK entries; corpus-check "does any historical stem ever ask X".

## Class 6 — Marks misweighted for the flight's difficulty (wrong_marks + recurring in notes)

> "the points are weighted heavily against variety and country identification" on a mostly-curveball flight (`gen_p3_F5_1785878179723`)
> "too many marks awarded for variety where the variety is more obscure" (`gen_p2_F4_1785898861354`)
> "a couple of curveballs (3 and 4) so I would expect fewer marks (maybe 5) for variety and origin" (`gen_p2_F4_1785955036866`)
> "obscure wine is fine, but too many points for identifying variety and region - they would focus on other things, perhaps not even ask the variety" (`gen_p3_F5_1785878565496`)

**Principle:** on curveball-heavy flights the real exam shifts marks *away* from identification
toward style/quality/method. The generator currently assigns identification marks independent of
wine obscurity. **Detectability: MEDIUM** — curveball_level tags exist per question; a rule could
bound identification-mark share when curveball is high. Also EK material for the prompt.

## Class 7 — Singletons worth keeping

- "manzanilla doesn't belong in a paper 1" (`gen_p1_F4_1785957386487`) — paperScope validator
  missed a fortified wine in P1; check why (label phrasing) and pin a test.
- "stop saying 'significant residual sugar', either say nothing or say 'residual sugar' —
  'significant' is vague without context" (`gen_p3_F5_1785965440357`) — stem-wording lexicon point.
- "Chateauneuf is almost always a blend… question should read variety(ies)" (`gen_p2_F2_1785898647285`)
  — stem should say "variety or varieties" when a keyed wine is a blend (near-miss of the existing
  single-variety-blend soft rule; could upgrade to auto-repair the stem wording).
- "odd flight: three sparkling + one fortified — not sure what this tests" (`gen_p3_F5_1785881237388`)
  — flight-coherence, currently untested.

---

## Disposition

Filed as the missing half of Mike's feedback (the bin-reason corpus; his typed feedback was already
fully processed). Recommended order of attack, by leverage:

1. **Class 2** — stop relaxing the banker check for bank-path generation (small code change, kills
   the largest tag bucket at its source).
2. **Class 4** — hard-exclude over-used producers at generation (the Weinbach complaint is repeated
   and explicit; the tally infrastructure already exists).
3. **Class 1** — `stem-discloses-discriminator` validator + prompt clause (biggest writing-quality
   class, cleanly detectable).
4. **Class 3** — `contrast-without-contrast` key-stage rule (unanswerable-as-designed, same family
   as the existing hard rules).
5. **Classes 5/6** — EK entries + prompt guidance; small denylist where phrase-listable.

Each class cites its question IDs so `/feedback-analysis` can verify any individual item against the
10-year corpus before a rule ships.
