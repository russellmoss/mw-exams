// question-rules.mjs — THE single source of truth for the stem<->wine "contradiction" rules.
//
// These rules used to live twice: text-based copies in question-engine.ts (run at generation on raw
// fullText) and key-based copies in question-validator.ts (run by the audit + feedback path on the
// resolved answer key). That duplication drifted. They now live HERE, once, operating on a small
// normalized shape (a resolved wine: { slot, varieties[], region?, country?, is_blend?, style? }).
// Each stage adapts its data and calls applyQuestionRules — the engine via a text adapter (detect
// variety/country from fullText), the validator by passing its already-resolved AuditWine.
//
// Kept as plain .mjs (not .ts) so the CI-invoked node scripts (audit-questions.mjs via
// question-validator.ts) can import it directly; the TS app imports it too (allowJs + bundler), the
// same pattern as stem-answer-key.mjs. Stage-specific checks intentionally stay with their stage:
// the engine keeps generation-only checks (banker, flight-size, novelty, generation-consistency,
// white/red grape scope, per-sub-question marks) + its retry/relax loop; the validator keeps the
// severity->ok mapping.

const NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

// Canonicalise so synonyms don't read as different grapes (the "same variety" / "different
// varieties" checks). THE single synonym table for the whole app — question-engine.ts and
// stem-scoring.ts import this one rather than keeping their own.
//
// They used to keep three separate copies, which drifted: stem-scoring knew monastrell=mourvedre and
// pinot grigio=pinot gris, this file didn't; question-engine had only a four-entry .replace() chain
// that canonicalised toward "pinot grigio" while this file canonicalised toward "pinot gris". The
// Fill-the-Bank pilot banked a question whose stem promised three DIFFERENT varieties over an Alsace
// Pinot Noir, a Cannonau di Sardegna and a Campo de Borja Garnacha — Cannonau and Garnacha are both
// Grenache. The generation-stage check read them as distinct because no table knew "cannonau"; the
// answer-key resolver (richer lexicon) caught it only afterwards. Keys are pre-normalized ASCII —
// lowercase, accents stripped — so they match under every caller's `norm`.
//
// Keep in sync with data/variety_lexicon.json's `synonyms` (the answer-key resolver's copy); the two
// disagreeing is exactly the failure above.
/** @type {Record<string, string>} */
export const VARIETY_SYNONYMS = {
  // ── Pinot family ──
  spatburgunder: "pinot noir",
  blauburgunder: "pinot noir",
  "pinot nero": "pinot noir",
  grauburgunder: "pinot gris",
  rulander: "pinot gris",
  "pinot grigio": "pinot gris",
  weissburgunder: "pinot blanc",
  "pinot bianco": "pinot blanc",

  // ── Syrah ──
  shiraz: "syrah",

  // ── Grenache ──
  garnacha: "grenache",
  "garnacha tinta": "grenache",
  cannonau: "grenache",
  // "Grenache Noir" is the full French name for plain Grenache. The answer-key resolver emits it
  // verbatim off some labels, so without this entry a correct same-variety Grenache flight audited
  // as two varieties ("grenache, grenache noir") and was queued for quarantine.
  "grenache noir": "grenache",
  "garnacha blanca": "grenache blanc",

  // ── Tempranillo ──
  "tinta de toro": "tempranillo",
  "tinto fino": "tempranillo",
  // Feminine variant seen on real Ribera labels ("Tinta Fina Reserva") — without it the key emitted
  // "Tinta Fina" as its own grape and a correct Tempranillo answer audited as missing the variety.
  "tinta fina": "tempranillo",
  "tinta roriz": "tempranillo",
  aragonez: "tempranillo",
  "ull de llebre": "tempranillo",
  cencibel: "tempranillo",

  // ── Mourvedre ──
  mataro: "mourvedre",
  monastrell: "mourvedre",

  // ── Carignan ──
  carinena: "carignan",
  mazuelo: "carignan",
  samso: "carignan",

  // ── Nebbiolo ──
  spanna: "nebbiolo",
  chiavennasca: "nebbiolo",

  // ── Sangiovese ──
  brunello: "sangiovese",
  morellino: "sangiovese",
  "prugnolo gentile": "sangiovese",
  nielluccio: "sangiovese",

  // ── Blaufrankisch ──
  lemberger: "blaufrankisch",
  kekfrankos: "blaufrankisch",

  // ── Zinfandel ──
  primitivo: "zinfandel",
  tribidrag: "zinfandel",

  // ── Palomino ──
  // The answer-key resolver emits "Palomino Fino" off Sherry keys; answers (and the indicator
  // regexes) say plain "Palomino". Without this fold the two read as different grapes — 12 correct
  // Sherry model answers audited as "never names the variety".
  "palomino fino": "palomino",

  // ── Other reds ──
  cot: "malbec",
  durif: "petite sirah",
  "touriga francesa": "touriga franca",
  "tinta negra mole": "tinta negra",
  nerello: "nerello mascalese",

  // ── Muscat ──
  //
  // One grape under many regional names. Keeping them apart made correct MW Muscat flights read as
  // three or four different varieties and marked them unanswerable: a Moscato d'Asti + Beaumes-de-
  // Venise + Rutherglen + Samos flight is the classic Paper 3 same-variety set, and the audit was
  // reporting it as "stem says same variety; key has 3: moscato bianco, muscat blanc a petits grains,
  // muscat". Two such questions were queued for regeneration before this was caught.
  //
  // Muscat of Alexandria is a DIFFERENT variety and deliberately stays separate. That distinction is
  // load-bearing, not pedantry: it is what correctly flags the one flight in this set that IS broken —
  // three Muscat Blanc à Petits Grains wines plus a Ben Ryé Passito di Pantelleria, which is Zibibbo.
  //
  // Bare "muscat" folds into Muscat Blanc à Petits Grains because that is what it means on every
  // appellation that uses it unqualified (Beaumes-de-Venise, Rutherglen, Samos, St-Jean-de-Minervois).
  // A genuine Muscat of Alexandria labelled only "Muscat" would merge wrongly — but that direction
  // yields a missed defect, whereas the reverse destroys a good question at remediation. Prefer the
  // cheaper error.
  moscato: "muscat blanc a petits grains",
  "moscato bianco": "muscat blanc a petits grains",
  muscat: "muscat blanc a petits grains",
  "muscat blanc": "muscat blanc a petits grains",
  // Colour mutations of the same variety — the key resolver emits the long qualified forms.
  "muscat a petits grains": "muscat blanc a petits grains",
  "muscat blanc a petits grains rouge": "muscat blanc a petits grains",
  "muscat de frontignan": "muscat blanc a petits grains",
  "moscatel de grano menudo": "muscat blanc a petits grains",
  muskateller: "muscat blanc a petits grains",
  "gelber muskateller": "muscat blanc a petits grains",
  zibibbo: "muscat of alexandria",
  "moscatel de alejandria": "muscat of alexandria",
  "moscatel graudo": "muscat of alexandria",

  // ── Whites ──
  alvarinho: "albarino",
  "tocai friulano": "friulano",
  viura: "macabeo",
  steen: "chenin blanc",
  // The label token "chenin" and the Steen synonym target "chenin blanc" were two DIFFERENT
  // canonical forms, so a Steen wine in a Chenin flight read as a variety contradiction
  // (Live Tasting E2E, 2026-08-06).
  chenin: "chenin blanc",
  "listan blanco": "palomino",
  "ugni blanc": "trebbiano",
  "riesling italico": "welschriesling",
  grasevina: "welschriesling",
  // Muscadet is the appellation, Melon de Bourgogne the grape — canonicalise to the grape so the
  // appellation table (which already emits "melon de bourgogne") and this table agree.
  muscadet: "melon de bourgogne",
  melon: "melon de bourgogne",
  malmsey: "malvasia",
  boal: "bual",
};

