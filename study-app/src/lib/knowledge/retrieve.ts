// Hybrid retrieval over the frozen production-knowledge corpus.
//
// Ported from the Wine-inventory knowledge stack (plan 079), rewritten for this app. Three substantive
// changes, all of them forced by a real difference between the two systems:
//
// 1. DRIVER. Prisma $queryRaw -> @neondatabase/serverless tagged templates. This app has no ORM.
//    Prisma.join() has no equivalent, so source filtering uses `= ANY(...)`.
//
// 2. NO TENANT LAYER. The source system resolves per-tenant source subscriptions and fails CLOSED
//    (no enabled sources => no results, never "all"), because it is multi-tenant and a leaked passage
//    crosses a customer boundary. This app has one user. The subscription table, the resolver, and the
//    fail-closed branch are all gone; what remains is `kb_source.active`, so a source can still be
//    switched off without a re-export.
//
// 3. ONE LEXICAL ARM PER LANGUAGE. This is the real change, and the reason retrieval here is not just
//    the source file with the imports swapped. See below.
//
// WHY THE LEXICAL ARM IS PLURAL. The corpus is substantially non-English: Union des Maisons de
// Champagne — the best sparkling-production source in it — is 5,200/5,200 chunks French; WBI and LVWO
// are German; ICVV is Spanish. A tsquery is bound to ONE text-search configuration, so a single
// lexical arm can only ever match one language. Measured against UMC, an English arm querying
// "second fermentation in bottle / disgorgement / riddling / autolysis" returns 0 hits out of 5,200;
// a French arm querying "dégorgement / remuage / prise de mousse / autolyse" returns 347.
//
// Note what that measurement does and does not prove. Routing each document's tsvector to its own
// config is necessary but NOT sufficient — English lexemes appear nowhere in a French document
// regardless of how it was stemmed, so config routing alone also scores 0. The load-bearing piece is
// the cross-lingual concept map in lexicon.ts, which turns an English question into the French, German
// and Spanish terms of art that actually appear in the text. This file just runs one arm per config
// and lets RRF fuse them, which it already supported.
//
// Without this, hybrid search degrades to dense-only on exactly the content that justified importing
// the corpus — and it degrades SILENTLY, which is why it is worth this much comment.

import { neon } from "@neondatabase/serverless";
import { embedQuery, KB_EMBEDDING_MODEL, KB_EMBEDDING_DIM } from "./embed";
import { buildLexicalQueries } from "./lexicon";
import { rrfFuse, normalizeScores } from "./rrf";
import { mmrSelect, type MmrCandidate } from "./mmr";

/**
 * Where a passage's date came from. The distinction is the point.
 *
 * "published"     — the document declared it. Trustworthy enough to reason about currency with.
 * "last-modified" — no declared date; this is the sitemap's lastmod, i.e. when the page was last
 *                   TOUCHED. On WordPress that is a theme migration or a category re-tag. It is NOT a
 *                   publication date and passage-age.ts must never be handed one.
 * "unknown"       — neither is available.
 */
export type DateSource = "published" | "last-modified" | "unknown";

export interface RetrievedPassage {
  chunkId: string;
  documentId: string;
  publisher: string;
  tier: number;
  canonicalUrl: string;
  canonicalTitle: string | null;
  publishedAt: Date | null;
  dateSource: DateSource;
  sectionPath: string;
  language: string;
  topic: string | null;
  isRegionalPractice: boolean;
  text: string;
}

interface Row {
  chunk_id: string;
  document_id: string;
  section_path: string;
  text: string;
  language: string;
  topic: string | null;
  is_regional_practice: boolean;
  publisher: string;
  tier: number;
  canonical_url: string;
  canonical_title: string | null;
  published_at: string | null;
  sitemap_lastmod: string | null;
}

/** Resolve a row's effective date and record WHICH kind of date it is. Pure — unit-tested. */
export function dateOf(r: { published_at: string | null; sitemap_lastmod: string | null }): {
  publishedAt: Date | null;
  dateSource: DateSource;
} {
  if (r.published_at) return { publishedAt: new Date(r.published_at), dateSource: "published" };
  if (r.sitemap_lastmod) return { publishedAt: new Date(r.sitemap_lastmod), dateSource: "last-modified" };
  return { publishedAt: null, dateSource: "unknown" };
}

function parseVector(text: string | null): number[] {
  if (!text) return [];
  try {
    return JSON.parse(text) as number[];
  } catch {
    return [];
  }
}

