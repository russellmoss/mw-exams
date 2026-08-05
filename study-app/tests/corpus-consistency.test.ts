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