export const norm = (s) =>
  (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export const canonVariety = (s) => {
  const n = norm(s);
  return VARIETY_SYNONYMS[n] || n;
};

// Normalise a stem (lower-case, accents stripped, punctuation flattened so "same, single grape
// variety" reads as "same single grape variety" — a real comma-bug seen in the corpus).
export const normStem = (questionText) =>
  norm(questionText).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Stem Sniper scoring model for a flight. In a "same (single) grape variety" flight the variety is
// ONE shared answer but the origins differ per wine, and the stem gives no clue which origin maps to
// which wine number — so the candidate can only identify the likely *pool* of origins. The MW exam
// rewards that pool/funnel reasoning, so such flights score as a SET (variety + origin pool); every
// other flight keeps per-wine scoring.
export function stemSniperScoringModel(questionText, wineCount = 0) {
  const stem = normStem(questionText);
  const sameVariety = /\bsame (?:single )?grape variety\b|\bsame variety\b/.test(stem);
  return sameVariety && wineCount >= 2 ? "set" : "per-wine";
}

// True when the stem describes the flight in subsets/pairs ("Wines 1 and 2 ... the other two ...").
// Per-subset claims can't be validated flight-wide without false positives, so flight-wide rules
// (country/variety diversity) are skipped for these.
function isSubsetSplit(stem) {
  return /the other (?:two|three|one|wine)\b|\btwo wines\b|\bwines?\s+1\s+and\s+2\b|\bwines?\s+3\s+and\s+4\b|\bwine\s+[1-9]\s+(?:is|are|comes)\b/.test(
    stem
  );
}

// ---------------------------------------------------------------------------------------------------
// WINE REFERENCE SHAPE — is this string a wine, or is it the generator thinking out loud?
//
// The generator sometimes emits its own deliberation into a wine slot instead of a wine. Twelve slots
// across seven banked questions held things like "Chambers Rosewood — wait, excluded. Let me correct.",
// "**Spain** — Amontillado Sherry (Palomino, oxidative/fortified) — ... non-banned ✓. But VORS is still
// quite special...", "The P3 STILL_DRY sub-rule requires that...", a bare "...", and truncated
// fragments ("The Sadie Family Wines, Pof"). Nothing downstream noticed: wine enrichment ran a Tavily
// search on the paragraph, the wine_bank gained a row whose "producer" was a sentence of reasoning, and
// the question reached the candidate.
//
// Every real wine banked as of 2026-08-05 follows the same shape —
//   Producer, wine name, vintage. Region, Country. (ABV%)
// — the longest being 137 characters. Swept over the whole bank the four checks below reject 28 slots
// across 12 questions and accept all ~1,157 real references, with each check the sole catch for at
// least one row: length 16, deliberation marker 10, origin anchor 1, separator 1. So none is redundant
// — in particular the anchor is what catches a truncation ("… 2022. Bierz") that reads perfectly well
// as a wine, and the markers are what catch a reasoning preamble followed by a well-formed wine, which
// ends on a country and so clears the anchor.
// ---------------------------------------------------------------------------------------------------

// Anchors for "this string ends on an origin". Deliberately a SUPERSET of COUNTRY_NAMES (which is
// order-sensitive — detectCountryName returns its first hit — and so is left alone): matching here only
// asks "does this look like a country?", so the extra entries cost nothing and stop a legitimate
// curveball origin from being rejected as junk. COUNTRY_NAMES is spread in lazily (see
// countryAnchorRe) because it is declared further down, with the text adapter it belongs to.
const COUNTRY_ANCHOR_EXTRAS = [
  "czech republic", "czechia", "slovakia", "romania", "bulgaria", "moldova", "ukraine", "russia",
  // Accent-free by construction: the anchor regex is tested against norm()'d text (NFD, marks stripped).
  "turkey", "turkiye", "cyprus", "malta", "luxembourg", "belgium", "netherlands", "denmark", "sweden",
  "norway", "poland", "serbia", "montenegro", "north macedonia", "macedonia", "albania", "kosovo",
  "bosnia and herzegovina", "armenia", "azerbaijan", "india", "thailand", "vietnam", "south korea",
  "taiwan", "morocco", "algeria", "tunisia", "egypt", "ethiopia", "kenya", "namibia", "zimbabwe",
  "peru", "bolivia", "paraguay", "colombia", "united kingdom", "great britain", "wales", "scotland",
  "ireland",
];

// Built on first use, not at module load: COUNTRY_NAMES is declared below (TDZ at init).
// Group 1 captures WHICH country anchored the string, for canonCountry below.
let _countryAnchorRe = null;
const countryAnchorRe = () =>
  (_countryAnchorRe ??= new RegExp(
    `(?:^|[\\s,.\\-])(${[...COUNTRY_NAMES, ...COUNTRY_ANCHOR_EXTRAS].join("|")})$`,
    "i"
  ));

// Canonicalise a resolved country. The answer-key resolver sometimes emits a region-qualified value
// ("South West France") where a plain country belongs, and the diversity rules compared those as
// strings — so a correct same-country flight audited as two countries ("france, south west france")
// and was queued for quarantine. A value that ENDS on a known country collapses to that country
// ("united states" further folds to "usa", matching detectCountryName); anything else passes through
// norm()'d, so two unknown-but-equal values still compare equal.
export const canonCountry = (s) => {
  const n = norm(s);
  if (!n) return n;
  const m = n.match(countryAnchorRe());
  return m ? m[1].replace("united states", "usa") : n;
};

// Tells that the string is the model reasoning rather than naming a wine. Each pattern is chosen to be
// impossible on a real label — no wine is called "wait", carries a ✓, or asks a question.
const DELIBERATION_MARKERS = [
  { re: /\*\*/, why: "markdown emphasis (**)" },
  { re: /[✓✗✔✘]/, why: "a check/cross mark" },
  { re: /\?/, why: "a question mark" },
  { re: /\b(wait|actually|instead|let me|i need|i'll|i will|we need)\b/i, why: "first-person deliberation" },
  { re: /\b(exclude[ds]?|banned|non-banned|dedupl\w*|correction|corrected)\b/i, why: "a dedup/exclusion note" },
  { re: /\b(the stem|sub-?rule|per the prompt|paper [123]\b|this is a problem|see reasoning)/i, why: "a reference to the prompt's own rules" },
];

// The longest legitimate reference in the bank is 137 chars. The bounds below are deliberately loose —
// they exist to catch a bare "..." or a paragraph of prose, not to police label length.
const MIN_REFERENCE_LEN = 20;
const MAX_REFERENCE_LEN = 200;

/**
 * Does `fullText` read as a wine reference (producer/name + "." + region, country) rather than as
 * generator reasoning or a truncated fragment?
 * @param {string} fullText
 * @returns {{ ok: boolean, problem: string | null }}
 */
export function checkWineReferenceShape(fullText) {
  const text = (fullText || "").toString().trim();
  const fail = (problem) => ({ ok: false, problem });

  if (!text) return fail("empty");
  if (text.length < MIN_REFERENCE_LEN) return fail(`too short to be a wine reference (${text.length} chars)`);
  if (text.length > MAX_REFERENCE_LEN) return fail(`too long to be a wine reference (${text.length} chars) — reads as prose`);

  for (const m of DELIBERATION_MARKERS) {
    if (m.re.test(text)) return fail(`contains ${m.why} — this is generator reasoning, not a wine`);
  }

  // Producer/name and origin must be separated by a sentence break, per the corpus format.
  if (!/[^\s.]\.\s/.test(text)) return fail("no '. ' separating the wine name from its region/country");

  // Origin anchor: drop a trailing ABV parenthetical or bare percentage, then require a country at the end.
  const core = text
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s*\d+(?:\.\d+)?\s*%(?:\s*abv)?\s*$/i, "")
    .replace(/[\s.,;:—–-]+$/, "")
    .trim();
  if (!countryAnchorRe().test(norm(core)))
    return fail("does not end on a recognised country — the origin is missing or the entry is truncated");

  return { ok: true, problem: null };
}

// ---------------------------------------------------------------------------------------------------
// METHOD CLASS — the granularity at which "method of production" contrast is judged (rule R9).
//
// Style LABELS are too fine (Trentodoc vs Blanc de Blancs: different labels, identical traditional
// method) and style CATEGORIES too coarse (Fino vs Oloroso: same "Sherry" category, biological vs
// oxidative ageing — a genuinely contrasting pair). This maps a keyed wine's style/category from the
// stem_style_lexicon onto the axis an examiner would call "the method". Returns null when the method
// cannot be positively determined (generic labels like bare "Port"/"Sherry", or no style at all) —
// null wines are excluded from the R9 comparison rather than guessed.
// ---------------------------------------------------------------------------------------------------
export function methodClass(style, styleCategory) {
  const label = norm(style);
  const cat = norm(styleCategory);
  // Label-level splits inside ambiguous categories.
  if (/^(fino|manzanilla|manzanilla pasada)$/.test(label)) return "biological-ageing";
  if (/^(amontillado|palo cortado)$/.test(label)) return "biological-then-oxidative";
  if (/^(oloroso|east india solera|cream sherry|pedro ximenez)$/.test(label)) return "oxidative-ageing";
  if (/^(vintage port|lbv port|ruby port|crusted port)$/.test(label)) return "reductive-port";
  if (/^(tawny port|colheita port)$/.test(label)) return "oxidative-port";
  if (/^vin jaune$/.test(label) || /oxidative \(jura\)/.test(cat)) return "biological-ageing";
  // Category-level classes where the category IS the method.
  if (/traditional.method sparkling/.test(cat)) return "traditional-sparkling";
  if (/tank.method sparkling/.test(cat)) return "tank-sparkling";
  if (/^madeira$/.test(cat)) return "oxidative-madeira";
  if (/^fortified muscat$/.test(cat)) return "fortified-muscat";
  if (/vin doux naturel/.test(cat)) return "vdn-mutage";
  if (/botrytis sweet/.test(cat)) return "botrytis";
  if (/late.harvest sweet/.test(cat)) return "late-harvest";
  if (/^icewine$/.test(cat)) return "icewine";
  if (/appassimento sweet|straw/.test(cat)) return "dried-grape";
  return null; // generic "Sherry"/"Port"/"Sparkling"/"Madeira" labels, still wines, unknowns
}

// ---------------------------------------------------------------------------------------------------
// STEM DISCLOSURE — rule R10. A stem may constrain the universe ("four different countries", "same
// single grape variety") but must not name the discriminator the marks are for. Every pattern below
// comes from a question Mike binned for exactly this ("the candidate should be able to discern
// contrasting approaches in the winery WITHOUT BEING TOLD"), and every pattern was verified to fire
// on ZERO of the 162 historical stems in data/exams.json. The near-misses that anchored that check:
// real stems DO say "made using different METHODS OF PRODUCTION" (2021 P3 Q2, 2023 P3 Q2) — a
// defined, style-level constraint — so "methods of production" is deliberately absent from the
// object lists here; the tells are the vaguer winery-decision variants.
// ---------------------------------------------------------------------------------------------------
const STEM_DISCLOSURE_PATTERNS = [
  {
    re: /(?:made|been made|produced|handled) (?:using|with|by|via) (?:a |very |all )?(?:different|differing|contrasting) (?:approach|approaches|route|routes|technique|techniques|production technique|winemaking)/,
    why: "the stem announces the wines were made differently ('different approaches/techniques') — the candidate is meant to discern that from the glass",
  },
  {
    re: /different approach(?:es)? to (?:fermentation|maturation|winemaking|vinification)/,
    why: "the stem names the winemaking axis ('a different approach to fermentation/maturation') the marks are for",
  },
  {
    re: /contrasting (?:approaches|decisions|production techniques|winemaking)/,
    why: "the stem discloses that winery decisions contrast — that is the deduction being examined",
  },
  { re: /handled (?:very )?differently in the (?:cellar|winery)/, why: "the stem announces differing cellar treatment" },
  { re: /by (?:a )?(?:very )?different route/, why: "the stem discloses the wines took different routes in the winery" },
  {
    re: /(?:belong to|from|of|in) (?:two |three |four )?different (?:official )?quality (?:categor|designation|level|tier)/,
    why: "the stem discloses a quality-tier difference the candidate is expected to discern and state",
  },
  {
    re: /relative roles? of/,
    why: "the stem names the mechanism pair ('the relative roles of X and Y') the comparison should discover",
  },
  // ── Class 5 additions (un-MW asks; each verified 0-hit on the 162 historical stems) ──
  {
    // "Comment on the role of autolysis and dosage in each wine" — naming the mechanism PAIR hands
    // over the analysis. A single-topic ask ("discuss the role of yeast") is Mike's own suggested
    // realistic phrasing and does not match.
    re: /roles? of \w+(?:[ -]\w+)? and \w+/,
    why: "the stem names a mechanism pair ('the role of X and Y') — the exam asks about one topic ('the role of yeast') or asks for the method and lets the candidate find the mechanisms",
  },
  {
    // "including how the bubbles were created". No historical stem mentions bubbles, sparkle or
    // mousse AT ALL (0/162) — real stems say "comment on the method of production".
    re: /how the (?:bubbles?|sparkle|fizz|mousse) (?:were|was|is|are|has been|have been) (?:created|formed|produced|made|achieved|generated)/,
    why: "the exam never asks how the bubbles were created — it asks for the method of production and expects the mechanism in the answer",
  },
  {
    // "citing any relevant official quality designation" — the candidate is expected to KNOW and
    // state the designation unprompted; asking for it hands over that it exists.
    re: /(?:cit(?:e|ing)|stat(?:e|ing)|identify(?:ing)?|nam(?:e|ing)) (?:any relevant )?(?:official )?quality (?:designation|classification|category|level|tier)/,
    why: "the exam never asks the candidate to cite an official quality designation — stating it unprompted is part of what earns the marks",
  },
];

/**
 * Stem-only disclosure check (rule R10) — shared verbatim between the generation engine (where it
 * BLOCKS a draft, since the model can always reword its own stem) and the audit (where it is a SOFT
 * flag: an already-banked question is answerable, just less exam-realistic than it should be).
 * @param {string} questionText
 * @returns {Array<{ rule: string, severity: "soft", detail: string }>}
 */
export function stemDisclosureViolations(questionText) {
  const stem = normStem(questionText || "");
  const v = [];
  for (const p of STEM_DISCLOSURE_PATTERNS) {
    const m = stem.match(p.re);
    if (m) {
      v.push({ rule: "stem-discloses-discriminator", severity: "soft", detail: `${p.why} (matched: "${m[0]}")` });
      break; // one disclosure verdict per stem — the first match is the clearest to act on
    }
  }
  return v;
}

/**
 * Run the shared contradiction rules against a (normalized) question.
 * @param {{ paper: number, questionText: string, totalMarks?: number,
 *           wines: Array<{ slot: number, varieties: string[], region?: string, country?: string,
 *                          is_blend?: boolean, style?: string, style_category?: string,
 *                          fullText?: string }> }} q
 * `fullText` is the raw generated label; supply it to enable R8 (wine-reference-shape).
 * `style`/`style_category` come from the P3 answer key; they enable R9 (contrast-without-contrast).
 * @returns {Array<{ rule: string, severity: "hard"|"soft", detail: string }>}
 * hard = stem contradicts its own wines/key (unanswerable as framed); soft = worth flagging.
 */
export function applyQuestionRules(q, opts = {}) {
  const v = [];
  const stem = normStem(q.questionText);
  const wines = q.wines || [];
  const primaries = wines.map((w) => canonVariety(w.varieties?.[0]));
  const distinctPrimary = new Set(primaries.filter(Boolean));
  const distinctCountry = new Set(wines.map((w) => canonCountry(w.country)).filter(Boolean));
  const predominantly = /\bpredominantly\b/.test(stem); // explicitly permits blends / dominant grape
  const subsetSplit = isSubsetSplit(stem);
  // Detection-gap guard for the TEXT stage only (engine passes countryRequireAllKnown). When a wine's
  // country couldn't be detected from its label, flagging "N countries" would be a false positive, so
  // the engine skips the check unless every wine resolved a country. For the KEY stage (validator)
  // countries are always resolved, so this defaults off and the validator is byte-identical.
  const allCountriesKnown = wines.length > 0 && wines.every((w) => norm(w.country));
  const countryGuardOk = !opts.countryRequireAllKnown || allCountriesKnown;

  if (!subsetSplit) {
    // R1 — country diversity. "N different countries" needs N distinct; bare "different countries"
    // needs one per wine.
    const cc = stem.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b\s+(?:different\s+)?countries\b/);
    const bareDiff = /\bdifferent\s+countries\b/.test(stem);
    if (cc || bareDiff) {
      const required = cc ? (/^\d+$/.test(cc[1]) ? Number(cc[1]) : NUM[cc[1]]) : wines.length;
      if (required && countryGuardOk && distinctCountry.size < required)
        v.push({
          rule: "country-diversity",
          severity: "hard",
          detail: `stem implies ${required} different countries; key has only ${distinctCountry.size} distinct (${[...distinctCountry].join(", ") || "none"})`,
        });
    }

    // R2 — "same (single) grape variety" => one dominant variety across the flight.
    if (/\bsame (?:single )?grape variety\b|\bsame variety\b/.test(stem) && distinctPrimary.size > 1)
      v.push({
        rule: "same-variety",
        severity: "hard",
        detail: `stem says same variety; key has ${distinctPrimary.size}: ${[...distinctPrimary].join(", ")}`,
      });

    // R3 — "different grape varieties" => every dominant variety distinct. And, mirroring R1's
    // country-diversity count, a stem that names N different grape varieties must key N DISTINCT
    // dominant varieties ("three different grape varieties" over two Grenaches + a Syrah is
    // unanswerable as framed even if no two labels look alike).
    if (/different (?:single )?grape variet(?:y|ies)/.test(stem)) {
      const present = primaries.filter(Boolean);
      if (present.length !== distinctPrimary.size)
        v.push({
          rule: "distinct-variety",
          severity: "hard",
          detail: `stem says different varieties; duplicates present (${primaries.join(", ")})`,
        });

      const vc = stem.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b\s+different\s+(?:single\s+)?grape\s+variet(?:y|ies)\b/);
      if (vc) {
        const requiredV = /^\d+$/.test(vc[1]) ? Number(vc[1]) : NUM[vc[1]];
        if (requiredV && distinctPrimary.size < requiredV)
          v.push({
            rule: "variety-diversity",
            severity: "hard",
            detail: `stem implies ${requiredV} different grape varieties; key has only ${distinctPrimary.size} distinct (${[...distinctPrimary].join(", ") || "none"})`,
          });
      }
    }

    // R4 — "same country" => one country.
    if (/\bsame country\b/.test(stem) && distinctCountry.size > 1)
      v.push({
        rule: "same-country",
        severity: "hard",
        detail: `stem says same country; key has ${[...distinctCountry].join(", ")}`,
      });
  }

  // R5 — "single grape variety" + a blend wine. SOFT: a dominant-grape blend / co-ferment is often
  // legitimate, and "predominantly" explicitly permits it. Truly wrong wines are caught (hard) by R2.
  if (!predominantly && /\bsingle grape variety\b/.test(stem) && wines.some((w) => w.is_blend))
    v.push({
      rule: "single-variety-blend",
      severity: "soft",
      detail: `stem says single grape variety; a wine is a blend (${wines.filter((w) => w.is_blend).map((w) => w.varieties.join("/")).join("; ")})`,
    });

  // R9 — contrast-without-contrast (Mike's bin corpus, Class 3). Two triggers, both method-shaped:
  // a stem that PROMISES "different methods of production" must not key duplicate methods (same
  // family as R3's distinct-variety — 2021 P3 Q2 and 2023 P3 Q2 are real stems making this promise),
  // and a stem that ASKS to compare/contrast the method of production over wines whose methods are
  // all identical has marks that cannot be earned ("the method of production to make these two wines
  // is identical so there's no compare and contrast… 16 marks"). Method is judged by METHOD CLASS,
  // not style label or category: Fino vs Oloroso share the category "Sherry" but are biological vs
  // oxidative ageing — a great compare question — while Trentodoc vs Blanc de Blancs are different
  // labels with the identical traditional method. Wines whose method class is unknown (generic
  // labels like bare "Port", or non-P3 wines with no style at all) are SKIPPED, so the rule can
  // only fire on positive evidence.
  if (!subsetSplit && wines.length >= 2) {
    const classes = wines.map((w) => methodClass(w.style, w.style_category)).filter(Boolean);
    const promised = /(?:made|produced|crafted|vinified)[a-z ]{0,20}\bdifferent methods? of production\b/.test(stem);
    const asked = /compare (?:and contrast )?the methods? of production\b/.test(stem);
    if (promised && classes.length >= 2) {
      if (new Set(classes).size < classes.length)
        v.push({
          rule: "contrast-without-contrast",
          severity: "hard",
          detail: `stem promises different methods of production; keyed methods duplicate (${classes.join(", ")})`,
        });
    } else if (asked && classes.length >= 2 && new Set(classes).size === 1) {
      v.push({
        rule: "contrast-without-contrast",
        severity: "hard",
        detail: `stem asks to compare methods of production, but every keyed wine shares one method (${classes[0]}) — there is no contrast to earn the marks with`,
      });
    }
  }

  // R11 — shared-variety flights ask the variety ONCE, flight-wide. Every real same-variety stem
  // either scaffolds the shared part ("With reference to both wines: a) Identify the grape variety.
  // (10 marks) … For each wine: b) …") or combines variety+origin under a single FLAT flight-wide
  // mark ("For both wines: a) Identify the country of origin and grape variety. (25 marks)"). None
  // marks the shared variety per wine: an "Identify the … variety" sub-part carrying "(N x M marks)"
  // with N = the wine count pays the candidate N times for one shared answer and gives the Split
  // Sections renderer (question-sections.ts) nothing to group on (ledger: attempt #344,
  // gen_p2_F5_1786023511251). HARD. Pair-split flights ("each pair is made from the same single
  // grape variety") are exempt — there the multiplier counts pairs, not wines, and the varieties
  // genuinely differ across pairs (real format: 2019 P2 Q1, "(3 x 10 marks)" over 6 wines).
  if (
    wines.length >= 2 &&
    (/\bsame (?:single )?grape variety\b|\bsame variety\b/.test(stem)) &&
    !/\beach pair\b|\bpairs?\b/.test(stem)
  ) {
    // Break inline sub-part markers onto their own lines (mirrors question-sections.ts) so each
    // lettered part can be inspected with its own trailing mark token.
    const lined = (q.questionText || "").replace(/\s+\(?([a-h])\)\s+/gi, "\n$1) ");
    for (const line of lined.split("\n")) {
      const sub = line.match(/^\(?([a-h])\)\s*(.*)$/i);
      if (!sub) continue;
      const text = sub[2];
      // The identify clause must TARGET the variety ("Identify the [common/single] grape variety…"),
      // not merely mention it downstream — "Identify the region of origin … and comment on how the
      // character of the variety is expressed" is a legitimate per-wine origin ask (real false
      // positive: gen_p1_F1_1786016636975, whose flat flight-wide variety part is corpus-correct).
      if (!/identify\s+(?:the\s+|its\s+)?(?:common\s+|primary\s+|predominant\s+|single\s+)*(?:grape\s+)?variet/i.test(text)) continue;
      const mk = text.match(/\(\s*(\d+)\s*[x×]\s*\d+\s*marks?\s*\)/i);
      if (mk && Number(mk[1]) === wines.length) {
        v.push({
          rule: "shared-variety-marked-per-wine",
          severity: "hard",
          detail: `stem says same grape variety but sub-part ${sub[1].toLowerCase()}) marks variety identification per wine ("${mk[0].trim()}") — ask the variety once, flight-wide, with a flat mark ("With reference to both wines: … (10 marks)"), then per-wine parts under "For each wine:"`,
        });
        break; // one verdict per stem — the first offending part is the one to fix
      }
    }
  }

  // R10 — stem discloses the discriminator (Mike's bin corpus, Class 1). SOFT: answerable, but the
  // stem hands over the axis the marks are for. Blocking at generation via the engine's check.
  for (const d of stemDisclosureViolations(q.questionText)) v.push(d);

  // R8 — every wine slot must hold a wine REFERENCE, not the generator's reasoning about which wine to
  // pick. HARD: an unparseable entry is enriched (a Tavily search on the reasoning text), banked as a
  // bogus wine_bank producer, and served to the candidate as a real wine. Only fires for callers that
  // supply the raw label — the key stage passes fullText through from generated_questions.wines.
  for (const w of wines) {
    if (typeof w.fullText !== "string") continue;
    const shape = checkWineReferenceShape(w.fullText);
    if (!shape.ok)
      v.push({
        rule: "wine-reference-shape",
        severity: "hard",
        detail: `Wine ${w.slot} is not a wine reference — ${shape.problem}. Expected "Producer, wine name, vintage. Region, Country. (ABV%)"; got: ${JSON.stringify(
          w.fullText.length > 120 ? `${w.fullText.slice(0, 120)}…` : w.fullText
        )}`,
      });
  }

  // R6 — marks: 25 per wine (universal in the MW corpus). HARD.
  if (q.totalMarks && wines.length && q.totalMarks !== wines.length * 25)
    v.push({ rule: "marks", severity: "hard", detail: `total_marks ${q.totalMarks} != ${wines.length}x25` });

  // R7 — Paper 3 oxidative still-white scope (hard). P3 admits a STILL white only when flor/sous
  // voile-driven (Jura Vin Jaune / Savagnin) or paired with a fortified/biologically-aged wine.
  // Conventionally cask-oxidized still whites (oxidative white Rioja, oxidative Hunter Semillon) are
  // corpus-attested Paper 1 wines and are mis-papered in P3.
  if (q.paper === 3 && wines.length > 0) {
    const blob = (w) => norm(`${w.region || ""} ${w.style || ""} ${(w.varieties || []).join(" ")}`);
    const FLOR_SOUS_VOILE = /vin\s*jaune|sous\s*voile|chateau[\s-]*chalon|l['`’ ]?\s*etoile|\betoile\b|savagnin|\bjura\b|\bflor\b/;
    const FORTIFIED_OR_FLOR = /fortified|sherry|jerez|\bfino\b|manzanilla|amontillado|oloroso|palo\s*cortado|\bport\b|madeira|marsala|banyuls|rivesaltes|maury|rutherglen|vin\s*doux|\bvdn\b|vin\s*jaune|sous\s*voile|chateau[\s-]*chalon|\bflor\b/;
    const WHITE_HINT = /viura|macabeo|malvasia|garnacha\s*blanca|grenache\s*blanc|albari|verdejo|hondarrabi|semillon|hunter|\bwhite\b|\bblanc/;
    const isConvOxWhite = (w) => {
      const b = blob(w);
      if (FLOR_SOUS_VOILE.test(b) || FORTIFIED_OR_FLOR.test(b)) return false; // flor / fortified => legitimately P3
      const namedWhiteRioja = /\brioja\b/.test(b) && WHITE_HINT.test(b);
      const namedHunterSem = /hunter/.test(b) && /semillon/.test(b);
      const oxidativeWhite = /oxidativ/.test(b) && WHITE_HINT.test(b);
      return namedWhiteRioja || namedHunterSem || oxidativeWhite;
    };
    const hasAnchor = wines.some((w) => FORTIFIED_OR_FLOR.test(blob(w)));
    const offenders = wines.filter(isConvOxWhite);
    if (offenders.length > 0 && !hasAnchor)
      v.push({
        rule: "p3-oxidative-white",
        severity: "hard",
        detail: `Paper 3 conventionally-oxidative still white(s) with no fortified/flor anchor: ${offenders.map((w) => w.region || (w.varieties || []).join("/") || `wine ${w.slot}`).join("; ")}. Such wines (oxidative white Rioja, oxidative Hunter Semillon) are Paper 1 styles; P3 admits a still white only when flor/sous voile-driven or paired with a fortified/biologically-aged wine.`,
      });
  }

  return v;
}

// ---------------------------------------------------------------------------------------------------
// TEXT ADAPTER — turn raw generated wines ({slot, fullText}) into the normalized RuleWine shape the
// rules consume, by detecting variety/country/blend from the label. This is the generation-stage
// counterpart to the validator passing its already-resolved AuditWine. Ported verbatim from the
// engine so the engine can delegate to applyQuestionRules and the whole text path is testable here
// (no @/ aliases). The engine keeps its TEXT-ONLY extras (undetectable-variety, name-cross-check,
// blend-hard, P3 fullText scope, banker, flight-size, novelty, generation-consistency).
// ---------------------------------------------------------------------------------------------------

// A synonym in VARIETY_SYNONYMS only helps if the label is DETECTED here first — an undetected label
// resolves to "unknown" and the diversity rules skip it. Every synonym key above that can appear on a
// real label therefore has a token here. Longer alternatives must precede the shorter ones they
// contain ("garnacha blanca" before "garnacha") because the regex alternation is first-match.
export const WHITE_GRAPE_INDICATORS = /\b(chardonnay|sauvignon\s*blanc|riesling\s*italico|riesling|pinot\s*gri[gs]|grauburgunder|rul[aä]nder|pinot\s*bianco|weissburgunder|gewurz|moscato\s*bianco|moscatel\s*de\s*grano\s*menudo|moscatel|muscat\s*blanc|muscat|moscato|zibibbo|gelber\s*muskateller|muskateller|viognier|chenin|steen|semillon|albarino|alvarinho|gruner|verdejo|vermentino|soave|garganega|torrontes|fiano|greco|arneis|cortese|marsanne|roussanne|picpoul|muscadet|melon\s*de\s*bourgogne|blanc\s*de\s*blancs|prosecco|glera|listan\s*blanco|palomino|pedro\s*xim[eé]nez|furmint|sercial|verdelho|malvasia|malmsey|boal|bual|assyrtiko|welschriesling|grasevina|vidal|viura|macabeo|garnacha\s*blanca|grenache\s*blanc|ugni\s*blanc|trebbiano|tocai\s*friulano|friulano|treixadura|romorantin|godello|hondarrabi\s*zuri|aligote|savagnin|altesse|jacquere|mauzac|\brolle\b|bourboulenc|clairette|timorasso|pecorino|passerina|falanghina|verdicchio|grillo|catarratto|carricante|inzolia|insolia|loureiro|arinto|encruzado|ant[aã]o\s*vaz|fern[aã]o\s*pires|s[iy]lvaner|elbling|scheurebe|rkatsiteli|robola|savatiano|malagousia|petit\s*manseng|gros\s*manseng|colombard|folle\s*blanche|chasselas|gutedel|m[uü]ller[- ]thurgau|traminer|kerner|xarel[- ]?lo|parellada)\b/i;
export const RED_GRAPE_INDICATORS = /\b(cabernet\s*sauvignon|cabernet\s*franc|merlot|pinot\s*noir|pinot\s*nero|spatburgunder|sp[aä]tburgunder|blauburgunder|syrah|shiraz|garnacha\s*tinta|grenache|garnacha|cannonau|tempranillo|tinta\s*de\s*toro|tinto\s*fino|tinta\s*fina|tinta\s*roriz|aragonez|ull\s*de\s*llebre|cencibel|sangiovese|prugnolo\s*gentile|nielluccio|morellino|nebbiolo|spanna|chiavennasca|malbec|zinfandel|primitivo|tribidrag|mourvedre|monastrell|mataro|carignan|carinena|cari[nñ]ena|mazuelo|samso|barbera|dolcetto|touriga\s*nacional|touriga\s*franca|touriga\s*francesa|touriga|tannat|carmenere|pinotage|gamay|blaufr[aä]nkisch|lemberger|kekfrankos|k[ée]kfrankos|zweigelt|aglianico|nero\s*d.avola|nerello|lagrein|xinomavro|cinsault|tinta\s*negra\s*mole|tinta\s*negra|petite\s*sirah|durif|cot|baga|mencia|blauer\s*wildbacher|corvina|corvinone|rondinella|molinara|sagrantino|refosco|schioppettino|teroldego|petit\s*verdot|graciano|bobal|trincadeira|castel[aã]o|alfrocheiro|agiorgitiko|negroamaro|gaglioppo|frappato|saperavi|plavac\s*mali|ciliegiolo|freisa|croatina|marzemino|schiava|cesanese|trousseau|poulsard|ploussard)\b/i;
// NOTE: `montepulciano` is deliberately NOT in the list above. The bare token is ambiguous — Vino
// Nobile di Montepulciano is Sangiovese from a Tuscan town, Montepulciano d'Abruzzo is the grape —
// and adding it here outranks APPELLATION_TO_PRIMARY_VARIETY's `vino nobile` entry, sending every
// Vino Nobile to the wrong variety (pinned by tests/appellation-resolver.test.ts and
// tests/distinct-variety-generation.test.ts). Its COLOUR is unambiguous though, so the colour
// resolver handles it via EXTRA_RED_VARIETIES in question-validator.ts.

const APPELLATION_TO_PRIMARY_VARIETY = [
  { pattern: /\b(barolo|barbaresco|gattinara|ghemme|carema|valtellina|sforzato)\b/i, variety: "nebbiolo" },
  // "Montepulciano" is two different things and this entry used to conflate them: Vino Nobile di
  // MONTEPULCIANO (a Tuscan town) is Sangiovese, while Montepulciano d'Abruzzo is the Montepulciano
  // GRAPE. Matching the bare town name sent every Abruzzese red to sangiovese — which, now that the
  // distinct-variety rule runs at generation, would falsely flag a Chianti + Montepulciano d'Abruzzo
  // flight as a duplicate grape. "vino nobile" still covers the Tuscan case and is matched first.
  { pattern: /\b(chianti|brunello|vino\s+nobile|morellino)\b/i, variety: "sangiovese" },
  { pattern: /\bmontepulciano\b/i, variety: "montepulciano" },
  { pattern: /\b(etna\s+rosso)\b/i, variety: "nerello mascalese" },
  { pattern: /\b(taurasi)\b/i, variety: "aglianico" },
  { pattern: /\b(valpolicella|amarone|ripasso|bardolino)\b/i, variety: "corvina blend" },
  { pattern: /\b(barbera)\b/i, variety: "barbera" },
  { pattern: /\b(dolcetto)\b/i, variety: "dolcetto" },
  { pattern: /\b(beaujolais|fleurie|morgon|moulin-a-vent|brouilly)\b/i, variety: "gamay" },
  { pattern: /\b(sherry|fino|manzanilla|amontillado|oloroso|palo\s*cortado)\b/i, variety: "palomino" },
  { pattern: /\b(madeira|malmsey|rainwater)\b/i, variety: "tinta negra" },
  { pattern: /\b(tokaj|tokaji|aszu|szamorodni)\b/i, variety: "furmint" },
  { pattern: /\b(sauternes|barsac)\b/i, variety: "semillon blend" },
  { pattern: /\b(port\b|vintage\s*port|lbv|tawny\s*\d+|ruby\s*port|vintage\s*port|colheita)\b/i, variety: "touriga nacional blend" },
  { pattern: /\b(banyuls|maury|rivesaltes)\b/i, variety: "grenache" },
  { pattern: /\b(rutherglen)\b/i, variety: "muscat" },
  { pattern: /\b(muscadet)\b/i, variety: "melon de bourgogne" },
  // WHITE Burgundy must outrank the generic burgundy→pinot-noir entry below (first match wins):
  // "Pouilly-Fuissé 2022. Burgundy, France." was detecting as PINOT NOIR and failing valid
  // same-variety Chardonnay flights (Live Tasting BYO, E2E runs 2026-08-06).
  { pattern: /\b(chablis|meursault|puligny|chassagne|montrachet|corton-charlemagne|pouilly-fuisse|saint-veran|macon|vire-clesse|bourgogne\s+blanc|white\s+burgundy)\b/i, variety: "chardonnay" },
  { pattern: /\b(burgundy|bourgogne|gevrey|chambolle|vosne|pommard|volnay)\b/i, variety: "pinot noir" },
  { pattern: /\b(rioja|ribera\s+del\s+duero)\b/i, variety: "tempranillo" },
  { pattern: /\b(cote-rotie|cornas|hermitage|crozes-hermitage|saint-joseph)\b/i, variety: "syrah" },
  { pattern: /\b(chateauneuf-du-pape|gigondas|vacqueyras)\b/i, variety: "grenache blend" },
];

// Canonicalise a detected label through the one shared table. This used to be a hand-rolled chain of
// four .replace() calls that mapped toward "pinot grigio" while canonVariety mapped toward
// "pinot gris" — so the same grape could canonicalise two ways depending on which function ran.
function normalizeVariety(value) {
  return canonVariety(value);
}

// Optional SERVER-SIDE appellation resolver. This module is reachable from the client bundle
// (StemSniperCard -> stem-scoring -> question-rules), so it cannot itself hold the 220-entry
// appellation dataset the answer-key resolver uses. src/lib/appellation-resolver.ts registers one on
// the server; detectPrimaryVariety consults it ONLY when its own table comes back "unknown", so the
// client is unaffected and the server stops missing grapes that are named by appellation rather than
// on the label (Savennieres -> Chenin Blanc, Vouvray -> Chenin Blanc).
let appellationResolver = null;
export function registerAppellationResolver(fn) {
  appellationResolver = typeof fn === "function" ? fn : null;
}

// The same bridge, for COLOUR rather than variety — and it reaches further than the variety one can.
//
// varietyFromAppellation must refuse the 114 multi-variety and 7 byColor entries, because it can only
// assert ONE grape and a Bordeaux blend is not one grape. But colour survives that ambiguity: every
// variety in St-Julien is red, so St-Julien is red even though its variety is unresolvable. That turns
// 238 appellations into colour evidence where only 117 were variety evidence — which is what lets
// R-COLOUR place an appellation-only label like Hermitage or Châteauneuf-du-Pape.
let appellationColourResolver = null;
export function registerAppellationColourResolver(fn) {
  appellationColourResolver = typeof fn === "function" ? fn : null;
}

/** "white" | "red" implied by an appellation named in `fullText`, or null. Server-only; see above. */
export function colourFromAppellation(fullText) {
  return appellationColourResolver?.(fullText) ?? null;
}

export function detectPrimaryVariety(fullText) {
  // Accents STRIPPED before matching. The indicator regexes are ASCII ("gruner", "semillon"), but
  // real labels are accented — "Grüner Veltliner", "Sémillon", "Nero d'Avola". Lower-casing alone
  // left every accented grape reading as "unknown", so the diversity rules silently skipped those
  // wines: a flight could carry two Grüners and no rule could see it.
  const text = fullText.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const whiteMatch = text.match(WHITE_GRAPE_INDICATORS);
  const redMatch = text.match(RED_GRAPE_INDICATORS);
  const direct = (whiteMatch?.[0] || redMatch?.[0])?.toLowerCase().trim();
  if (direct) return normalizeVariety(direct);
  const appellationMatch = APPELLATION_TO_PRIMARY_VARIETY.find((entry) => entry.pattern.test(text));
  if (appellationMatch) return appellationMatch.variety;
  // Server-only fallback across the full appellation dataset (see registerAppellationResolver).
  const resolved = appellationResolver?.(fullText);
  return resolved ? canonVariety(resolved) : "unknown";
}

// Appellations where a BLEND is the norm, so a "single grape variety" stem must not use them.
//
// Two fixes and four additions, all grounded in the corpus (148 multi-variety wines; this list
// previously missed 98 of them):
//   • `champagne` no longer requires a brut/nv/vintage/rose qualifier — bare "Champagne AOC" is how
//     12 corpus wines are written and none of them matched.
//   • porto / bare `port` added: the list had vintage/tawny/ruby port but not the plain form (8 wines).
//   • rioja (13 wines), tokaji (2), cotes de provence (2) added — blends by convention.
// Deliberately NOT added: Madeira (varietal Sercial/Verdelho/Bual/Malmsey are single-grape by
// definition), Stellenbosch and IGT Toscana (regions producing both), Chianti Classico (can be 100%
// Sangiovese). Listing those would reject correct single-variety flights.
//
// NOTE: duplicated verbatim in question-engine.ts. Change both or they drift.
const KNOWN_BLEND_INDICATORS = /\b(tawny\s*(port|\d+\s*year)|ruby\s*port|lbv|vintage\s*port|porto|port\s*(doc|dop)|champagne|cremant|cava|franciacorta|prosecco|chateauneuf|cdp|gigondas|vacqueyras|bordeaux|medoc|haut-medoc|pauillac|margaux|saint-julien|saint-estephe|saint-emilion|pomerol|pessac|graves|cotes\s*du\s*rhone|cotes\s*de\s*provence|rioja|chianti|tokaji|gsm|meritage|ripasso|amarone|valpolicella)\b/i;

export function isLikelyBlend(fullText) {
  // Strip diacritics first — see the note in question-engine.ts. "Châteauneuf" never matched
  // `chateauneuf`.
  const text = fullText
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (KNOWN_BLEND_INDICATORS.test(text)) return true;
  const variety = detectPrimaryVariety(fullText);
  if (variety.includes("blend")) return true;
  return false;
}

// ORDER IS LOAD-BEARING for detectCountryName: it returns the FIRST entry found in the label, so
// "united states" must precede "usa". Do not reorder; append only.
const COUNTRY_NAMES = [
  "south africa", "new zealand", "united states", "france", "italy", "spain", "portugal",
  "germany", "austria", "greece", "hungary", "australia", "argentina", "chile", "canada",
  "usa", "england", "georgia", "uruguay", "brazil", "lebanon", "japan", "switzerland",
  "croatia", "slovenia", "israel", "mexico", "china",
];

export function detectCountryName(fullText) {
  const text = fullText.toLowerCase();
  const match = COUNTRY_NAMES.find((country) => text.includes(country));
  return match?.replace("united states", "usa") || "unknown";
}

/**
 * Build normalized RuleWine[] from raw generated wines by detecting variety/country/blend from the
 * label. Undetectable variety -> varieties:[] and undetectable country -> "" so the rules' "known"
 * filters behave exactly like the engine's detected/undetected split. `fullText` is carried through
 * unchanged so R8 (wine-reference-shape) can see the raw label.
 * @param {Array<{ slot: number, fullText: string }>} wines
 */
export function winesFromText(wines) {
  return (wines || []).map((w) => {
    const fullText = (w.fullText ?? "").toString();
    const primary = detectPrimaryVariety(fullText);
    const country = detectCountryName(fullText);
    return {
      slot: w.slot,
      fullText,
      varieties: primary === "unknown" ? [] : [primary],
      country: country === "unknown" ? "" : country,
      is_blend: isLikelyBlend(fullText),
    };
  });
}
