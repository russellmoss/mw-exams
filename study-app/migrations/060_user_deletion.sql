-- 060_user_deletion.sql
--
-- Real user deletion: a 30-day soft-delete window followed by a hard purge.
--
-- The point of this migration is to move the cascade OUT of application code and INTO the schema.
-- Before it, DELETE /api/user/account hand-ordered deletes across eight tables. That had two
-- failure modes, both live in production:
--
--   1. Wrong order. It deleted live_tasting_papers before live_tasting_sessions, but
--      live_tasting_sessions.paper_id -> live_tasting_papers was a non-deferrable NO ACTION FK, so
--      any user with a paper that had sessions attached hit a constraint violation that aborted
--      the whole transaction. Two of forty users were in that state and simply could not delete.
--
--   2. Silent orphans. Twelve columns referenced users with NO foreign key at all, so the
--      hand-written list never touched them. Those rows survived pointing at a dead user id — and
--      users.id is a serial, so a later signup could inherit the id and absorb the deleted
--      person's usage rows.
--
-- After this migration the purge is a single `DELETE FROM users WHERE id = $1` and Postgres decides
-- what follows. Adding a new user-referencing table can no longer silently opt out of deletion:
-- it needs an explicit FK, and the FK names the policy.
--
-- Two policies, applied per column:
--
--   CASCADE  — personal content. The user wrote it or it describes them. It goes.
--   SET NULL — non-personal rows that merely reference the user. The row survives, anonymized.
--              This covers the cost/usage ledger behind the admin Cost dashboard (deleting those
--              rows would retroactively shrink historical spend) and the shared question bank
--              (other users are still served questions this person generated).
--
-- Idempotent per the runner contract in scripts/migrate.mjs: every constraint is dropped by name
-- before being re-added, and the orphan cleanup is a no-op on a second run.

-- ---------------------------------------------------------------------------
-- 1. Soft-delete state on users.
-- ---------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Who asked for it: NULL means the user deleted their own account, otherwise the acting admin.
-- Deliberately NOT a foreign key — if that admin is later deleted themselves we want the audit
-- trail to keep the id rather than cascade or null it away.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by integer;

-- Partial: the purge job only ever scans pending-deletion rows, which are a tiny minority.
CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users (deleted_at) WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Clean orphans, then re-point every user-referencing FK at an explicit delete rule.
-- ---------------------------------------------------------------------------
--
-- The policy is expressed as data rather than as two dozen near-identical ALTER statements, so the
-- CASCADE/SET NULL split can be read as a single table. Adding a column here is the whole change.
--
-- It runs in three passes, and the order matters. Orphan cleanup has to happen before
-- ADD CONSTRAINT, because adding a foreign key validates the rows already in the table: 11 rows
-- (5 in model_usage, 6 in tavily_usage) point at users who no longer exist, left behind by the
-- pre-FK era. But cleanup cannot happen while the OLD constraints are still in place either —
-- deleting an orphaned feedback_analyses row would trip the existing NO ACTION
-- user_attempts_auto_analysis_id_fkey. So: drop everything, clean, then add the new rules back.
--
-- SET NULL columns get nulled; CASCADE columns get deleted, matching what the constraint itself
-- would have done had it existed at the time.

DO $migration$
DECLARE
  r         record;
  fk_name   text;
  n_cleaned bigint;
