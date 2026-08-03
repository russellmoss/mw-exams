// Cross-lingual production lexicon for the LEXICAL arm of hybrid retrieval.
//
// WHY THIS EXISTS, and why it is not the same as the source system's synonyms.ts.
//
// Wine-inventory's synonym map expands ACRONYMS within English ("KMBS" -> "potassium metabisulfite")
// because its corpus is overwhelmingly English extension material. Ours is not. Measured on the
// imported slice: Union des Maisons de Champagne is 5,200/5,200 chunks French, WBI 5,205/5,468 German,
// LVWO 1,860/2,155 German, Chambre d'Agriculture Gironde 546/614 French, ICVV 293/397 Spanish. UMC is
// the single best sparkling-production source in the corpus and every word of it is French.
//
// The naive fix — build each document's tsvector with its own language config — is NECESSARY but NOT
// SUFFICIENT, and it is worth being precise about why, because it is easy to ship the half that does
// nothing. Stemming config decides that "fermentations" and "fermentation" are the same token. It does
// NOT decide that "second fermentation in bottle" and "prise de mousse" are the same CONCEPT. An
// English query tokenised under the french config still produces English lexemes, which appear nowhere
// in a French document. Config routing alone leaves the lexical arm returning nothing on the best
// content we have — and returning nothing SILENTLY, degrading hybrid search to dense-only exactly where
// we most wanted two arms.
//
// So the load-bearing part is this table: a curated concept map that carries MW production vocabulary
// across the four corpus languages. Dense retrieval already handles cross-lingual matching reasonably
// (voyage-4 is multilingual); this restores the lexical arm's specific strength, which is exact terms
// of art — "dégorgement", "Edelfäule", "solera" — that embeddings blur.
//
// SCOPE. Production vocabulary only. No appellation, region, or variety terms: retrieval is gated to
// production questions, and terms that pull regional passages would defeat that gate.
//
// EXTENDING IT. Add a concept with whatever languages you are confident about — a missing translation
// costs a missed lexical hit, a WRONG one poisons every query containing that concept. Omit rather
// than guess. Entries here are deliberately conservative for that reason.

/** Postgres text-search configurations present in the corpus. `simple` is the fallback (no stemming). */
export const TS_CONFIGS = ["english", "french", "german", "spanish", "italian"] as const;
export type TsConfig = (typeof TS_CONFIGS)[number] | "simple";

/**
 * One production concept, expressed in each language we can express it in.
 *
 * ITALIAN WAS ADDED LATE, and the reason is worth recording because it is the same mistake twice.
 * The original map covered en/fr/de/es because that was the corpus. Then the appellation build added
 * 451 chunks of MASAF disciplinari in Italian — and nobody extended this file, so the Italian lexical
 * arm never existed and Italian appellations were reachable by dense retrieval alone. Measured before
 * the fix: an English lexical query scored 0 of 451 Italian chunks; an Italian one scored 155. That
 * is the H1 failure from the French corpus, recurring exactly.
 *
 * THE RULE THIS ESTABLISHES: adding content in a new language means adding it HERE and to TS_CONFIGS
 * in the same change. The failure is silent — retrieval keeps working, just worse, on the content you
 * just paid to add.
 */
interface Concept {
  english: string[];
  french?: string[];
  german?: string[];
  spanish?: string[];
  italian?: string[];
}

