# IMW Theory Corpus — Crawl Inventory

**Crawled:** 2026-08-05 from https://www.mastersofwine.org/mw-exam (public page).
**Local files:** `source/imw_pdfs/` (49 PDFs, all verified `%PDF` headers). **Gitignored** —
copyrighted IMW material, ~14 MB of binaries. Reproduce with `python scripts/fetch_imw_pdfs.py`,
which carries the full URL map.
**Download note:** the wp-content PDFs are hotlink-protected — fetch with a browser User-Agent
**and** `Referer: https://www.mastersofwine.org/mw-exam`, otherwise some return 403/404
(this is how three *unlisted* examiner reports were found: 2014, 2016, 2018).

## Status: five-paper theory era is BUILT

The 2015–2026 theory corpus is extracted, compiled and parsed:

- `source/MW_Theory_Papers_Compilation.md` — 11 years × 5 papers, **297 questions**, authoritative text
- `scripts/parse_theory_source.py` → `data/theory/{theory_exams,theory_questions,theory_annotations}.json`
- `tests/test_theory_corpus.py` — structural gate (passing)

Every year has the identical shape: **6 / 6 / 4 / 6 / 5** questions for papers 1–5 (27 per year).
Verification: all 216 questions from the eight text-extractable years match their source PDF
character-for-character (whitespace-insensitive); the 81 questions from the three scanned years
(2021–2023) were transcribed from page renders, with 2021 cross-checked against the
JancisRobinson.com republication.

Remaining: the **4-paper era (2000–2014)** is downloaded but not compiled — it needs its own era
grammar (different paper→domain mapping), and `parse_theory_source.py` deliberately hard-fails on
any year outside 2015–2026 to prevent silent mixing.

## Status: rubric extractor is BUILT — 189 rubrics (64% of the corpus)

`scripts/segment_examiner_reports.py` → `.claude/agents/rubric-extractor.md` →
`scripts/build_theory_rubrics.py` → `data/theory/theory_rubrics.json`. Run via
`/extract-rubrics <year>`. Schema in `RUBRIC_SCHEMA.md`; gate in `tests/test_theory_rubrics.py`.

Result: **189 rubrics, 667 core requirements, 185 differentiators, 1,910 quotes — every one verified
verbatim against its report segment.** Evidence quality: 132 rich, 55 moderate, 2 thin. All 189
questions had genuine commentary; zero `coverage: "none"` rows.

### Rubric coverage by year

| Year | Questions | Rubrics | Report source |
|------|-----------|---------|---------------|
| 2015 | 27 | — | no report available |
| 2016 | 27 | 27 | public IMW (unlisted URL) |
| 2017 | 27 | 27 | student area |
| 2018 | 27 | 27 | public IMW (unlisted URL) |
| 2019 | 27 | 27 | student area |
| 2021 | 27 | — | **image scan, needs OCR** |
| 2022 | 27 | — | **image scan, needs OCR** |
| 2023 | 27 | 27 | student area |
| 2024 | 27 | 27 | student area |
| 2025 | 27 | 27 | student area |
| 2026 | 27 | — | no report available |
| **total** | **297** | **189 (64%)** | |

Reports live in two stores, both resolved by `REPORT_SOURCES` in the segmenter:
`source/imw_pdfs/` (public, gitignored, refetch with `scripts/fetch_imw_pdfs.py`) and
`docs/examiners reports/` (student-area reports, committed).

**Remaining upside:** OCR of the 2021 and 2022 theory reports would add ~54 questions and take
coverage to about 82%. 2015 and 2026 have no report in either store.

### What the extraction surfaced about report structure

Report formats vary far more than expected, and each variation broke something before it was
handled:

- **Heading conventions differ by year and within a year.** 2016 uses bare `1.`; 2018 uses
  `Question 1:` for papers 1–4 then switches to bare `N.` mid-paper-5; 2019 paper 5 uses `Q5.`.
  From 2019 the IMW splits theory and practical into separate report files and retitles sections
  `Paper one report 2024: Paper chair, …`.
- **The Theory Chair section is renamed almost every year** — `Theory Chair Report`,
  `Theory Panel Chair Report`, `Theory Exam Chair Report, …`, and a bare `Theory Chair:` under an
  Introduction heading in 2025.
- **Chairs abbreviate or reword question restatements.** 2018 p3q2 appears as literally
  "Question 2: each option?"; 2017 p3q4 is retitled "Write concise short notes on 3 of the
  following topics"; 2019 p5q5 is "Q5.". These are recovered by the question-number fallback and
  flagged `anchor: "question_number"` so a human can verify the commentary belongs to the question.
