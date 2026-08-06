# Scope: the Theory feature — write, grade, learn

**Date:** 2026-08-06
**Goal:** let a candidate sit a real past MW theory question under real exam time, get graded against
what the examiners actually demanded, **answered from today's industry reality rather than the state
of the world when the question was set**, and then study an annotated model answer that shows *which
examiner requirement each part discharges*.

**Non-goal:** generating new theory questions. The corpus holds 297 real ones and a candidate cannot
exhaust them. Generation is the hardest part of the practical system and buys nothing here.

**Non-goal:** a calibrated mark. No marked scripts exist. Bands stay indicative, permanently, and the
UI must say so on every verdict.

---

## 0. Ground truth (measured, not assumed)

**Corpus.** 297 questions, 2015–2026 (no 2020 exam). 243 have an examiner-derived rubric; **2015 and
2026 have no published examiners' report at all**, so 54 questions (18%) have no standard to grade
against. 189 rubrics come from a publisher text layer, 54 from transcribed page renders (2021–2022
reports were image-only PDFs).

**Model answers.** 243, one per rubric-backed question. Each carries `covers_core` — one entry per
core requirement, quoting it and naming the section that discharges it. **This is already the
"explain why it's good" data**; surfacing it is a rendering job, not a generation job.

**Claim provenance.** All 1,300 registered claims carry a verdict:

| paper | VERIFIED | IMPRECISE | WRONG | HEDGED | UNVERIFIED | NOT_A_CLAIM | time-sensitive |
|---|---|---|---|---|---|---|---|
| 1 viticulture | 30 | 8 | 1 | 0 | **83** | 2 | 13 |
| 2 vinification | 113 | 19 | 4 | 0 | 144 | 12 | 36 |
| 3 handling | **204** | 38 | 5 | 0 | 66 | 10 | 19 |
| 4 business | 84 | 5 | 1 | 80 | 76 | 56 | 20 |
| 5 contemporary | 151 | 14 | 1 | 0 | 67 | 26 | 24 |

**This table overturns the obvious retrieval design.** The intuitive split — "papers 1–3 are science
so use the KB, papers 4–5 are business so use the web" — is wrong in both directions:

- **Paper 1 is the WORST covered at 24% verified**, worse than any other paper. The KB is trial
  literature and appellation law; it does not hold textbook vine physiology (temperature cutoffs,
  soil pH bands, rootstock vigour groupings), and neither does any tier-1 web source.
- **Paper 5 is 58% verified**, better than papers 1 and 2, because health, policy and regulatory
  claims have excellent tier-1 sources (WHO, IARC, EUR-Lex, national health bodies).
- **Paper 3 is 63% verified** — the KB's true sweet spot.

**KB.** Neon project `wandering-feather-17026214`, tables `kb_chunk` (6,719), `kb_document` (882),
`kb_source` (27, of which 26 are tier-1). Retrieval layer exists at `study-app/src/lib/knowledge/`
with a gate (`context.ts`) whose own comment states the governing principle: *a corpus that answers
confidently outside its coverage is worse than no corpus.*

