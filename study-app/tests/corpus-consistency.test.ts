// corpus-consistency.test.ts — guards the DERIVED layers against corpus drift.
//
// The failure this exists to catch: a question appears in data/exams.json mid-stream (the
// auto-feedback bot recovered 2011 P3 Q1 this way in 353250b) and the derived layers are not
// regenerated. Nothing errors. The question simply sits in the corpus with family = null and
// drops out of every family-based aggregation, and the wines under it keep a stale
// question_role. It happened twice before anyone noticed, both times found by accident.
//
// These pipelines run `npm test`, so this file is the gate on exactly the actor that caused it:
//   .github/workflows/auto-feedback.yml   (bot: feedback -> code change -> merge to master)
//   .github/workflows/feature-build.yml   (bot: feature request -> code -> merge to master)
//
// If this fails, the fix is to re-run the derivation chain from the repo root:
//   python scripts/parse_source.py
//   python scripts/build_historical_wine_classification.py
//   python scripts/generate_taxonomy_tags.py
//   python scripts/build_structured_corpus.py
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXAMS = join(ROOT, "data", "exams.json");
const WINES = join(ROOT, "data", "wines.json");
const TAGS_DIR = join(ROOT, "outputs", "taxonomy_tags");
const CORPUS_Q = join(ROOT, "data", "structured", "corpus_questions.json");
const CORPUS_W = join(ROOT, "data", "structured", "corpus_wines.json");

const HAVE_ALL = [EXAMS, WINES, CORPUS_Q, CORPUS_W].every(existsSync) && existsSync(TAGS_DIR);

type Paper = { paper: number; questions: { n: number }[]; wines: { slot: number }[] };
type Exam = { year: number; papers: Paper[] };

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

/** Every question id the corpus says exists, e.g. "2026_p1_q1". */
function questionIds(): string[] {
  return readJson<Exam[]>(EXAMS).flatMap((e) =>
    e.papers.flatMap((p) => p.questions.map((q) => `${e.year}_p${p.paper}_q${q.n}`)),
  );
}

describe.skipIf(!HAVE_ALL)("derived layers stay in step with the corpus", () => {
  it("every question has a taxonomy tag", () => {
    const ids = questionIds();
    const tags = new Set(
      readdirSync(TAGS_DIR).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, "")),
    );
    const untagged = ids.filter((id) => !tags.has(id));
    expect(untagged, `untagged questions — re-run scripts/generate_taxonomy_tags.py`).toEqual([]);
  });

  it("has no orphan taxonomy tags", () => {
    const ids = new Set(questionIds());
    const orphans = readdirSync(TAGS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .filter((id) => /^\d{4}_p\d_q\d+$/.test(id) && !ids.has(id));
    expect(orphans, "tags for questions that no longer exist").toEqual([]);
  });

  it("every question reaches the structured corpus with a family", () => {
    const ids = questionIds();
    const rows = readJson<{ qid: string; family?: string | null }[]>(CORPUS_Q);
    const byId = new Map(rows.map((r) => [r.qid, r]));

    const missing = ids.filter((id) => !byId.has(id));
    expect(missing, "questions absent from corpus_questions.json").toEqual([]);

    // A null family is the silent-exclusion bug: the row exists but drops out of every
    // family aggregation. This is the specific symptom 2011_p3_q1 presented with.
    const familyless = ids.filter((id) => !byId.get(id)?.family);
    expect(familyless, "questions with no family — re-run the taxonomy tagger then the corpus build").toEqual([]);
  });

  it("every wine reaches the structured corpus", () => {
    const wines = readJson<{ id: string }[]>(WINES).map((w) => w.id);
    const corpus = new Set(readJson<{ wine_id: string }[]>(CORPUS_W).map((w) => w.wine_id));
    const missing = wines.filter((id) => !corpus.has(id));
    expect(missing.length, `wines absent from corpus_wines.json (${missing.slice(0, 5).join(", ")})`).toBe(0);
    expect(corpus.size).toBe(wines.length);
  });

  // A brief can describe the WRONG WINE and nothing errors — the filename still matches a
  // real slot, so every downstream consumer reads it happily. All twelve
  // data/wine_research/2023_p3_w*.md briefs described the 2025 Paper 3 flight, slot for slot,
  // and it went unnoticed until a mock answer written from them argued about a Gredos
  // Garnacha under a question about three rosés (fixed 2026-08-05).
  //
  // The check: the brief's `producer` must appear in the wine's own full_text. That is the
  // one field specific enough to catch a whole-flight swap and stable enough not to
  // false-positive on wording.
  it("wine-research briefs describe the wine their filename claims", () => {
    // Briefs naming the parent company where the exam text names the brand or the wine.
    // Both are correct; they just share no token.
    const PARENT_COMPANY_OK = new Set([
      "2012_p3_w12", // Donnafugata makes 'Ben Ryé'
      "2018_p1_w1", //  Casella Family Brands owns Yellowtail
      "2025_p1_w4", //  Gabilan Wine Company farms Old Stage
    ]);

    // Accents, punctuation and spacing vary between the exam text and the briefs
    // ("Cockburn's"/"Cockburns", "DuMOL"/"Du MOL"), so compare on collapsed alphanumerics.
    const collapse = (s: string) =>
      s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

    const exams = readJson<(Exam & { papers: { paper: number; wines: { slot: number; full_text: string }[] }[] })[]>(EXAMS);
    const mismatched: string[] = [];

    for (const e of exams) {
      for (const p of e.papers) {
        for (const wine of p.wines) {
          const id = `${e.year}_p${p.paper}_w${wine.slot}`;
          if (PARENT_COMPANY_OK.has(id)) continue;

          const brief = join(ROOT, "data", "wine_research", `${id}.md`);
          if (!existsSync(brief)) {
            mismatched.push(`${id}: no brief`);
            continue;
          }
          const producer = /^producer:\s*(.+)$/m.exec(readFileSync(brief, "utf8"))?.[1]?.trim();
          if (!producer) {
            mismatched.push(`${id}: brief has no producer field`);
            continue;
          }

          const haystack = collapse(wine.full_text);
          // Trailing "s" is dropped so a possessive in one source matches a plural in the other.
          const hit = producer
            .split(/[\s,()/]+/)
            .flatMap((tok) => [collapse(tok), collapse(tok).replace(/s$/, "")])
            .some((tok) => tok.length >= 3 && haystack.includes(tok));

          if (!hit) mismatched.push(`${id}: brief says "${producer}", exam says "${wine.full_text}"`);
        }
      }
    }

    expect(mismatched, "briefs describing a different wine — re-run the wine-researcher").toEqual([]);
  });

  // The Stage 1 Assessment is a different exam with a different structure. It lives in
  // data/s1a/ behind an `s1a_` id prefix precisely so it cannot skew the paper-1/2/3
  // distributions the master trees are built on. This locks that boundary in place.
  it("keeps the S1A namespace out of the Stage 2 corpus", () => {
    for (const f of [EXAMS, WINES, CORPUS_Q, CORPUS_W]) {
      expect(readFileSync(f, "utf8").toLowerCase().includes("s1a"), `S1A leaked into ${f}`).toBe(false);
    }
    const papers = new Set(
      readJson<Exam[]>(EXAMS).flatMap((e) => e.papers.map((p) => p.paper)),
    );
    expect([...papers].sort(), "Stage 2 has exactly three papers").toEqual([1, 2, 3]);
  });
});
