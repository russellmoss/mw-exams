# 08 — Plan Implementability Verification

Verifies `exam_improvement_plan.md` against the real code on `master` (2026-05-31). Per-phase: anchor
accuracy, buildability, threshold reality-check. (Phase 1 is docs-only and not in scope here; Phase 5
touches `pipeline-context.json` / agent MD only and is not code-verified beyond the shared sync question.)

---

## Phase 2 — single-question generation fixes `[question-gen]`

### Anchors correct?
- ✅ `question-engine.ts` generation loop, relax tiers: critical validators ~398–402, **important tier
  relax `attempt >= 6`** at 405–409, nice-to-have `attempt >= 4` at 412–418, violations concat 430–440,
  retry log line 447. **All match the plan exactly.**
- ✅ Wine shape `{ slot, fullText }` — `QuestionCandidate.wines` at `:43-51`; parsed at
  `parseGeneratedQuestion` (`:942-1028`, the `1.` / `2.` line parse at ~962). (Plan cited `:962` — correct.)
- ✅ `validateBankerMinimum` (`:809`), `validateFlightSize` (`:903`, ends `:924` — plan said "~924" ✓),
  `BENCHMARK_APPELLATIONS` (`:807`).
- ✅ `question-rules.mjs`: `detectCountryName` exists and returns **lowercased** names; `usa` (not
  `united states`). Plan's note "title-case before Set lookup" is correct and necessary. RuleWine shape
  (`{slot, varieties[], country, is_blend}`) matches `winesFromText` (`:258`).
- ✅ `question-generation-prompt.ts`: `paperScope` ternary at **222–226** ✓; `## MARK ALLOCATION RULES`
  block ✓; F4 quality-tier-cap **347–355** ✓. **Minor drift:** the plan says interpolate `markEmphasis`
  "right after the `## MARK ALLOCATION RULES` block (ends ~line 393)" — but MARK ALLOCATION ends ~393 and
  is immediately followed by a `## STYLE SUB-QUESTIONS` block (395–408). Insertion still works; just don't
  assume 393 is the end of guidance.
- ✅ Phase-2 `SUBQ_TYPE_RULES` + `OLD_WORLD`/`NEW_WORLD` are **byte-faithful ports** of
  `build_structured_corpus.py` `TYPE_RULES` (`:139-151`) and the world sets (`:55-63`). Verified
  label-by-label. MARK_TOKEN regex matches `:120`.

### Buildable as described?
- **R8 (mark type-mix):** Tractable — `questionText` only. One subtlety the plan glosses: the corpus
  `classify_subq` (`:154`) uses a **priority `primary` type** but also stores `type_hits` (all matches).
  The plan's "full-credit-per-hit" matches the `type_hits` semantics (correct), but ID-composite must be a
  **union over parts**, not a sum of per-type credits (summing double-counts a part hitting both
  variety_id and origin_id past 100%). Spell that out in the prompt or R8 will over-count.
- **R9/R10 deriving world/difficulty from a bare `{slot, fullText}`:** *Feasible but coarse, and the plan
  under-states how coarse R10's difficulty axis is.* World derivation via `detectCountryName` is fine
  (~good recall). **`harder = !BENCHMARK_APPELLATIONS.test(fullText)` is the weak link:** the regex covers
  only ~80 named appellations, so it **mislabels 63% of real anchor wines as "harder"** (see threshold
  check). The plan is honest that R9 *price* is a coarse proxy, but presents R10's "harder" derivation as
  if it were reliable ("coarse: non-benchmark ≈ harder"). In practice R10b/R10c precision is poor. Still
  *soft*, so not destructive — but the acceptance criterion "no P3/F5/F6 flight that is all-anchor" will
  rarely fire because almost nothing reads as an anchor under this proxy.
- **R9 (price):** Correctly scoped as advisory; the "every wine reads high" trigger will almost never
  fire (most wines fall through BENCHMARK), so it's near-inert — acceptable as a placeholder for Phase 3.
