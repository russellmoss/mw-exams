-- Migration 032: Producer Spread — surface (and gently correct) producer over-concentration in the
-- auto-generated question bank.
--
-- Wine producer is not a first-class stored field: a banked question keeps its wines as a JSON array
-- whose `fullText` is authored as `Producer, Cuvée, Vintage. Region, Country. (ABV%)`, so the producer
-- is the head segment before the first comma. Re-deriving that on every read does not scale, so this
-- migration adds a lightweight DERIVED table, bank_wine_producer, with one row per banked wine keyed
-- on a NORMALISED producer string. New rows are written by saveGeneratedQuestion (src/lib/db.ts); this
-- migration BACKFILLS the existing servable + pending pool once.
--
-- It also adds generated_questions.producer_flags — the per-item "over-used producer" flags computed
-- when a question lands in the pending-review queue, read by the review card.
--
-- Additive / idempotent — safe to run repeatedly.

-- (a) NORMALISED PRODUCER KEY. Mirrors normaliseProducer() in src/lib/bank-health/producer.ts:
--     strip diacritics, lowercase, drop a leading house article ('domaine'/'chateau'/'ch.'/'bodegas'/
--     'weingut'/'dom.') and a trailing '& fils' / '& co' / 'et fils', then collapse punctuation and
--     whitespace to single spaces. IMMUTABLE so it can back an index / be used in a generated backfill.
CREATE OR REPLACE FUNCTION bank_producer_key(raw text) RETURNS text AS $$
  SELECT btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 translate(
                   lower(coalesce(raw, '')),
                   'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
                   'aaaaaaceeeeiiiinooooouuuuyy'),
                 '^(domaine|chateau|ch\.|bodegas|weingut|dom\.)\s+', ''),
               '\s*(&\s*fils|&\s*co|et\s+fils)\s*$', ''),
             '[^a-z0-9]+', ' ', 'g'),
           '\s+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE;

-- (b) THE DERIVED TABLE. One row per banked wine. item_id links to generated_questions.question_id;
--     paper is denormalised for fast paper-scoped aggregation. producer_display is the raw head
--     spelling (the endpoint picks the most frequent spelling per key for display).
CREATE TABLE IF NOT EXISTS bank_wine_producer (
  item_id          TEXT NOT NULL,
  slot             INT  NOT NULL,
  paper            INT  NOT NULL,
  producer_key     TEXT NOT NULL,
  producer_display TEXT NOT NULL,
  region           TEXT,
  country          TEXT,
  PRIMARY KEY (item_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_bwp_paper_key ON bank_wine_producer (paper, producer_key);
CREATE INDEX IF NOT EXISTS idx_bwp_item      ON bank_wine_producer (item_id);

-- (c) BACKFILL the servable + pending pool once. Binned rows are excluded (a bin is a soft-delete;
--     it never counts toward spread). Each wine's producer is the descriptor's head segment; malformed
--     heads (empty, or > 60 chars = a whole wine string with no comma) are dropped. region/country come
--     from the enriched per-wine fields when present. Re-runnable: ON CONFLICT keeps the row current.
-- DISTINCT ON collapses any duplicate (item_id, slot) the flight might yield — a wine whose payload
-- carries an explicit `slot` can otherwise collide with another wine's ordinality-derived slot, and
-- ON CONFLICT DO UPDATE cannot touch the same target row twice within one command. Ordinality breaks
-- the tie so the earliest wine in the array wins.
INSERT INTO bank_wine_producer (item_id, slot, paper, producer_key, producer_display, region, country)
SELECT DISTINCT ON (src.item_id, src.slot)
       src.item_id, src.slot, src.paper, src.producer_key, src.producer_display, src.region, src.country
FROM (
  SELECT g.question_id                                                    AS item_id,
         COALESCE((wine.elem->>'slot')::int, wine.ord::int)               AS slot,
         g.paper                                                          AS paper,
         bank_producer_key(split_part(wine.elem->>'fullText', ',', 1))    AS producer_key,
         btrim(split_part(wine.elem->>'fullText', ',', 1))                AS producer_display,
         NULLIF(wine.elem->>'region', '')                                 AS region,
         NULLIF(wine.elem->>'country', '')                                AS country,
         wine.ord                                                         AS ord
  FROM generated_questions g
  CROSS JOIN LATERAL jsonb_array_elements(g.wines::jsonb) WITH ORDINALITY AS wine(elem, ord)
  WHERE g.review_state IN ('kept', 'pending')
    AND jsonb_typeof(g.wines::jsonb) = 'array'
    AND btrim(split_part(wine.elem->>'fullText', ',', 1)) <> ''
    AND length(btrim(split_part(wine.elem->>'fullText', ',', 1))) <= 60
    AND bank_producer_key(split_part(wine.elem->>'fullText', ',', 1)) <> ''
) src
ORDER BY src.item_id, src.slot, src.ord
ON CONFLICT (item_id, slot) DO UPDATE SET
  paper            = EXCLUDED.paper,
  producer_key     = EXCLUDED.producer_key,
  producer_display = EXCLUDED.producer_display,
  region           = EXCLUDED.region,
  country          = EXCLUDED.country;

-- (d) REVIEW FLAG. The over-used-producer flags for a pending item, computed at insert time by
--     saveGeneratedQuestion: [{producer_display, appearance_number, paper}]. NULL for servable rows and
--     for any pending item with no over-used producer.
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS producer_flags JSONB;

-- Pending items awaiting review that carry a producer flag — the Bank Health deep-link and its count
-- read this predicate, so index it.
CREATE INDEX IF NOT EXISTS idx_gq_producer_flags
  ON generated_questions (review_state)
  WHERE producer_flags IS NOT NULL;
