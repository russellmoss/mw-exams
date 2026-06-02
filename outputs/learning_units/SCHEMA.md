# Learning-Unit Content-Block Schema

> The contract between the **learning-unit agent team** (which writes chapters) and the
> **`/learn` reader UI** (which renders them). One chapter = one JSON file in
> `outputs/learning_units/ch{NN}_{slug}.json`. The reader treats this JSON as authoritative;
> nothing is hand-edited in the app for a chapter's *content*.
>
> **Design goal.** Content is **data, not compiled code.** A bad generation can never break the
> build — it only fails validation and gets regenerated. Every factual block carries `sourceRefs`
> into a citations array, which is what makes the adversarial verifier's job tractable: it checks
> each claim against the cited source, not against the open corpus.

---

## Top-level shape

```jsonc
{
  "schemaVersion": 1,
  "chapter": 1,                       // integer, matches the book outline
  "slug": "grading",                  // kebab-case; file is ch01_grading.json, route is /learn/grading
  "title": "What the Practical Measures, and How It Is Graded",
  "subtitle": "The arithmetic that governs every strategic decision.",  // one line, optional
  "summary": "One-paragraph abstract shown on the chapter card and at the top of the reader.",
  "estReadingMinutes": 12,            // integer; reader shows "≈12 min"
  "anchorVisual": "grade-bands",      // the chapter's headline infographic component id (see registry)
  "status": "draft",                  // draft | verified | published — only "published" shows in the app by default
  "sources": [                        // the research files this chapter was synthesized from
    { "file": "outputs/research/pass_standard_impact_analysis.md", "note": "governing pass-standard evidence + sourcing strength" },
    { "file": "mw_exam_empirical_knowledge.md", "note": "EK §3 grading; EK-0093, EK-0116" }
  ],
  "sections": [ /* ordered Section objects — see below */ ],
  "citations": [ /* Citation objects referenced by blocks via sourceRefs — see below */ ],
  "meta": {                           // pipeline provenance, written by the orchestrator
    "generatedBy": "learning-unit team v1",
    "writerModel": "claude-...",
    "verifier": { "rounds": 2, "flagsResolved": 7, "flagsOpen": 0 },
    "builtForChapterSources": ["..."]
  }
}
```

