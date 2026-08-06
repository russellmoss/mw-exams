# Theory rubric schema

One rubric per theory question, extracted from that year's examiners' report by the
`rubric-extractor` subagent. Rubrics are the **grading anchor** for theory: a candidate's
essay is scored against the rubric, never against similarity to a generated model answer
(theory questions admit many valid answers with different examples and different
positions — anchoring on a model answer would penalise a good essay for choosing Rías
Baixas where ours chose Marlborough).

Written to `data/theory/theory_rubrics.json` as a JSON array.

## The cardinal rule

**Every field must be supported by the examiners' report text.** This is an extraction
task, not a generation task. If the report does not say what a good answer needed, the
field stays empty and `evidence_quality` records that. Never infer requirements from your
own wine knowledge — a fabricated requirement would fail a candidate for omitting
something the examiners never asked for.

Every `required_element`, `credit_signal` and `penalty_signal` carries a verbatim `quote`
from the report. If you cannot quote it, do not assert it.

## Fields

```jsonc
{
  "id": "th_2016_p1_q1",              // matches data/theory/theory_questions.json
  "year": 2016,
  "paper": 1,
  "question": 1,
  "domain": "viticulture",
  "section": "A",                      // "A" | "B" | null (paper 3 has no sections)
  "question_text": "...",              // verbatim, copied from the corpus

  "source_report": "examiners_report_2016.pdf",
  "text_source": "pdf_text_layer",   // "pdf_text_layer" | "transcribed_render"
                                     // transcribed_render = the IMW published that year's report
                                     // as an image-only PDF and the evidence is a transcription of
                                     // page renders. The quote gate can then only prove a quote
                                     // matches the transcription, not the printed report — weaker
                                     // provenance, so weight it accordingly.
  "coverage": "full",                  // "full" — commentary found | "none" — no commentary
  "evidence_quality": "rich",          // "rich" | "moderate" | "thin"
                                       // thin = a sentence or two; grader should weight it lightly

  "command_word": "assess",            // the question's operative verb, verbatim
  "command_word_demand": "...",        // what the examiners said that verb required, in their terms.
                                       // The single most repeated theory failure is answering a
                                       // different command word: describing when asked to assess.

  "definitions_required": [            // terms the examiners said had to be DEFINED to score
    {"term": "effectiveness", "quote": "Most did not define 'effectiveness'..."}
  ],

  "required_elements": [               // what a passing answer had to contain
    {
      "element": "Distinguish organic from biodynamic conceptually (containment vs prevention)",
      "quote": "Nor were there many papers that clearly understood the conceptual differences...",
      "weight": "core"                 // "core" — needed to pass | "differentiator" — separated strong answers
    }
  ],

  "credit_signals": [                  // what the BEST answers did
    {"signal": "...", "quote": "..."}
  ],

  "penalty_signals": [                 // what WEAK answers did; the grader's negative checks
    {"signal": "...", "quote": "..."}
  ],

  "examples_expected": {
    "required": true,                  // did the examiners require concrete examples?
    "specificity": "...",              // e.g. "meso-areas such as Clare Valley, not 'Napa' or 'Austria'"
    "named_in_report": ["Clare Valley", "Okanagan Valley"],  // examples the report itself praised
    "quote": "..."
  },

  "scope_traps": [                     // misreadings the examiners explicitly warned about
    {"trap": "Reading the question as being about high-quality wines only",
     "quote": "A few papers misinterpreted the question to mean 'high quality' wines only."}
  ],

  "performance_note": "...",           // how candidates actually did, if stated (attempt rate, pass rate)
  "extraction_notes": "..."            // anything the extractor wants a human to check; "" if none
}
```

## Field rules

- **`coverage: "none"`** — the report contains no commentary for this question. Emit the
  row with all evidence arrays empty. It is a legitimate outcome and must be visible: a
  grader must know it is grading without examiner backing, rather than silently treating
  an empty rubric as "no requirements".
- **`weight`** — `core` only where the report indicates an answer *needed* this to pass
  ("absolutely critical", "the question required", "few succeeded without"). Everything
  the report praises in strong answers but does not treat as mandatory is a
  `differentiator`.
- **`command_word_demand`** — quote or closely paraphrase the examiners. Do not supply a
  generic dictionary gloss of "assess".
- **`named_in_report`** — only examples the report itself mentions. Never add your own.
- Quotes may be lightly trimmed with `…` but never reworded.

## Consuming a rubric

A grader should treat `required_elements[weight=core]` as the pass floor,
`differentiator` + `credit_signals` as the ceiling, `penalty_signals` and `scope_traps` as
negative checks, and `evidence_quality` as its confidence in the whole rubric. Grades
remain **indicative**: there are no marked scripts to calibrate against, so a rubric tells
you what the examiners asked for, not where the pass line fell.
