#!/usr/bin/env node
/**
 * kb-fortified-build.mjs — build the FORTIFIED / OXIDATIVE corpus.
 *
 * WHY THIS EXISTS. The first corpus (016_knowledge_corpus, imported from Wine-inventory) covers how
 * wine is made by viticulture and enology research institutes. Measured against it, fortified wine is
 * not merely thin — it is ABSENT AND MISLEADING: 11 chunks classified `fortified`, 5 chunks in 3,979
 * mentioning solera / criadera / flor / fino / amontillado / oloroso / madeira / estufagem, and a
 * botrytis query that returned six passages of bunch-rot disease control. Research institutes publish
 * on grape growing and table-wine enology; nobody at AWRI writes about the criaderas system.
 *
 * So the gate in lib/knowledge/context.ts suppresses fortified/oxidative and botrytis questions
 * outright. That is correct while the coverage is absent, and it costs real Paper 3 marks — sherry,
 * port and madeira are staples. This script fills the hole from the bodies that actually regulate
 * those wines.
 *
 * DIFFERENT SOURCING PROBLEM, DIFFERENT TOOL. The first corpus was an EXPORT: 45,956 finished chunks
 * with vectors already computed. This one has to be built from the open web, so it crawls (via Tavily,
 * the project's sanctioned research tool per CLAUDE.md) and pays to embed. That also means it is
 * SMALL AND CURATED by design — a hand-picked URL list from regulators, not a sitemap sweep. The
 * fortified world has few authoritative publishers and a great many blogs.
 *
 * TIER DISCIPLINE, inherited from the first corpus and non-negotiable. Consejo Regulador and IVDP are
 * tier 1 because they WRITE THE RULES. SherryNotes, Lustau, GuildSomm and the rest are excluded: good
 * writing, but a producer's blog is not a product specification, and an MW answer citing one is worse
 * than an MW answer citing nothing. Peer-reviewed open-access reviews are tier 1.
 *
 * Usage:
 *   node scripts/kb-fortified-build.mjs --dry-run   # fetch + chunk + report, embed nothing, write nothing
 *   node scripts/kb-fortified-build.mjs             # do it
 *   node scripts/kb-fortified-build.mjs --source sherry-consejo
 *   node scripts/kb-fortified-build.mjs --group botrytis    # only the noble-rot set
 *
 * Env: DATABASE_URL, TAVILY_API_KEY, VOYAGE_API_KEY
 */

import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { chunkMarkdown } from "../src/lib/knowledge/chunk.ts";

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY = (() => { const i = process.argv.indexOf("--source"); return i >= 0 ? process.argv[i + 1] : null; })();
const GROUP = (() => { const i = process.argv.indexOf("--group"); return i >= 0 ? process.argv[i + 1] : null; })();

const VOYAGE_MODEL = "voyage-4";
const VOYAGE_DIM = 1024;
const EMBED_BATCH = 64;
const INSERT_BATCH = 20;

// ---------------------------------------------------------------------------------------------
// SOURCE REGISTRY.
//
// `urls` are hand-picked. Every one was confirmed to exist and to carry production content before
// being listed — a 404 or a navigation shell contributes nothing but costs an embedding.
//
// `tsConfig` must match the page language or the lexical arm silently returns nothing for that
// source (the lesson from the first corpus, where an English tsquery scored 0 against 5,200 French
// UMC chunks). Postgres ships english/spanish/portuguese/french, all of which we need here.
// ---------------------------------------------------------------------------------------------

