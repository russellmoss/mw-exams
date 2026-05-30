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

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const clean = (s) => (s || "").toString().trim();

const varieties = [...new Set(lex.varieties.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b));

const regionSet = new Set();
const add = (s) => { const v = clean(s); if (v && v.toLowerCase() !== "unknown") regionSet.add(v); };
for (const [key, v] of Object.entries(appVar)) {
  add(titleCase(key));
  add(v.region);
  add(v.country);
}
for (const e of bank) {
  add(e.region);
  add(e.sub_region);
  add(e.country);
  add(e.appellation);
}
const regions = [...regionSet].sort((a, b) => a.localeCompare(b));

const out = { _generated: "build-stem-autocomplete.mjs", varieties, regions };
mkdirSync(join(ROOT, "study-app", "public", "data"), { recursive: true });
writeFileSync(join(ROOT, "study-app", "public", "data", "stem-autocomplete.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`wrote stem-autocomplete.json: ${varieties.length} varieties, ${regions.length} regions/places.`);
