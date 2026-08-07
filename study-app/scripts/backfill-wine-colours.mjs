// backfill-wine-colours.mjs — fill wine_bank.colour (migration 052), which was NULL on all 1,285 rows.
//
// WHY THIS EXISTS: R-COLOUR (Paper 1 = still white, Paper 2 = still red) has to know a wine's colour.
// Without a stored value it re-derives one from the label on every call, and a label is the weakest
// evidence available — an appellation-only name like "Domaine Jean-Louis Chave, Hermitage" contains no
// colour word and no grape. Four such wines reached live Paper 1 flights. classifyWine() now emits a
// colour on every NEW enrichment; this fills the rows that predate it.
//
// DETERMINISTIC FIRST, MODEL LAST. Most rows can be settled for free from data already on the row:
// the resolved grape varieties, the appellation's colour, and the tasting note's own appearance line
// ("deep ruby", "pale straw"). Only the genuine residue goes to Haiku. That keeps the spend small AND
// makes most of the backfill reproducible rather than a one-off model opinion — so the script prints
// the deterministic / model / unresolved split, and every write records which tier decided it.
//
// A row whose colour cannot be settled is left NULL, exactly as backfill-price-bands.mjs leaves an
// unjudgeable price_band. NULL means "R-COLOUR falls back to inference", which is safe; a WRONG stored
// colour is worse than none, because the validator trusts a stored value over its own inference.
//
// Idempotent: only rows with colour IS NULL are touched, so re-running converges.
//
// Usage (from study-app/ — the ts-loader is required because this imports the app's .ts libs):
//   node --import ./scripts/ts-loader.mjs scripts/backfill-wine-colours.mjs --dry
//   node --import ./scripts/ts-loader.mjs scripts/backfill-wine-colours.mjs
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import Anthropic from "@anthropic-ai/sdk";
import { resolveWineScope } from "../src/lib/question-validator.ts";
// Load-bearing: registers the appellation → variety AND appellation → colour resolvers. Without it
// every appellation-only wine resolves to null and the deterministic pass collapses to the grape list.
import "../src/lib/appellation-resolver.ts";

const DRY = process.argv.includes("--dry");
const BATCH = 25;
const MODEL = "claude-haiku-4-5-20251001";
const COLOURS = new Set(["white", "red", "rose", "orange"]);

const DB =
  process.env.DATABASE_URL ||
  readFileSync(".env.local", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
const sql = neon(DB);

// The tasting note's appearance line is strong, independent evidence — it describes the wine in the
// glass. Deliberately NOT inferring "orange" from amber/gold: a Sauternes is amber and a Tokaji is
// gold, and both are white. Skin-contact has to be stated, which resolveWineScope already handles.
const APPEARANCE_RED = /\b(ruby|garnet|purple|violet|inky|crimson|opaque|blood)/i;
const APPEARANCE_WHITE = /\b(straw|lemon|pale gold|greenish|green-gold|water-white|pale yellow)/i;
const APPEARANCE_ROSE = /\b(salmon|pink|onion skin|onion-skin|pale copper|blush)/i;

/** Colour from the row's own tasting note, or null. */
function colourFromAppearance(appearance) {
  const a = String(appearance || "");
  if (!a) return null;
  const red = APPEARANCE_RED.test(a);
  const white = APPEARANCE_WHITE.test(a);
  const rose = APPEARANCE_ROSE.test(a);
  if (rose && !red) return "rose"; // salmon/pink beats a stray "ruby" in a rosé note
  if (red && !white) return "red";
  if (white && !red) return "white";
  return null;
}

/**
 * Settle one row without a model call. Returns { colour, tier } or null.
 * Order: the shared resolver (varieties → label → appellation) first, because it is the same logic
 * R-COLOUR itself uses, then the appearance line as an independent second opinion.
 */
function resolveDeterministically(row) {
  // style_category already names the colour for two of its values, and on a bank row it is curated
  // rather than guessed. Take it directly: resolveWineScope's orange test looks for "orange wine" /
  // "skin-contact" / "qvevri" in free text and will not fire on a bare style tag of "orange", so an
  // orange wine would otherwise be resolved by its grape and come back white.
  const styleTag = String(row.style_category || "").toLowerCase();
  if (styleTag === "orange") return { colour: "orange", tier: "resolver" };
  if (styleTag === "rose") return { colour: "rose", tier: "resolver" };

  const fullText = [row.producer, row.wine_name, row.region, row.country].filter(Boolean).join(", ");
  const scope = resolveWineScope({
    slot: 1,
    varieties: Array.isArray(row.grape_varieties) ? row.grape_varieties : [],
    region: row.region || "",
    fullText,
    style_category: row.style_category || "",
  });
  if (scope.colour) return { colour: scope.colour, tier: "resolver" };

  const fromNote = colourFromAppearance(row.tasting_profile?.appearance);
  if (fromNote) return { colour: fromNote, tier: "appearance" };

  return null;
}

async function classifyBatch(client, batch) {
  const list = batch
    .map((r, j) => {
      const grapes = Array.isArray(r.grape_varieties) && r.grape_varieties.length
        ? ` [${r.grape_varieties.join("/")}]`
        : "";
      return `${j + 1}. ${r.producer} ${r.wine_name || ""} — ${r.region || "?"}, ${r.country || "?"}${grapes} (${r.style_category || "?"})`;
    })
    .join("\n");

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: `For each numbered wine, state the colour of the wine IN THE GLASS. Output one JSON object mapping the number to a colour, no prose:
{"1":"red","2":"white",...}

Colours: "white" | "red" | "rose" | "orange".

This is a question about COLOUR, not about how the wine was made:
- A Riesling Spätlese is white. A Sauternes is white. A Vin Jaune is white. A Tokaji Aszú is white.
- A Tawny Port is red. A Vintage Port is red. An Amarone is red.
- A rosé Champagne is rose. A Blanc de Noirs Champagne is white (white wine from black grapes).
- "orange" ONLY for deliberate extended skin-contact / amber wines (qvevri Rkatsiteli, ramato Pinot Grigio). A conventionally-made white is white however deep its colour.
- A red grape bottled as a white is WHITE — "Touriga Nacional Branco", "Xinomavro White", white Rioja.
- Beware proprietary names: "Château Cheval Blanc" is a RED Bordeaux. "Blanc" in an estate name proves nothing.

Use "" ONLY if the wine is genuinely unidentifiable. A wrong colour is worse than "".`,
    messages: [{ role: "user", content: list }],
  });

  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return JSON.parse((text.match(/\{[\s\S]*\}/) || ["{}"])[0]);
  } catch {
    return null;
  }
}

