#!/usr/bin/env node
/**
 * kb-export.mjs — import a filtered slice of the Wine-inventory knowledge corpus into MW-exam.
 *
 * OPERATOR TOOL, RUN BY HAND. Deliberately not wired into prebuild: the corpus is FROZEN by decision,
 * so there is no sync job and no standing dependency on another app's schema. (That dependency is the
 * exact class of drift that has broken MW deploys three times — see migrate.mjs.) To refresh the
 * corpus, re-run this by hand and read the report.
 *
 * WHAT IT MOVES. ~10k chunks of tier-1 enology/viticulture technical writing, filtered from a 45,956-
 * chunk source corpus in three stages (source allowlist -> vector prefilter -> LLM classification).
 * EMBEDDINGS ARE COPIED VERBATIM — never re-embedded. That is the whole cost argument for exporting
 * rather than re-crawling: 10k re-embeds would be a Voyage bill and a day of rate-limit babysitting,
 * and would produce the same vectors.
 *
 * Usage:
 *   node scripts/kb-export.mjs --dry-run     # report what would move, write nothing
 *   node scripts/kb-export.mjs               # do it
 *   node scripts/kb-export.mjs --no-classify # skip stage 3 (cheaper, less precise)
 *
 * Env:
 *   KB_SOURCE_DATABASE_URL  Wine-inventory Neon connection string (READ ONLY — this script never
 *                           writes to it; use a read-only role if you have one)
 *   DATABASE_URL            MW-exam Neon connection string (target)
 *   VOYAGE_API_KEY          for embedding the ~30 probe queries in stage 2
 *   ANTHROPIC_API_KEY       for stage 3 classification
 */

import { neon } from "@neondatabase/serverless";
import Anthropic from "@anthropic-ai/sdk";

const DRY_RUN = process.argv.includes("--dry-run");
const NO_CLASSIFY = process.argv.includes("--no-classify");
const NO_VECTOR_PREFILTER = process.argv.includes("--no-vector-prefilter");

const VOYAGE_MODEL = "voyage-4";
const VOYAGE_DIM = 1024;
/** Per probe, how many nearest chunks to admit. 30 probes x 600 => ~18k pre-dedup, ~8-12k after. */
const PER_PROBE_K = 600;
const CLASSIFY_BATCH = 20;
/** Concurrent classifier calls. Sequential, ~390 batches x ~4s is half an hour of wall clock for work
 *  that is entirely IO-bound; 6 in flight brings it to a few minutes without troubling rate limits. */
const CLASSIFY_CONCURRENCY = 6;
const INSERT_BATCH = 25;

// ---------------------------------------------------------------------------------------------
// Stage 1 — source allowlist.
// ---------------------------------------------------------------------------------------------

/**
 * Sources that travel. Measured production-relevance per source is in the plan doc; the short version
 * is that a source allowlist alone is NOT a sufficient filter (Penn State Extension is 6,163 chunks at
 * 3.6% relevance; AWRI is 4,809 at 18.7%), which is why stages 2 and 3 exist. This list only removes
 * what is categorically wrong.
 */
const ALLOWED_SOURCES = [
  "awri",
  "ives-technical-reviews",
  "umc", // Union des Maisons de Champagne — French, and the best sparkling source in the corpus
  "wsu",
  "osu-owri",
  "osu-extension",
  "cornell-grapes",
  "vt-enology-notes",
  "ifv-france",
  "ifv-occitanie",
  "chambre-gironde",
  "icvv",
  "incavi",
  "wbi",
  "lvwo",
  "wine-australia",
  // Tier 2, kept deliberately: ETS is method reference (phenolics, microbiology, TCA), not product
  // marketing. The other tier-2 sources (Scott Labs, Laffort, Enartis) are EXCLUDED — their own source
  // config notes that they steer toward the SKUs they sell, and a cited product recommendation is
  // worse in an MW answer than no citation at all.
  "ets",
];

