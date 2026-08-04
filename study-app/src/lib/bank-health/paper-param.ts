// paper-param.ts — shared validation for the Bank Health paper filter (`?paper=1|2|3`, absent = all).
// Returns the numeric paper when present, null when absent, or "invalid" for anything else so each
// route can reject with a 400 (spec: whitelist server-side, reject unknown values).

export type PaperParam = 1 | 2 | 3 | null | "invalid";

export function parsePaperParam(raw: string | null): PaperParam {
  if (raw == null || raw === "") return null;
  if (raw === "1" || raw === "2" || raw === "3") return Number(raw) as 1 | 2 | 3;
  return "invalid";
}
