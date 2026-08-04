// appellation-resolver.ts — SERVER-ONLY bridge from the answer-key appellation data to the
// generation-stage text rules.
//
// question-rules.mjs carries a 21-entry hardcoded appellation table, while the answer-key resolver
// reads data/appellation_varieties.json — 220 entries. That gap is a defect source, not a cosmetic
// one: a Paper 1 flight of Savennières + Grüner Veltliner + Kloof Street White promised three
// different grape varieties and delivered two Chenin Blancs. Neither Chenin label contains the word
// "chenin" (one is an appellation, one a proprietary name) and neither appellation is in the 21, so
// generation saw [unknown, gruner veltliner, unknown] and had nothing to compare. The key resolver,
// with all 220, mapped both to Chenin and the audit caught it after banking. Same failure class as
// Cannonau/Garnacha — a DETECTION gap, not a rule gap.
//
// WHY NOT JUST IMPORT THE JSON IN question-rules.mjs: that module is reachable from the client
// bundle (StemSniperCard -> stem-scoring -> question-rules), so it can neither read from disk nor
// carry 220 entries of appellation data. Instead the server registers this resolver at import and
// the shared rules consult it only when their own detection comes back "unknown"; the client never
// registers anything and behaves exactly as before.

import { readFileSync } from "fs";
import { join } from "path";
import { registerAppellationResolver } from "@/lib/question-rules.mjs";

type Entry = {
  varieties?: string[];
  byColor?: { white?: string[]; red?: string[] };
};

let table: { needle: string; variety: string }[] | null = null;

// Longest appellation name first, so "vino nobile di montepulciano" wins over "montepulciano".
function load(): { needle: string; variety: string }[] {
  if (table) return table;
  const out: { needle: string; variety: string }[] = [];
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "appellation_varieties.json"), "utf8")
    );
    const entries: Record<string, Entry> = raw.appellations ?? raw;
    for (const [name, entry] of Object.entries(entries)) {
      // Only single-variety appellations are safe to assert from the label alone. A byColor entry
      // (Anjou blanc = Chenin, Anjou rouge = Cabernet Franc) cannot be resolved without knowing the
      // wine's colour, and a multi-variety appellation is a blend — both stay "unknown" here rather
      // than risk a wrong call, which would be worse than no call.
      const varieties = entry?.varieties;
      if (!Array.isArray(varieties) || varieties.length !== 1) continue;
      const needle = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
      if (needle.length < 4) continue; // too short to match safely inside a label
      out.push({ needle, variety: varieties[0].toLowerCase() });
    }
  } catch {
    // Missing file (an environment without the synced data) — the shared rules keep their own table.
    return (table = []);
  }
  out.sort((a, b) => b.needle.length - a.needle.length);
  return (table = out);
}

/** The single variety an appellation named in `fullText` implies, or null. */
export function varietyFromAppellation(fullText: string): string | null {
  const text = (fullText || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const { needle, variety } of load()) {
    if (text.includes(needle)) return variety;
  }
  return null;
}

// Registered once per server process, at import. Idempotent.
registerAppellationResolver(varietyFromAppellation);