/**
 * Stage 1b — DOCUMENT-LEVEL DENY LIST.
 *
 * Added after the first live export, which proved that a source's tier does not describe every page
 * it publishes. IFV France is a tier-1 national research institute, and 681 of the 699 chunks it
 * contributed were `/outils/fiches-levures/` — a catalogue of 372 commercial yeast-strain fact sheets
 * ("Sélectionneur: Lallemand", "RENSEIGNEMENTS FOURNIS PAR LE FABRICANT"). That is exactly the vendor
 * product material the tier-2 exclusion exists to keep out, arriving through a tier-1 door, and it
 * ranked FIRST on a barrel-fermented-white retrieval test.
 *
 * The lesson worth keeping: filter on what a DOCUMENT IS, not only on who published it.
 *
 * Applied before classification, so it also saves the classifier bill on 760 chunks.
 */
const DENY_URL_SUBSTRINGS = [
  "/outils/fiches-levures/", // IFV commercial yeast-strain catalogue (372 docs)
];

const DENY_TEXT_PATTERNS = [
  /Tätigkeitsbericht/i, // WBI / LVWO annual institutional activity reports (6 docs)
  /Taetigkeitsbericht/i,
];

// Excluded and why, kept here so the next person does not have to re-derive it:
//   extension-psu, uc-ipm, pnw-handbooks, cornell-grape-guide, virginia-fruit, mapa, epa-pesticide,
//   msu-grapes  -> pest/disease/pesticide-label material. ~8,000 chunks, none of it about how wine
//                  is made. mapa is a pesticide register that happens to be in Spanish.
//   scott-labs, laffort, enartis -> vendor, product-biased by their own config comment.

// ---------------------------------------------------------------------------------------------
// Stage 2 — probe queries. These define what "production knowledge" MEANS for this corpus.
// ---------------------------------------------------------------------------------------------

const PROBES = [
  "traditional method sparkling wine second fermentation in bottle and autolytic character",
  "tirage liqueur, yeast strain and pressure development in bottle-fermented sparkling wine",
  "riddling, disgorgement and dosage in traditional method production",
  "tank method Charmat sparkling wine production and aromatic preservation",
  "solera fractional blending system for fortified wine ageing",
  "biological ageing under flor yeast and the development of fino character",
  "fortification timing and spirit addition in fortified wine production",
  "botrytis affected sweet wine production, pressing and fermentation of concentrated must",
  "drying and raisining grapes for sweet wine, appassimento and passerillage",
  "freeze concentration and cryoextraction for sweet wine",
  "whole bunch fermentation, stem inclusion and carbonic maceration in red winemaking",
  "cap management, punch down and pump over regimes and their effect on extraction",
  "cold soak and extended post-fermentation maceration in red wine",
  "malolactic fermentation timing, inhibition and its sensory consequences",
  "lees ageing, bâtonnage and the textural effect of extended lees contact",
  "new oak barrel maturation, toast level and its aromatic contribution",
  "large format neutral oak, foudre and concrete vessel maturation",
  "oxidative versus reductive handling and protective winemaking for aromatic whites",
  "micro-oxygenation and tannin management during élevage",
  "skin contact for white wine and orange wine production",
  "whole bunch pressing, free run juice and press fractions in white winemaking",
  "juice settling, débourbage and turbidity before white fermentation",
  "fermentation temperature control and ester retention in aromatic white wine",
  "indigenous versus inoculated yeast and the character of spontaneous fermentation",
  "sulfur dioxide management, binding and low-sulfur winemaking",
  "chaptalisation, enrichment, acidification and deacidification as must adjustments",
  "fining, filtration and the decision to bottle unfiltered",
  "tartrate and protein stabilisation before bottling",
  "brettanomyces, volatile acidity and reduction as winemaking faults",
  "blending and assemblage decisions across parcels, vessels and vintages",
  "harvest date and ripeness decisions and their effect on finished wine style",
  "amphora, qvevri and clay vessel fermentation and ageing",
];

// ---------------------------------------------------------------------------------------------
// Language detection — stopword ratio. Crude but sufficient: we only need to pick a Postgres text
// search config, and the corpus is monolingual per document by publisher.
// ---------------------------------------------------------------------------------------------

