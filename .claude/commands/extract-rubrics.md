---
description: Extract marking rubrics for MW theory questions from an IMW examiners' report.
argument-hint: <year> [paper]
---

Arguments: $ARGUMENTS

Run the three-stage theory rubric extractor. Stages 1 and 3 are deterministic; only
stage 2 uses an LLM.

1. **Check the report exists.** `source/imw_pdfs/examiners_report_{year}.pdf`. If missing,
   run `python scripts/fetch_imw_pdfs.py`. If it is still missing, that year's report is
   not public — reports for 2015, 2017, 2019 and 2021-2026 are IMW student-area only, and
   the user must download them manually. Say so and stop.

2. **Check the year is in the corpus.** Rubrics can only be anchored for years present in
   `data/theory/theory_questions.json` (the five-paper era, 2015-2026). The 2010-2014
   reports cover four-paper-era questions that are not in the corpus; they can only feed
   the cross-cutting principles pass, not per-question rubrics. Say so and stop.

3. **Segment (deterministic).** Run:
   `python scripts/segment_examiner_reports.py --report {year}`
   Report how many questions were located and list any that were not — a question with no
   commentary is a legitimate outcome, not a failure. Note any segment flagged
   `anchored by question number`: the report abbreviated that question's restatement, so
   the extractor must verify the commentary belongs to it.

4. **Extract (LLM).** Dispatch `rubric-extractor` subagents, one batch per paper (or per
   two papers for the smaller ones), each writing to
   `data/theory/_rubrics_work/{year}_p{n}.json`. Run batches in parallel — they are
   independent. Give each batch its question IDs and any flags from stage 3.

5. **Merge and validate (deterministic).** Run:
   `python scripts/build_theory_rubrics.py`
   This enforces the **quote gate**: every extracted requirement must quote the report
   verbatim, or the build fails. Do not hand-edit `theory_rubrics.json` to make it pass —
   a failing quote means the extractor asserted something the examiners did not say, and
   the fix is to re-extract that rubric.

6. **Test.** Run `python tests/test_theory_rubrics.py`.

7. **Report** to the user: rubrics written, coverage, evidence-quality spread, core
   requirement count, and anything flagged for human review.

If the user passed a paper number, restrict stages 4-7 to that paper but still run the
full segmentation in stage 3.
