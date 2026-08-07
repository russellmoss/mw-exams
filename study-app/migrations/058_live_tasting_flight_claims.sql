-- Migration 058: make a Live Tasting paper position hold exactly ONE flight.
--
-- generateNextFlight picks the first composition position with no child session, generates the flight
-- (40-90s of Opus), and only then links it. Nothing coordinated concurrent callers, and the client
-- chains by POSTing again whenever its SSE loop doesn't see a terminal `result` — so a missed frame, a
-- reload mid-generation, or a second tab fires a second call that computes the SAME next position.
-- Paper ltpr_egt9dfy3e (2026-08-07) ended with THREE sessions on position 4, generated within 14
-- seconds of each other: three full Opus generations billed to the candidate's own key, and a paper
-- that would render the same slot three times.
--
-- Two layers, because they fix different halves:
--
--   flight_claims (this column) — a per-position, TTL'd claim taken BEFORE generation. Stops the
--   duplicate WORK. A jsonb column on the paper rather than a new table: the claim is worthless
--   outside its paper's lifetime, and one atomic conditional UPDATE is the whole primitive.
--
--   the partial unique index — stops the duplicate ROW, unconditionally, even if a claim is lost to a
--   stale-claim takeover or a future caller forgets to claim. The claim is an optimisation; this is
--   the guarantee.
--
-- Idempotent per the runner's contract. The dedupe below must run BEFORE the index is created, or the
-- index cannot be built on a database that already holds duplicates.

ALTER TABLE live_tasting_papers ADD COLUMN IF NOT EXISTS flight_claims JSONB;

COMMENT ON COLUMN live_tasting_papers.flight_claims IS
  'Per-position generation claims: {"<position>": "<iso timestamp>"}. Claimed before generating a '
  'flight, honoured for 5 minutes, then treated as stale (a crashed generation must not wedge a paper). '
  'Not released on success — the linked child session is what makes the position skipped from then on.';

-- Retire duplicate links, keeping the one flight a candidate might already have interacted with:
-- reveal/grade/attempt/share activity first, then the earliest created. The losers are UNLINKED and
-- soft-abandoned rather than deleted — the session and its question stay auditable, and the row can be
-- relinked by hand if the wrong one was kept.
WITH ranked AS (
  SELECT id, paper_id, paper_position,
         ROW_NUMBER() OVER (
           PARTITION BY paper_id, paper_position
           ORDER BY
             (CASE WHEN user_revealed_at IS NOT NULL OR graded_at IS NOT NULL
                        OR attempt_id IS NOT NULL OR share_token_hash IS NOT NULL
                        OR entered_wines IS NOT NULL THEN 0 ELSE 1 END),
             created_at
         ) AS rn
  FROM live_tasting_sessions
  WHERE paper_id IS NOT NULL AND paper_position IS NOT NULL
)
UPDATE live_tasting_sessions s
SET paper_id = NULL,
    paper_position = NULL,
    abandoned_at = COALESCE(s.abandoned_at, now())
FROM ranked r
WHERE s.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS live_tasting_sessions_paper_position_uniq
  ON live_tasting_sessions (paper_id, paper_position)
  WHERE paper_id IS NOT NULL AND paper_position IS NOT NULL;