- Wiring into the relax loop (Step 2.5) is a clean mirror of `validateOriginDiversity`; the snippet's
  `{ valid: true, violations: [] as string[] }` shape matches the engine's uniform validator shape. ✅

### Threshold reality-check (real last-10 corpus, 112 distinct questions, 2015–2025)
- **R8a ID-composite ≤ 55%:** trips **40%** of REAL questions (median real share **44%**, mean 50%).
  Sane — the cap sits above the modern ~46% mean and flags under half. ✅
- **R8b "commercial present unless pure-ID":** trips **57%** of real questions (109 non-pure-ID). **TOO
  TIGHT** — the majority of authentic MW questions carry NO commercial sub-question (commercial is a
  paper-level ~13–21% share, not a per-question requirement). As written this soft rule fires on most
  questions → constant relaxation. **Fix: make it paper-level/advisory, or only warn when commercial AND
  style are both absent.**
- **R8c "style present unless pure-ID":** trips **51%** of real questions. Same problem, same fix.
- **R10a non-F2/F7 3+ flights all-single-world:** WARNs **29%** of real flights (16/56). Reasonable. ✅
- **R10b F1 with >2 harder wines:** WARNs **0/25** real F1 flights (ground-truth `curveball_level`).
  Clean — confirms F1 is banker-clean. ✅ (But under the BENCHMARK proxy this is noisy; see above.)
- **R10c F5/F6/P3 zero-harder:** **25%** under ground truth vs only **10%** under the plan's BENCHMARK
  proxy — the proxy *under-detects* because nearly everything reads as harder.

---

## Phase 3 — whole-test composition validator `[whole-test]`

### Anchors correct?
- ✅ `run_loyo.py` exports `extract_variety_from_text` (`:119`) and `extract_country_from_text` (`:177`) —
  the two extractors the plan reuses. (Also `extract_subregion_from_text` if needed.)
- ✅ `build_structured_corpus.py` has the helpers the validator would import/copy: `OLD_WORLD`/`NEW_WORLD`
  (`:55-63`), `MARK_TOKEN` (`:120`), `parse_mark_tokens` (`:124`), `TYPE_RULES`/`classify_subq` (`:139-158`),
  `split_subquestions` (`:161`), `world_of` (`:109`). All present.

### Buildable as described?
- ✅ Standalone Python validator reading a per-paper JSON of the `data/exams.json` shape is straightforward;
  all detection helpers exist and are import/copyable. The plan's self-test (emit real 2024 papers, expect
  mostly PASS) is the right validation strategy.
