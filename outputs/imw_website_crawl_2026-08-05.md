# IMW Website Crawl — Knowledge-Source Inventory (2026-08-05)

Crawl of https://www.mastersofwine.org/ to find sources that would improve question/answer
generation and examiner-style reasoning. All URLs verified live on 2026-08-05.

**Access note:** the site's `wp-content/uploads` PDFs return 403 to non-browser user agents
(SiteGround anti-bot). Workarounds that worked: (a) Wayback Machine copies
(`web.archive.org/web/<ts>/<url>`), (b) a real browser. Tavily extract also failed on the PDFs.

---

## 1. HIGHEST VALUE — not currently in our corpus

### 1a. Examiners' Reports (the only public documents where examiners explain their marking)
- 2013: https://www.mastersofwine.org/wp-content/uploads/2019/09/examiners_report_2013.pdf
  (Wayback: http://web.archive.org/web/20210512134846/… — full text extracted to scratchpad)
- 2010: https://www.mastersofwine.org/wp-content/uploads/2019/09/2010_examiners_report.pdf
  (Wayback: http://web.archive.org/web/20210512133016/…)

Practical-section contents (both reports, ~6 pages each of practical commentary):
- Confirms pass = 65% average; documents "crashes" (one catastrophic paper sinks the attempt) —
  49 candidates crashed on P2 in 2013 vs 27 on each other paper.
- Named the actual wines and what examiners expected per wine (2013: Tondonia Rioja, Prager
  Riesling, De Morgenzon Chenin, Gavi, Grenache flight, Ripasso, Vidal Icewine, ~300 g/L VA
  passito, etc.).
- Explicit reasoning doctrine: "It is not just about picking the winners" — reward is for
  intelligent option-summary + reasoned argument from evidence in the glass; lists of diverse
  options with no conclusion earn zero; "funneling" endorsed by name.
- Answer-length doctrine: "less is more", match detail to mark allocation; bullet points OK for
  time pressure but fail for compare/contrast or funnelling.
- Catalogue of credibility-killing errors (the "clanger" list): high acid ⇒ CNdP, "lees work
  evidenced by minerality", "Rías Baixas warm climate", MLF on Gewurz, misspelling classic
  wine terms, Rueda DOCG / Napa AOC-type appellation errors.
- P3 doctrine (2010): "at no point were candidates asked grape varieties — the focus was on
  method of production and detailed structural analysis"; failure mode = not breaking down
  sugar/acid/alcohol/tannin structurally; single number required for RS/abv, not a range.
- New-World country choice doctrine (2013 P2 Q2): going outside NZ/Chile/Australia/South Africa
  forced note-squeezing and failed.

### 1b. 2026 exam questions and wines (NOT in data/exams.json — corpus ends 2025)
- https://www.mastersofwine.org/wp-content/uploads/2026/06/MW-exam-questions-and-wines-2026.pdf
- News: https://www.mastersofwine.org/2026/06/15/2026-master-of-wine-exam-questions-and-wines-revealed

### 1c. Stage One Assessment (S1A) papers — a parallel 12-wine blind-tasting corpus, none in our data
- 2026: https://www.mastersofwine.org/wp-content/uploads/2026/06/S1A-questions-and-wines-2026.pdf
- 2025: https://www.mastersofwine.org/wp-content/uploads/2025/06/imw_s1a_2025.pdf
- 2024: https://www.mastersofwine.org/wp-content/uploads/2024/06/imw_s1a_2024.pdf
- 2023: https://www.mastersofwine.org/wp-content/uploads/2023/06/imw_s1a_2023.pdf
- 2022: https://www.mastersofwine.org/wp-content/uploads/2022/08/imw_s1a_2022.pdf
- 2021: https://www.mastersofwine.org/wp-content/uploads/2021/09/IMW-S1A-2021.pdf
- 2019: https://www.mastersofwine.org/wp-content/uploads/2019/09/stage_1_assessment_2019_questions_and_wines_edit.pdf
- 2018: https://www.mastersofwine.org/wp-content/uploads/2019/09/stage_1_assessment_2018_questions_and_wines.pdf
- 2017: https://www.mastersofwine.org/wp-content/uploads/2019/09/stage_1_assessment_2017_questions_and_wines.pdf
- 2016: https://www.mastersofwine.org/wp-content/uploads/2019/09/2016_theory_and_practical_stage_1_assessment_questions_and_wines.pdf
- 2015: https://www.mastersofwine.org/wp-content/uploads/2019/09/first_year_assessment_wines_and_questions_2015.pdf

≈ 11 papers × 12 wines ≈ 130 additional wine/question pairs, written by the same examiner
panel at a calibrated "one step easier" level — ideal for difficulty-tiering our generated
questions and for growing the wine bank.

### 1d. Official syllabus (assessment criteria for the practical, in the IMW's own words)
- https://www.mastersofwine.org/wp-content/uploads/2021/04/MW-Syllabus.pdf (extracted to scratchpad)
- Practical papers are **2 hours 15 minutes** (135 min ÷ 12 wines = 11.25 min/wine) — our
  CLAUDE.md says "~12 minutes per wine"; candidate-facing timing guidance should use 11.25.
- Official competency triad: (1) accurate organoleptic assessment, (2) logical conclusions on
  quality/origin/variety/maturity/winemaking/commercial potential, (3) concise persuasive
  written communication under time limit. "Arguments must always be based on the evidence in
  the glass."
- Official curveball scope statement: any region, any price point; classic regions expected in
  detail PLUS "clear awareness of lesser-known or up-and-coming examples (such as Swartland,
  Leyda Valley, Carricante, Godello)". Named examples are a signal of what the IMW considers
  fair-game curveballs.
- "The number of marks per question will give a sense of the detail required."
- Commercial-potential definition: "where, how, and when do you see the wine being sold and to whom?"
- Maturity definition: "how old is the wine and what is its potential for future ageing?"

## 2. STRONG VALUE

### 2a. Entrance-exam practical papers (2020-2025) — known wines + IMW question style
- 2025: https://www.mastersofwine.org/wp-content/uploads/2025/10/Previous-practical-entrance-exam-2025.pdf
- 2024: https://www.mastersofwine.org/wp-content/uploads/2025/03/Final-Practical-Questions-website.pdf
- 2023: https://www.mastersofwine.org/wp-content/uploads/2024/03/2023-IMW-Practical-Entry-Exam-2023.pdf
- 2022: https://www.mastersofwine.org/wp-content/uploads/2023/05/Practical-entry-exam-questions-2022.pdf
- 2021: https://www.mastersofwine.org/wp-content/uploads/2022/04/Practical-Entry-Exam-Questions-2021.pdf
- 2020: https://www.mastersofwine.org/wp-content/uploads/2021/04/Practical-Entry-Exam-Questions-2020.pdf
- Unique property: the wines are DISCLOSED (2026: SE Australia Chardonnay ~£10, Chablis
  ~£25-30, Rioja Reserva ~£25, Côtes du Rhône ~£10-15) — question style on known wines shows
  exactly what the IMW asks when identity is *not* the point (style, quality, winemaking,
  commercial position). Also on the page: Richard Hemming MW advice videos (embedded Vimeo).

### 2b. Pre-2011 stage-2 exam papers (corpus extension backward: 2000-2010)
- Pattern: https://www.mastersofwine.org/wp-content/uploads/2019/09/mini_exam_{YY}.pdf
  (2000-2009: mini_exam_00.pdf … mini_exam_09.pdf; note 2008="mini_exam_08.pdf",
  2011="mini_exam_2011_2570.pdf", 2010/2012/2013/2014 = mini_exam_2010.pdf,
  mini_exam_2012.pdf, 2013_exam_questions_and_wines.pdf, mini_exam_2014.pdf)
- Older format; useful for long-horizon pattern analysis (style cycles, region recurrence),
  lower priority than 1a-1d.

### 2c. Research papers with direct relevance to tasting/lexicon systems
Page: https://www.mastersofwine.org/research-papers (release requires request + no-dissemination
assurance, i.e. a manual step by the user):
- Qian Janice Wang MW (2025): Communicating acidity — language vs chemical composition vs
  temporal perception (Riesling, Chenin Blanc)