**What already ships.** `POST /api/theory/grade` is live (PR #40): rubric-anchored, streaming, band
enforcement from the IMW Student Guide durations, 404 on the no-rubric years. Blind-tested 4/4
including a purpose-built trap essay, on both Opus and the production Sonnet tier. **It has no
retrieval and no concept of time.**

**Time budget, authoritative from the IMW Student Guide.** Papers 1/2/4: 3 hours, 3 answers. Paper 3:
2 hours, 2 answers. **Paper 5: 3 hours, 2 answers** — 90 minutes per question, the only outlier.

---

## 1. The two-clock model (the core design decision)

Every question runs on two clocks and they must be graded separately.

- **The rubric clock**, frozen at the exam year. Define your terms; obey the command word; avoid
  these misreadings; argue rather than describe; take a position. **Structural, and it has not
  dated.** This is what the rubric encodes and it applies unchanged.
- **The world clock**, which is now. Market share, regulation, ownership, consumption, technology,
  health guidance. **Factual, and it moves.**

Grade structure against the rubric clock and facts against the world clock.

### 1a. Where naive two-clock breaks — and the fix

Adversarial review (council, 2026-08-06) found the model fails where **time invalidates the question's
premise, not merely its facts**. Two concrete failure cases, both real:

- **Forecast questions.** A 2016 question asking what the next decade holds is testing *ex-ante
  judgement*. A 2026 candidate answering with hindsight is not demonstrating the skill assessed.
  Crediting currency here rewards reporting, not reasoning.
- **Rubric conclusions reality has reversed.** A 2016 rubric may demand discussion of English
  sparkling wine's marginal climate and lack of reserve stocks. A 2026 candidate correctly says the
  climate is less marginal and reserves now exist. The rubric requirement and the truth now
  contradict each other, and an unaided grader will either penalise a correct answer or invent a
  justification.

"The grader says so rather than penalising" is not a policy — it is grader discretion wearing a
policy's clothes. The fix is to **preclassify every rubric requirement**, once, offline:

| class | meaning | grading effect |
|---|---|---|
| `evergreen` | structural or stable-science demand | applies in full, always |
| `year_bound` | content expectation tied to the exam year's world | applies, but a current-reality substitute is accepted |
| `superseded` | reality has overtaken it | excused; grader told explicitly not to require it |

This turns a judgement call into data, and it is auditable. Forecast questions get a fourth marker,
`ex_ante`, which puts the whole question in exam-year context and suppresses currency credit.

### 1b. The currency rule, tightened

Naive "credit the candidate for currency" is exploitable — **temporal laundering**: a candidate who
does not know a required point asserts it was "overtaken by events" and substitutes fresh, selective
examples. Worse, it erodes the adjacent-question protection this grader was blind-tested to have: a
fluent, current answer to the *wrong* framing becomes harder to fail once recency itself earns credit.

The rule is therefore asymmetric and must be stated that way in the prompt:

> **Currency can ADD credit. It can never EXCUSE a missing rubric requirement.**
> A requirement is excused only when it is preclassified `superseded` — never because the candidate
> says so.

### 1c. The unverified-claims symmetry rule

436 claims in our *own* model answers carry no tier-1 support. They are ordinary industry heuristics —
storage temperatures, dose rates, shipping durations — that no regulator publishes. If a candidate
writes the same heuristics and the grader demands tier-1 support, **we penalise candidates for facts
our own model answers rely on.** That is an indefensible double standard and it would surface as a
user revolt.

So retrieval is **asymmetric evidence**:

> Retrieval may **refute** a candidate's claim. It is never required to **confirm** one.
> Absence of a source is not evidence of error, and must never lower a band on its own.

The 112 time-sensitive flags tell us where drift concentrates, from data rather than guesswork.

---

## 2. Retrieval, routed per question — not per paper

The council rejected paper-level routing and is right: **papers are subject domains, not semantic
buckets.** A vinification paper carries questions about packaging economics; a contemporary-issues
paper carries questions about low-alcohol chemistry. Routing a chemistry question to the web because
of the paper it sits in buys latency and poor retrieval.

So the yield table in §0 is a **prior, not a router**. It tells us what to expect; the routing key is
the question's own semantics, decided per question (and where practical, per claim being checked):

| Claim/question shape | Source |
|---|---|
| Production technique, enology, viticultural trial data | KB |
| Appellation law, ageing minima, permitted varieties, yields | KB (INAO/disciplinari/consejos) |
| Regulation, health policy, statistics, trade | tier-1 web (EUR-Lex, WHO, IARC, OIV, gov) |
| Company/corporate fact | company primary source |
| Textbook vine physiology (temperature cutoffs, soil pH bands) | **often no tier-1 source exists** — expect abstention, do not penalise |

Reuse the gate discipline in `knowledge/context.ts` — retrieve where the corpus can speak,
**suppress** where it would return confident irrelevance — but write a theory-shaped gate, because
that file's heuristics key off practical question families and stem tokens theory questions lack.

Tier-1 web uses the domain allowlist already proven across 1,300 claims in
`.claude/agents/claim-verifier.md`. **Retained against the council's advice to cut web retrieval
entirely**: the measured evidence is that it works — Paper 5 reached 58% verified precisely because
WHO/IARC/EUR-Lex publish this material, better than the KB manages on viticulture. Gemini's failure
mode (SEO spam, paywalls, non-determinism) is what the allowlist exists to prevent, and it has held.
Its *complementary* suggestion is adopted below.

**Adopted from review:** ingest a focused set of annual industry reports (OIV statistical report, an
equivalent market report) into the KB, so the highest-traffic market facts resolve locally rather
than over the network.

### 2a. "Fails soft" — defined, because undefined it means silent misgrading

A retrieval failure must never quietly produce a normal band. Precisely:

- Retrieval error or timeout → the grader **abstains on factual checking**, grades structure only,
  and the response says so on its face.
- A specific claim cannot be adjudicated → abstain **on that claim**, lower stated confidence,
  never convert absence into a deduction (see §1c).
- The band is never silently degraded by an infrastructure failure.

---

## Implementation units

### Unit 0 — temporal classification of rubric requirements  *(prerequisite)*
Offline pass over all 243 rubrics tagging each requirement `evergreen` / `year_bound` / `superseded`,
and each question optionally `ex_ante` (forecast). Output `data/theory/rubric_temporal.json`. Seed
from the 112 time-sensitive claim flags.

**THE SUPERSEDED GATE (decided at eng review).** `superseded` is the only class that *removes* a
requirement from grading, so it is the only one that can quietly lower the standard for every future
candidate on that question. It therefore builds only if it carries a **tier-1 source showing the
world actually changed**; `evergreen` and `year_bound` need none. `scripts/build_rubric_temporal.py`
hard-fails on an uncited `superseded`, exactly as the quote gate fails an uncited requirement and the
claim gate fails an uncited VERIFIED. Most requirements are structural and evergreen, so the source
burden is small.
**Why first:** without it §1a is grader discretion, and Units 2–3 cannot be written honestly.

### Unit 0b — grading diff harness  *(moved early on council advice; scoped down at eng review)*
Both reviewers said you cannot evaluate temporal adjudication from JSON payloads, and that learner UI
can wait but operator tooling cannot. **Scoped to two files rather than an admin page**, following
the existing `tests/knowledge-retrieval.eval.test.ts` pattern:

- `study-app/tests/theory-grading.eval.test.ts` — the six adversarial cases in Unit 2. `.eval.test.ts`
  is already excluded from the build gate, which matters because these make live model calls.
- `study-app/scripts/theory-grade-diff.mjs` — run one essay through old-grader and new-grader, print
  verdicts, retrieved sources, and each rubric requirement with its temporal class, side by side.

Version-controlled, rerunnable, CI-capable. Promote to an admin page only if it is used constantly.

### Unit 1 — theory retrieval gate
`study-app/src/lib/theory/retrieval.ts`. Given a rubric, decide whether to retrieve, from which
source, and with what query. Domain-routed per §2. Returns passages plus a citation block.
**Test:** a p3 SO2 question retrieves; a p4 Prosecco-market question does not touch the KB; a
p1 physiology question retrieves appellation law but not vine-temperature thresholds.

### Unit 2 — two-clock grading prompt
Extend `theory-evaluation-prompt.ts` with the temporal section: rubric clock for structure, world
clock for fact, requirements rendered **with their Unit 0 temporal class**, the asymmetric currency
rule (§1b), the asymmetric evidence rule (§1c), and an explicit statement that the model answer is
dated to its exam year. Inject retrieved passages as a verification block (mirroring
`buildVerificationBlock` in the practical route).

**Tests — the harness must include the adversarial cases the council named, not just happy paths:**
1. *Currency credit* — an essay structurally identical to a known PASS but updated to 2026 reality
   must not lose marks and should gain a note.
2. *Temporal laundering* — an essay that omits an `evergreen` requirement and claims it was
   "overtaken by events" must still FAIL. This is the exploit; if it passes, the design is broken.
3. *Adjacent-question + current* — the original trap essay, updated with 2026 facts. It must still
   FAIL. Recency must not rescue a wrong framing.
4. *Unverifiable-but-standard* — an essay using ordinary industry heuristics with no tier-1 source
   must NOT be marked down for it (§1c).
5. *Ex-ante* — a forecast question answered with hindsight must be judged on reasoning, not outcome.
6. *Retrieval outage* — with retrieval stubbed to fail, the grader abstains on fact, grades
   structure, and says so; the band must not silently move.

### Unit 3 — wire into the route
`/api/theory/grade` calls Unit 1, passes to Unit 2, streams a `sources` frame alongside the existing
`meta` frame so the client can render citations.

**Store the full grading provenance per attempt** — retrieval snapshot, source URLs and their dates,
per-claim decisions, and which rubric requirements were treated as superseded. Without this, a
support question ("why did this grade change?") is unanswerable, and the same essay legitimately
grades differently on different dates as live facts move.

**Submit-lock and idempotency.** A retrieval-plus-grade pipeline on a 1,000-word essay can run 30–60s.
Streaming already prevents the appearance of a hang, but a double submit must be rejected rather than
doubling cost and corrupting state.

### Unit 4 — model-answer API + annotation payload
`GET /api/theory/answer/[id]`. Returns the answer body, its `covers_core` map (requirement →
section → examiner quote), and per-claim provenance from `claim_verification.json`: verified (+
source + tier), unsourced, or time-sensitive (+ exam year). **This is the "explain why it's good"
feature and the data already exists.**

### Unit 5 — provenance rendering
Verified figures show their source; unsourced figures carry a quiet marker; time-sensitive ones show
a staleness note. Without this the ledger knows something the page doesn't, and the candidate cannot
tell which numbers to trust.

### Unit 6 — UI: pick, write, submit
Question picker (year / paper / domain / free-text theme), timed writing surface at the real budget
(60 min; **90 for paper 5**), word counter against the band, dictation reusing the existing
normalizer. Follow `DESIGN.md` — Cellar system, PASS/BORDERLINE/FAIL verdict colours already defined.

### Unit 7 — UI: feedback and study
Streamed feedback beside the rubric so the candidate sees *what they were marked against*. Then the
annotated model answer with Unit 5's provenance. Verdict labelled indicative on every render.

### Unit 8 — persistence and history
Reuse `save-attempt` / `/history`. **Verified at eng review: `user_attempts` fits theory almost
unchanged** — `question_id` is text so `th_2024_p1_q3` fits, and `user_answer`, `answer_feedback`,
`pass_estimate`, `elapsed_seconds`, `input_method` map directly. `drill_payload` (jsonb) carries the
Unit 3 grading provenance. Likely no migration at all.

**Two hard requirements, both found at eng review:**

1. **Supply every NOT NULL column explicitly.** `mode`, `input_method`, `flagged` and `stem_detail`
   are all NOT NULL, and `stem_detail` is a purely practical concept with no theory meaning
   (use `mode='theory'`, `stem_detail='none'`). Project history records three production outages from
   exactly this class of omission; any migration must be idempotent.

2. **THE MODE GUARD — theory attempts must not pollute practical statistics.** Two readers aggregate
   `user_attempts` with no `mode` filter today:
   - `src/app/api/admin/users/route.ts:28` — `attempt_count` / `completed_count`
   - `scripts/sync-empirical-knowledge.mjs:190` — selects attempts carrying feedback and feeds them
     into `mw_exam_empirical_knowledge.md`, **the canonical reference for the PRACTICAL exam**

   Unfiltered, a theory attempt with user feedback would start rewriting practical guidance. This is
   the same failure the corpus separation prevents at the data layer (`th_` prefix, separate JSON,
   collision tests) — the guard simply never extended to the attempts table. Fix every reader, then
   **add a test that fails when a new unfiltered reader appears**, since the risk is recurrence.

### Unit 9 — the no-rubric years
2015 and 2026 (54 questions). **Settled product decision: never expose them.** They remain in the
source corpus only and are absent from the picker, grading route, ungraded modes, and static
appendices. Do not grade them on generic principles; that manufactures an authority that does not
exist.

---

## Risks

| Risk | Mitigation |
|---|---|
| **Temporal laundering** — currency used to excuse a missing requirement | §1b asymmetric rule + Unit 0 classes + test case 2. **The highest-severity risk in this design.** |
| **We penalise candidates for heuristics our own answers use** | §1c asymmetric evidence rule + test case 4 |
| **Two-clock confuses the grader** — currency read as error | Test case 1; blind harness on both model tiers |
| **Premise-invalidated questions** (forecasts, reversed conclusions) | Unit 0 `ex_ante` and `superseded` classes |
| **Silent misgrading on retrieval failure** | §2a — abstain and say so; never move the band quietly |
| **Non-reproducible grades** as live facts change | Unit 3 stores the retrieval snapshot with the attempt |
| **Live retrieval cost/latency** on every grade | Route per question (Unit 1); cache per question; OIV/market reports into the KB |
| **Time-sensitive facts decay silently** | Automated six-month temporal reclassification; any unverifiable supersession fails the refresh. |
| **Stale model answers** presented as current | Unit 5 staleness markers + exam-year banner |
| **436 unsourced claims invisible** to the candidate | Unit 5; de-emphasise unsourced figures visually, not merely annotate |
| Grader sycophancy | Already blind-tested; extend the harness rather than trusting it |

## Temporal refresh decision

**Settled product decision (2026-08-06): the system refreshes the temporal classification every six
months, with no human approval step.** The scheduled job reviews the temporally scoped requirements,
requires dated tier-1 evidence and an exact supporting quote before setting `superseded`, rebuilds
both grading payloads, runs the corpus and build gates, and commits only a fully verified result.
Missing credentials, retrieval failure, malformed model output, or unverifiable evidence fails the
job without changing the ledger.

## Sequencing

Revised after review. The original "retrieval + two-clock, then UI" was only half right: learner UI
can wait, **operator tooling cannot**.

1. **Unit 0** — temporal classification. Everything downstream depends on it and without it §1a is
   just discretion.
2. **Unit 0b** — internal review console. This is how Units 1–3 are judged at all.
3. **Units 1–3** — retrieval, two-clock prompt, route wiring. Validate against all six adversarial
   cases before proceeding.
4. **Units 4–5** — the study payload and provenance rendering.
5. **Units 6–8** — learner UI and persistence.
6. **Unit 9** — product decision, any time.

**Council review:** hardened 2026-08-06 against Codex (gpt-5.4) and Gemini (3.1-pro). Accepted:
temporal preclassification, the asymmetric currency rule, per-question routing, defined fail-soft,
grading provenance storage, internal-console-first sequencing, hiding the rubricless years. Rejected
with reason: cutting tier-1 web retrieval (measured evidence contradicts it — Paper 5 reached 58%
verified through exactly that path) and cutting unsourced figures from model answers (they are often
load-bearing; hedging one answer already cost it 230 words and required a rebuild).

---

## ENG REVIEW (2026-08-06)

### Decisions taken

| # | Decision | Chosen |
|---|---|---|
| 1 | Theory attempt storage | Same `user_attempts` table, `mode='theory'`, **plus a mode guard and a test that fails on any new unfiltered reader** |
| 2 | Unit 0b review console | **Eval test + CLI diff script**, not an admin page. Promote later only if used constantly |
| 3 | `superseded` classification | **Must carry a tier-1 source** or the build fails, matching the quote/coverage/claim gates |

### Architecture findings

- **A1 (9/10)** `user_attempts` has four NOT NULL columns theory has no natural value for — `mode`,
  `input_method`, `flagged`, `stem_detail` (purely practical). Supply all explicitly; any migration
  idempotent. Three prior production outages came from this class.
- **A2 (8/10)** Tavily is per-user BYOK, so **Papers 4-5 fact-checking silently vanishes for users
  without a key**. Not addressed in the plan. Under §2a this must abstain on fact, grade structure,
  and say so on the response — never a silent downgrade.
- **A3 (7/10)** Nothing owns caching. Listed as a risk mitigation, assigned to no unit. The same
  question is graded by many users; cache retrieval on `question_id` + a date bucket.
  **Assign to Unit 1.**
- **A4** Resolved by decision 3 above.

### Code quality

- **C1 (9/10) DRY, and it is about to get worse.** `api/theory/grade/route.ts` and
  `api/evaluate-answer/route.ts` already duplicate 14 concerns apiece: `requireApiKey`,
  `selectModel`, `withThinking`, `thinkingFrame`, the whole SSE `ReadableStream` scaffold,
  `text_delta` / `thinking_delta` handling, `logClaudeUsage`, dictation normalisation. Unit 3 adds
  `getKnowledgeContext`, `buildVerificationBlock` and `buildCitationBlock` to the theory route —
  every one of which the practical route already has.
  **Extract a shared `streamGradedResponse()` before Unit 3, not after.** Make the change easy, then
  make the easy change. Refactoring after Unit 3 means unpicking two copies instead of one.
- **C2 (7/10)** `theory-evaluation-prompt.ts` is 199 lines against `answer-evaluation-prompt.ts`'s
  68, and Unit 2 adds the temporal section. Split the rubric renderer from the prompt assembler
  before it becomes unreviewable.

### Performance

- **P1 (8/10)** `rubric.ts` parses and caches **985 KB of JSON per serverless instance** to serve a
  single-row lookup. Acceptable today; it is a cold-start cost, not a per-request one. Revisit if
  2015/2026 gain rubrics or the index passes ~2 MB — at which point move the lookup to Postgres,
  where the KB already lives.
- **P2 (8/10)** Retrieval sits on the user-blocking path: roughly 1-3 s for KB, 3-10 s for web, on
  top of grading a 1,000-word essay. This is the council's 30-60 s pipeline. Streaming already
  prevents the appearance of a hang; the submit-lock in Unit 3 prevents the double-submit that
  doubles cost. A3's cache is the real fix.
- **P3** No N+1 risk: one rubric lookup, one retrieval, one model call per grade.

### Test coverage plan

```
UNIT 0 — temporal classification              build_rubric_temporal.py
  |-- [GAP] superseded WITHOUT source        -> must FAIL the build      ** CRITICAL **
  |-- [GAP] superseded WITH tier-1 source    -> builds
  |-- [GAP] evergreen / year_bound no source -> builds (none needed)
  \-- [GAP] class not in the enum            -> must FAIL

UNIT 1 — retrieval gate                       theory/retrieval.ts
  |-- [GAP] p3 SO2 question                  -> KB retrieval fires
  |-- [GAP] p4 Prosecco-market question      -> KB NOT touched
  |-- [GAP] p1 appellation-law question      -> KB fires
  |-- [GAP] p1 vine-physiology question      -> abstains, no penalty
  |-- [GAP] no Tavily key (A2)               -> abstain on fact, say so  ** CRITICAL **
  \-- [GAP] cache hit on repeat question     -> no second call

UNIT 2 — two-clock prompt                     theory-grading.eval.test.ts  [->EVAL]
  |-- [GAP] currency credited                -> no mark lost, note added
  |-- [GAP] TEMPORAL LAUNDERING              -> must still FAIL          ** CRITICAL **
  |-- [GAP] trap essay + current facts       -> must still FAIL          ** CRITICAL **
  |-- [GAP] unsourceable-but-standard claim  -> NOT marked down (§1c)    ** CRITICAL **
  |-- [GAP] ex_ante forecast + hindsight     -> judged on reasoning
  \-- [GAP] retrieval stubbed to fail        -> structure-only, stated

UNIT 3 — route                                api/theory/grade
  |-- [GAP] provenance persisted             -> retrieval snapshot stored
  |-- [GAP] double submit                    -> second rejected
  \-- [GAP] 404 on 2015/2026                 -> already covered

UNIT 8 — persistence                          MODE GUARD
  |-- [GAP] theory excluded from admin attempt_count            ** CRITICAL **
  |-- [GAP] theory excluded from empirical-knowledge sync       ** CRITICAL **
  \-- [GAP] a new unfiltered reader          -> test FAILS on it ** CRITICAL **
-------------------------------------------------------------
GAPS: 22 paths need tests. 8 critical. 1 needs an eval suite.
```

### Failure modes with no test and no handling today

| Failure | Silent? | Covered by |
|---|---|---|
| Theory attempt rewrites practical empirical knowledge | **Yes — worst case here** | Unit 8 mode guard |
| Uncited `superseded` lowers the bar permanently | **Yes** | Unit 0 gate |
| Temporal laundering passes a hollow essay | **Yes** | Unit 2 case 2 |
| Candidate penalised for an unsourceable-but-standard claim | No, visible | §1c + Unit 2 case 4 |
| No Tavily key silently drops fact-checking | **Yes** | A2 -> §2a abstention |

### NOT in scope

- Theory question generation. 297 real questions exist; a candidate cannot exhaust them.
- A calibrated numeric mark. No marked scripts exist; bands stay indicative permanently.
- Rubrics for 2015 and 2026. No examiners' report exists to derive them from.
- The admin review console as a page (decision 2). Script first.
- Refreshing the temporal data on a schedule — still open, below.

### Parallelisation

| Lane | Units | Shared modules |
|---|---|---|
| A | 0 -> 0b | `scripts/`, `data/theory/` |
| B | 1 -> 2 -> 3 | `study-app/src/lib/theory/`, `prompts/`, `api/theory/` |
| C | 8 mode guard | `api/admin/`, `scripts/sync-empirical-knowledge.mjs` |

**A and C are independent and can run in parallel. B depends on A** (Unit 2 renders Unit 0's
classes). C is small, self-contained, and the one to do first regardless — the pollution risk exists
the moment any theory attempt is written.

### Still open

None. The final product decisions are: the 54 no-report questions are never shown, and temporal
classification is refreshed automatically every six months without human approval.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 3 design holes, all closed |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 8 issues, 8 critical test gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**CODEX/GEMINI:** two-clock premise failure, temporal laundering, paper-level routing, and the
unverified-claims double standard. All folded into §1a-1c and §2.
**UNRESOLVED:** 0.
**VERDICT:** ENG REVIEW COMPLETE — 3 decisions taken, 8 findings, 22 test paths specified (8
critical). Lane C (mode guard) lands first. Ready to implement.
