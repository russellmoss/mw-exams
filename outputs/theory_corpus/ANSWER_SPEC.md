# Theory model-answer spec

One model answer per rubric-backed theory question, written to the rubric extracted from
that year's examiners' report. Output: `outputs/theory_answers/{year}_p{paper}_q{question}.md`.

## What these are

A **solid passing answer under real exam conditions** — not a best-possible essay, not a
reference article. The examiners repeatedly say the difference between pass and fail is not
knowledge but deployment: answering the question actually asked, at the right depth, with
concrete examples, inside the time. A model answer that is encyclopaedic teaches the wrong
lesson, because no candidate can write it in the time available.

The rubric is the specification. Everything in `required_elements[weight=core]` must be
substantively addressed; everything in `penalty_signals` and `scope_traps` must be avoided.

## Time and length — from the IMW Student Guide

| Paper | Duration | Answers required | Time per question |
|-------|----------|------------------|-------------------|
| 1 Viticulture | 3 hours | 3 | 60 min |
| 2 Vinification | 3 hours | 3 | 60 min |
| 3 Handling of wine | 2 hours | 2 | 60 min |
| 4 Business of wine | 3 hours | 3 | 60 min |
| 5 Contemporary issues | 3 hours | **2** | **90 min** |

Paper 5 is the outlier and it matters: two answers in three hours, so half again the time
per essay, and the examiners expect correspondingly more developed argument.

Working rate: roughly 15 minutes planning and 45 minutes writing per 60-minute question,
which a fast typist turns into 750–900 words (Jennifer Docherty MW, on her own exam
technique). Word bands used by the validator:

| Papers | Band | Target |
|--------|------|--------|
| 1, 2, 3, 4 | 700–1,000 | ~850 |
| 5 | 1,050–1,450 | ~1,250 |

An answer outside its band fails the build. Too long is as wrong as too short: it models a
paper the candidate cannot physically produce.

## File format

Markdown with YAML frontmatter. The frontmatter is machine-checked; the body is what the
candidate reads.

```yaml
---
id: th_2024_p1_q1
year: 2024
paper: 1
question: 1
domain: viticulture
section: A
question_text: "How can vineyard practices minimise the need for must adjustments in the winery?"
rubric_source: examiners_report_2024.pdf
text_source: pdf_text_layer        # inherited from the rubric
time_minutes: 60
word_target: 850
word_count: 862
covers_core:                        # one entry per core requirement in the rubric, in order
  - requirement: "Define 'must adjustment' and scope the answer to pre-winery levers"
    where: "Opening paragraph"
  - requirement: "..."
    where: "Section: Acidity"
avoids:                             # penalty signals explicitly steered around
  - "Listing winery corrections rather than vineyard causes"
claims_to_verify:                   # every specific numeric/statistical claim made in the body
  - "Botrytis risk rises sharply above 92% relative humidity"
generated: 2026-08-06
---
```

### Frontmatter rules

- **`covers_core` must have exactly one entry per `core` requirement in the rubric**, quoting
  the requirement text, with `where` naming the part of the answer that discharges it. This
  is the machine-checkable link between rubric and answer; a missing entry fails the build.
- **`claims_to_verify` must list every specific figure, percentage, date, statistic or
  named-producer factual assertion in the body.** These are the fabrication-prone claims.
  Listing them turns an invisible risk into a review checklist. If the answer makes no such
  claim, use `[]` — which is a legitimate and often better outcome.
- `word_count` must match the body's actual count (the validator recomputes it).

## How the answer should read

**Structure that shows the examiner you answered the question:**

1. **Open by defining the terms the rubric says needed defining**, and by stating the scope
   you are taking. Examiners fail candidates for not defining key words more often than for
   any other single thing. Do not open with throat-clearing about the importance of wine.
2. **Signpost the shape** of the answer in a line, so the examiner can see the argument
   coming.
3. **Body in labelled sections** that map onto the question's own structure. Where the
   question has parts (a/b/c), use them as headings — the examiners note that the question's
   wording usually indicates the expected structure.
4. **Every claim carries a concrete example** at the specificity the rubric demands. The
   examiners' recurring complaint is examples used *as* the argument rather than to support
   it; the example should illustrate a point already made, not stand in for it.
5. **Take a position** where the question asks for one ("To what extent…", "Discuss",
   "Do you agree?"). Sitting on the fence is explicitly penalised, especially in Paper 5.
6. **Close with a conclusion that answers the question as set** — not a summary of the essay.

**Register:** professional, economical, first-person where a judgement is being made. This is
a wine professional writing to senior peers. No marketing language, no filler, no
"stonking"-class informality (an examiner singled that out), no unexplained acronyms.

## Factual discipline

This is where a generated model answer can do real harm: a candidate who memorises a
fabricated statistic and reproduces it in the exam is penalised for it, and the examiners
are explicit that factual errors sink otherwise passable papers ("Lambrusco is not a hybrid;
Marechal Foch is not a white grape").

Rules:

- **Prefer robust, widely documented examples** over precise-sounding statistics. "Mosel
  growers train on individual stakes on the steepest slopes because wire trellising is
  impractical there" is safer and scores as well as an invented percentage.
- **Never invent a figure to sound authoritative.** If a number genuinely carries the point,
  state it with a hedge appropriate to a closed-book exam ("of the order of", "roughly") and
  list it in `claims_to_verify`.
- **Never attribute a specific practice to a named producer unless it is well documented.**
  Examiners noticed candidates citing producers second-hand and over-familiarly.
- **Prefer examples the rubric itself names** (`examples_expected.named_in_report`) where they
  fit — those are examiner-endorsed by construction.
- Spread examples globally. Repeated reliance on one region or a single seminar example is a
  documented penalty.

## What the validator enforces

`scripts/build_theory_answers.py`:

1. Frontmatter parses; `id` matches a rubric; identity fields agree with the corpus.
2. Word count inside the paper's band.
3. One `covers_core` entry per core requirement, each quoting a real requirement from that
   rubric.
4. `claims_to_verify` present (possibly empty) and every listed claim actually appears in the
   body.
5. Body has real structure (headings) and does not merely restate the question.

It cannot check that the wine facts are true. That is what `claims_to_verify` is for.