async function write(id, colour) {
  // `AND colour IS NULL` keeps this idempotent and prevents clobbering a value written since the SELECT.
  await sql`UPDATE wine_bank SET colour = ${colour}, updated_at = now() WHERE id = ${id} AND colour IS NULL`;
}

async function main() {
  const rows = await sql`
    SELECT id, producer, wine_name, country, region, grape_varieties, style_category, tasting_profile
    FROM wine_bank WHERE colour IS NULL ORDER BY id
  `;
  console.log(`${rows.length} wine_bank rows need a colour${DRY ? " (dry run — no writes)" : ""}\n`);
  if (rows.length === 0) return;

  const tally = { resolver: 0, appearance: 0, model: 0, unresolved: 0 };
  const byColour = {};
  const residue = [];

  // ---- Pass 1: deterministic, free, reproducible -------------------------------------------------
  for (const row of rows) {
    const got = resolveDeterministically(row);
    if (!got) { residue.push(row); continue; }
    tally[got.tier]++;
    byColour[got.colour] = (byColour[got.colour] ?? 0) + 1;
    if (DRY) console.log(`  [${got.tier}] ${row.id} -> ${got.colour}`);
    else await write(row.id, got.colour);
  }
  console.log(
    `\nPass 1 (deterministic): ${tally.resolver} by resolver, ${tally.appearance} by appearance line, ${residue.length} left for the model\n`
  );

  // ---- Pass 2: the residue only ------------------------------------------------------------------
  if (residue.length > 0) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log(`No ANTHROPIC_API_KEY — leaving the ${residue.length} residual rows NULL.`);
      tally.unresolved += residue.length;
    } else {
      const client = new Anthropic({ apiKey });
      for (let i = 0; i < residue.length; i += BATCH) {
        const batch = residue.slice(i, i + BATCH);
        const got = await classifyBatch(client, batch);
        if (!got) {
          console.error(`  batch ${Math.floor(i / BATCH) + 1}: unparseable response, left NULL`);
          tally.unresolved += batch.length;
          continue;
        }
        for (let j = 0; j < batch.length; j++) {
          const colour = got[String(j + 1)];
          if (!COLOURS.has(colour)) { tally.unresolved++; continue; }
          tally.model++;
          byColour[colour] = (byColour[colour] ?? 0) + 1;
          if (DRY) console.log(`  [model] ${batch[j].id} -> ${colour}`);
          else await write(batch[j].id, colour);
        }
        console.log(
          `  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(residue.length / BATCH)} done (${tally.model} resolved, ${tally.unresolved} left NULL)`
        );
      }
    }
  }

  const decided = tally.resolver + tally.appearance + tally.model;
  console.log(`\n──────── COLOUR BACKFILL ${DRY ? "(DRY RUN)" : ""} ────────`);
  console.log(`rows needing a colour: ${rows.length}`);
  console.log(`  deterministic (resolver):   ${tally.resolver}`);
  console.log(`  deterministic (appearance): ${tally.appearance}`);
  console.log(`  model:                      ${tally.model}`);
  console.log(`  left NULL:                  ${tally.unresolved}`);
  console.log(`distribution: ${JSON.stringify(byColour)}`);
  console.log(
    `${decided} rows ${DRY ? "would be" : "were"} filled (${Math.round((decided / rows.length) * 100)}%).`
  );
  // A NULL is not a failure — it means R-COLOUR keeps inferring for that wine, which is the safe
  // behaviour. Re-run after a grape/appellation list improvement to convert more of them for free.
}

main().catch((err) => { console.error(err); process.exit(1); });
