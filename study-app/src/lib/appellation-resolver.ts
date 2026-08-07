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
import {
  registerAppellationResolver,
  registerAppellationColourResolver,
  RED_GRAPE_INDICATORS,
  WHITE_GRAPE_INDICATORS,
} from "@/lib/question-rules.mjs";

type Entry = {
  varieties?: string[];
  byColor?: { white?: string[]; red?: string[] };
};

let table: { needle: string; variety: string }[] | null = null;
let colourTable: { needle: string; colour: "white" | "red" | null; byColor: boolean }[] | null = null;

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

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * The colour a list of varieties agrees on, or null if they disagree or none is recognised.
 *
 * Unrecognised grapes are SKIPPED, not treated as vetoes. Requiring every grape to be known made this
 * useless in practice: St-Julien lists Cabernet Sauvignon, Merlot, Cabernet Franc and Petit Verdot, and
 * one absence from the indicator list (Petit Verdot) discarded an unambiguously red appellation. The
 * safety property that matters is kept — any DISAGREEMENT between recognised grapes still returns null.
 */
function colourOfVarieties(varieties: string[]): "white" | "red" | null {
  let red = false;
  let white = false;
  for (const v of varieties) {
    const t = norm(v);
    if (RED_GRAPE_INDICATORS.test(t)) red = true;
    else if (WHITE_GRAPE_INDICATORS.test(t)) white = true;
  }
  if (red && !white) return "red";
  if (white && !red) return "white";
  return null; // mixed, or nothing recognised
}

// Unlike the variety table, this keeps MULTI-variety entries: St-Julien's four grapes are all red, so
// the appellation is red even though no single variety can be asserted. byColor entries are kept too
// but marked, because they need a colour word on the label before they mean anything.
function loadColour(): { needle: string; colour: "white" | "red" | null; byColor: boolean }[] {
  if (colourTable) return colourTable;
  const out: { needle: string; colour: "white" | "red" | null; byColor: boolean }[] = [];
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "appellation_varieties.json"), "utf8")
    );
    const entries: Record<string, Entry> = raw.appellations ?? raw;
    for (const [name, entry] of Object.entries(entries)) {
      const needle = norm(name);
      if (needle.length < 4) continue; // too short to match safely inside a label
      if (entry?.byColor) {
        // Graves, Anjou, Mercurey… the appellation itself is both colours. Only the label can settle it.
        out.push({ needle, colour: null, byColor: true });
        continue;
      }
      const varieties = entry?.varieties;
      if (!Array.isArray(varieties) || varieties.length === 0) continue;
      const colour = colourOfVarieties(varieties);
      if (colour) out.push({ needle, colour, byColor: false });
    }
  } catch {
    return (colourTable = []);
  }
  // Longest first, so "vino nobile di montepulciano" is tested before "montepulciano".
  out.sort((a, b) => b.needle.length - a.needle.length);
  return (colourTable = out);
}

// Colour words on the label, used to settle a byColor appellation. Kept in step with
// question-validator.ts's cues: French `blanc` is fine HERE because we are already inside a known
// two-colour appellation ("Graves Blanc"), not scanning an arbitrary proprietary name.
const LABEL_RED = /\b(rouge|rosso|tinto|tinta|red)\b/;
const LABEL_WHITE = /\b(blanc|blanche|blanco|branco|bianco|weiss|white)\b/;

/**
 * The colour an appellation named in `fullText` implies, or null.
 *
 * This is what makes R-COLOUR able to judge a label that names no grape at all — the wines that
 * actually reached live Paper 1 flights (Hermitage, Châteauneuf-du-Pape, Moulin-à-Vent, Viña Tondonia).
 */
export function colourFromAppellationData(fullText: string): "white" | "red" | null {
  const text = norm(fullText);
  if (!text) return null;
  for (const { needle, colour, byColor } of loadColour()) {
    if (!text.includes(needle)) continue;
    if (!byColor) return colour;
    // Two-colour appellation: believe the label, or decline.
    if (LABEL_WHITE.test(text)) return "white";
    if (LABEL_RED.test(text)) return "red";
    return null;
  }
  return null;
}

// Registered once per server process, at import. Idempotent.
registerAppellationResolver(varietyFromAppellation);
registerAppellationColourResolver(colourFromAppellationData);