const STOPWORDS = {
  en: ["the", "and", "with", "of", "is", "that", "for", "was"],
  fr: ["les", "des", "pour", "dans", "sont", "une", "est", "aux"],
  de: ["der", "die", "und", "nicht", "werden", "wird", "das", "mit"],
  es: ["los", "las", "para", "del", "una", "con", "que", "por"],
  it: ["della", "delle", "sono", "che", "per", "una", "con", "gli"],
};

const TS_CONFIG_OF = {
  en: "english",
  fr: "french",
  de: "german",
  es: "spanish",
  it: "italian",
};

function detectLanguage(text) {
  const words = text.toLowerCase().match(/[a-zà-öø-ÿ]+/g) ?? [];
  if (words.length < 20) return "en"; // too short to judge; English is the safe default
  const counts = {};
  for (const [lang, stops] of Object.entries(STOPWORDS)) {
    const set = new Set(stops);
    counts[lang] = words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0);
  }
  const [best] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  // Require a real signal — an unrecognised language falls back to 'simple' via 'en'-shaped default
  // rather than being force-stemmed as English.
  return best[1] / words.length > 0.01 ? best[0] : "en";
}

// ---------------------------------------------------------------------------------------------
// Voyage — probe embedding only. Chunk embeddings are copied, never recomputed.
// ---------------------------------------------------------------------------------------------

