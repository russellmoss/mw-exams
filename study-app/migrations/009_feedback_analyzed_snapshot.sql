-- Migration 009: store the exact feedback text an analysis was run on
-- Root cause of the attempt-188 incident: two distinct feedback submissions hit the
-- same user_attempts row; the second OVERWROTE user_feedback. The apply step and the
-- empirical-knowledge sync both re-read the mutable user_feedback column at LATER times,
-- so the analyzed text and the shipped/synced text silently diverged (fa.thread = Dry
-- Notes, but the column read as Sylvaner at sync time → EK-0131 came out Sylvaner).
--
-- This column pins the snapshot the analysis actually saw, so apply/sync consume that
-- instead of a live re-read, and a mismatch can be detected and reviewed instead of
-- auto-shipped. Additive only — safe to run repeatedly.

ALTER TABLE feedback_analyses ADD COLUMN IF NOT EXISTS analyzed_feedback TEXT;