const SOURCES = [
  {
    group: "fortified",
    topic: "fortified",
    key: "sherry-consejo",
    publisher: "Consejo Regulador DO Jerez-Xérès-Sherry",
    homeDomain: "sherry.wine",
    tier: 1,
    license: "public web, cited with link-back",
    language: "en",
    tsConfig: "english",
    urls: [
      "https://www.sherry.wine/sherry-wine/production",
      "https://www.sherry.wine/sherry-wine/production/viticulture",
      "https://www.sherry.wine/sherry-wine/production/harvest",
      "https://www.sherry.wine/sherry-wine/production/vinification",
      "https://www.sherry.wine/sherry-wine/production/fortification",
      "https://www.sherry.wine/sherry-wine/production/diversity",
      "https://www.sherry.wine/sherry-wine/production/ageing",
      "https://www.sherry.wine/sherry-wine/production/bottling",
      "https://www.sherry.wine/sherry-wine/dry-sherry-wines/manzanilla",
      "https://www.sherry.wine/sherry-wine/dry-sherry-wines/fino",
      "https://www.sherry.wine/sherry-wine/dry-sherry-wines/amontillado",
      "https://www.sherry.wine/sherry-wine/dry-sherry-wines/oloroso",
      "https://www.sherry.wine/sherry-wine/dry-sherry-wines/palo-cortado",
      "https://www.sherry.wine/sherry-wine/naturally-sweet-sherry-wine/pedro-ximenez",
      "https://www.sherry.wine/sherry-wine/naturally-sweet-sherry-wine/moscatel",
      "https://www.sherry.wine/sherry-wine/sweet-sherry-wine/cream",
      "https://www.sherry.wine/sherry-wine/sweet-sherry-wine/pale-cream",
      "https://www.sherry.wine/sherry-wine/sweet-sherry-wine/medium",
      "https://www.sherry.wine/sherry-wine/special-categories",
      "https://www.sherry.wine/news/what-is-fortification-in-sherry-wine",
      "https://www.sherry.wine/news/abc-fortified-wines-jerez",
      "https://www.sherry.wine/documents/122/04a_sherry_wine-making_0.pdf",
    ],
  },
  {
    group: "fortified",
    topic: "fortified",
    key: "ivdp-port",
    publisher: "IVDP — Instituto dos Vinhos do Douro e do Porto",
    homeDomain: "ivdp.pt",
    tier: 1,
    license: "public web, cited with link-back",
    language: "en",
    tsConfig: "english",
    urls: [
      "https://www.ivdp.pt/en/wines/port-wines/introduction",
      "https://www.ivdp.pt/en/wines/port-wines/the-winemaking",
      "https://www.ivdp.pt/en/wines/port-wines/special-categories",
      "https://www.ivdp.pt/en/wines/port-wines/colour-sweetness",
      "https://www.ivdp.pt/en/wines/glossary",
      "https://www.ivdp.pt/en/wines/douro-wines/enology",
      "https://www.ivdp.pt/en/viticulture/vine-culture",
    ],
  },
  {
    group: "fortified",
    topic: "fortified",
    key: "jerez-dop-spec",
    publisher: "DOP Jerez-Xérès-Sherry / Manzanilla — product specification",
    homeDomain: "assets.publishing.service.gov.uk",
    tier: 1,
    license: "official product specification (pliego de condiciones)",
    language: "en",
    tsConfig: "english",
    // The legal text itself: ageing definitions, vessel rules, the criaderas/solera definition. This
    // is the single most authoritative fortified document reachable, and it is the kind of source the
    // first corpus lacked entirely — regulation, not agronomy.
    urls: ["https://assets.publishing.service.gov.uk/media/6682cadcaec8650b10090217/Jerez-Xerez-Sherry_DOP_20.docx"],
  },
  {
    group: "fortified",
    topic: "fortified",
    key: "fortified-reviews",
    publisher: "Peer-reviewed open-access reviews (PMC)",
    homeDomain: "pmc.ncbi.nlm.nih.gov",
    tier: 1,
    license: "open access",
    language: "en",
    tsConfig: "english",
    urls: [
      // Criaderas/solera, flor yeast dynamics, biological ageing mechanisms.
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC12732140",
      // Fortification spirit composition and its effect on Port.
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC10297353",
      // Abreu 2021 — flavour chemistry across Madeira, Port, Sherry AND Muscat in one review. This
      // is the load-bearing entry for Madeira: IVBAM publishes almost nothing technical, so without
      // the peer-reviewed literature estufagem/canteiro would have stayed uncovered.
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC8229606",
      // Madeira estufagem: metabolite evolution under 45 °C thermal processing.
      "https://www.mdpi.com/2227-9717/10/5/1019",
      // Estufagem effect on polyphenols / colour in fortified wine.
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC6269662",
      // Madeira fermentation microbiology (non-Saccharomyces) ahead of fortification.
      "https://www.mdpi.com/2227-9717/11/2/482",
      "https://www.mdpi.com/2227-9717/9/5/799",
    ],
  },
  {
    group: "fortified",
    topic: "fortified",
    key: "madeira-ivbam",
    publisher: "IVBAM / Madeira wine institutional sources",
    homeDomain: "vinhomadeira.pt",
    tier: 1,
    license: "public web, cited with link-back",
    language: "pt",
    tsConfig: "portuguese",
    // Madeira is the weakest link: IVBAM publishes far less technical material online than the
    // Consejo or IVDP. Estufagem/canteiro coverage may end up thin, and if so that must be REPORTED
    // rather than papered over — an under-covered style that the gate no longer suppresses is exactly
    // the failure this whole corpus exists to prevent.
    // CORRECTED after the first dry run: vinhomadeira.pt does not exist. The institute publishes at
    // ivbam.madeira.gov.pt, and what is there is institutional (history, services, annual reports)
    // rather than technical. Kept deliberately small — the real Madeira production coverage comes
    // from the peer-reviewed entries in `fortified-reviews`, and pretending otherwise would overstate
    // this source.
    urls: [
      "https://ivbam.madeira.gov.pt/historico",
      "https://ivbam.madeira.gov.pt/servicos-executivos-ou-operativos/direcao-de-servicos-de-viticultura-e-infraestruturas-vinicas",
    ],
  },
  {
    group: "fortified",
    topic: "fortified",
    key: "civr-vdn",
    publisher: "CIVR — Conseil Interprofessionnel des Vins du Roussillon",
    homeDomain: "roussillon.wine",
    tier: 1,
    license: "public web, cited with link-back",
    language: "fr",
    tsConfig: "french",
    // CORRECTED after the first dry run: the CIVR publishes at roussillon.wine. Like IVBAM this is a
    // promotional site more than a technical one, so VDN depth is limited; mutage is covered better by
    // the fortified-wine reviews above.
    urls: [
      "https://www.roussillon.wine/vins-et-terroirs/nos-aoc-et-igp",
      "https://www.roussillon.wine/vins-et-terroirs/nos-singularites",
      "https://www.roussillon.wine/le-civr",
    ],
  },
  // ===========================================================================================
  // BOTRYTIS / NOBLE ROT — the F4 hole.
  //
  // The first corpus does not merely lack noble rot, it CONTRADICTS it: 56 chunks frame botrytis as
  // bunch rot to be sprayed against, 19 as noble rot, and Sauternes/Tokaji/Beerenauslese appear
  // twice in 3,979 chunks. Viticulture institutes exist to help growers PREVENT botrytis; the sweet-
  // wine world exists to court it. Feeding a Sauternes question rot-control passages is worse than
  // feeding it nothing, which is why the gate suppressed these questions.
  //
  // Deliberately NOT included: papers on bunch rot / grey rot aroma damage. They are good science and
  // they are the exact material that drowned noble rot in the first place. Adding more of it to fix a
  // problem caused by it would be self-defeating.
  // ===========================================================================================
  {
    group: "botrytis",
    topic: "sweet-wine",
    key: "inao-sweet-cdc",
    publisher: "INAO — cahiers des charges (Sauternes, Coteaux du Layon, Alsace VT/SGN)",
    homeDomain: "inao.gouv.fr",
    tier: 1,
    license: "official appellation specification",
    language: "fr",
    tsConfig: "french",
    // The legal texts, and the counterpart of the Jerez DOP spec in the fortified set. These state
    // what the others only describe: harvest "par tries successives", minimum 221 g/L of sugar, and —
    // the detail that makes the point — anti-botrytis sprays are FORBIDDEN in Sauternes.
    urls: [
      "https://info.agriculture.gouv.fr/boagri/document_administratif-1d1c41fa-d838-4b2e-9d53-6392daff9d87/telechargement",
      "https://www.origin-gi.com/wp-content/uploads/2014/08/france_sauternes.pdf",
      "https://extranet.inao.gouv.fr/fichier/PNOCDCCoteauxDuLayon.pdf",
      "https://extranet.inao.gouv.fr/fichier/2.9-PNO-CDC-Coteaux-du-Layon-modifi%C3%A9.pdf",
      "https://info.agriculture.gouv.fr/boagri/document_administratif-cd02193e-eda4-4b68-88c8-2055632ec873/telechargement",
      "https://extranet.inao.gouv.fr/fichier/PNOCDCAlsace.pdf",
      "https://extranet.inao.gouv.fr/fichier/PNODUAlsace.pdf",
    ],
  },
  {
    group: "botrytis",
    topic: "sweet-wine",
    key: "noble-rot-research",
    publisher: "Peer-reviewed noble-rot literature",
    homeDomain: "various",
    tier: 1,
    license: "open access",
    language: "en",
    tsConfig: "english",
    urls: [
      // Botrytized wines review — explicitly covers Tokaji Aszú, Sauternes and TBA together, and is
      // the main Tokaj-bearing entry: no official Hungarian specification was reachable.
      "https://www.dovepress.com/botrytized-wines-ndash-current-perspectives-peer-reviewed-fulltext-article-IJWR",
      // Blanco-Ulate 2015 — the landmark paper on how noble rot reprograms berry metabolism, and the
      // clearest statement anywhere of why noble rot is not grey rot.
      "https://academic.oup.com/plphys/article/169/4/2422/6114124",
      // Induction of noble rot infection under controlled withering conditions.
      "https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2017.01002/full",
    ],
  },
  // ===========================================================================================
  // APPELLATION LAW — what a designation PERMITS, as opposed to how wine is made.
  //
  // The third and largest hole. The first corpus knows fermentation chemistry; it does not know that
  // Barolo requires 38 months' ageing with 18 in wood, that Chianti Classico is min 80% Sangiovese, or
  // that Chablis is Chardonnay only. Those are marks: the MW rubric is variety + region, and origin
  // arguments are won or lost on exactly this material.
  //
  // SCOPED BY THE EXAM, NOT BY THE EU REGISTER. There are 1,200+ EU wine PDOs and crawling them all
  // would be waste. The target list is derived from frequency in the 504-wine exam corpus cross-
  // referenced against data/appellation_varieties.json: 183 appellations actually appear, and the
  // distribution is heavily French (232 mentions), then Italian (71), Portuguese (54), Spanish (46).
  // Port, Jerez, Madeira, Sauternes and Tokaji are already covered by the fortified and botrytis
  // groups, so this group targets what remains.
  //
  // TRANCHE 1. Only URLs confirmed to resolve are listed. INAO filenames are inconsistent
  // (PNOCDC-X.pdf, CDC-X.pdf, PNOCDCX.pdf) so they cannot be generated, and the Italian ministry
  // indexes disciplinari by opaque numeric id. Both make this a curation job rather than a crawl;
  // extending it means adding confirmed URLs here, not loosening a pattern.
  // ===========================================================================================
  {
    group: "appellation",
    topic: "appellation-law",
    key: "inao-aoc-cdc",
    publisher: "INAO — cahiers des charges (AOC)",
    homeDomain: "inao.gouv.fr",
    tier: 1,
    license: "official appellation specification",
    language: "fr",
    tsConfig: "french",
    urls: [
      // Confirmed to resolve. Note the filenames: PNOCDCAOC-Champagne-20190619.pdf,
      // CDC-Chablis-250623-PNO.pdf, 4-CDCPNOvouvray.pdf, pno-cdc-AOC-Meursault-cn250612.pdf. There is
      // no pattern — a first attempt at generating 15 URLs from the observed shapes resolved ZERO of
      // them. Each of these was looked up individually, which is why this grows by curation.
      "https://extranet.inao.gouv.fr/fichier/PNOCDCAOC-Champagne-20190619.pdf",
      "https://extranet.inao.gouv.fr/fichier/CDC-Chablis-250623-PNO.pdf",
      "https://extranet.inao.gouv.fr/fichier/pno-cdc-AOC-Meursault-cn250612.pdf",
      "https://extranet.inao.gouv.fr/fichier/4-CDCPNOvouvray.pdf",
      "https://extranet.inao.gouv.fr/fichier/CDC---Graves-et-Graves-sup%C3%A9rieures---PNO-2023.pdf",
      "https://extranet.inao.gouv.fr/fichier/CDC-Savoie-PNOcn210211.pdf",
      "https://extranet.inao.gouv.fr/fichier/PNO2025AOPSaintPeray.pdf",
      "https://extranet.inao.gouv.fr/fichier/CDC-Bordeaux.pdf",
      "https://extranet.inao.gouv.fr/fichier/PNOCDC-Languedoc.pdf",
      "https://extranet.inao.gouv.fr/fichier/pno-cdc-Alsace-cn240911.pdf",
      // --- tranche 2 (2026-08-03): the appellations the whitelist gate was refusing ---
      "https://info.agriculture.gouv.fr/gedei/site/bo-agri/document_administratif-c5b06e73-5c8e-40fc-81cb-26d1b8a0135a/telechargement", // Sancerre
      "https://extranet.inao.gouv.fr/fichier/CPAOV-2018-108-ChateauneufDuPape.pdf",
      "https://extranet.inao.gouv.fr/fichier/CDCSaint-Emilion-PNO2023.pdf",
      "https://extranet.inao.gouv.fr/fichier/CDCSaint-Emilion-Grand-cru-PNO2023.pdf",
      "https://extranet.inao.gouv.fr/fichier/CDC---Pessac-L%C3%A9ognan---PNO-2024.pdf",
      "https://extranet.inao.gouv.fr/fichier/PNO-cdcBeaujolais-cn220210.pdf",
      "https://extranet.inao.gouv.fr/fichier/3-CDC-Pouilly-Fum%C3%A9-PNO.pdf",
      "https://extranet.inao.gouv.fr/fichier/PNOCDC-Pouilly-Fuisse.pdf",
      "https://extranet.inao.gouv.fr/fichier/CDC-Muscadet-PNO.pdf",
      "https://extranet.inao.gouv.fr/fichier/CDC-Muscadet-S%C3%A8vre-et-Maine-PNO.pdf",
      // Retries for the five that failed extraction on the first tranche-2 run. The documents exist
      // (a plain web search reads them); Tavily's extractor choked, so alternates are listed. Keeping
      // BOTH forms is deliberate — whichever resolves wins, and a duplicate is deduped by URL hash.
      "https://extranet.inao.gouv.fr/fichier/3-CDC-Pessac-L%C3%A9ognan-v170619.pdf",
      "https://extranet.inao.gouv.fr/fichier/PNO-CDC-Modif-AOC-Pessac-Leognan.pdf",
      "https://extranet.inao.gouv.fr/fichier/PNOCDCAOC-St-Emilion-Grand-Cru.pdf",
      "https://info.agriculture.gouv.fr/gedei/site/bo-agri/document_administratif-dc972687-14a5-4be7-96fd-a01742f70956/telechargement",
      "https://info.agriculture.gouv.fr/gedei/site/bo-agri/document_administratif-3a0da993-586b-4570-b26a-03b392acb095/telechargement",
    ],
  },
  {
    group: "appellation",
    topic: "appellation-law",
    key: "italy-disciplinari",
    publisher: "MASAF / Catalogo nazionale — disciplinari di produzione",
    homeDomain: "politicheagricole.it",
    tier: 1,
    license: "official production specification (disciplinare)",
    language: "it",
    tsConfig: "italian",
    // The ministry catalogue keys each denomination by numeric id — Barolo 1011, Chianti Classico
    // 1023, Piemonte 2231 — so these were looked up rather than guessed.
    urls: [
      "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=1011",
      "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=1023",
      "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=2231",
      // tranche 2 — ids looked up individually; the catalogue is keyed by opaque number.
      "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=1013", // Brunello di Montalcino
      "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=2250", // Rosso di Montalcino
      "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=1004", // Amarone della Valpolicella
      "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=2313", // Valpolicella
      "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=2314", // Valpolicella Ripasso
      "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=1054", // Recioto della Valpolicella
      "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=2237", // Prosecco DOC
      "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=1029", // Conegliano Valdobbiadene Prosecco DOCG
      "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=1024", // Asolo Prosecco
      "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=1007", // Barbaresco
      "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=2277", // Soave
      "https://www.chianticlassico.com/wp-content/uploads/2024/01/DOCG_Chianti_Classico_disciplinare_consolidato_con_modifiche_DM_22_giugno_2023.pdf",
    ],
  },
  {
    group: "appellation",
    topic: "appellation-law",
    key: "spain-do-reglamento",
    publisher: "Consejo Regulador DOCa Rioja / DO Cava",
    homeDomain: "riojawine.com",
    tier: 1,
    license: "official regulation / pliego de condiciones",
    language: "es",
    tsConfig: "spanish",
    // Rioja's reglamento carries the crianza / reserva / gran reserva ageing minima — the single most
    // exam-relevant fact about the region, and absent from every other corpus here.
    urls: [
      "https://riojawine.com/wp-content/uploads/2018/08/Estatutos.pdf",
      "https://www.cava.wine/documents/335/Requisitos_minimos_etiquetado_DOP_CAVA_-_2021.pdf",
      "https://www.mapa.gob.es/dam/mapa/contenido/alimentacion/temas/calidad-agroalimentaria/2017-calidad-diferenciada/nuevo_denominaciones/pliegos-de-condiciones/pliego-condiciones-vinos/dops/ribera_del_duero_2023_07_31.pdf",
      "https://www.doqpriorat.org/wp-content/uploads/2019/02/Texto-consolidado-PC-Priorat-Julio-2013.pdf",
    ],
  },
];

