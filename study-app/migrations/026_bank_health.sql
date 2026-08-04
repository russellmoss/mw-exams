-- Migration 026: Bank Health — slice-able analytics over the generated question bank.
--
-- The Bank Health admin page (/admin/bank-health) benchmarks the banked pool against the last 7
-- exam years, sliced by paper / question type / curveball / flight size / mark focus / price band /
-- grape & region coverage. Aggregations run as SQL GROUP BY so they stay fast at 10k+ rows, which
-- needs the slicing dimensions to live as INDEXED COLUMNS rather than being re-derived from the
-- stored stem/wine JSON on every read.
--
-- paper, total_marks and the wines JSON already exist on generated_questions. curveball, price band,
-- question type and flight size were only ever implicit (in metadata / the wine descriptors), so we
-- add nullable columns and BACKFILL them by re-deriving from the stored data. New rows are populated
-- at write time by saveGeneratedQuestion (see src/lib/db.ts), keeping the columns consistent going
-- forward. Everything here is additive / idempotent — safe to run repeatedly.

ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS question_type TEXT;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS curveball     TEXT;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS price_band    TEXT;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS flight_size   INT;

-- (a) FLIGHT SIZE — the number of wines in the flight, straight from the stored JSON array.
UPDATE generated_questions
  SET flight_size = jsonb_array_length(wines::jsonb)
  WHERE flight_size IS NULL
    AND wines IS NOT NULL
    AND jsonb_typeof(wines::jsonb) = 'array';

-- (b) CURVEBALL — recorded in metadata as 'curveball' or the older 'difficulty' key. Left NULL when
--     absent; the aggregation reads NULL as the corpus-dominant 'low'.
UPDATE generated_questions
  SET curveball = COALESCE(
        NULLIF(metadata::jsonb->>'curveball', ''),
        NULLIF(metadata::jsonb->>'difficulty', ''))
  WHERE curveball IS NULL
    AND metadata IS NOT NULL;

-- (c) PRICE BAND — the modal per-wine price band across the flight, where the enriched wine JSON
--     carries one. Rows with no per-wine band stay NULL and are excluded from the price-band slice's
--     denominator (rather than all defaulting into one bucket and skewing the benchmark).
UPDATE generated_questions g SET price_band = sub.band
  FROM (
    SELECT id, band FROM (
      SELECT g2.id,
             COALESCE(w->>'priceBand', w->>'price_band') AS band,
             ROW_NUMBER() OVER (
               PARTITION BY g2.id
               ORDER BY COUNT(*) DESC,
                        COALESCE(w->>'priceBand', w->>'price_band')
             ) AS rn
      FROM generated_questions g2,
           LATERAL jsonb_array_elements(g2.wines::jsonb) w
      WHERE jsonb_typeof(g2.wines::jsonb) = 'array'
        AND COALESCE(w->>'priceBand', w->>'price_band') IS NOT NULL
      GROUP BY g2.id, COALESCE(w->>'priceBand', w->>'price_band')
    ) t
    WHERE t.rn = 1
  ) sub
  WHERE g.id = sub.id AND g.price_band IS NULL;

-- (d) QUESTION TYPE — best-effort classification from the stem's constraint phrasing. Priority
--     order matters (a "compare and contrast the quality" stem is a compare-and-contrast question).
--     New rows get the same classification computed in TypeScript at write time.
UPDATE generated_questions
  SET question_type = CASE
        WHEN question_text ILIKE '%compare and contrast%'                              THEN 'compare_contrast'
        WHEN question_text ILIKE '%same single grape variety%'
          OR question_text ILIKE '%same grape variety%'
          OR question_text ILIKE '%same variety%'                                      THEN 'same_variety'
        WHEN question_text ILIKE '%different countr%'
          OR question_text ILIKE '%from different countries%'                          THEN 'different_countries'
        WHEN question_text ILIKE '%same country%'
          OR question_text ILIKE '%same region%'                                       THEN 'same_country'
        WHEN question_text ILIKE '%mixed%'
          OR question_text ILIKE '%grab bag%'
          OR question_text ILIKE '%grab-bag%'                                          THEN 'mixed_grab_bag'
        WHEN question_text ILIKE '%commercial%'
          OR question_text ILIKE '%quality%'
          OR question_text ILIKE '%style%'                                             THEN 'focus_style_quality_commercial'
        ELSE 'other'
      END
  WHERE question_type IS NULL
    AND question_text IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gq_health_paper         ON generated_questions (review_state, paper);
CREATE INDEX IF NOT EXISTS idx_gq_health_question_type ON generated_questions (review_state, question_type);
CREATE INDEX IF NOT EXISTS idx_gq_health_curveball     ON generated_questions (review_state, curveball);
CREATE INDEX IF NOT EXISTS idx_gq_health_price_band    ON generated_questions (review_state, price_band);
CREATE INDEX IF NOT EXISTS idx_gq_health_flight_size   ON generated_questions (review_state, flight_size);

-- (e) TARGETED GENERATION — a Bank Health slice can trigger generation aimed at that slice. The
--     targeting object (paper / questionType / curveball / flightSize / grape / region / priceBand)
--     is threaded into the generation prompt as soft constraints and persisted on the batch so a
--     resumed invocation applies the same aim.
ALTER TABLE bank_batches ADD COLUMN IF NOT EXISTS targeting JSONB;
