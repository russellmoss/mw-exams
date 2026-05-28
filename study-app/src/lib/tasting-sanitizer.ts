type WineIdentity = { fullText: string };

const ORIGIN_TERMS = [
  "argentina",
  "argentinian",
  "australia",
  "australian",
  "austria",
  "austrian",
  "burgundian",
  "california",
  "californian",
  "canada",
  "canadian",
  "chile",
  "chilean",
  "england",
  "english",
  "france",
  "french",
  "germany",
  "german",
  "greece",
  "greek",
  "hungary",
  "hungarian",
  "iberian",
  "italian",
  "italy",
  "loire",
  "mediterranean",
  "new world",
  "new zealand",
  "northern italian",
  "old world",
  "portugal",
  "portuguese",
  "rhone",
  "rioja",
  "south africa",
  "south african",
  "spain",
  "spanish",
  "tuscany",
  "tuscan",
  "usa",
  "u.s.",
  "united states",
];

const DIRECT_ORIGIN_CLUE = new RegExp(
  `\\b(?:${ORIGIN_TERMS.map(escapeRegExp).join("|")})\\b`,
  "i"
);

export function sanitizeTastingNote(note: string, wines: WineIdentity[] = []): string {
  const dynamicOriginTerms = extractOriginTerms(wines);
  const dynamicClue = dynamicOriginTerms.length
    ? new RegExp(`\\b(?:${dynamicOriginTerms.map(escapeRegExp).join("|")})\\b`, "i")
    : null;

  return note
    .replace(/\b(?:legs|tears)\b[^.\n]*(?:\.|$)/gi, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .filter((sentence) => !DIRECT_ORIGIN_CLUE.test(sentence))
    .filter((sentence) => !dynamicClue?.test(sentence))
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeTastingNotes(
  notes: string[],
  wines: WineIdentity[] = []
): string[] {
  return notes.map((note) => sanitizeTastingNote(note, wines));
}

function extractOriginTerms(wines: WineIdentity[]): string[] {
  const terms = new Set<string>();

  for (const wine of wines) {
    const parts = wine.fullText
      .split(".")
      .flatMap((part) => part.split(","))
      .map((part) => part.replace(/\([^)]*\)/g, "").trim())
      .filter(Boolean);

    for (const part of parts.slice(1)) {
      if (part.length >= 4 && !/^\d{4}$/.test(part)) {
        terms.add(part.toLowerCase());
      }
    }
  }

  return [...terms];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
