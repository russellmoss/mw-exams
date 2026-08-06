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

## Status: rubric extractor is BUILT — 243 rubrics (82% of the corpus)

`scripts/segment_examiner_reports.py` → `.claude/agents/rubric-extractor.md` →
`scripts/build_theory_rubrics.py` → `data/theory/theory_rubrics.json`. Run via
`/extract-rubrics <year>`. Schema in `RUBRIC_SCHEMA.md`; gate in `tests/test_theory_rubrics.py`.

Result: **243 rubrics, 845 core requirements, 241 differentiators, 2,407 quotes — every one
verified verbatim against its report segment.** Evidence quality: 175 rich, 66 moderate, 2 thin.
All 243 questions had genuine commentary; zero `coverage: "none"` rows.

### Rubric coverage by year

| Year | Questions | Rubrics | Report source | Text |
|------|-----------|---------|---------------|------|
| 2015 | 27 | — | none available | — |
| 2016 | 27 | 27 | public IMW (unlisted URL) | publisher |
| 2017 | 27 | 27 | student area | publisher |
| 2018 | 27 | 27 | public IMW (unlisted URL) | publisher |
| 2019 | 27 | 27 | student area | publisher |
| 2021 | 27 | 27 | student area | **transcribed** |
| 2022 | 27 | 27 | student area | **transcribed** |
| 2023 | 27 | 27 | student area | publisher |
| 2024 | 27 | 27 | student area | publisher |
| 2025 | 27 | 27 | student area | publisher |
| 2026 | 27 | — | none available | — |
| **total** | **297** | **243 (82%)** | | 189 publisher / 54 transcribed |

Reports resolve through `REPORT_SOURCES` in the segmenter, across two stores:
`source/imw_pdfs/` (public, gitignored, refetch with `scripts/fetch_imw_pdfs.py`) and
`docs/examiners reports/` (student-area, committed).

**Remaining gap:** 2015 and 2026 have no examiners' report in either store (~54 questions).

### Provenance: two years are transcribed, not publisher text

The IMW published the 2021 and 2022 theory reports as **image-only PDFs** — 75 and 48 extractable
characters across 24 and 23 pages. Both were transcribed page by page from 170-DPI renders into
`data/theory/ocr/{year}_theory_report.txt`, which `OCR_SOURCES` makes the segmenter prefer over the
PDF. Each file carries a provenance header, stripped at read time so its own wording can never be
quoted as an examiner's.

This is a real, if small, weakening of the evidence chain and is tracked rather than hidden: every
segment and rubric carries `text_source` (`pdf_text_layer` or `transcribed_render`), and
`tests/test_theory_rubrics.py` asserts the two agree. **The quote gate proves a quote matches the
transcription; it cannot prove the transcription matches the printed report.** Re-check any
transcribed quote before showing it to a candidate as an examiner's exact words.

Fidelity indicators for the transcription: 25/27 (2021) and 26/27 (2022) corpus questions appear in
it verbatim, and all three apparent misses turned out to be the chairs rewording their own
restatements — "How relevant is tradition to 21st century consumers?" for the paper's "…21st century
wine consumers?" — the same drift seen in every publisher-text year.

Transcription scaffolding (`===== PAGE n =====`) is stripped at read time and the test fails on any
quote containing it, after an extractor agent flagged markers appearing mid-quote.

### What the extraction surfaced about report structure

Report formats vary far more than expected, and each variation broke something before it was
handled:

- **Heading conventions differ by year and within a year.** 2016 uses bare `1.`; 2018 uses
  `Question 1:` for papers 1–4 then switches to bare `N.` mid-paper-5; 2019 and 2021–2022 use `Q5.`.
  From 2019 the IMW splits theory and practical into separate report files and retitles sections
  `Paper one report 2024: Paper chair, …`.
- **The Theory Chair section is renamed almost every year** — `Theory Chair Report`,
  `Theory Panel Chair Report`, `Theory Exam Chair Report, …`, and a bare `Theory Chair:` under an
  Introduction heading in 2025.
- **Chairs abbreviate or reword question restatements.** 2018 p3q2 appears as literally
  "Question 2: each option?"; 2017 p3q4 is retitled "Write concise short notes on 3 of the
  following topics". These are recovered by the question-number fallback and flagged
  `anchor: "question_number"` so a human can verify the commentary belongs to the question.
