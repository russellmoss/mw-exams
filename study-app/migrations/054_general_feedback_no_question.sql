-- Migration 054: let app-level feedback exist without a question.
--
-- Migration 050 added `user_attempts_question_family_check`, which asserts that every attempt row
-- belongs to exactly one question family: a theory row has theory_question_id and no question_id,
-- and every other row has question_id and no theory_question_id. That was correct when every row
-- WAS an attempt at a question.
--
-- Migration 053 then made user_attempts the store for the Feedback tab, where a general-scope
-- submission is deliberately question-less (mode='full', question_id NULL, scope='general'). The two
-- are incompatible: every general Feedback-tab submission violated the 050 check, so
-- recordTabFeedback threw and POST /api/feedback returned a 500. Since /api/feedback treats
-- anything that isn't scope='question' as general, that is the tab's DEFAULT path — the feature was
-- inert from the day it shipped (verified against production 2026-08-07: the constraint is present
-- and zero general rows exist).
--
-- The rule 050 wanted still holds for attempts; this adds the one carve-out the feedback store
-- needs. Feedback about the app in general is about no question by definition, and `scope` is what
-- marks it — the same field getUserStats and getUserAttempts use to keep these rows out of the
-- candidate's study totals.
--
-- Idempotent: drops and re-adds the named constraint, so re-running is a no-op in effect.

ALTER TABLE user_attempts DROP CONSTRAINT IF EXISTS user_attempts_question_family_check;

ALTER TABLE user_attempts
  ADD CONSTRAINT user_attempts_question_family_check CHECK (
    (mode = 'theory' AND question_id IS NULL AND theory_question_id IS NOT NULL)
    OR
    (mode <> 'theory' AND question_id IS NOT NULL AND theory_question_id IS NULL)
    OR
    -- App-level feedback: belongs to no question in either family. `IS NOT DISTINCT FROM`, not
    -- `=`, because scope is nullable: `scope = 'general'` evaluates to NULL on the ordinary rows
    -- that carry no scope, and a CHECK only rejects FALSE — so the `=` form would have quietly
    -- admitted ANY question-less non-theory row, which is exactly what 050 exists to forbid.
    (scope IS NOT DISTINCT FROM 'general' AND question_id IS NULL AND theory_question_id IS NULL)
  ) NOT VALID;

ALTER TABLE user_attempts VALIDATE CONSTRAINT user_attempts_question_family_check;
