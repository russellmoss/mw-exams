-- Migration 015: production-knowledge corpus (RAG) for method-of-production answers and grading.
--
-- WHAT THIS IS. A FROZEN, filtered slice of the Wine-inventory knowledge corpus (Neon project
-- muddy-shape-80817041), imported by scripts/kb-export.mjs. Tier-1 enology/viticulture publishers
-- (AWRI, IVES, UMC, WSU, OSU/OWRI, IFV, WBI, LVWO, ICVV, Virginia Tech Enology) plus ETS Labs.
-- Vendor sources (Scott Labs, Laffort, Enartis) and the entire pest/IPM/pesticide block are excluded
-- at export time — see docs/plans/2026-08-02-kb-export-retrieval-port.md.
--
-- FROZEN means: nothing in the app writes to these tables. The export script is an operator tool run
-- by hand. That decision is load-bearing below (see SEARCH_VECTOR).
--
-- SCOPE DISCIPLINE. This corpus covers HOW WINE IS MADE. It does not cover appellation law, regional
-- style, or variety/origin identification, and retrieval is gated to production-shaped questions
-- (families F5/F6 + the `ask:production` stem token) in question-engine.ts. A corpus that answers
-- confidently outside its coverage is worse than no corpus.
--
-- COPYRIGHT. Full chunk text is stored to power the index; what the app SURFACES is a snippet plus a
-- link back to canonical_url. That asymmetry is the defensible shape and it is not optional — never
-- re-serve a document in full from this table.
--
-- Additive / idempotent — safe to run repeatedly.

-- pgvector must exist before any vector(N) column. Neon has it available at 0.8.0; if this fails the
-- build fails, which is the intent (code and schema must not ship independently — see migrate.mjs).
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Publishers. Carried over from Wine-inventory's knowledge_source, minus the crawl configuration
--    (seed roots, allow/deny prefixes, cadence) which is meaningless here: we import a finished
--    corpus and never crawl. `active` stays so a source can be switched off without a re-export.
CREATE TABLE IF NOT EXISTS kb_source (
  key         TEXT PRIMARY KEY,
  publisher   TEXT NOT NULL,
  home_domain TEXT NOT NULL,
  tier        INTEGER NOT NULL,          -- 1 = peer-reviewed / official extension; 2 = industry
  license     TEXT NOT NULL DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2. Documents. `id` is carried over verbatim from the source corpus so a re-export is an upsert
--    rather than a duplicate-and-orphan.
--
--    LANGUAGE is not decoration. The corpus is substantially non-English — Union des Maisons de
--    Champagne (the best sparkling source we have) is 100% French, WBI and LVWO are German, ICVV and
--    MAPA Spanish. `ts_config` is the Postgres text-search configuration that matches, and it drives
--    both how search_vector was built at import and which websearch_to_tsquery config the lexical arm
--    uses at query time. Postgres ships english/french/german/spanish/italian/catalan; anything
--    unsupported falls back to 'simple' (no stemming, still tokenises).
CREATE TABLE IF NOT EXISTS kb_document (
  id              TEXT PRIMARY KEY,
  source_key      TEXT NOT NULL REFERENCES kb_source(key),
  canonical_url   TEXT NOT NULL,
  canonical_title TEXT,
  publisher       TEXT NOT NULL,
  tier            INTEGER NOT NULL,
  language        TEXT NOT NULL DEFAULT 'en',
  ts_config       TEXT NOT NULL DEFAULT 'simple',
  -- Kept SEPARATE, not coalesced: published_at is a date the document declared; sitemap_lastmod is
  -- when the page was last TOUCHED (a theme migration, a category re-tag). Collapsing them lets a
  -- 2009 page present as current. passage-age.ts reasons only from the declared date.
  published_at    TIMESTAMPTZ,
  sitemap_lastmod TIMESTAMPTZ,
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_key, canonical_url)
);

-- 3. Chunks. embedding is voyage-4 / 1024-dim, COPIED VERBATIM from the source corpus — never
--    re-embedded. That is the entire cost argument for exporting rather than re-crawling, and it
--    means the vectors here are only comparable to query vectors from the SAME model. The model and
--    dim are stored per row so a future swap is a backfill, not a silent mismatch.
--
--    SEARCH_VECTOR is a PLAIN COLUMN, not GENERATED, and that is deliberate. A generated column must
--    be immutable, and routing the text-search config per row (to_tsvector(ts_config::regconfig, text))
--    is not — the text::regconfig cast is only stable. The alternatives were one tsvector column per
--    language (ugly) or a single 'english' config applied to French and German text (which is how the
--    lexical arm silently dies on the best content in the corpus). Because the corpus is FROZEN, a
--    plain column populated once at import has no drift risk and is simply correct.
--
--    topic / is_regional_practice come from the import-time classifier. is_regional_practice marks a
--    passage that describes how a REGION does something, as opposed to generic technique — those are
--    the ones worth preferring in an MW answer.
CREATE TABLE IF NOT EXISTS kb_chunk (
  id                   TEXT PRIMARY KEY,
  document_id          TEXT NOT NULL REFERENCES kb_document(id) ON DELETE CASCADE,
  ordinal              INTEGER NOT NULL,
  section_path         TEXT NOT NULL DEFAULT '',
  text                 TEXT NOT NULL,
  token_count          INTEGER NOT NULL DEFAULT 0,
  embedding            vector(1024),
  embedding_model      TEXT NOT NULL,
  embedding_dim        INTEGER NOT NULL,
  -- Denormalised from kb_document so the per-language lexical arm can filter without a join.
  language             TEXT NOT NULL DEFAULT 'en',
  ts_config            TEXT NOT NULL DEFAULT 'simple',
  search_vector        tsvector,
  topic                TEXT,
  is_regional_practice BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (document_id, ordinal)
);

-- 4. Indexes.
--
--    HNSW on cosine: Wine-inventory deliberately runs without an ANN index and eats the sequential
--    scan (its retrieve.ts carries a long note about the `id` tiebreaker that exists because of it).
--    At this corpus size an index is cheap, so we take it — but the tiebreaker is ported anyway,
--    because reproducible ordering is what makes the retrieval eval trustworthy.
CREATE INDEX IF NOT EXISTS idx_kb_chunk_embedding_hnsw
  ON kb_chunk USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_kb_chunk_search_vector ON kb_chunk USING gin (search_vector);
-- The lexical arm runs once per language present in the corpus, so it filters on ts_config first.
CREATE INDEX IF NOT EXISTS idx_kb_chunk_ts_config ON kb_chunk (ts_config);
CREATE INDEX IF NOT EXISTS idx_kb_chunk_document  ON kb_chunk (document_id);
CREATE INDEX IF NOT EXISTS idx_kb_document_source ON kb_document (source_key);
