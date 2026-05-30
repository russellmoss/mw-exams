-- 007_tasting_lexicon.sql — editable MW tasting-vocabulary lexicon used to raise the register of
-- generated model/mock answers.
--
-- Seeded from study-app/src/lib/prompts/tasting-lexicon.json (the source of truth) via
-- scripts/sync-tasting-lexicon.mjs. The app reads this table (getTastingLexicon in db.ts) with the
-- bundled JSON as fallback, so editing rows here changes generation without a redeploy.
--
-- group_kind: 'dimension' (COLOUR, FRUIT, ACIDITY, …) or 'rhetoric' (POSITIVES, NEGATIVES, SUGGESTS,
-- PROVES, ODDS_AND_SODS). 'term' is one descriptor/verb/word. 'sort_order' preserves the source order.
-- Apply: psql "$DATABASE_URL" -f migrations/007_tasting_lexicon.sql   (idempotent)

CREATE TABLE IF NOT EXISTS tasting_lexicon (
  id          BIGSERIAL PRIMARY KEY,
  group_kind  TEXT NOT NULL,                 -- 'dimension' | 'rhetoric'
  category    TEXT NOT NULL,                 -- COLOUR / FRUIT / … | POSITIVES / SUGGESTS / …
  term        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (category, term)
);

CREATE INDEX IF NOT EXISTS idx_tasting_lexicon_lookup ON tasting_lexicon (active, group_kind, category, sort_order);