- Justin Martindale MW (2022): The evolving language of minerality — Decanter notes 1976-2019
- Barbara Drew MW (2018): Influence of vocabulary on perception — tasting tannins in Barolo
  and Brunello
- Tone Veseth Furuholmen MW (2024): Mousiness sensitivity and training
Relevant to the tasting-lexicon system (examiner-endorsed vocabulary research by MWs).

## 3. CONTEXT / MINOR
- FAQ: https://www.mastersofwine.org/2019/01/11/faqs — attempt limits (max 5 sits in 6 years;
  must pass one component within first 3 attempts).
- Annual press releases (news/{year}-mw-exam-questions-and-wines-revealed) — candidate counts
  per year (2026: 111 stage-2, 101 S1A; 2025: 141; 2024: 145; 2023: 137), venues, dates.
- s2-papers page (https://www.mastersofwine.org/s2-papers) is login-gated (student area) —
  likely holds more examiner feedback; not accessible.
- 2013 report references an annual "exam feedback day" video published on the site (Vimeo) —
  the 2013-era video URLs are gone; student-area may retain these.

## Downloaded artifacts (scratchpad, this session)
- examiners_report_2013.pdf/.txt (22 pp), examiners_report_2010.pdf/.txt (23 pp),
  MW-Syllabus.pdf/.txt (7 pp) — under the session scratchpad `imw/` folder.

## ACQUIRED 2026-08-05 (second pass — all stored in repo under docs/)

- `docs/examiners reports/2013-Examiners-Report.pdf` + `2010-Examiners-Report.pdf`
  (+ extracted_txt/) — these two were MISSING from the existing 2017-2025 collection.
- `docs/s1a_papers/` — all 11 S1A papers 2015-2026 (PDF + extracted_txt). Each PDF contains
  BOTH the practical (12-wine) paper and the theory questions.
- `docs/past_papers_2000s/` — MW exam papers 2000-2010 (PDF + extracted_txt). All contain
  theory + practical sections. The 2010 PDF is a scan with no text layer; its extracted_txt
  is a manual transcription from page images and includes the **Crib Sheet 2010** — the full
  wine list (producer, vintage, abv, region, country) that pairs with the 2010 examiners'
  report. Direct-download trick: the 403 is UA/Referer-based; requests with a Chrome UA +
  `Referer: https://www.mastersofwine.org/mw-exam` succeed.
- `docs/research_papers/` — the 4 tasting-language RPs (PDF + extracted_txt):
  Wang 2025 (acidity language), Martindale 2022 (minerality lexicon), Drew 2018 (tannin
  vocabulary, Barolo/Brunello), Furuholmen 2024 (mousiness training). No request form was
  needed — the page gates downloads behind a T&C checkbox but the PDFs are direct links.
  **IMW terms: personal use only, do not publish or disseminate further** — keep these
  internal (fine to mine for the tasting-lexicon system; do not surface the PDFs in the app).

## Remaining next actions
1. Ingest 2026 stage-2 paper into data/exams.json pipeline — IN PROGRESS (separate effort).
2. ~~Parse S1A practical papers into a structured sibling corpus~~ — DONE 2026-08-05:
   `data/s1a_exams.json` (11 years / 45 questions / 132 wines; 2021-2023 transcribed from page
   images), validated by `scripts/validate_s1a.py`.
3. Mine 2013 + 2010 examiners' reports into mw_exam_empirical_knowledge.md §2/§3/§5
   (marking doctrine, clanger taxonomy, per-paper strategy) with citations.
4. Correct the 12-min/wine assumption to 135 min/paper (11.25 min/wine) where it matters.
5. Entrance-exam practical papers → potential drill type: "known wine, IMW-style
   non-identity questions" (style/quality/winemaking/commercial).
6. Mine the 4 RPs into the tasting-lexicon system (examiner-endorsed vocabulary research).
7. Long-horizon pattern analysis over 2000-2010 practicals (question-structure evolution,
   region/style recurrence) to strengthen heuristics.