const SELECT_COLS = `
  c.id AS chunk_id, c.document_id, c.section_path, c.text, c.language, c.topic,
  c.is_regional_practice, d.publisher, d.tier, d.canonical_url, d.canonical_title,
  d.published_at, d.sitemap_lastmod`;

export async function retrieveKnowledge(opts: {
  query: string;
  topK?: number;
}): Promise<RetrievedPassage[]> {
  const sql = neon(process.env.DATABASE_URL!);
  const topK = opts.topK ?? 6;
  const candidateK = Math.max(topK * 4, 24);
  // H2 mitigation. The source system selects `embedding::text` in the candidate queries themselves,
  // which over a pooled TCP connection is free enough. This app talks to Postgres over HTTP per query,
  // where 48 candidates x ~20KB of vector text is ~1MB on the wire before we have even ranked them. So
  // the arms return metadata only, and vectors are fetched for the fused pool alone — a third of the
  // rows, after cheap ranking has already discarded the rest.
  const mmrPool = Math.max(topK * 3, 18);

  const qvec = await embedQuery(opts.query);
  const qlit = `[${qvec.join(",")}]`;

  // Dense arm. The `c.id` tiebreaker is load-bearing, not cosmetic: without a total order, rows tied
  // on distance straddle the LIMIT differently between executions, which propagates through RRF and
  // MMR into a final ranking that moves for no reason. That instability shows up as phantom retrieval
  // regressions in the eval. (Inherited from the source system, which discovered it the hard way.)
  const dense = (await sql`
    SELECT ${sql.unsafe(SELECT_COLS)}
    FROM kb_chunk c
    JOIN kb_document d ON d.id = c.document_id
    JOIN kb_source s ON s.key = d.source_key
    WHERE s.active
      AND c.embedding IS NOT NULL
      AND c.embedding_model = ${KB_EMBEDDING_MODEL}
      AND c.embedding_dim = ${KB_EMBEDDING_DIM}
    ORDER BY c.embedding <=> ${qlit}::vector, c.id
    LIMIT ${candidateK}`) as Row[];

  // Lexical arms — one per corpus language the query has terms for. Run concurrently: each is its own
  // HTTP round trip, and serialising four of them would triple retrieval latency for nothing.
  const lexicalQueries = buildLexicalQueries(opts.query);
  const lexicalArms = (await Promise.all(
    lexicalQueries.map(
      async ({ tsConfig, query }) =>
        (await sql`
          SELECT ${sql.unsafe(SELECT_COLS)}
          FROM kb_chunk c
          JOIN kb_document d ON d.id = c.document_id
          JOIN kb_source s ON s.key = d.source_key
          WHERE s.active
            AND c.ts_config = ${tsConfig}
            AND c.search_vector @@ websearch_to_tsquery(${tsConfig}::regconfig, ${query})
          ORDER BY ts_rank(c.search_vector, websearch_to_tsquery(${tsConfig}::regconfig, ${query})) DESC, c.id
          LIMIT ${candidateK}`) as Row[],
    ),
  )) as Row[][];

  const byId = new Map<string, Row>();
  for (const r of [dense, ...lexicalArms].flat()) if (!byId.has(r.chunk_id)) byId.set(r.chunk_id, r);
  if (byId.size === 0) return [];

  // Fuse every arm, normalize, then fetch vectors only for the pool MMR will actually choose among.
  const fused = rrfFuse([dense.map((r) => r.chunk_id), ...lexicalArms.map((arm) => arm.map((r) => r.chunk_id))]);
  const norm = normalizeScores(fused);
  const poolIds = fused.slice(0, mmrPool).map((f) => f.id);

  const vecRows = (await sql`
    SELECT id, embedding::text AS embedding FROM kb_chunk WHERE id = ANY(${poolIds})`) as {
    id: string;
    embedding: string | null;
  }[];
  const vectors = new Map(vecRows.map((v) => [v.id, parseVector(v.embedding)]));

  const candidates: MmrCandidate<Row>[] = poolIds
    .map((id) => byId.get(id))
    .filter((r): r is Row => !!r)
    .map((r) => ({
      item: r,
      relevance: norm.get(r.chunk_id) ?? 0,
      vector: vectors.get(r.chunk_id) ?? [],
    }));

  return mmrSelect(candidates, topK, 0.7).map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    publisher: r.publisher,
    tier: r.tier,
    canonicalUrl: r.canonical_url,
    canonicalTitle: r.canonical_title,
    ...dateOf(r),
    sectionPath: r.section_path,
    language: r.language,
    topic: r.topic,
    isRegionalPractice: r.is_regional_practice,
    text: r.text,
  }));
}
