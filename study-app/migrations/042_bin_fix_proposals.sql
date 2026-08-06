-- Migration 042: Bin root-cause miner + codify-and-retire loop.
--
-- Bin reasons feed generation prompts as a bounded rolling nudge (digest + lessons), which means
-- RECURRING faults age out of the window and recur — the ledger shows the same complaints binned
-- three, four, six times (Weinbach overuse, "stem gives the answer away", "flight needs a banker").
-- The miner clusters recurring reasons and proposes ONE mechanical fix per cluster (a validator rule
-- or a generation constraint), which is dispatched through the existing auto-feedback Action as a
-- PR-GATED code change. When the PR merges, the cluster's ledger rows are RETIRED from the prompt
-- feeds (codified_by below): knowledge migrates from prompt-nudge (paid every call, forgettable) to
-- code (free, permanent), and the prompts shrink as the system hardens.
--
--   bin_fix_proposals.status lifecycle:
--     proposed   — miner emitted it; awaiting the admin
--     dispatched — admin fired the auto-feedback Action (reviewOnly, PR-gated)
--     pr_opened  — the Action opened a PR (written back by scripts/record-apply.mjs)
--     merged     — PR merged (detected by reconcile or written by the Action); retirement pending
--     shipped    — evidence rows retired from the prompt feeds; loop closed
--     pr_closed  — PR closed unmerged; evidence stays live
--     rejected   — admin declined the proposal; evidence stays live
--     failed     — the Action produced no shippable change
--
-- Additive and idempotent — safe to run repeatedly.

CREATE TABLE IF NOT EXISTS bin_fix_proposals (
  id BIGSERIAL PRIMARY KEY,
  theme TEXT NOT NULL,
  kind TEXT NOT NULL,
  paper INTEGER,
  evidence_item_ids TEXT[] NOT NULL,
  proposal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  work_branch TEXT,
  pr_url TEXT,
  apply_error TEXT,
  decided_by INTEGER,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bin_fix_proposals_kind_chk') THEN
    ALTER TABLE bin_fix_proposals ADD CONSTRAINT bin_fix_proposals_kind_chk
      CHECK (kind IN ('generation', 'validator'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bin_fix_proposals_status_chk') THEN
    ALTER TABLE bin_fix_proposals ADD CONSTRAINT bin_fix_proposals_status_chk
      CHECK (status IN ('proposed', 'dispatched', 'pr_opened', 'merged', 'shipped', 'pr_closed', 'rejected', 'failed'));
  END IF;
END $$;

-- Codify-and-retire: a ledger row whose fault is now enforced in code is excluded from the
-- digest/lessons prompt feeds (the fix ships, the nudge retires). NULL = still live.
ALTER TABLE bank_bin_reasons ADD COLUMN IF NOT EXISTS codified_by BIGINT;