- ⚠️ **One real blocker for `--suite` and price:** `build_structured_corpus.py` imports the *enriched*
  `data/historical_wine_classification.json` + `data/quality_price_tier_analysis.json` for `benchmark_status`
  / `curveball_level` / `price_band` (`:195-196`). A freshly-*generated* mock paper has NONE of these
  fields — only `{slot, full_text}`. So the validator's curveball/price axes **must** fall back to the
  BENCHMARK proxy (which the plan already says: "if a `curveball_level`/`benchmark` field is provided … else
  fall back"). That fallback inherits the same 63%-false-harder noise from Phase 2. Acceptable for an
  advisory check, but the price axis (`high_price_share` bands in `whole_test_targets.json`) is effectively
  unmeasurable on a generated paper without price data — note it as "skipped unless provided."
- ✅ `.claude/agents/mock-exam-writer.md` + `.claude/commands/generate-mock-exam.md` edits are doc-only and
  feasible. (Not line-verified; they're prose targets.)

---

## Phase 4 — grading mechanics + wording lexicon `[grading]` `[answer-gen]`

### Anchors correct?
- ✅ **Both routes STREAM and assemble a server-side `fullText`.** `evaluate-answer/route.ts`: `fullText`
  accumulates in the `for await` loop, `stream.finalMessage()` at **`:72`** (plan ✓), `[DONE]` at `:87`.
  `evaluate-full/route.ts`: `fullText` loop, `finalMessage()` at **`:182`** (plan said "~181" ✓), `[DONE]`
  at `:198`.
- ⚠️ **Anchor drift (important):** the plan says "the inline system prompt in `evaluate-full/route.ts`,
  ~lines 40–115" — **correct**, evaluate-full builds its prompt **inline** (`:40-115`) and does NOT call
  `buildAnswerEvaluationSystemPrompt`. So Step 4.1/4.3's "append to the inline system prompt" is right for
  evaluate-full, but **`answer-evaluation-prompt.ts` is only used by `evaluate-answer`** — editing the
  builder covers evaluate-answer; evaluate-full needs the same text appended inline separately. The plan
  does say "and the inline system prompt in evaluate-full" — so it's covered, just confirm both edits land.
- ✅ `marking-principles.ts` contains BOTH HARD overrides the plan mechanizes: howler tips
  BORDERLINE→FAIL (`## Howlers and the borderline (a HARD rule)`, ~`:35`) and zero fabricated/cascade
  (`:45`). The override logic is grounded in real rubric text.
- ✅ Lexicon contract: `getTastingLexicon` (`db.ts:629`) buckets rows generically by `group_kind`/
  `category` — **DISLIKED/PREFERRED_ARGUMENT under `rhetoric` flow through unchanged.** `sync-tasting-
  lexicon.mjs` iterates `Object.entries(lex.rhetoric)` for both rows (`:42`) and MD (`:68`) — generic;
  `RHET_LABELS` at **`:47-53`** (plan ✓) falls back to the raw key if no label. `TastingLexicon` interface
  is `Record<string,string[]>` — adding keys does not break the type.
- ✅ `buildTastingLexiconGuidance` reads **hardcoded** keys (SUGGESTS/PROVES/POSITIVES/NEGATIVES/
  ODDS_AND_SODS) at **`:33-37`** (plan ✓) — it does NOT iterate, so new sub-keys are NOT auto-rendered in
  guidance. The plan's Step 4.3 explicitly extends this function to emit PREFERRED_ARGUMENT/DISLIKED lines
  — **correct and required.**
- ✅ `buildModelAnswerPrompt(questionText, wines, paper, lexiconGuidance?)` — the optional 4th param
  **already exists** (`model-answer-prompt.ts:47-52`); interpolated at `:72`. Engine path calls it WITHOUT
  the 4th arg at **`question-engine.ts:71`** (plan ✓). So AG-2 wiring is a clean add.
- ✅ AG-1: `model-answer-prompt.ts` imports only `FUNNELLING_PRINCIPLE` (`:3`), NOT `MARKING_PRINCIPLES` —
  so injecting it is a real, needed change. (evaluate-full already imports MARKING_PRINCIPLES; only the
  generator lacks it.)

### Buildable as described?
- **(b) Grading-override on a STREAMED response — does "parse fullText after the loop + emit corrective
  SSE" work?** **YES.** The prose has already been flushed to the client during the loop, but `fullText`
  is fully assembled server-side before `[DONE]`, and the controller is still open. Enqueuing one extra
  `data: {"override": …}` event *before* the existing `[DONE]` (evaluate-answer `:87`, evaluate-full
  `:198`) is exactly the pattern the existing `{ enriched }` event already uses (`:83` / `:194`). So the
  mechanism is proven by precedent. The plan is correct that the streamed prose can't be rewritten (it's
  gone) — the corrective banner is the right call. **Caveat:** the model must reliably emit the trailing
  ```json fence; defensive "skip silently if absent" is essential (plan says this ✓). The verdict
  override only fires when the JSON parses, so coverage depends on model compliance — acceptance should
  measure how often the fence is actually present.
- **(c) Lexicon new-block contract — will DISLIKED/PREFERRED_ARGUMENT surface?** **YES** through sync + DB
  + MD (all generic), and **YES** through guidance/critique **only because** Step 4.3 hand-edits the two
  builder functions that hardcode the keys. There is no place that would *reject* the new keys; the only
  risk is forgetting Step 4.3 (then they'd seed to Neon/MD but never reach a prompt). Contract is sound.

---

## Anchors that drifted
1. **Phase 2 prompt insertion point:** "after `## MARK ALLOCATION RULES` (~line 393)" — that block is
   immediately followed by `## STYLE SUB-QUESTIONS` (395–408). Insertion still valid; the "~393 = end of
   guidance" framing is slightly off. (Cosmetic.)
2. **Phase 4 evaluate-full `finalMessage()` at "~181"** is actually **`:182`** (off by one; harmless).
3. **Phase 4 "answer-evaluation-prompt.ts (and the inline system prompt in evaluate-full)"** — correct,
   but worth flagging that these are TWO separate edits (a shared builder + an inline string); evaluate-full
   does not import the builder. The plan covers it but a careless implementer could edit only the builder
   and miss evaluate-full.
4. **No hard line-number drift found** in the engine relax loop, the lexicon files, `getTastingLexicon`,
   `buildModelAnswerPrompt`, or the Python helpers — those anchors are accurate.

## Blockers / glossed difficulties
- **B1 (Phase 2, real):** R8b "commercial present" and R8c "style present" as written would WARN on
  **57% / 51%** of REAL last-10 questions — they encode a paper-level share as a per-question requirement.
  As soft rules they won't break generation, but they'll trip constantly and erode signal (and could push
  most generations to the `attempt>=6` relax tier, harming acceptance check #3 "relax loop isn't tripping
  constantly"). **Must loosen** (paper-level, or only warn when commercial AND style both absent).
- **B2 (Phase 2/3, glossed):** the `harder = !BENCHMARK_APPELLATIONS` difficulty proxy **mislabels 63% of
  real anchor wines as harder.** The plan flags R9-price as coarse but presents R10-difficulty as
  serviceable. R10b/R10c precision against the BENCHMARK proxy is low (R10c fires 10% vs 25% truth).
  Not a hard blocker (soft rules), but the acceptance criteria phrased around "harder-wine count" /
  "all-anchor" will be measuring noise. **Either widen the benchmark regex, or relabel R10 as advisory.**
- **B3 (Phase 3, glossed):** generated mock papers carry no `benchmark_status`/`curveball_level`/`price`
  fields (those come from the enriched JSONs the corpus builder imports), so the validator's curveball axis
  falls to the noisy BENCHMARK proxy and the **price axis is effectively unmeasurable** without supplied
  price data. The plan's "else fall back" covers curveball; price should be explicitly "skip unless
  provided."

## Threshold reality-check (summary table — REAL last-10, 112 questions / flights as noted)
| Rule | Proposed threshold | % of REAL questions that WARN | Verdict |
|---|---|---|---|
| R8a ID-composite | ≤ 55% (P1/P3), ≤60% (P2) | 40% (>55%); median real 44% | Sane |
| R8b commercial present | >0% unless pure-ID | **57%** | Too tight → loosen |
| R8c style present | >0% unless pure-ID | **51%** | Too tight → loosen |
| R10a non-F2/F7 3+ all-single-world | warn | 29% | Sane |
| R10b F1 >2 harder | warn | 0% (ground truth) | Sane (clean) |
| R10c F5/F6/P3 zero-harder | warn | 25% truth / 10% proxy | Proxy under-detects |
| harder proxy precision | !BENCHMARK | 63% of real anchors mislabeled "harder" | Noisy |

*Methods: ID-composite = union of parts whose `type_hits` intersect {variety_id, origin_id, vintage_id}
over question total marks. "harder" ground truth = `curveball_level ∈ {medium, high}`. Proxy = the
verbatim `BENCHMARK_APPELLATIONS` regex from `question-engine.ts:807`.*
