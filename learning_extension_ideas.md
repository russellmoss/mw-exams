# Learning Extension Ideas — MW Exam Study App

Brainstormed 2026-05-29. Ideas for new study modes to add diversity, engagement, and
"fun" to the candidate's preparation, grounded in what the system has already learned
about optimizing for the MW practical.

## Where the app is today

The study app already nails the **full-rep loop** — the "simulate the real exam" pillar:

- Timed 8-minute answer writing (`StudyTimer`, `AnswerInput`)
- Pre-glass reasoning capture (`PreGlassReasoning`)
- Voice input (`MicButton`)
- LLM scoring (`evaluate-answer`, `evaluate-reasoning`, `evaluate-full`)
- Model-answer + wine reveal (`ModelAnswerReveal`, `WineReveal`)
- Decision-tree walkthrough (`DecisionTreeWalkthrough`)
- Attempt history (`save-attempt`, `HistoryView`, `SessionHistory`)

## The gap

Everything that **isn't a full rep**. Full mocks are expensive (8+ minutes, mentally
taxing), so a candidate only does a handful a day. The fun/diversity opportunity is in
the **short, high-frequency, low-friction drills** (30 seconds to 2 minutes) you'd do 50
times a session. The ideas below are grouped by the underlying muscle each one trains.

---

## 1. Memory & recall (currently zero of this)

### Spaced-repetition flashcards (SRS)
The single biggest gap. Auto-generate cards from existing artifacts — marker→variety,
region→climate/style signature, "STRONG SIGNAL phrases" from the heuristics doc. An
SM-2/FSRS scheduler surfaces cards just before they're forgotten. Highest-leverage,
most-proven study tech, and all the source content already exists.

### Confusable-pair drills
Sancerre vs. Marlborough Sauvignon Blanc, Barossa vs. Rhône Syrah, Mosel Riesling vs.
imitators, Chablis vs. Côte d'Or Chardonnay. Show the two side-by-side discriminators;
quiz "which marker breaks the tie." The exam lives in these tie-breaks.

---

## 2. Reasoning under the trees (fast, no writing)

### Stem Sniper (Layer-A quick-fire)
Show only the question stem — e.g. "Wines 1–4, single variety, ageability noted" — and
the candidate taps the plausible variety+region buckets **before any tasting**. ~30
seconds, instant scoring against the decision matrices. Trains the highest-ROI exam skill
(stems carry massive information) and is genuinely fun as rapid-fire.

### Interactive tree traversal as a branching quiz
Turn the existing `DecisionTreeWalkthrough` into a choose-your-own-adventure where each
node is a decision the candidate makes; a wrong branch shows what it would have led to.
Gamifies the master trees themselves.

### Reverse tasting
Pull a real tasting note from `data/wine_research/`, hide the wine, candidate deduces
variety+region. Closer to the real cognitive act than reading a stem.

---

## 3. Calibration (the secret weapon — system is uniquely set up for it)

### Confidence-calibration scoring
The whole system already speaks in three tiers (STRONG / PLAUSIBLE / CURVEBALL). Make the
candidate assign a tier to every guess, then track a **Brier-style calibration score over
time**: are your "STRONG" calls actually right ~90% of the time? Most candidates fail by
over-committing to wrong answers or under-committing to right ones. This is the most
differentiated thing the app could build — no generic tool has the tier vocabulary baked
in.

---

## 4. Engagement / gamification layer (cross-cutting)

- **Daily Challenge + streaks** — one curated question a day, streak counter.
  Habit-formation is the real battle in a long study campaign.
- **Mastery heatmap** — paper × taxonomy-family grid that fills in as competence is
  proven (taxonomy + history data already exist to compute this). Visible progress
  motivates and shows where to study.
- **Adaptive weak-spot engine** — read `save-attempt`/history, over-serve the families
  and regions the candidate misses most. Turns history from a passive log into an active
  tutor.
- **XP / mark economy** — predict where the marks fall in a question ("how many marks for
  origin vs. quality?"), reflecting the real mark scheme.

---

## 5. Mode / medium diversity

- **Map mode** — drop the region on a map; links geography to climate→style. Different
  sensory channel, breaks monotony.
- **Audio / commute mode** — `MicButton` already handles input; add TTS output so stems
  and cards can be done hands-free on a commute. A big "found time" multiplier.

---

## Prioritization

| Mode | Exam leverage | Build effort | Net-new? |
|---|---|---|---|
| Confidence calibration scoring | ★★★★★ | Low–med (data exists) | Yes |
| SRS flashcards | ★★★★★ | Medium (needs scheduler) | Yes |
| Stem Sniper quick-fire | ★★★★☆ | Low | Yes |
| Mastery heatmap + adaptive | ★★★★☆ | Medium | Yes |
| Confusable-pair drills | ★★★★☆ | Low | Yes |
| Daily challenge + streaks | ★★★☆☆ | Low | Yes |
| Reverse tasting / map / audio | ★★★☆☆ | Med | Partial |

### Recommended starting sequence
1. **Stem Sniper** — cheap, fun, trains the #1 skill, validates the "short-drill" pattern
   the other modes would reuse.
2. **Confidence calibration scoring** — uniquely ours, trains the thing that decides
   pass/fail.
3. **SRS flashcards** — the daily-habit backbone.
