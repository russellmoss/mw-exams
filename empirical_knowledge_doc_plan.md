# Plan: `mw_exam_empirical_knowledge.md` — a living, evidence-cited knowledge base

**Status:** DRAFT for review · **Date:** 2026-05-30 · **Owner:** Russell

A design plan (no code yet) for a single cohesive document capturing everything we
know to be true — or very directionally correct — about the MW practical exam: how it's
built, how it's graded, how examiners think, and how that should shape our question/answer
generation. It is fed both by the **feedback ledger** in Neon and by the existing **agentic
research artifacts** already in the repo.

> Decisions locked in this round (from review):
> - **Auto-confirmed, no human gate.** Entries are written **live and confirmed** by Claude
>   (latest/most-powerful Opus) running inside GitHub Actions, using the `ANTHROPIC_API_KEY`
>   already configured in the repo for the code-change pipeline. No propose-only, no review
>   queue. Claude self-corrects via **supersession** when a new finding contradicts an old one.
> - **Always commit straight to `master`.** No PR, no branch. It's a document — the sync edits
>   it in place and pushes to master, exactly like the code pipeline pushes its merges.
> - **Triggers:** (A) **incremental — wired into `auto-feedback.yml`** as the primary, zero-latency
>   path; (B) **weekly consolidation cron**; (C) **manual `/sync-empirical-knowledge` command`**.
> - **Core insight driving (A):** an agentic auto-apply change *is itself evidence* that the exam
>   model had a gap — if a feedback item was right enough to change the code, the same learning
>   belongs in the knowledge doc. Code change and knowledge update are **one and the same event**.
> - **Scope this round:** design/plan only. Implementation phased afterward.

---

## 1. Goals & non-goals

### Goals
1. One canonical, readable document stating what we believe is true about the exam, each
   claim **cited** to its evidence (a ledger row, a corpus reference, a backtest stat, or an
   existing artifact).
2. A **living** doc: it absorbs new findings produced by the feedback loop over time, without
   manual re-typing.
3. A **trustworthy** doc: every entry carries a confidence tier and a `proposed`/`confirmed`
   status, so a one-off or hallucinated finding can't silently become "fact."
4. A reusable knowledge source for building future app features (question generation,
   grading, new study modes), and for onboarding future agents/contributors.

### Non-goals
- **Not** a re-derivation of work already done. The 30 examiner patterns, 8-family taxonomy,
  7 Cardinal Rules, master trees, and backtest reports already exist — this doc *synthesizes
  and cites* them, it does not copy them. (See §8 cross-ref index.)
- **Not** a per-question dump. The 112 decision matrices and 504 wine-research files stay
  where they are; this doc links to them.
- **Not** loaded into CLAUDE.md inline (token economy). CLAUDE.md *points* to it; agents read
  the relevant section on demand.

---

## 2. Location & CLAUDE.md integration

- **File:** `mw_exam_empirical_knowledge.md` at the **repo root** (domain knowledge, a
  first-class artifact — deliberately **not** inside `.claude/`, which is harness/agent config).
- **CLAUDE.md:** add a short pointer, e.g.:
  > *The canonical, evidence-cited summary of everything we know about the MW exam lives in
  > `mw_exam_empirical_knowledge.md`. It is the definitive guide for reasoning about the exam
  > and for generating questions/answers. Read the relevant **section** on demand — do not
  > load the whole file routinely (token economy).*
- Keep it out of any "never modify" list; it's a managed-output document.

---

## 3. Section structure

| # | Section | Source(s) | Living? |
|---|---------|-----------|---------|
| 0 | **How to use this doc** — provenance conventions, confidence tiers, live-vs-superseded, changelog | — | yes (changelog) |
| 1 | **Overall exam structure & creation** — paper composition, timing, mark structure, how flights are built | CLAUDE.md, methodology.md, composition analysis | rarely |
| 2 | **Examiner mindset & grading philosophy** — 7 Cardinal Rules, reasoning > ID, quality-in-context | `examiner_report_synthesis.md` | occasionally |
| 3 | **Answer grading guidelines** — mark allocation by question type, what earns vs wastes marks, ID→Quality shift | examiner reports, mw_write_pipeline_guidance.md | occasionally |
| 4 | **Wine selection & distribution by paper** — pricing/quality tiers, regional/variety/style distribution, curveball rates, diversity & composition guardrails | curveball/composition/diversity analyses, quality_price_tier_analysis | occasionally |
| 5 | **Question generation rules** — hard validator rules, 8-family taxonomy, composition guardrails; what makes a question valid | question-validator.ts, question_taxonomy.md, family_matrix_templates.md | yes |
| 6 | **Question-generation learnings from feedback** ← *living core* — what accepted/rejected feedback actually taught us | **Neon feedback ledger** | yes (primary) |
| 7 | **App bug catalog & postmortems** — symptom → root cause → fix → prevention | remediation plan, feedback ledger, git history | yes |
| 8 | **Cross-reference index** — pointers to authoritative artifacts (master trees, heuristics, backtests) | repo | rarely |
| 9 | **Open questions / hypotheses to validate** — explicit unknowns & low-confidence hunches | — | yes |

Notes:
- **§6 is the heart of the living doc** — it's where feedback findings accrue.
- **§7 (bug catalog)** is the "don't repeat our mistakes" registry; each entry pairs a bug with
  the test/validator that now guards against it (ties to `question_quality_remediation_plan.md`).
- **§9 keeps it honest** — a living truth-doc that never records what it *doesn't* know drifts
  into overconfidence.

---

## 4. Entry format

Every atomic claim is an **entry** with structured metadata, so automation can append, update,
and supersede cleanly, and so a human *can* skim/correct later even though nothing waits on review.
Proposed format:

```markdown
### EK-0142 · P3Q1 is sparkling in 100% of recent years
- **tier:** STRONG SIGNAL         <!-- content-signal confidence: STRONG SIGNAL | PLAUSIBLE | CURVEBALL | PROCESS -->
- **status:** live                <!-- live | superseded -->  (everything Claude writes is live)
- **section:** 4
- **added:** 2026-05-30 (sync: auto-feedback / analysis#318)
- **updated:** 2026-05-30
- **evidence:**
  - corpus: 2022–2025 P3Q1 all sparkling (outputs/heuristics/examiner_patterns.md #H17)
  - ledger: feedback_analyses#318 (accept) — user flagged a still wine in P3Q1 mock; code fix shipped @ commit abc1234
- **supersedes:** —
- **claim:** When generating Paper 3, slot Q1 should default to a sparkling wine; deviating
  needs a deliberate reason.
```

Conventions:
- **IDs (`EK-####`)** are stable and never reused.
- **`tier`** is *content-signal confidence* (how strong the exam signal is), **not** a review
  status — reuse STRONG SIGNAL / PLAUSIBLE / CURVEBALL, plus **PROCESS** for app/operational
  facts (§7) that aren't about wine. Claude self-assigns it. This stays because a CURVEBALL
  finding is real knowledge that's *low-confidence as a signal* — useful to mark even when live.
- **`status`** is only `live` or `superseded`. Everything Claude writes is `live` immediately
  (no propose/confirm gate). When a new finding contradicts an old entry, Claude writes the new
  one with `supersedes: EK-####` and flips the old one to `superseded` (kept for history, never
  deleted) — this is how the doc **self-corrects** without a human in the loop.
- **No uncited entries.** If Claude can't cite evidence (ledger row, corpus ref, backtest stat,
  or artifact), the finding goes to §9 (open questions / hypotheses), not into a content section
  as fact. This is the one guardrail that survives auto-confirm: live ≠ uncited.

---

## 5. Data sources

### 5a. The feedback ledger (Neon) — the new/living input
The sync reads resolved feedback and turns each into a candidate finding:

- `feedback_analyses`: `recommendation` (accept/reject/partial), `thread` (LLM reasoning),
  `apply_status`, `commit_sha`, `pr_url`.
- `user_attempts`: `feedback_status`, `feedback_admin_note`, `feedback_decided_by`,
  `feedback_reviewed_at`, joined to the question.
- `generated_questions` / `stem_answer_keys`: `invalid_reasons` (what the validator caught) —
  feeds §5 (gen rules) and §7 (bugs).

Rough query shape (to be finalized in implementation):
> "Give me every `user_attempts` row with `feedback_status` set and
> `feedback_reviewed_at > {last_sync}`, plus its linked `feedback_analyses`
> (recommendation, thread excerpt, apply_status)." → cluster → propose entries.

A small **sync cursor** (last-processed `feedback_reviewed_at`, stored in the doc's
front-matter or a `data/empirical_sync_state.json`) prevents reprocessing the same feedback.

### 5b. Existing artifacts — the seed + cross-refs
Seeded once and cited thereafter (not re-derived): `outputs/heuristics/*`,
`outputs/master_trees/*`, `outputs/backtest_reports/*`, `docs/methodology.md`,
`docs/mw_write_pipeline_guidance.md`, `question_quality_remediation_plan.md`.

---

## 6. Sync mechanism

A single shared core does the work; three triggers call it. The core runs **Claude (Opus) inside
the action via the Anthropic CLI**, the same way `auto-feedback.yml` already runs Claude for code
changes — reusing the existing `ANTHROPIC_API_KEY` repo secret.

```
scripts/sync-empirical-knowledge.mjs  (or a CLI Claude step driven by a brief)
  ├─ inputs: mode (incremental | consolidate), + for incremental: ANALYSIS_ID / verdict / thread / commit_sha
  ├─ read current doc (parse entries by EK-id) + sync cursor (cron/manual only)
  ├─ pull evidence: the resolved feedback item(s) from Neon (§5a) + relevant artifacts (§5b)
  ├─ Claude pass: turn findings into LIVE, cited entries; dedupe vs existing EK-ids;
  │              supersede any entry the new finding contradicts; route uncited findings to §9
  ├─ write entries into the right sections + update §0 changelog
  ├─ advance cursor (cron/manual)
  └─ commit the doc straight to master and push   (no branch, no PR)
```

### Trigger A — Incremental, wired into `auto-feedback.yml` (PRIMARY, zero-latency)
- Add a final step to the existing `auto-feedback.yml`, **after** deploy + `record-apply.mjs`.
- It already knows `ANALYSIS_ID` and has the analysis `thread`, the verdict, and the resulting
  `commit_sha`/`apply_status`. Pass those to the core in **single-item incremental mode**: "this
  feedback resolved this way and changed the code like so — record what it teaches us about the
  exam." Then commit the doc to master and push.
- **Runs on every resolved feedback item, regardless of outcome** (merged, PR-opened, *or*
  rejected) — a rejected-because-X is also a real learning. The knowledge is in the *finding*,
  not only in a successful merge.
- **No sync cursor needed here** — it processes the one item from this run.
- **Loop / deploy safety:** committing a root-level `.md` to master triggers nothing —
  `auto-feedback.yml` is fired by `repository_dispatch`, not by push, and git auto-deploy is
  disabled (`study-app/vercel.json`). The Vercel ignored-build-step is scoped to `study-app/`,
  so a root doc change wouldn't deploy even if auto-deploy were on. No loop, no extra build.
  (`[skip ci]` in the commit message is therefore unnecessary, but harmless if we add it.)
- **Ordering:** runs last so it never interferes with the code merge/deploy; the doc lands as a
  separate small commit right after.

### Trigger B — Weekly consolidation cron
- New workflow `.github/workflows/empirical-knowledge-sync.yml`, `schedule:` weekly.
- Runs the core in **consolidate mode**: re-clusters/merges near-duplicate entries, rewrites prose
  for cohesion, catches any feedback the incremental path missed (via the cursor), refreshes §0.
- Commits straight to master and pushes. (Same loop/deploy safety as above.)

### Trigger C — Manual `/sync-empirical-knowledge` command
- New `.claude/commands/sync-empirical-knowledge.md`.
- Runs the core on demand — `--consolidate` for a full pass, default incremental catch-up.
- Useful as an override and for the initial big sync after seeding.

---

## 7. Write & self-correction workflow (no human gate)

1. A trigger fires; Claude reads the resolved feedback (and/or backlog) + the current doc.
2. Claude writes **live, cited** entries directly into the right sections and pushes to master.
3. When a new finding **contradicts** an existing entry, Claude does not silently overwrite: it
   writes the new entry with `supersedes: EK-####` and flips the old one to `status: superseded`
   (kept for history). This is the doc's self-correction mechanism — it replaces human review.
4. Downstream agents treat all `live` entries as load-bearing; `superseded` entries are ignored
   except as history.

**What replaces human review:**
- **Mandatory citations** — `live ≠ uncited`. No evidence ⇒ §9 (open questions), not a fact.
- **Explicit supersession** — contradictions self-heal and stay auditable rather than thrashing.
- **Weekly consolidation** — the cron de-dupes and re-coheres, catching incremental-pass noise.
- **It's still a git doc** — every change is a diff on master; you *can* skim/correct/revert any
  time, but nothing blocks on you doing so. Trust is placed in Opus + citations + git history.

---

## 8. Seeding plan (initial content, day one)

Before any automation, seed each section from existing artifacts so the doc is useful
immediately. Seed entries are written `live` with their content tier (the existing heuristics,
Cardinal Rules, and validator rules are already verified research, so they seed at full
confidence; lower-confidence items seed as PLAUSIBLE/CURVEBALL):

- **§1** ← CLAUDE.md exam overview + `docs/methodology.md` (Phase 1 corpus stats).
- **§2** ← the 7 Cardinal Rules (`examiner_report_synthesis.md`), mark-allocation trend.
- **§3** ← `mw_write_pipeline_guidance.md` (what earns marks) + examiner-report synthesis.
- **§4** ← curveball distribution (6.2/17.9/75.9%), composition guardrails, quality/price tiers,
  per-paper variety/region distributions from the heuristics.
- **§5** ← `question-validator.ts` rules (country-count, same/distinct variety, etc.) + 8-family
  taxonomy + composition guardrails.
- **§6** ← (empty at seed; fills from the first feedback sync).
- **§7** ← the remediation-plan history: the 6 quarantined questions (13% HARD-invalid), CF-1/2/3,
  each as a bug→fix→prevention entry.
- **§8** ← link table to master trees, heuristics, backtest reports, methodology.
- **§9** ← known weak spots from LOYO (e.g., blends / Gewürztraminer / Grenache-blend 0% top-1)
  reframed as open questions.

---

## 9. Implementation phasing (after this plan is approved)

1. **Phase 1 — Seed.** Create `mw_exam_empirical_knowledge.md` with the §0–§9 skeleton and
   seed content (§8 above). Add the CLAUDE.md pointer. *(No automation yet — reviewable on its own.)*
2. **Phase 2 — Core.** The shared sync core (script and/or Claude brief): read doc + Neon evidence
   + artifacts → write live cited entries, dedupe, supersede, commit to master. Add
   `data/empirical_sync_state.json` (cursor for cron/manual modes).
3. **Phase 3 — Incremental trigger (primary).** Add the final step to `auto-feedback.yml` that runs
   the core in single-item mode using the run's `ANALYSIS_ID`/verdict/`commit_sha`, then commits the
   doc straight to master. This is the zero-latency path the rest hangs off.
4. **Phase 4 — Manual command.** `.claude/commands/sync-empirical-knowledge.md` wrapping the core
   (default catch-up / `--consolidate`).
5. **Phase 5 — Weekly cron.** `.github/workflows/empirical-knowledge-sync.yml` running the core in
   consolidate mode and committing to master.

Each phase is independently shippable; we can stop after any of them, but Phase 3 is the one that
delivers the "no latency" behavior you want.

---

## 10. Resolved & remaining decisions

**All resolved — ready to build:**
- ✅ **Auto-confirmed, no human gate** — entries are `live` on write; Claude self-corrects via supersession.
- ✅ **Straight to `master`** — no PR, no branch, for all three triggers.
- ✅ **Incremental trigger is in** — wired into `auto-feedback.yml`, primary zero-latency path.
- ✅ **Runs via the existing `ANTHROPIC_API_KEY`** repo secret (same one the code pipeline uses).
- ✅ **Location:** `mw_exam_empirical_knowledge.md` at the **repo root**.
- ✅ **Tiers:** **STRONG SIGNAL / PLAUSIBLE / CURVEBALL** for exam-content claims + **PROCESS** for
      app/operational facts (§7). Matches the master-tree vocabulary.
- ✅ **Rejected feedback writes entries too** — a rejection ("user thought X; corpus shows Y") is a
      cited learning, routed to §6 or §9. Captures the most signal.
- ✅ **No token cap** — run the doc-sync Opus call on every resolved feedback item (one extra call
      per feedback is cheap next to the code-change pipeline already running).
```
