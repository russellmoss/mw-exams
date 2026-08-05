// question-sections.ts — Split Sections (feature).
//
// Mixed-scope MW practical questions carry two kinds of sub-part: parts asked of the flight AS A
// WHOLE ("For the flight as a whole"), and parts asked of EACH WINE individually ("For each wine").
// Rendering them as one flat list makes the mark arithmetic illegible — flight-wide parts and
// per-wine parts appear as peers even though a per-wine part is really "N marks × the whole flight".
//
// This module is the single source of truth for turning a printed question stem + its wine count into
// grouped, scope-tagged sub-parts, so every surface (QuestionDisplay, ModelAnswerReveal, HistoryView,
// the debrief, the mark validator, the model-answer/evaluation prompts) groups and phrases marks the
// same way. It is pure and dependency-free so it runs unchanged on the server (validator/prompts) and
// in the browser (rendering).
//
// NOMENCLATURE (researched against the paper corpus, see mw_exam_empirical_knowledge.md §1/§5):
//   - MW practical papers use NUMBERED questions with lowercase lettered sub-parts a) b) c) that run
//     CONTINUOUSLY across the whole question — they are NOT renumbered when the scope changes. Scope
//     is signalled by an addressee line ("For the flight as a whole" / "For each wine").
//   - "Section A / Section B" is theory-paper lettering, borrowed here only as the display heading;
//     the sub-part letters themselves are never re-lettered by section.

export type SectionScope = "flight" | "per_wine";

export interface SubPart {
  /** Continuous lowercase letter across the whole question — never renumbered by section. */
  label: string;
  text: string;
  scope: SectionScope;
  /** Displayed total marks for this sub-part (flat marks for a flight part; per-wine × wines otherwise). */
  marks: number;
  /** Marks awarded per wine. Equals `marks` for a flight part. */
  marksPerWine: number;
}

export interface QuestionSection {
  scope: SectionScope;
  heading: string;
  subParts: SubPart[];
  /** Sum of the section's sub-part totals (e.g. "40 marks"). */
  subtotal: number;
}

export interface DerivedQuestion {
  preamble: string;
  subParts: SubPart[];
  sections: QuestionSection[];
  /** Distinct scopes present. Length > 1 ⇒ render the two labelled section cards. */
  scopes: SectionScope[];
  totalMarks: number | null;
}

// Admin may swap the Section B heading tail to "All four wines" — kept as ONE string constant so a
// single edit re-labels every surface. (Section A's tail is stable in the corpus.)
export const SECTION_A_TAIL = "For the flight as a whole";
export const SECTION_B_TAIL = "For each wine individually";
export const SECTION_A_HEADING = `Section A · ${SECTION_A_TAIL}`;
export const SECTION_B_HEADING = `Section B · ${SECTION_B_TAIL}`;

export function headingForScope(scope: SectionScope): string {
  return scope === "flight" ? SECTION_A_HEADING : SECTION_B_HEADING;
}

/**
 * Human mark line for a sub-part. Per-wine parts always spell out the arithmetic so the flight-wide
 * multiplication is legible: "8 marks per wine (32 total)". Flight parts read as a flat "15 marks".
 */
export function markPhrase(part: SubPart, wineCount: number): string {
  if (part.scope === "per_wine" && wineCount > 0) {
    const total = part.marksPerWine * wineCount;
    return `${part.marksPerWine} mark${part.marksPerWine === 1 ? "" : "s"} per wine (${total} total)`;
  }
  const n = part.marks;
  return `${n} mark${n === 1 ? "" : "s"}`;
}

// ---- Parsing internals ----

// An addressee line signals which scope the sub-parts that follow belong to.
function detectAddressee(line: string): SectionScope | null {
  const l = line.toLowerCase();
  if (/for each wine|for every wine|per wine\b|for each of the wines|for each of the following wines/.test(l)) {
    return "per_wine";
  }
  if (/for the flight as a whole|for all (?:the |four |three |two |six |five )?wines|for the flight\b|across the flight/.test(l)) {
    return "flight";
  }
  return null;
}

// Pull a numeric mark reading out of a raw marks string. "4 x 8 marks" and "4 × 8 = 32 marks" are the
// PER-WINE multiplier form (first factor = wine count, second = marks per wine); a bare "(15 marks)"
// is a single reading whose scope is decided by the addressee / divisibility inference above.
function parseMarks(marksStr: string): { total: number; marksPerWine: number; multiplier: boolean } | null {
  if (!marksStr) return null;
  const s = marksStr.replace(/×/g, "x");
  const mult = s.match(/(\d+)\s*x\s*(\d+)/i);
  if (mult) {
    const wines = parseInt(mult[1], 10);
    const per = parseInt(mult[2], 10);
    return { total: wines * per, marksPerWine: per, multiplier: true };
  }
  const flat = s.match(/(\d+)/);
  if (flat) {
    const n = parseInt(flat[1], 10);
    return { total: n, marksPerWine: n, multiplier: false };
  }
  return null;
}

