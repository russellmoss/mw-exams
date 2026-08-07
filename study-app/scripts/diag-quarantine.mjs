import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";

const here = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(here, "..", ".env.local"), "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  SELECT id, invalid_reasons, created_at FROM generated_questions
  WHERE scope = 'live-tasting' AND invalid_reasons IS NOT NULL
    AND created_at > now() - interval '4 hours'
  ORDER BY created_at DESC LIMIT 10`;
console.log(`quarantined live-tasting questions (last 4h): ${rows.length}`);
for (const r of rows) console.log(" -", r.id, JSON.stringify(r.invalid_reasons).slice(0, 260));

const sweet = await sql`
  SELECT id, producer, wine_name, region, country FROM wine_bank
  WHERE style_category = 'still_sweet' AND price_band IS NOT NULL LIMIT 12`;
console.log(`\nstill_sweet bank rows with a price band: ${sweet.length}`);
for (const w of sweet) console.log(" -", `${w.producer} / ${w.wine_name} (${w.region}, ${w.country})`);
