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

## Status: rubric extractor is BUILT — 54 rubrics (2016, 2018)

`scripts/segment_examiner_reports.py` → `.claude/agents/rubric-extractor.md` →
`scripts/build_theory_rubrics.py` → `data/theory/theory_rubrics.json`. Run via
`/extract-rubrics <year>`. Schema in `RUBRIC_SCHEMA.md`; gate in `tests/test_theory_rubrics.py`.

Result: **54 rubrics, 246 core requirements, 58 differentiators, 685 quotes — every one verified
verbatim against its report segment.** Evidence quality: 31 rich, 22 moderate, 1 thin. All 54
questions of 2016 and 2018 had genuine commentary; no `coverage: "none"` rows.

**Why only 2016 and 2018:** of the seven public examiner reports, 2010–2014 cover four-paper-era
questions absent from the corpus, so they cannot be anchored per question. They remain useful for a
cross-cutting principles pass (not yet built).

### Rubric coverage vs. the corpus

| | questions | rubrics |
|---|---|---|
| 2016, 2018 | 54 | 54 (100%) |
| 2015, 2017, 2019, 2021–2026 | 243 | 0 — reports not public |
| **total** | **297** | **54 (18%)** |

**The single highest-value manual step for theory grading** is downloading the student-area
examiner reports for 2015, 2017, 2019 and 2021–2025 and dropping them in `source/imw_pdfs/` as
`examiners_report_YYYY.pdf`; `/extract-rubrics YYYY` then handles the rest. That would take rubric
coverage from 18% to roughly 80% of the corpus, concentrated in the most recent years.

## Stage 2 exam papers (theory + practical questions in one PDF)

| Year | File | Theory papers | Text-extractable | Notes |
|------|------|---------------|------------------|-------|
| 2000 | exam_2000.pdf | 4 (P1/P2 Production Pt 1&2, P3 Business, P4 Contemporary) | ✅ | |
| 2001 | exam_2001.pdf | 4 | ✅ | |
| 2002 | exam_2002.pdf | 4 | ✅ | |
| 2003 | exam_2003.pdf | 4 | ✅ | |
| 2004 | exam_2004.pdf | 4 | ✅ | |
| 2005 | exam_2005.pdf | 4 | ✅ | |
| 2006 | exam_2006.pdf | 4 | ✅ | |
| 2007 | exam_2007.pdf | 4 | ✅ | |
| 2008 | exam_2008.pdf | 4 | ✅ | |
| 2009 | exam_2009.pdf | 4 | ✅ | |
| 2010 | exam_2010.pdf | 4 | ❌ **image scan** | theory questions are quoted in examiners_report_2010.pdf (text) |
| 2011 | exam_2011.pdf | 4 | ✅ | |
| 2012 | exam_2012.pdf | 4 | ✅ | |
| 2013 | exam_2013.pdf | 4 | ✅ | |
| 2014 | exam_2014.pdf | 4 | ✅ | last 4-paper year |
| 2015 | exam_2015.pdf | **5** (Viti / Vinif+pre-bottling / Handling / Business / Contemporary) | ✅ | first 5-paper year |
| 2016 | exam_2016.pdf | 5 | ✅ | |
| 2017 | exam_2017.pdf | 5 | ✅ | |
| 2018 | exam_2018.pdf | 5 | ✅ | |
| 2019 | exam_2019.pdf | 5 | ✅ | |
| 2020 | — | — | — | **no exam held (COVID)** |
| 2021 | exam_2021.pdf | 5 | ❌ **image scan** | full questions republished as HTML text on JancisRobinson.com |
| 2022 | exam_2022.pdf | 5 | ❌ **image scan** | ditto JancisRobinson |
| 2023 | exam_2023.pdf | 5 | ❌ **image scan** | ditto JancisRobinson |
| 2024 | exam_2024.pdf | 5 | ✅ | |
| 2025 | exam_2025.pdf | 5 | ✅ | |
| 2026 | exam_2026.pdf | 5 | ✅ (layout differs — parser needs care) | |

**26 exam years total (2000–2026, no 2020).** Rough theory volume: ~20–25 questions/year in the
4-paper era, ~25–35 offered questions/year in the 5-paper era → **~600+ real theory questions**.

## Stage 2 examiner reports (the rubric source)

| Year | File | Text | Coverage |
|------|------|------|----------|
| 2010 | examiners_report_2010.pdf | ✅ 23 pp | theory + practical, per-question commentary |
| 2011 | examiners_report_2011.pdf | ✅ 23 pp | " |
| 2012 | examiners_report_2012.pdf | ✅ 38 pp | " |
| 2013 | examiners_report_2013.pdf | ✅ 22 pp | " |
| 2014 | examiners_report_2014.pdf | ✅ 22 pp | " — **unlisted on page, found by URL probe** |
| 2016 | examiners_report_2016.pdf | ✅ 25 pp | theory + practical + RP — **unlisted, found by probe** |
| 2018 | examiners_report_2018.pdf | ✅ 25 pp | " — **unlisted, found by probe** |

**Publicly missing:** 2000–2009, 2015, 2017, 2019, 2021–2026. Probed many URL patterns and the
Wayback Machine index — not publicly hosted. The IMW Student Guide says reports (plus panel-chair
videos) are published in the **student-area login**. → The user, as an MW student, can likely
download 2015/2017/2019/2021–2025 reports from the student area; that would give rubric-grade
examiner commentary for nearly every modern year.

## S1A (Stage 1 Assessment) — bonus haul

Papers: 2015–2019, 2021–2026 (s1a_YYYY.pdf). Examiner/marker reports: 2015, 2016, 2017, 2018, 2019
(s1a_report_YYYY.pdf). S1A includes its own theory paper — relevant since the user's next exam
touchpoint may be S1A-format.

## Source URL map

All under `https://www.mastersofwine.org/wp-content/uploads/`:

- 2000–2012, 2014 papers: `2019/09/mini_exam_{00..08,2009,2010,2011_2570,2012,2014}.pdf`
- 2013: `2019/09/2013_exam_questions_and_wines.pdf`
- 2015–2019: `2019/09/imw_*{2015..2019}*.pdf` (names vary per year)
- 2021: `2021/09/IMW-MW-Exam-2021.pdf` · 2022: `2022/08/imw_s2_exam_2022.pdf` · 2023: `2023/06/imw_s2_exam_2023.pdf`
- 2024: `2024/06/imw_s2_exam_2024.pdf` · 2025: `2025/06/imw_s2_exam_2025-v2.pdf` · 2026: `2026/06/MW-exam-questions-and-wines-2026.pdf`
- Reports: `2019/09/{2010,2011}_examiners_report.pdf`, `2019/09/examiners_report_{2012,2013}.pdf`,
  `2019/09/2014_examiners_report.pdf`, `2019/09/imw_{2016,2018}_examiners_report.pdf`

## Gaps & remediation

1. **Image-scan PDFs (2010, 2021, 2022, 2023):** OCR locally, or (better for 2021–2023) scrape the
   JancisRobinson HTML republication; 2010 theory questions can be recovered from its examiner report.
2. **Missing examiner reports:** ask the user to pull 2015, 2017, 2019, 2021–2025 from the IMW
   student area. 2000–2009 reports may simply never have been digitised publicly.
3. **Copyright:** IMW papers — fine for private study use; do not republish PDFs or full text in
   any public-facing surface.