const CONCEPTS: Concept[] = [
  // --- fermentation ---
  {
    english: ["malolactic fermentation", "malolactic", "mlf"],
    french: ["fermentation malolactique", "malolactique"],
    german: ["malolaktische Gärung", "biologischer Säureabbau"],
    spanish: ["fermentación maloláctica", "maloláctica"],
    italian: ["fermentazione malolattica", "malolattica"],
  },
  {
    english: ["fermentation temperature", "cool fermentation", "warm fermentation"],
    french: ["température de fermentation"],
    german: ["Gärtemperatur"],
    spanish: ["temperatura de fermentación"],
    italian: ["temperatura di fermentazione"],
  },
  {
    english: ["wild yeast", "indigenous yeast", "ambient yeast", "spontaneous fermentation"],
    french: ["levures indigènes", "fermentation spontanée"],
    german: ["Spontangärung", "Naturhefe"],
    spanish: ["levaduras autóctonas", "fermentación espontánea"],
    italian: ["lieviti indigeni", "fermentazione spontanea"],
  },
  {
    english: ["cultured yeast", "selected yeast", "inoculated"],
    french: ["levures sélectionnées", "levurage"],
    german: ["Reinzuchthefe"],
    spanish: ["levaduras seleccionadas"],
    italian: ["lieviti selezionati"],
  },
  {
    english: ["stuck fermentation"],
    french: ["fermentation languissante", "arrêt de fermentation"],
    german: ["Gärstockung"],
    spanish: ["fermentación parada"],
  },
  {
    english: ["yeast assimilable nitrogen", "yan"],
    french: ["azote assimilable"],
    german: ["hefeverwertbarer Stickstoff"],
    spanish: ["nitrógeno asimilable"],
  },

  // --- lees and élevage ---
  {
    english: ["lees", "sur lie", "lees ageing", "lees contact"],
    french: ["lies", "sur lie", "élevage sur lies"],
    german: ["Hefelager", "Feinhefe", "auf der Hefe"],
    spanish: ["lías", "sobre lías", "crianza sobre lías"],
    italian: ["fecce", "sui lieviti", "fecce fini"],
  },
  {
    english: ["lees stirring", "batonnage", "bâtonnage"],
    french: ["bâtonnage"],
    german: ["Aufrühren der Hefe"],
    spanish: ["bâtonnage", "removido de lías"],
    italian: ["bâtonnage", "rimescolamento delle fecce"],
  },
  {
    english: ["barrel", "oak", "barrique", "new oak", "oak ageing"],
    french: ["barrique", "fût de chêne", "chêne", "bois neuf"],
    german: ["Barrique", "Holzfass", "Eichenholz"],
    spanish: ["barrica", "roble", "roble nuevo"],
    italian: ["barrique", "botte", "rovere", "legno"],
  },
  {
    english: ["large format cask", "foudre", "botti"],
    french: ["foudre", "demi-muid"],
    german: ["Stückfass", "Halbstückfass", "Holzfuder"],
    spanish: ["tino", "fudre"],
    italian: ["botte grande", "botti di rovere"],
  },
  {
    english: ["ageing", "maturation", "elevage", "élevage"],
    french: ["élevage", "vieillissement"],
    german: ["Ausbau", "Reifung"],
    spanish: ["crianza", "envejecimiento"],
    italian: ["affinamento", "invecchiamento", "maturazione"],
  },
  {
    english: ["oxidative ageing", "oxidative"],
    french: ["élevage oxydatif", "oxydatif"],
    german: ["oxidativer Ausbau"],
    spanish: ["crianza oxidativa"],
    italian: ["affinamento ossidativo", "ossidativo"],
  },
  {
    english: ["reductive", "protective winemaking", "anaerobic handling"],
    french: ["élevage réducteur", "vinification réductrice"],
    german: ["reduktiver Ausbau"],
    spanish: ["crianza reductiva"],
    italian: ["riduttivo"],
  },
  {
    english: ["micro-oxygenation", "microoxygenation"],
    french: ["micro-oxygénation"],
    german: ["Mikrooxygenierung"],
    spanish: ["microoxigenación"],
  },
  {
    english: ["concrete", "amphora", "concrete egg", "qvevri"],
    french: ["amphore", "cuve béton", "béton"],
    german: ["Amphore", "Betonei", "Beton"],
    spanish: ["ánfora", "hormigón", "tinaja"],
    italian: ["anfora", "cemento"],
  },
  {
    english: ["stainless steel", "inert vessel"],
    french: ["inox", "acier inoxydable"],
    german: ["Edelstahl", "Edelstahltank"],
    spanish: ["acero inoxidable"],
    italian: ["acciaio inox", "acciaio inossidabile"],
  },

  // --- must handling and extraction ---
  {
    english: ["skin contact", "maceration", "extended maceration"],
    french: ["macération pelliculaire", "macération"],
    german: ["Maischestandzeit", "Maischegärung"],
    spanish: ["maceración", "contacto con hollejos"],
    italian: ["macerazione", "contatto con le bucce"],
  },
  {
    english: ["carbonic maceration", "semi-carbonic"],
    french: ["macération carbonique", "semi-carbonique"],
    german: ["Kohlensäuremaischung"],
    spanish: ["maceración carbónica"],
    italian: ["macerazione carbonica"],
  },
  {
    english: ["cold soak", "pre-fermentation maceration"],
    french: ["macération préfermentaire à froid"],
    german: ["Kaltmazeration"],
    spanish: ["maceración prefermentativa en frío"],
  },
  {
    english: ["whole bunch", "whole cluster", "whole-bunch fermentation"],
    french: ["grappe entière", "vendange entière"],
    german: ["Ganztraubenpressung", "ganze Trauben"],
    spanish: ["racimo entero"],
    italian: ["grappolo intero", "raspi"],
  },
  {
    english: ["destemming", "destemmed"],
    french: ["éraflage", "égrappage"],
    german: ["Entrappen", "Abbeeren"],
    spanish: ["despalillado"],
    italian: ["diraspatura"],
  },
  {
    english: ["pressing", "press", "whole bunch pressing"],
    french: ["pressurage", "pressage"],
    german: ["Kelterung", "Pressen", "Ganztraubenpressung"],
    spanish: ["prensado"],
    italian: ["pressatura", "torchiatura"],
  },
  {
    english: ["free run juice", "free-run"],
    french: ["jus de goutte", "moût de goutte"],
    german: ["Vorlaufmost", "Seihmost"],
    spanish: ["mosto flor", "lágrima"],
    italian: ["mosto fiore"],
  },
  {
    english: ["press wine", "press fraction"],
    french: ["vin de presse", "taille"],
    german: ["Presswein"],
    spanish: ["vino de prensa"],
    italian: ["vino di torchio"],
  },
  {
    english: ["settling", "juice clarification", "debourbage"],
    french: ["débourbage"],
    german: ["Mostvorklärung", "Vorklärung"],
    spanish: ["desfangado"],
    italian: ["sfecciatura", "decantazione"],
  },
  {
    english: ["punch down", "pigeage"],
    french: ["pigeage"],
    german: ["Unterstoßen"],
    spanish: ["bazuqueo"],
    italian: ["follatura"],
  },
  {
    english: ["pump over", "remontage"],
    french: ["remontage"],
    german: ["Umpumpen", "Überpumpen"],
    spanish: ["remontado"],
    italian: ["rimontaggio"],
  },
  {
    english: ["cap management", "cap"],
    french: ["chapeau de marc", "gestion du chapeau"],
    german: ["Tresterhut"],
    spanish: ["sombrero"],
    italian: ["cappello"],
  },
  {
    english: ["thermovinification", "flash detente", "flash détente"],
    french: ["thermovinification", "flash détente"],
    german: ["Maischeerhitzung"],
    spanish: ["termovinificación"],
  },
  {
    english: ["must", "juice"],
    french: ["moût"],
    german: ["Most"],
    spanish: ["mosto"],
    italian: ["mosto"],
  },

  // --- sparkling ---
  {
    english: ["traditional method", "bottle fermented", "second fermentation in bottle"],
    french: ["méthode traditionnelle", "méthode champenoise", "prise de mousse", "seconde fermentation"],
    german: ["traditionelle Flaschengärung", "Flaschengärung", "zweite Gärung"],
    spanish: ["método tradicional", "segunda fermentación en botella"],
  },
  {
    english: ["tirage", "liqueur de tirage"],
    french: ["tirage", "liqueur de tirage"],
    german: ["Tirage", "Fülldosage"],
    spanish: ["tiraje", "licor de tiraje"],
  },
  {
    english: ["autolysis", "autolytic", "yeast autolysis"],
    french: ["autolyse"],
    german: ["Autolyse", "Hefeautolyse"],
    spanish: ["autólisis"],
  },
  {
    english: ["riddling"],
    french: ["remuage"],
    german: ["Rütteln", "Rüttelpult"],
    spanish: ["removido"],
  },
  {
    english: ["disgorgement", "disgorging"],
    french: ["dégorgement"],
    german: ["Degorgieren", "Degorgierung"],
    spanish: ["degüelle"],
  },
  {
    english: ["dosage", "liqueur d'expedition", "brut nature", "zero dosage"],
    french: ["dosage", "liqueur d'expédition", "brut nature"],
    german: ["Dosage", "Versanddosage"],
    spanish: ["dosaje", "licor de expedición"],
  },
  {
    english: ["tank method", "charmat", "cuve close"],
    french: ["cuve close", "méthode Charmat"],
    german: ["Tankgärung", "Großraumgärverfahren"],
    spanish: ["método charmat", "granvás"],
  },
  {
    english: ["ancestral method", "petillant naturel", "pet-nat"],
    french: ["méthode ancestrale", "pétillant naturel"],
    german: ["méthode ancestrale"],
    spanish: ["método ancestral"],
  },
  {
    english: ["reserve wine", "perpetual reserve"],
    french: ["vins de réserve", "réserve perpétuelle"],
    german: ["Reserveweine"],
    spanish: ["vinos de reserva"],
  },

  // --- sweet, fortified, oxidative ---
  {
    english: ["botrytis", "noble rot", "botrytised"],
    french: ["pourriture noble", "botrytis"],
    german: ["Edelfäule", "Botrytis"],
    spanish: ["podredumbre noble", "botritis"],
    italian: ["muffa nobile", "botrite"],
  },
  {
    english: ["dried grapes", "raisined", "passerillage", "appassimento"],
    french: ["passerillage", "raisins passerillés"],
    german: ["Trockenbeeren"],
    spanish: ["pasificación", "uvas pasificadas"],
    italian: ["appassimento", "uve appassite", "ripasso", "governo"],
  },
  {
    english: ["ice wine", "eiswein", "cryoextraction", "freeze concentration"],
    french: ["cryoextraction", "vin de glace"],
    german: ["Eiswein", "Gefrierkonzentration"],
    spanish: ["vino de hielo", "crioextracción"],
  },
  {
    english: ["fortification", "fortified", "mutage"],
    french: ["mutage", "vinage", "vin doux naturel"],
    german: ["Aufspriten", "Likörwein"],
    spanish: ["encabezado", "fortificación", "vino generoso"],
  },
  {
    english: ["flor", "biological ageing", "veil of yeast"],
    french: ["voile de levures", "fleur"],
    german: ["Florhefe"],
    spanish: ["velo de flor", "crianza biológica", "flor"],
  },
  {
    english: ["solera", "criadera", "fractional blending"],
    french: ["solera"],
    german: ["Solera"],
    spanish: ["solera", "criaderas", "sistema de criaderas"],
  },
  {
    english: ["residual sugar", "sweetness level"],
    french: ["sucre résiduel"],
    german: ["Restzucker"],
    spanish: ["azúcar residual"],
    italian: ["zucchero residuo"],
  },
  {
    english: ["sussreserve", "süssreserve", "unfermented must sweetening"],
    german: ["Süßreserve"],
  },

  // --- adjustments and stabilisation ---
  {
    english: ["sulfur dioxide", "sulphur dioxide", "so2", "sulfite", "sulphite"],
    french: ["dioxyde de soufre", "anhydride sulfureux", "sulfites"],
    german: ["Schwefeldioxid", "schweflige Säure", "Sulfite"],
    spanish: ["dióxido de azufre", "anhídrido sulfuroso", "sulfitos"],
    italian: ["anidride solforosa", "solfiti"],
  },
  {
    english: ["chaptalisation", "chaptalization", "enrichment"],
    french: ["chaptalisation", "enrichissement"],
    german: ["Anreicherung", "Chaptalisierung"],
    spanish: ["chaptalización"],
    italian: ["arricchimento"],
  },
  {
    english: ["acidification"],
    french: ["acidification"],
    german: ["Säuerung"],
    spanish: ["acidificación"],
    italian: ["acidificazione"],
  },
  {
    english: ["deacidification"],
    french: ["désacidification"],
    german: ["Entsäuerung"],
    spanish: ["desacidificación"],
  },
  {
    english: ["fining", "fined"],
    french: ["collage"],
    german: ["Schönung"],
    spanish: ["clarificación", "encolado"],
    italian: ["chiarifica"],
  },
  {
    english: ["filtration", "filtered", "unfiltered"],
    french: ["filtration", "non filtré"],
    german: ["Filtration", "unfiltriert"],
    spanish: ["filtración", "sin filtrar"],
    italian: ["filtrazione"],
  },
  {
    english: ["cold stabilisation", "tartrate stability"],
    french: ["stabilisation tartrique"],
    german: ["Weinsteinstabilisierung", "Kältestabilisierung"],
    spanish: ["estabilización tartárica"],
  },
  {
    english: ["reverse osmosis"],
    french: ["osmose inverse"],
    german: ["Umkehrosmose"],
    spanish: ["ósmosis inversa"],
  },
  {
    english: ["blending", "assemblage", "cuvee"],
    french: ["assemblage"],
    german: ["Verschnitt", "Cuvée"],
    spanish: ["mezcla", "coupage", "ensamblaje"],
    italian: ["taglio", "assemblaggio"],
  },
  {
    english: ["bottling", "bottled"],
    french: ["mise en bouteille"],
    german: ["Abfüllung", "Flaschenfüllung"],
    spanish: ["embotellado"],
    italian: ["imbottigliamento"],
  },

  // --- faults and analysis ---
  {
    english: ["brettanomyces", "brett"],
    french: ["brettanomyces"],
    german: ["Brettanomyces"],
    spanish: ["brettanomyces"],
  },
  {
    english: ["volatile acidity", "va"],
    french: ["acidité volatile"],
    german: ["flüchtige Säure"],
    spanish: ["acidez volátil"],
    italian: ["acidità volatile"],
  },
  {
    english: ["titratable acidity", "total acidity", "ta"],
    french: ["acidité totale"],
    german: ["Gesamtsäure", "titrierbare Säure"],
    spanish: ["acidez total"],
    italian: ["acidità totale"],
  },
  {
    english: ["reduction", "reductive fault", "hydrogen sulfide"],
    french: ["réduction", "hydrogène sulfuré"],
    german: ["Böckser", "Schwefelwasserstoff"],
    spanish: ["reducción", "sulfhídrico"],
  },
  {
    english: ["oxidation", "oxidised", "oxidized"],
    french: ["oxydation", "oxydé"],
    german: ["Oxidation", "oxidiert"],
    spanish: ["oxidación", "oxidado"],
    italian: ["ossidazione"],
  },
  {
    english: ["ripeness", "harvest date", "picking decision"],
    french: ["maturité", "date de vendange"],
    german: ["Reife", "Lesezeitpunkt"],
    spanish: ["madurez", "fecha de vendimia"],
    italian: ["maturazione delle uve", "vendemmia"],
  },
];