`sections[]` define the **table of contents** (each section's `id` + `title`) and drive **scroll-spy**
(the active section highlights as the reader scrolls) and **deep links** (`/learn/grading#pass-standard`).

---

## Section object

```jsonc
{
  "id": "pass-standard",              // unique within the chapter; becomes the anchor (#pass-standard)
  "title": "The pass standard",       // shown in the per-chapter TOC and as the section heading
  "blocks": [ /* ordered Block objects */ ]
}
```

---

## Block objects

Every block has a `type`. Factual blocks (anything making a claim about the exam, a wine, a number, a
year/paper) **must** include `sourceRefs: ["EK-0116", ...]` — ids that exist in `citations`. The verifier
rejects any factual block with an empty or dangling `sourceRefs`. Pure connective prose (transitions,
framing) may omit `sourceRefs` but should be minimal.

### `prose`
The workhorse. GitHub-flavored markdown, rendered by the existing `react-markdown`.
```jsonc
{ "type": "prose", "md": "The pass standard is a **65% average** across the three papers…", "sourceRefs": ["EK-0116"] }
```

### `callout`
A boxed aside. `variant` maps to Cellar colors: `key` (amber accent), `warning` (fail/red),
`insight` (success/green), `note` (neutral border).
```jsonc
{ "type": "callout", "variant": "warning", "title": "The per-paper floor",
  "md": "A strong Paper 1 and 2 **cannot** rescue a Paper 3 that falls below the floor…",
  "sourceRefs": ["EK-0116", "PS-1"] }
```

### `visual`
An interactive infographic. `component` must be one of the **Visual Registry** ids (below). `props` is
passed verbatim to the React component. The visual-spec agent authors `props`; a human hand-builds the
component once, then it is reused across chapters.
```jsonc
{ "type": "visual", "component": "GradeBands",
  "props": {
    "bands": [
      { "label": "A", "range": "70+", "verdict": "pass", "confidence": "plausible" },
      { "label": "B", "range": "65–69", "verdict": "pass", "confidence": "plausible" },
      { "label": "C+", "range": "60–64", "verdict": "borderline", "confidence": "confirmed" },
      { "label": "Fail", "range": "<50 floor breach", "verdict": "fail", "confidence": "confirmed" }
    ],
    "average": 65, "floor": 50
  },
  "caption": "The average, the floor, and how one weak paper drags the average under.",
  "sourceRefs": ["EK-0116", "PS-1"] }
```
- `confidence` on a data point uses the project's three tiers (`confirmed`/`plausible`/`curveball`) so the
  visual can *show* uncertainty (e.g. dashed border on the PLAUSIBLE A/B cut-points) instead of asserting it.

### `example`
A real past-exam example. `year`/`paper`/`question` **must** resolve to a real question in
`data/exams.json` — the verifier checks this. `wine` quotes the real wine label verbatim. This block is
how chapters stay concrete and how we prevent fabricated examples.
```jsonc
{ "type": "example", "year": 2017, "paper": 3, "question": 2,
  "stem": "Consider wine 4 to be of unknown origin. …",
  "wine": "\"Amber\", Cullen, 2014. Margaret River, WA, Australia. (15%)",
  "why": "The only single-wine question in the corpus — an origin-suppressed orange-wine curveball.",
  "sourceRefs": ["exams:2017_p3_q2", "EK-0048"] }
```

### `model-answer`
An excerpt from a real model answer (`outputs/mock_answers/`) or an annotated exemplar, with a short
gloss on *why it scores*. Never invent a model answer; cite the file.
```jsonc
{ "type": "model-answer", "label": "Tokaji Szamorodni — reconciling conflicting evidence",
  "excerpt": "Residual sugar suggests Szamorodni száraz, yet the concentration and length indicate…",
  "annotation": "The distinction move: sugar points one way, quality points to a producer exceeding the minimum.",
  "sourceRefs": ["mock:2019_p3_q4"] }
```

### `table`
```jsonc
{ "type": "table", "columns": ["Band", "Range", "Verdict"],
  "rows": [["A", "70+", "Pass"], ["C+", "60–64", "Borderline"]],
  "caption": "Grade bands (A/B cut-points are PLAUSIBLE, not confirmed).",
  "sourceRefs": ["EK-0116"] }
```

### `keytakeaway`
The one sentence the section exists to install. Rendered as a pull-quote. One per section, max.
```jsonc
{ "type": "keytakeaway", "md": "A single weak paper below the floor is fatal regardless of average.", "sourceRefs": ["EK-0116"] }
```

---

## Audience rule — NO BACKSTAGE (read before authoring anything)

**The reader is a Master of Wine candidate, not a developer.** A chapter is about understanding and
mastering the exam — how to study, how to think under pressure, and *how we know what we know*. It must
read as if written by the research team that studied the exam, for someone who has never seen this
software's internals. The "we" in a chapter is *we, who analysed a decade of exams* — never *we, who wrote
the code*.

**NEVER appears in prose or in any reader-visible field (`source`, `caption`, `md`, titles):**
- The app, software, website, "this tool/system/pipeline," UI, AI models, prompts, validators,
  question-generation or grading internals, code files or paths (`*.ts`), deploys, "both graders."
- Internal knowledge-base mechanics: empirical-knowledge entry ids (`EK-####`), internal finding ids
  (`PS-1`), project/phase names, "the empirical knowledge doc," supersession of internal entries.
- Any "our system had a bug / we mis-stated X in our code" framing. (A *misconception in the wine-study
  world* — e.g. the natural-but-wrong reading of a rule — is fair game and useful; frame it as the exam
  reality vs a common intuition, never as our codebase's defect.)

**DO cite, in plain reader-facing language** (this is where "how we know" lives — lean into it):
- The IMW's own materials — the Student Guide, the syllabus, the practical-exam guidance — named plainly.
- Examiner / Chief Examiner reports, by year and role ("the 2022 Practical Chair report").
- Our own statistical work, described plainly: "our analysis of every MW practical paper from 2011–2025,"
  "across the 14-year corpus," "our backtest of the decision trees." Trust in the method is pedagogy.

Internal traceability is preserved in the `ref` field and the `_work/` audit files — never rendered.

## Citation object

```jsonc
{
  "id": "imw-student-guide",          // internal link key (slug or id) — referenced by blocks' sourceRefs;
                                      // NOT rendered to the reader (only `source` is).
  "type": "imw",                      // imw | examiner-report | corpus-analysis | exam | external
  "claim": "Pass = 65% avg across 3 papers + ~50% per-paper floor; criterion-referenced, not a curve.",
  "source": "IMW Student Guide",      // READER-FACING label ONLY (Audience rule). Never a file path, never
                                      // an internal id (EK-####, PS-#), never the app/codebase.
  "ref": "mw_exam_empirical_knowledge.md · EK-0116; outputs/research/evidence_audit.md Audit A",  // INTERNAL
                                      // audit trail for the verifier. NEVER rendered.
  "strength": "STRONG"                // STRONG | PLAUSIBLE | CURVEBALL | PROCESS — drives hedged confidence
}
```

`sourceRefs` are **internal link keys** — they point a block at a citation `id`; they are not rendered (the
reader sees that citation's reader-facing `source`). Use reader-meaningful slugs for `id`
(`imw-student-guide`, `chair-report-2022`, `corpus-2011-2025`). The *internal* provenance (the EK id, the
finding id, the file + line) lives in the citation's `ref` field for the verifier — never in `id` or `source`.
For a real past-exam example block, still resolve `year`/`paper`/`question` against `data/exams.json`.

---

## Visual Registry (hand-built React components keyed by `component`)

The writer/visual-spec agents may only reference ids in this registry. Adding a new visual = adding a
React component + an entry here (a deliberate gate, so generation can't invent un-buildable visuals).

| `component`     | Chapter | Shows |
|-----------------|---------|-------|
| `GradeBands`    | 1       | Grade-band ladder + the average line + the per-paper floor; one weak paper dragging the average under. |
| `TrustBalance`  | 2       | Credits vs debits scale, with the two "bankruptcies" (Howler, Shoehorn/Cascade) hitting zero. |
| `Funnel`        | 3       | Evidence → 2–3 options (for/against) → commit → tie to quality/commercial. |
| `QualityLadder` | 4       | Official tiers with within-tier discrimination; over-call and under-call failure directions. |
| `ProcessChain`  | 5       | Reception-to-bottle stages, each tagged with its sensory marker. |
| `MaturityCurve` | 6       | Positive/negative evolution trajectory + commercial-placement grid. |
| `FailureCards`  | 8       | The named failure modes as a quick-reference card grid; fatal vs expensive. |

For Chapter 1 only `GradeBands` is required. Others are built as their chapters are produced.

---

## Reader behavior (what the JSON drives)

- **TOC**: built from `sections[].{id,title}`; sticky sidebar on desktop, collapsible on mobile.
- **Scroll-spy**: the section whose heading is nearest the top is the active TOC item (amber).
- **Deep links**: every section heading is an anchor; `/learn/{slug}#{sectionId}` scrolls to it.
- **Citations**: `sourceRefs` render as small superscript chips; a chapter-level "Sources" footer lists
  the `citations` array. Lets the candidate (and the author) audit every claim.
- **Confidence**: `strength`/`confidence` fields render as visual hedging (dashed borders, "plausible"
  tags) so the chapter never asserts a PLAUSIBLE claim as fact.
- **Publish gate**: only `status: "published"` chapters appear in `/learn` for normal users.