// ---------------------------------------------------------------------------------------------

async function tavilyExtract(urls) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is required");
  const out = [];
  // Tavily caps URLs per request; keep batches small so one bad URL fails a small blast radius.
  for (let i = 0; i < urls.length; i += 5) {
    const batch = urls.slice(i, i + 5);
    const res = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ urls: batch, format: "markdown", extract_depth: "advanced" }),
    });
    if (!res.ok) {
      console.warn(`  tavily extract HTTP ${res.status} for ${batch.length} url(s) — skipped`);
      continue;
    }
    const json = await res.json();
    for (const r of json.results ?? []) out.push({ url: r.url, markdown: r.raw_content ?? "" });
    for (const f of json.failed_results ?? []) console.warn(`  failed: ${f.url} (${f.error ?? "unknown"})`);
  }
  return out;
}

async function embedTexts(texts) {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is required");
  const out = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    // input_type MUST be "document" here. The first corpus's vectors were built that way, and query
    // vectors use "query"; mixing them degrades retrieval silently.
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: batch, model: VOYAGE_MODEL, input_type: "document" }),
    });
    if (!res.ok) throw new Error(`Voyage HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const vecs = json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    for (const v of vecs) {
      if (v.length !== VOYAGE_DIM || v.some((x) => !Number.isFinite(x))) {
        throw new Error(`Voyage returned an invalid vector (dim ${v.length})`);
      }
    }
    out.push(...vecs);
    process.stdout.write(`\r    embedded ${out.length}/${texts.length}`);
  }
  return out;
}

/**
 * Drop chunks that are not content.
 *
 * WHY. Retrieval returns six passages. Every slot spent on a journal's "Disclosure" section, a
 * reference list, or the sherry.wine navigation menu is a slot NOT spent on production detail, and the
 * cost is invisible — the answer is merely a little worse. Measured on the first web-built corpus:
 * 57 chunks of journal front/back matter, 79 carrying the site nav, 3 age-gate/legal footers. Small in
 * percentage terms, large in top-6 terms, because boilerplate repeats across a document and so
 * competes many times.
 *
 * STRUCTURAL FIRST, patterns second. Site-specific strings rot the moment a site is redesigned, so the
 * heavy lifting is done by shape — link density, short-line ratio, citation ratio — with a small
 * pattern list only for things shape cannot catch (an age gate is prose).
 *
 * THE ONE THING THIS MUST NOT DO is eat the INAO cahiers des charges. Legal text is terse, clause
 * numbered and list-shaped: exactly what a naive "looks like navigation" heuristic deletes. That is
 * why the nav test additionally requires high LINK density — regulations have clauses, not hyperlinks
 * — and why there is no minimum-sentence rule. Verified by the drop-rate report in --dry-run.
 */
function isBoilerplate(text) {
  // The chunker prepends a breadcrumb line; judge the body.
  const body = text.replace(/^[^\n]*\n/, "").trim();
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return true;

  // 1. Journal front/back matter, by leading heading.
  if (/^(#+\s*|\*\*)?(Disclosure|Acknowledge?ments?|Conflicts? of Interest|Author Contributions|Data Availability|Funding|ORCID|Publisher's Note|Abbreviations|Supplementary Material)\b/im.test(body)) {
    return true;
  }
  // 2. Reference lists — majority of lines are citations.
  const refLines = lines.filter((l) => /^\d+\.\s|doi:|doi\.org|\[PubMed\]|Google Scholar|CrossRef/i.test(l)).length;
  if (lines.length >= 4 && refLines / lines.length > 0.5) return true;

  // 3. Navigation. Requires BOTH many short lines AND many links — the second condition is what keeps
  //    clause-numbered legal text (short lines, no links) out of this branch.
  const shortLines = lines.filter((l) => l.length < 45).length;
  const links = (body.match(/\]\(|https?:\/\//g) ?? []).length;
  if (lines.length >= 6 && shortLines / lines.length > 0.75 && links >= lines.length * 0.3) return true;

  // 4. Age gate / cookie / legal footer — prose, so shape cannot catch it.
  if (/âge légal|l'âge légal|consommer de l'alcool|abus d'alcool est dangereux|politique de confidentialité|cookie policy/i.test(body)) {
    return true;
  }
  // 5. Almost nothing there.
  if (body.replace(/[^\p{L}]/gu, "").length < 120) return true;

  return false;
}

function titleOf(markdown, url) {
  const h1 = markdown.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim().slice(0, 200);
  return decodeURIComponent(url.split("/").filter(Boolean).pop() || url).slice(0, 200);
}

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  const sources = ONLY ? SOURCES.filter((s) => s.key === ONLY)
    : GROUP ? SOURCES.filter((s) => s.group === GROUP)
    : SOURCES;
  console.log(`\n=== kb-fortified-build ${DRY_RUN ? "(DRY RUN — no embedding, no writes)" : ""} ===\n`);

  let grandChunks = 0;
  const report = [];

  for (const src of sources) {
    console.log(`${src.key}  (${src.publisher}, tier ${src.tier}, ${src.language})`);
    const docs = await tavilyExtract(src.urls);
    console.log(`  fetched ${docs.length}/${src.urls.length} url(s)`);

    const prepared = [];
    let dropped = 0;
    for (const d of docs) {
      if (!d.markdown || d.markdown.length < 400) {
        console.warn(`  thin/empty, skipped: ${d.url} (${d.markdown?.length ?? 0} chars)`);
        continue;
      }
      const title = titleOf(d.markdown, d.url);
      const all = chunkMarkdown(d.markdown, title);
      const chunks = all.filter((c) => !isBoilerplate(c.text));
      dropped += all.length - chunks.length;
      if (chunks.length) prepared.push({ url: d.url, title, chunks });
    }
    const nChunks = prepared.reduce((n, p) => n + p.chunks.length, 0);
    console.log(`  ${prepared.length} document(s) -> ${nChunks} chunk(s)  (dropped ${dropped} boilerplate)`);
    grandChunks += nChunks;
    report.push({ key: src.key, docs: prepared.length, chunks: nChunks });

    if (DRY_RUN || nChunks === 0) { console.log(""); continue; }

    // --- embed -------------------------------------------------------------------------------
    const allTexts = prepared.flatMap((p) => p.chunks.map((c) => c.text));
    const vectors = await embedTexts(allTexts);
    console.log("");

    // --- write -------------------------------------------------------------------------------
    await sql`
      INSERT INTO kb_source (key, publisher, home_domain, tier, license, active)
      VALUES (${src.key}, ${src.publisher}, ${src.homeDomain}, ${src.tier}, ${src.license}, TRUE)
      ON CONFLICT (key) DO UPDATE SET publisher = EXCLUDED.publisher, tier = EXCLUDED.tier`;

    let vi = 0;
    for (const p of prepared) {
      // HASH the whole URL. The first version truncated base64url to 40 chars, which encodes only 30
      // BYTES of URL — and every sherry page shares the prefix "https://www.sherry.wine/sherry", so
      // all 19 of them produced an identical id. Combined with the DELETE below (which exists so a
      // re-run replaces rather than duplicates) each collision silently wiped the previous page's
      // chunks: 22 URLs collapsed to 4 documents and ~918 already-embedded chunks were discarded.
      // A truncated identifier is only safe when the truncated part is the part that varies.
      const docId = `fort_${src.key}_${createHash("sha1").update(p.url).digest("hex").slice(0, 24)}`;
      await sql`
        INSERT INTO kb_document (id, source_key, canonical_url, canonical_title, publisher, tier,
                                 language, ts_config, published_at, sitemap_lastmod)
        VALUES (${docId}, ${src.key}, ${p.url}, ${p.title}, ${src.publisher}, ${src.tier},
                ${src.language}, ${src.tsConfig}, NULL, NULL)
        ON CONFLICT (id) DO UPDATE SET canonical_title = EXCLUDED.canonical_title`;
      // Rebuild semantics: drop this document's old chunks so a re-run replaces rather than duplicates.
      await sql`DELETE FROM kb_chunk WHERE document_id = ${docId}`;

      for (let i = 0; i < p.chunks.length; i += INSERT_BATCH) {
        const batch = p.chunks.slice(i, i + INSERT_BATCH);
        await Promise.all(batch.map((c, j) => {
          const vec = vectors[vi + i + j];
          return sql`
            INSERT INTO kb_chunk (id, document_id, ordinal, section_path, text, token_count, embedding,
                                  embedding_model, embedding_dim, language, ts_config, search_vector,
                                  topic, is_regional_practice)
            VALUES (${`${docId}_c${c.ordinal}`}, ${docId}, ${c.ordinal}, ${c.sectionPath}, ${c.text},
                    ${c.tokenCount}, ${`[${vec.join(",")}]`}::vector, ${VOYAGE_MODEL}, ${VOYAGE_DIM},
                    ${src.language}, ${src.tsConfig},
                    to_tsvector(${src.tsConfig}::regconfig, ${c.text}),
                    ${src.topic}, TRUE)
            ON CONFLICT (id) DO NOTHING`;
        }));
      }
      vi += p.chunks.length;
    }
    console.log(`  written.\n`);
  }

  console.log("=".repeat(64));
  for (const r of report) console.log(`  ${r.key.padEnd(22)} ${String(r.docs).padStart(3)} docs  ${String(r.chunks).padStart(5)} chunks`);
  console.log(`  ${"TOTAL".padEnd(22)} ${String(report.reduce((n, r) => n + r.docs, 0)).padStart(3)} docs  ${String(grandChunks).padStart(5)} chunks`);
  if (DRY_RUN) console.log("\nDry run — nothing embedded, nothing written.\n");
}

main().catch((e) => { console.error(`\nkb-fortified-build failed: ${e.message}`); process.exit(1); });
