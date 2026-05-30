You are running `/sync-empirical-knowledge` — the manual trigger for the living
`mw_exam_empirical_knowledge.md` knowledge base.

## What this does

Runs the shared sync core (`study-app/scripts/sync-empirical-knowledge.mjs`) that reads the knowledge
doc + resolved feedback from Neon, asks Claude (latest Opus) what each item teaches about the MW exam,
and applies the result as deterministic operations — appending cited `live` entries, superseding
contradicted ones, adding a §6 ledger row, and a changelog line. Everything is auto-confirmed and goes
straight to `master` (no PR, no human gate) — the design decision is to trust Opus + citations + git
history rather than a review queue (see `empirical_knowledge_doc_plan.md`).

This is the on-demand path. The zero-latency path is the incremental step inside `auto-feedback.yml`
(fires when feedback resolves); the routine path is the weekly consolidation cron. This command is for
catch-up syncs and one-offs.

## Arguments (parse `$ARGUMENTS`)

- **(none)** → default: consolidate catch-up — process every resolved feedback item not yet in the
  cursor (`data/empirical_sync_state.json`), apply, and **commit + push to master**.
- **`dry-run`** → consolidate but preview only (print the proposed operations, write nothing). Use this
  when you want to see what would change first.
- **`analysis <N>`** → incremental: process exactly one feedback item by its `feedback_analyses.id`,
  then commit. (Mirrors what the workflow does for a single resolved item.)
- **`no-commit`** → apply locally (update the doc + cursor) but do NOT push — for inspecting the diff
  before it ships. Combine with the above (e.g. `analysis 14 no-commit`).

## Steps

1. **Run the core.** From the repo root, build the command from the arguments:
   - base: `node study-app/scripts/sync-empirical-knowledge.mjs`
   - mode: `--mode consolidate` (default) or `--mode incremental --analysis-id <N>` (if `analysis N`)
   - add `--dry-run` if `dry-run` was passed
   - add `--commit` UNLESS `dry-run` or `no-commit` was passed
   - This script needs network (Neon + Anthropic) and reads `DATABASE_URL` / `ANTHROPIC_API_KEY` from
     `study-app/.env.local`. If the Bash tool sandbox blocks the connection, re-run with the sandbox
     disabled (it is a read of prod feedback + one Opus call + a content-only push to master).

2. **Report the result.** Relay the script's output: how many feedback items were processed, how many
   new entries were created (and their EK ids), any supersessions, and whether it committed/pushed.
   - On `dry-run`, show the proposed operations JSON the script printed and note that nothing was
     written.
   - If the script said "no new feedback to process," tell the user it's already caught up.

3. **Confirm landing.** If it committed, the doc is already on `master` (root-level `.md` push — no CI,
   no deploy triggered). Mention the commit happened; the user can `git show` it if they want the diff.

## Rules

- **Do not hand-edit `mw_exam_empirical_knowledge.md` yourself** to add knowledge — let the script do
  it so entries stay consistently formatted, ID'd, and cited. (Fixing a typo or reverting a bad entry
  by hand is fine.)
- **Do not advance the cursor manually.** The script owns `data/empirical_sync_state.json`.
- The Neon project is `MW-exam` (`wandering-feather-17026214`) if you need to inspect the ledger.
- If the script fails, report the error verbatim — do not retry by hand-writing entries.