async function embedProbes(texts) {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is required for the stage-2 vector prefilter (or pass --no-vector-prefilter)");
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: "query" }),
  });
  if (!res.ok) throw new Error(`Voyage HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const vecs = json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  for (const v of vecs) {
    if (v.length !== VOYAGE_DIM) throw new Error(`Voyage returned dim ${v.length}, expected ${VOYAGE_DIM}`);
  }
  return vecs;
}

// ---------------------------------------------------------------------------------------------
// Stage 3 — classification.
// ---------------------------------------------------------------------------------------------

const CLASSIFY_SYSTEM = `You are filtering a technical wine corpus for a Master of Wine exam study tool.

The tool uses these passages for ONE purpose: answering "how was this wine made?" — method of production,
winemaking inference from the glass, and checking whether a candidate's production claims are true.

KEEP a passage if it explains a winemaking or grape-growing decision, technique, mechanism, or its
sensory/compositional consequence — something that could inform or verify a claim about how a wine was made.

DROP a passage if it is: pest/disease/spray guidance, vineyard machinery, business/market/export
material, event or course announcements, staff or funding notices, navigation boilerplate, product
marketing, or laboratory service pricing.

Also mark is_regional_practice = true when the passage describes how a SPECIFIC region or appellation
does something (e.g. "in Champagne, the taille is..."), as opposed to generic technique. Those are more
useful in an exam answer.

topic: one short lowercase slug, e.g. "sparkling", "oak-ageing", "malolactic", "fortified", "sweet-wine",
"white-vinification", "red-extraction", "stabilisation", "faults", "viticulture", "other".

Passages may be in French, German, Spanish or English. Judge them the same way.

Return ONLY a JSON array, one object per passage, in the order given:
[{"n":1,"keep":true,"topic":"sparkling","is_regional_practice":true}, ...]`;

async function classifyBatch(client, batch) {
  const numbered = batch
    .map((c, i) => `[${i + 1}] (${c.publisher}, ${c.section_path || "no section"})\n${c.text.slice(0, 1200)}`)
    .join("\n\n---\n\n");
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: CLASSIFY_SYSTEM,
    messages: [{ role: "user", content: numbered }],
  });
  const raw = msg.content.find((b) => b.type === "text")?.text ?? "[]";
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`classifier returned no JSON array: ${raw.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const srcUrl = process.env.KB_SOURCE_DATABASE_URL;
  const dstUrl = process.env.DATABASE_URL;
  if (!srcUrl) throw new Error("KB_SOURCE_DATABASE_URL (Wine-inventory) is required");
  if (!dstUrl && !DRY_RUN) throw new Error("DATABASE_URL (MW-exam) is required unless --dry-run");

  const src = neon(srcUrl);
  const dst = dstUrl ? neon(dstUrl) : null;

  console.log(`\n=== kb-export ${DRY_RUN ? "(DRY RUN — nothing will be written)" : ""} ===\n`);

  // --- Stage 1 -------------------------------------------------------------------------------
  const sources = await src`
    SELECT "id", "key", "publisher", "homeDomain", "tier", "license"
    FROM "knowledge_source" WHERE "key" = ANY(${ALLOWED_SOURCES})`;
  const sourceIds = sources.map((s) => s.id);
  console.log(`Stage 1 — source allowlist: ${sources.length} sources admitted.`);

  const [{ count: stage1Count }] = await src`
    SELECT count(*)::int AS count FROM "knowledge_chunk" c
    JOIN "knowledge_document" d ON d."id" = c."documentId"
    WHERE d."sourceId" = ANY(${sourceIds})
      AND d."status" = 'active' AND c."revision" = d."activeRevision" AND c."embedding" IS NOT NULL`;
  console.log(`             ${stage1Count} chunks in scope.\n`);

  // --- Stage 2 -------------------------------------------------------------------------------
  let candidateIds;
  if (NO_VECTOR_PREFILTER) {
    const rows = await src`
      SELECT c."id" FROM "knowledge_chunk" c
      JOIN "knowledge_document" d ON d."id" = c."documentId"
      WHERE d."sourceId" = ANY(${sourceIds})
        AND d."status" = 'active' AND c."revision" = d."activeRevision" AND c."embedding" IS NOT NULL`;
    candidateIds = rows.map((r) => r.id);
    console.log(`Stage 2 — SKIPPED (--no-vector-prefilter): all ${candidateIds.length} chunks are candidates.\n`);
  } else {
    console.log(`Stage 2 — embedding ${PROBES.length} probe queries...`);
    const probeVecs = await embedProbes(PROBES);
    const ids = new Set();
    for (let i = 0; i < probeVecs.length; i++) {
      const lit = `[${probeVecs[i].join(",")}]`;
      // Nearest neighbours per probe. No ANN index on the source corpus, so this is a sequential scan
      // per probe — a few seconds each, and this runs once.
      const rows = await src`
        SELECT c."id" FROM "knowledge_chunk" c
        JOIN "knowledge_document" d ON d."id" = c."documentId"
        WHERE d."sourceId" = ANY(${sourceIds})
          AND d."status" = 'active' AND c."revision" = d."activeRevision" AND c."embedding" IS NOT NULL
        ORDER BY c."embedding" <=> ${lit}::vector, c."id"
        LIMIT ${PER_PROBE_K}`;
      for (const r of rows) ids.add(r.id);
      process.stdout.write(`\r             probe ${i + 1}/${probeVecs.length} — ${ids.size} unique candidates`);
    }
    candidateIds = [...ids];
    console.log(`\n             ${candidateIds.length} candidates after vector prefilter.\n`);
  }

  // Pull the candidate rows (in slices — the HTTP driver has a payload ceiling).
  //
  // NOTE what is NOT selected here: the embedding. A vector(1024) serialises to ~20KB of text, so
  // fetching them alongside ~10k candidates would move ~200MB over HTTP before we have even decided
  // which chunks survive — and in a dry run, all of it is thrown away. Vectors are fetched per insert
  // batch in the write phase instead, where they are actually needed.
  const chunks = [];
  for (let i = 0; i < candidateIds.length; i += 500) {
    const slice = candidateIds.slice(i, i + 500);
    const rows = await src`
      SELECT c."id", c."documentId" AS document_id, c."ordinal", c."sectionPath" AS section_path,
             c."text", c."tokenCount" AS token_count,
             c."embeddingModel" AS embedding_model, c."embeddingDim" AS embedding_dim,
             d."canonicalUrl" AS canonical_url, d."canonicalTitle" AS canonical_title,
             d."publisher", d."tier", d."publishedAt" AS published_at,
             d."sitemapLastmod" AS sitemap_lastmod, s."key" AS source_key
      FROM "knowledge_chunk" c
      JOIN "knowledge_document" d ON d."id" = c."documentId"
      JOIN "knowledge_source" s ON s."id" = d."sourceId"
      WHERE c."id" = ANY(${slice})`;
    chunks.push(...rows);
    process.stdout.write(`\rFetching candidates… ${chunks.length}/${candidateIds.length}`);
  }
  console.log(`\nFetched ${chunks.length} candidate chunks (metadata + text; vectors deferred).`);

  // --- Stage 1b — document-level deny list ---------------------------------------------------
  // Deny by DOCUMENT, not by chunk: a datasheet's boilerplate marker appears in only some of its
  // chunks, and keeping the rest of the same document would defeat the point.
  const deniedDocs = new Set();
  for (const c of chunks) {
    if (DENY_URL_SUBSTRINGS.some((s) => c.canonical_url.includes(s))) deniedDocs.add(c.document_id);
    else if (DENY_TEXT_PATTERNS.some((re) => re.test(c.text))) deniedDocs.add(c.document_id);
  }
  const before = chunks.length;
  const admitted = chunks.filter((c) => !deniedDocs.has(c.document_id));
  console.log(
    `Stage 1b — deny list removed ${before - admitted.length} chunks across ${deniedDocs.size} documents ` +
      `(vendor catalogues, institutional reports).\n`,
  );
  chunks.length = 0;
  chunks.push(...admitted);


  // --- Stage 3 -------------------------------------------------------------------------------
  let kept = chunks;
  if (!NO_CLASSIFY) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY required (or pass --no-classify)");
    const client = new Anthropic();
    console.log(`Stage 3 — classifying ${chunks.length} chunks in batches of ${CLASSIFY_BATCH}...`);
    const batches = [];
    for (let i = 0; i < chunks.length; i += CLASSIFY_BATCH) batches.push(chunks.slice(i, i + CLASSIFY_BATCH));

    const results = new Array(batches.length);
    let done = 0;
    let failed = 0;
    let next = 0;
    await Promise.all(
      Array.from({ length: CLASSIFY_CONCURRENCY }, async () => {
        for (;;) {
          const idx = next++;
          if (idx >= batches.length) return;
          const batch = batches[idx];
          let verdicts;
          try {
            verdicts = await classifyBatch(client, batch);
          } catch (e) {
            // A classifier failure must not silently DROP content — that would quietly shrink the
            // corpus in a way no downstream check would notice. Keep the batch unclassified, count it,
            // and report the total at the end so the loss of precision is visible.
            failed++;
            verdicts = batch.map((_, n) => ({ n: n + 1, keep: true, topic: null, is_regional_practice: false }));
          }
          const out = [];
          for (const v of verdicts) {
            const c = batch[v.n - 1];
            if (!c || !v.keep) continue;
            out.push({ ...c, topic: v.topic ?? null, is_regional_practice: !!v.is_regional_practice });
          }
          results[idx] = out;
          done++;
          process.stdout.write(`\r             ${done}/${batches.length} batches`);
        }
      }),
    );
    kept = results.flat().filter(Boolean);
    console.log(`\n             ${kept.length} chunks kept (${chunks.length - kept.length} dropped).`);
    if (failed) console.log(`             WARNING: ${failed} batch(es) failed and were kept unclassified.`);
    console.log();
  } else {
    kept = chunks.map((c) => ({ ...c, topic: null, is_regional_practice: false }));
    console.log(`Stage 3 — SKIPPED (--no-classify).\n`);
  }

  // --- Language detection, per document ------------------------------------------------------
  const docText = new Map();
  for (const c of kept) docText.set(c.document_id, (docText.get(c.document_id) ?? "") + " " + c.text.slice(0, 500));
  const docLang = new Map();
  for (const [id, text] of docText) docLang.set(id, detectLanguage(text));

  // --- Report --------------------------------------------------------------------------------
  const bySource = {};
  const byLang = {};
  for (const c of kept) {
    bySource[c.source_key] = (bySource[c.source_key] ?? 0) + 1;
    const l = docLang.get(c.document_id);
    byLang[l] = (byLang[l] ?? 0) + 1;
  }
  console.log("Chunks by source:");
  for (const [k, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(26)} ${n}`);
  console.log("\nChunks by detected language:");
  for (const [k, n] of Object.entries(byLang).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(26)} ${n}`);
  const docs = new Set(kept.map((c) => c.document_id));
  console.log(`\nTotal: ${kept.length} chunks across ${docs.size} documents.\n`);

  if (DRY_RUN) {
    console.log("Dry run — nothing written.\n");
    return;
  }

  // --- Write ---------------------------------------------------------------------------------
  console.log("Writing to MW-exam...");

  for (const s of sources) {
    await dst`
      INSERT INTO kb_source (key, publisher, home_domain, tier, license, active)
      VALUES (${s.key}, ${s.publisher}, ${s.homeDomain}, ${s.tier}, ${s.license ?? ""}, TRUE)
      ON CONFLICT (key) DO UPDATE SET publisher = EXCLUDED.publisher, tier = EXCLUDED.tier`;
  }

  const docRows = new Map();
  for (const c of kept) {
    if (!docRows.has(c.document_id)) docRows.set(c.document_id, c);
  }
  for (const [id, c] of docRows) {
    const lang = docLang.get(id) ?? "en";
    await dst`
      INSERT INTO kb_document (id, source_key, canonical_url, canonical_title, publisher, tier,
                               language, ts_config, published_at, sitemap_lastmod)
      VALUES (${id}, ${c.source_key}, ${c.canonical_url}, ${c.canonical_title}, ${c.publisher},
              ${c.tier}, ${lang}, ${TS_CONFIG_OF[lang] ?? "simple"}, ${c.published_at}, ${c.sitemap_lastmod})
      ON CONFLICT (id) DO UPDATE SET language = EXCLUDED.language, ts_config = EXCLUDED.ts_config`;
  }
  console.log(`  ${docRows.size} documents.`);

  let written = 0;
  for (let i = 0; i < kept.length; i += INSERT_BATCH) {
    const batch = kept.slice(i, i + INSERT_BATCH);

    // Vectors are pulled here, one insert batch at a time, rather than with the candidate metadata —
    // see the note in the fetch phase.
    const vecRows = await src`
      SELECT "id", "embedding"::text AS embedding FROM "knowledge_chunk"
      WHERE "id" = ANY(${batch.map((c) => c.id)})`;
    const vecs = new Map(vecRows.map((v) => [v.id, v.embedding]));

    await Promise.all(
      batch.map((c) => {
        const embedding = vecs.get(c.id);
        if (!embedding) throw new Error(`chunk ${c.id} lost its embedding between fetch and write`);
        const lang = docLang.get(c.document_id) ?? "en";
        const cfg = TS_CONFIG_OF[lang] ?? "simple";
        // search_vector is built HERE, with the document's own config — see the note in migration 016
        // on why this is a plain column rather than a generated one.
        return dst`
          INSERT INTO kb_chunk (id, document_id, ordinal, section_path, text, token_count, embedding,
                                embedding_model, embedding_dim, language, ts_config, search_vector,
                                topic, is_regional_practice)
          VALUES (${c.id}, ${c.document_id}, ${c.ordinal}, ${c.section_path}, ${c.text},
                  ${c.token_count}, ${embedding}::vector, ${c.embedding_model}, ${c.embedding_dim},
                  ${lang}, ${cfg}, to_tsvector(${cfg}::regconfig, ${c.text}),
                  ${c.topic}, ${c.is_regional_practice})
          ON CONFLICT (id) DO NOTHING`;
      }),
    );
    written += batch.length;
    process.stdout.write(`\r  ${written}/${kept.length} chunks`);
  }
  console.log(`\n\nDone. Corpus is frozen — re-run this script by hand to refresh it.\n`);
}

main().catch((e) => {
  console.error(`\nkb-export failed: ${e.message}`);
  process.exit(1);
});