// Resolve a sub-part's scope + marks from its addressee context, its own text, and its mark form.
// Priority: explicit addressee (line or embedded) → per-wine multiplier form → divisibility inference
// on a bare number. Default is 'per_wine' when nothing is known (spec: absent scope ⇒ per_wine).
function resolveScope(
  addressee: SectionScope | null,
  parsed: ReturnType<typeof parseMarks>,
  wineCount: number
): { scope: SectionScope; marks: number; marksPerWine: number } {
  const total = parsed?.total ?? 0;

  if (parsed?.multiplier) {
    return { scope: "per_wine", marks: total, marksPerWine: parsed.marksPerWine };
  }
  if (addressee === "flight") {
    return { scope: "flight", marks: total, marksPerWine: total };
  }
  if (addressee === "per_wine") {
    const per = wineCount > 1 && total % wineCount === 0 ? total / wineCount : total;
    return { scope: "per_wine", marks: total, marksPerWine: per };
  }
  // No addressee: infer from a bare flat number — divisible by the wine count ⇒ per-wine, else flight.
  if (parsed) {
    if (wineCount > 1 && total % wineCount === 0) {
      return { scope: "per_wine", marks: total, marksPerWine: total / wineCount };
    }
    return { scope: "flight", marks: total, marksPerWine: total };
  }
  return { scope: "per_wine", marks: 0, marksPerWine: 0 };
}

/**
 * Turn a printed question stem + its wine count into grouped, scope-tagged sub-parts.
 *
 * Deterministic and idempotent: the same (text, wineCount) always yields the same structure, which is
 * why saved attempts can re-derive at render time rather than persisting a snapshot.
 */
export function deriveQuestion(text: string, wineCount: number): DerivedQuestion {
  let processed = text
    .replace(/&nbsp;/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "");

  // Break inline sub-question markers onto their own lines (mirrors the historical parser so existing
  // banked stems split identically).
  processed = processed.replace(/\s+([a-z])\)\s+/gi, (match, letter: string) =>
    letter.match(/^[a-h]$/i) ? `\n${letter}) ` : match
  );
  processed = processed.replace(/\s+(i{1,3}|iv|v)\)\s+/gi, (_m, numeral: string) => `\n${numeral}) `);
  // Break addressee phrases onto their own line so they can be read as scope markers.
  processed = processed.replace(
    /\.\s+(For (?:each|every|all|both|the flight))/gi,
    ".\n$1"
  );
  processed = processed.replace(/\.\s+(With reference to)/gi, ".\n$1");

  const lines = processed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const preambleLines: string[] = [];
  const raw: { label: string; text: string; marksStr: string; addressee: SectionScope | null }[] = [];
  let totalMarks: number | null = null;
  let currentAddressee: SectionScope | null = null;
  let current: { label: string; text: string; marksStr: string; addressee: SectionScope | null } | null = null;

  const marksAtEnd = /\((\d+(?:\s*[x×]\s*\d+)?\s*(?:marks?)?(?:\s*=\s*\d+\s*marks?)?)\)\s*$/i;
  const standaloneMarks = /^\((\d+(?:\s*[x×]\s*\d+)?\s*(?:marks?)?(?:\s*=\s*\d+\s*marks?)?)\)\s*$/i;

  for (const line of lines) {
    const totalMatch = line.match(/^Total:\s*(\d+)\s*marks?/i);
    if (totalMatch) {
      totalMarks = parseInt(totalMatch[1], 10);
      continue;
    }

    // A pure addressee line (no sub-part marker) sets the scope context for what follows.
    const addr = detectAddressee(line);
    const isPureAddressee =
      addr !== null && !line.match(/^\(?[a-z]\)/i) && line.replace(/[:.\s]/g, "").length < 60;
    if (isPureAddressee) {
      currentAddressee = addr;
      if (current) raw.push(current);
      current = null;
      continue;
    }

    const subMatch = line.match(/^\(?([a-z]|[iv]+)\)\s*(.*)/i);
    if (subMatch) {
      if (current) raw.push(current);
      const label = subMatch[1];
      let rest = subMatch[2];
      let marksStr = "";
      const m = rest.match(marksAtEnd);
      if (m) {
        marksStr = m[1];
        rest = rest.slice(0, rest.lastIndexOf("(" + m[1])).trim();
      }
      // A sub-part may name its own addressee ("For each wine, identify…"); prefer that over context.
      const embedded = detectAddressee(rest);
      current = { label, text: rest, marksStr, addressee: embedded ?? currentAddressee };
      continue;
    }

    const sm = line.match(standaloneMarks);
    if (sm && current) {
      if (!current.marksStr) current.marksStr = sm[1];
      continue;
    }

    if (current) {
      if (line.match(/^\d+\s*marks?$/i) || line.match(/^\(\d+/)) {
        const cleaned = line.replace(/[()]/g, "").trim();
        if (!current.marksStr) current.marksStr = cleaned;
      } else {
        current.text += " " + line;
        const embedded = detectAddressee(line);
        if (embedded && current.addressee === null) current.addressee = embedded;
      }
      continue;
    }

    preambleLines.push(line);
  }
  if (current) raw.push(current);

  const subParts: SubPart[] = raw.map((r) => {
    const parsed = parseMarks(r.marksStr);
    const { scope, marks, marksPerWine } = resolveScope(r.addressee, parsed, wineCount);
    return { label: r.label, text: r.text, scope, marks, marksPerWine };
  });

  // Group into sections, flight first, then per_wine. Sub-part order within a section is preserved.
  const order: SectionScope[] = ["flight", "per_wine"];
  const sections: QuestionSection[] = [];
  for (const scope of order) {
    const parts = subParts.filter((p) => p.scope === scope);
    if (parts.length === 0) continue;
    sections.push({
      scope,
      heading: headingForScope(scope),
      subParts: parts,
      subtotal: parts.reduce((sum, p) => sum + p.marks, 0),
    });
  }

  const scopes = sections.map((s) => s.scope);

  return {
    preamble: preambleLines.join(" "),
    subParts,
    sections,
    scopes,
    totalMarks,
  };
}
