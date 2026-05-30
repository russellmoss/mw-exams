// Generates public/data/stem-autocomplete.json (variety + region/place suggestion lists) for
// the Stem Sniper drill inputs, from the committed data files. Re-run after editing those.
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => JSON.parse(readFileSync(join(ROOT, "data", f), "utf8"));

const lex = read("variety_lexicon.json");
const appVar = read("appellation_varieties.json");
const bank = read("mock_wine_bank.json");
const styleLex = read("stem_style_lexicon.json").styles;

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const clean = (s) => (s || "").toString().trim();

const varieties = [...new Set(lex.varieties.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b));

// The region suggestion list must be PURE GEOGRAPHY — no styles, colours, classifications, or
// producer names. We pull from region/country/sub_region fields + appellation keys, then clean:
//   - reject compound/junk fields (comma, slash, parenthesis, dash-separated notes)
//   - strip trailing classification + colour tokens (AOC/DOCG/Premier Cru/Blanc/Rouge/...)
//   - drop entries that are pure wine styles (Amontillado, Tawny Port, Cava, Brut, ...),
//     while keeping place-names that double as categories (Champagne, Madeira, Jerez, Etna...)
const STRIP = new Set([
  "aoc", "doc", "docg", "doca", "do", "igp", "gi", "ava", "premier", "1er", "cru", "grand", "gran",
  "riserva", "reserva", "crianza", "superiore", "villages", "vors", "vos", "nv", "mv", "sec",
  "blanc", "blancs", "rouge", "rosso", "bianco", "blanco", "rose", "rosato", "rosado", "demi", "moelleux",
]);
const ALLOW = new Set([
  "champagne", "madeira", "jerez", "douro", "tokaj", "sauternes", "barsac", "banyuls", "maury",
  "rivesaltes", "rutherglen", "savennieres", "valdobbiadene", "cartizze", "penedes", "etna",
  "chianti classico", "marsala", "montilla", "constantia", "tokaji",
]);
const DROP = [
  "amontillado", "oloroso", "fino", "manzanilla", "palo cortado", "palo", "cortado", "cream",
  "east india", "solera", "tawny", "ruby", "port", "porto", "sherry", "sercial", "verdelho madeira",
  "bual", "boal", "malmsey", "aszu", "puttonyos", "beerenauslese", "trockenbeerenauslese", "auslese",
  "spatlese", "kabinett", "icewine", "eiswein", "paille", "santo", "recioto", "passito", "cava",
  "brut", "prosecco", "quartet", "cuvee", "inopia", "para grand",
];
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const cleanPlace = (raw) => {
  const v = clean(raw);
  if (!v || v.toLowerCase() === "unknown") return null;
  if (/[,/()]|—|–/.test(v)) return null; // compound/notes/producer field
  const kept = v.split(/\s+/).filter((w) => !STRIP.has(norm(w).replace(/[^a-z0-9]/g, "")));
  const out = kept.join(" ").trim();
  if (out.length < 3) return null;
  const n = norm(out);
  if (ALLOW.has(n)) return titleCase(out);
  // token-based DROP (split on spaces AND hyphens) so "Port" drops "Tawny Port" but NOT "Portugal";
  // multiword DROP entries match as substrings.
  const toks = n.replace(/-/g, " ").split(/\s+/).filter(Boolean);
  const dropped = DROP.some((d) => (d.includes(" ") ? n.replace(/-/g, " ").includes(d) : toks.includes(d)));
  if (dropped) return null;
  return titleCase(out);
};

const regionSet = new Set();
const add = (s) => { const v = cleanPlace(s); if (v) regionSet.add(v); };
for (const [key, v] of Object.entries(appVar)) {
  add(key);
  add(v.region);
  add(v.country);
}
for (const e of bank) {
  add(e.region);
  add(e.sub_region);
  add(e.country);
  // NOTE: bank.appellation deliberately excluded — it holds style/classification/producer text.
}
const regions = [...regionSet].sort((a, b) => a.localeCompare(b));

// P3 style/method suggestions: the specific labels + the broad categories.
const styleSet = new Set();
for (const s of styleLex) {
  if (s.label) styleSet.add(s.label);
  if (s.category) styleSet.add(s.category);
}
const styles = [...styleSet].sort((a, b) => a.localeCompare(b));

const out = { _generated: "build-stem-autocomplete.mjs", varieties, regions, styles };
mkdirSync(join(ROOT, "study-app", "public", "data"), { recursive: true });
writeFileSync(join(ROOT, "study-app", "public", "data", "stem-autocomplete.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`wrote stem-autocomplete.json: ${varieties.length} varieties, ${regions.length} regions/places, ${styles.length} styles.`);