BEGIN
  -- A temp table rather than three copies of the list. It has to live inside this one DO block:
  -- the neon HTTP driver sends each statement in the file as its own request, so a temp table
  -- created by a previous statement would not still be there.
  DROP TABLE IF EXISTS _fk_policy;
  CREATE TEMP TABLE _fk_policy (ord serial, child text, col text, parent text, policy text);

  INSERT INTO _fk_policy (child, col, parent, policy)
    SELECT * FROM (VALUES
      -- child table,               child column,           parent table,          policy
      -- ---- CASCADE: personal content, purged with the account -------------------------------
      ('user_attempts',             'user_id',              'users',               'CASCADE'),
      ('feedback_analyses',         'user_id',              'users',               'CASCADE'),
      ('question_views',            'user_id',              'users',               'CASCADE'),
      ('question_flags',            'user_id',              'users',               'CASCADE'),
      ('grading_telemetry',         'user_id',              'users',               'CASCADE'),
      ('live_tasting_papers',       'user_id',              'users',               'CASCADE'),
      ('live_tasting_sessions',     'user_id',              'users',               'CASCADE'),
      -- Within-content cascades. feedback_analyses.attempt_id CASCADE also fixes a standalone
      -- bug the old route worked around: an analysis row outliving the attempt it analyses.
      ('feedback_analyses',         'attempt_id',           'user_attempts',       'CASCADE'),
      -- The ordering bug from the header. As a constraint it cannot be got wrong.
      ('live_tasting_sessions',     'paper_id',             'live_tasting_papers', 'CASCADE'),

      -- ---- SET NULL: non-personal rows, kept but anonymized ----------------------------------
      -- Cost and usage ledger. These feed the admin Cost dashboard; purging them would rewrite
      -- historical spend every time somebody left.
      ('model_usage',               'user_id',              'users',               'SET NULL'),
      ('tavily_usage',              'user_id',              'users',               'SET NULL'),
      ('elevenlabs_usage',          'user_id',              'users',               'SET NULL'),
      ('generation_attempts',       'user_id',              'users',               'SET NULL'),
      -- Shared question bank. Other users are still served these questions; authorship is
      -- metadata, not ownership.
      ('generated_questions',       'created_by_user_id',   'users',               'SET NULL'),
      ('generated_questions',       'reviewed_by',          'users',               'SET NULL'),
      ('bank_batches',              'created_by',           'users',               'SET NULL'),
      ('bank_batches',              'resolved_by',          'users',               'SET NULL'),
      -- Moderation and product records that outlive the person who filed or actioned them.
      ('question_flags',            'resolved_by',          'users',               'SET NULL'),
      ('feature_requests',          'created_by',           'users',               'SET NULL'),
      -- Breaks the user_attempts <-> feedback_analyses reference cycle: the analysis side
      -- cascades, this side nulls, so a single DELETE resolves without deadlocking on itself.
      ('user_attempts',             'auto_analysis_id',     'feedback_analyses',   'SET NULL'),
      -- A Live Tasting session records a real tasting event; losing the attempt link is
      -- preferable to losing the session when an attempt is removed.
      ('live_tasting_sessions',     'attempt_id',           'user_attempts',       'SET NULL')
    ) AS t(child, col, parent, policy);

  -- Pass 1: drop every constraint we are about to redefine, so pass 2 can clean freely.
  -- Postgres' own naming convention, and what every existing constraint in this database
  -- already happens to be called.
  FOR r IN SELECT * FROM _fk_policy ORDER BY ord LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
                   r.child, r.child || '_' || r.col || '_fkey');
  END LOOP;

  -- Pass 2: clean orphans, in list order. The order within the list is load-bearing — deleting
  -- orphaned user_attempts creates orphaned feedback_analyses, so user_attempts.user_id is listed
  -- before feedback_analyses.attempt_id, and the two columns that point back INTO that pair
  -- (user_attempts.auto_analysis_id, live_tasting_sessions.attempt_id) are listed last.
  FOR r IN SELECT * FROM _fk_policy ORDER BY ord LOOP
    IF r.policy = 'SET NULL' THEN
      EXECUTE format(
        'UPDATE %I SET %I = NULL WHERE %I IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM %I p WHERE p.id = %I.%I)',
        r.child, r.col, r.col, r.parent, r.child, r.col
      );
    ELSE
      EXECUTE format(
        'DELETE FROM %I WHERE %I IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM %I p WHERE p.id = %I.%I)',
        r.child, r.col, r.parent, r.child, r.col
      );
    END IF;

    GET DIAGNOSTICS n_cleaned = ROW_COUNT;
    IF n_cleaned > 0 THEN
      RAISE NOTICE '060: cleaned % orphaned row(s) in %.% before adding FK', n_cleaned, r.child, r.col;
    END IF;
  END LOOP;

  -- Pass 3: add the policy back as a real constraint. Dropping in pass 1 is what makes the whole
  -- migration re-runnable — ADD CONSTRAINT has no IF NOT EXISTS form.
  FOR r IN SELECT * FROM _fk_policy ORDER BY ord LOOP
    fk_name := r.child || '_' || r.col || '_fkey';
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE %s',
      r.child, fk_name, r.col, r.parent, r.policy
    );
  END LOOP;

  DROP TABLE _fk_policy;
END
$migration$;

-- user_api_keys, password_reset_tokens and the four coach_* tables were already ON DELETE CASCADE
-- and are deliberately left alone.