/** Language key -> the Postgres text-search config that indexes it. */
const CONFIG_OF: Record<keyof Concept, TsConfig> = {
  english: "english",
  french: "french",
  german: "german",
  spanish: "spanish",
  italian: "italian",
};

/**
 * Build one lexical query per corpus language.
 *
 * A concept fires when ANY of its terms (in any language) appears in the query — normally the English
 * one, since the app's questions are English, but a query that already says "dégorgement" also pulls in
 * "disgorgement" and "Degorgieren".
 *
 * Returns an entry for `english` always (the raw query, so ordinary English retrieval is never worse
 * than before) and for each other language ONLY when at least one concept matched. Firing a French arm
 * with no French terms in it would return noise ranked by nothing, so we skip it — a missing arm is
 * cheaper than a misleading one.
 */
export function buildLexicalQueries(query: string): { tsConfig: TsConfig; query: string }[] {
  const lower = query.toLowerCase();
  const hits: Concept[] = [];

  for (const concept of CONCEPTS) {
    const allTerms = [
      ...(concept.english ?? []),
      ...(concept.french ?? []),
      ...(concept.german ?? []),
      ...(concept.spanish ?? []),
      ...(concept.italian ?? []),
    ];
    if (allTerms.some((t) => lower.includes(t.toLowerCase()))) hits.push(concept);
  }

  const out: { tsConfig: TsConfig; query: string }[] = [];

  // English arm.
  //
  // MUST be OR-joined, exactly like the other languages. websearch_to_tsquery ANDs unquoted words, so
  // handing it a whole question — "How was this sparkling wine made? Explain the second fermentation,
  // riddling and disgorgement." — demands that every one of those tokens appear in a single chunk, and
  // appending synonyms makes it MONOTONICALLY WORSE. Measured against the live corpus before this fix:
  // the English arm returned 0 rows on all three smoke queries while the French arm returned 24. The
  // source system gets away with `${query} ${extras}` because its callers pass short topic strings, not
  // sentences; ours passes exam questions.
  //
  // Falling back to the raw query when nothing matched is deliberate: no production concept means the
  // lexical arm has nothing useful to contribute anyway, and an OR over an empty set is not a query.
  const englishTerms = new Set<string>();
  for (const c of hits) for (const t of c.english ?? []) englishTerms.add(t);
  out.push({
    tsConfig: "english",
    query: englishTerms.size ? [...englishTerms].join(" OR ") : query,
  });

  for (const lang of ["french", "german", "spanish", "italian"] as const) {
    const terms = new Set<string>();
    for (const c of hits) for (const t of c[lang] ?? []) terms.add(t);
    if (terms.size === 0) continue;
    out.push({ tsConfig: CONFIG_OF[lang], query: [...terms].join(" OR ") });
  }

  return out;
}

/** Every concept's terms in one language, for the export-time topical prefilter. */
export function allTerms(lang: keyof Concept): string[] {
  return CONCEPTS.flatMap((c) => c[lang] ?? []);
}
