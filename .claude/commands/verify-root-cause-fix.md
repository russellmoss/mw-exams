You are running `/verify-root-cause-fix` — the gate that stands between a mined bin-fix proposal and a
merged PR. Its job is to answer one question per proposal: **is this actually a new fix, aimed at the
real cause?**

## Why this exists

The root-cause miner (`study-app/src/lib/bin-fix-miner.ts`) dedupes proposals by comparing theme text
to theme text. That catches a reworded label and nothing else. It never checks a proposal against the
code, so it will happily brief an agent to build a rule that already exists — and because the brief
names a *new* function (`checkMarkBudget` where `validateMarkBudget` is already there), the resulting
PR looks like new work to a reviewer.

Measured on 2026-08-08: three of five open proposals were re-implementations of shipped validators,
two of them already open PRs awaiting review. Merging those adds a second parallel implementation of a
rule the system already has, which is how validators start silently disagreeing with each other (see
the `p1-max-one-sparkling` post-mortem in `study-app/src/lib/question-validator.ts`).

Run this **before dispatching a proposal** and **before merging a bin-fix PR**.

## Step 1 — run the mechanical checks

```bash
cd study-app && node --import ./scripts/ts-loader.mjs scripts/verify-root-cause-fix.mjs
```

Add `--id=N` for one proposal, `--json` for structured output. It is read-only.

**If it refuses to run because HEAD is behind origin/master, fast-forward — do not pass `--allow-stale`
to get past it.** Every check asks "does the code already do this", so a stale tree answers *no* to all
of them. That is not hypothetical: the first run of this tool was made from an old branch and reported
zero collisions and three spurious ESCALATEs.

The script reports three things per open proposal:

- **[A] evidence overlap** — whose evidence rows this proposal shares with another. Overlap with a
  **shipped** proposal is the load-bearing signal. It has exactly two readings, and they demand
  opposite responses: the proposal is a duplicate, or the shipped fix did not work.
- **[B] symbol collision** — the functions and reason codes the brief asks for, matched against the
  tree literally, by token set, and singular-stemmed. This is what separates the two readings.
- **[C] validator replay** — the current validator run over the questions the evidence points at.
  A collision downgrades a clean row to *inconclusive*, never to "the shipped fix failed": rules that
  live off the `validateQuestion` path (the tasting-note rules do) cannot be seen by the replay.

## Step 2 — rule on each proposal

The script's `⇒` line is a reading of the mechanical evidence, not a verdict. Confirm or overturn it by
reading the brief against the code it collides with. Land each proposal in one of four states:

**DUPLICATE — nothing new.** Every rule the brief asks for exists and covers the same cases. Recommend
closing the PR and rejecting the proposal.

**DUPLICATE WITH A DELTA.** Most of the brief exists; some clause does not. Do **not** merge the PR —
it will re-add everything. Name the delta in one sentence, and recommend rejecting the proposal in
favour of a narrow follow-up that adds only that clause to the existing rule. Be strict here: read the
existing implementation and confirm the delta is genuinely absent. A brief asking for an "acidity
statement" is not a delta if `note_missing_acidity` already exists.

**ESCALATE — the earlier fix mis-located the cause.** Evidence overlaps a shipped proposal, nothing
collides, and the validator still passes evidence rows. This is the finding the whole gate exists for:
the same complaint keeps arriving because the fix was aimed at the wrong layer. Say where the cause
actually appears to sit. Do not let the new brief re-add a rule at the layer that already failed.

**GENUINELY NEW.** No overlap, no collision. Now judge it on merits, and check three things the
mechanical pass cannot:

1. **Layer.** Is a reject-rule the right answer, or should generation have been constrained not to
   produce this? The script prints the validator/generation mix across all proposals — it has been
   running ~80% validator. A system that answers every fault by rejecting output raises redraft rate
   and cost instead of improving the output. Say so when a validator brief has an obvious generation
   counterpart.
2. **Blast radius.** A new hard rule quarantines banked questions. Follow the
   `validator-blast-radius-before-merge` practice: run the proposed rule over the live bank and report
   how many *questions* newly fail, not how many instances.
3. **Consolidation.** If two open proposals share evidence, they are one cluster the miner split. Per
   `bin-fix-proposal-review-as-a-set`, consolidate before merging either — never merge them
   individually.

## Step 3 — report, and let the human act

Produce a short table: proposal, verdict, one-line reason, recommended action. Then **stop and ask**.

Do not reject proposals, close PRs, or update `bin_fix_proposals` without the user saying so in this
conversation. Rejection is the safe direction (evidence stays live and can be re-mined), but a merged
duplicate is expensive to unpick and `retireBinFixEvidence` permanently sets `codified_by` — a wrong
retirement silently stops a real fault from ever being mined again.

When the user approves:

- **Reject a proposal** — the Reject button in the admin Root-cause fixes panel, or
  `POST /api/admin/bin/fixes { "action": "reject", "proposalId": N }`. Evidence stays live.
- **Close a PR** — `gh pr close N --comment "<the reason, with the specific collision named>"`. Always
  say *why* in the comment and point at the shipped PR it duplicates; a bare close teaches nobody.
- **Never** hand-edit `bin_fix_proposals` rows to force a status.

## Step 4 — feed the finding back

A duplicate that reached PR stage is a miner defect, not just a bad proposal. If the same failure mode
shows up more than once, propose the mechanical fix to the miner itself — most of these would be
prevented by having `mineBinFixProposals` exclude evidence already claimed by a non-rejected proposal,
rather than only filtering evidence claimed by a `shipped` one (`codifiedFeedbackIds` in
`bin-fix-miner.ts`). That filter is currently a race: a same-day mine re-uses evidence that is already
in flight.

Record anything durable in `mw_exam_empirical_knowledge.md` §7 (app-bug catalog).
