# Chapter 1 — Visual Build Specs

> Authored by the `learning-unit-visual-spec` subagent. One section per `visual` block in
> `outputs/learning_units/ch01_grading.json`. Chapter 1 has exactly **one** visual: the anchor
> infographic `GradeBands`. Every datum below is confirmed against
> `outputs/learning_units/_work/ch01/evidence_sliceB.json` (and the chapter's own citations).
>
> Honor `DESIGN.md` ("Cellar") exactly: amber `--accent` as the single accent, verdict colors for
> PASS/BORDERLINE/FAIL, **borders not shadows**, Geist labels with `tabular-nums` for all figures,
> Fraunces only for a display title. No gradients, no drop-shadow stacks.

---

## Visual 1 — `GradeBands` (anchor infographic, §`pass-standard`)

### Purpose (one line)
Show the grade-band ladder **plus** the 65% pass line **plus** the ~50% per-paper floor together, so
the reader sees two distinct gates at once: one weak paper drags the **three-paper average** under the
65 line (the average gate), and **separately** a single paper below the ~50 floor fails the whole
practical no matter how high the average is (the floor gate) — while never mistaking the PLAUSIBLE A/B
cut-points for fact.

### Verified data table

Every value below traces to `evidence_sliceB.json` (slice B = `per-paper-floor` + `grade-bands`) or to
the chapter citations resolved by slice A. The **CONFIRMED / PLAUSIBLE** column is load-bearing: it
drives the visual's confidence encoding.

| Datum | Value | Confidence | Backed by (evidence) |
|---|---|---|---|
| Band A | range `70+`, verdict **pass** | **PLAUSIBLE** | `evidence_sliceB.json` c12/c13 → `research:evidence_audit#audit-a-grade-bands-AB` (MODERATE, ~65% conf; unreadable 2021 Chief appendix only) + `EK-0116` (L503–504, "do not assert as verified"). `verdictSummary.grade-bands.A = PLAUSIBLE`. |
| Band B | range `65–69`, verdict **pass** | **PLAUSIBLE** | Same as A — `audit-a-grade-bands-AB`; `verdictSummary.grade-bands.B = PLAUSIBLE`. |
| Band C+ | range `60–64`, verdict **borderline** | **CONFIRMED** | `evidence_sliceB.json` c11 → `research:evidence_audit#audit-a-grade-bands-cplus` (Student Guide + 2024 Practical, Marks MW, "60% – 64% range across all three papers"). `verdictSummary.grade-bands.C+ = CONFIRMED` ("the load-bearing solid anchor"). |
| Band Fail | range `below — or any paper under the floor`, verdict **fail** | **CONFIRMED** | `EA-SG` (Student Guide); floor is an independent gate, `evidence_sliceB.json` c9 → `research:pass_standard_impact_analysis#PS-1`. |
| Average (pass line) | `65` | **CONFIRMED** | `evidence_sliceB.json` `verdictSummary.grade-bands.average-65-and-floor-50 = CONFIRMED`; `EA-SG` verbatim Student Guide "average 65% or more across all three papers"; `PS-1`. |
| Floor (per-paper) | `~50` (hedge `~`) | **CONFIRMED** | `evidence_sliceB.json` c8 → `research:evidence_audit#audit-a-per-paper-floor` (Student Guide "minimum of 50% in any one paper"); `verdictSummary.per-paper-floor.floor-50pct = CONFIRMED`. The `~` hedge is for the 55% candidate-folklore variance only — the floor's **existence and 50 value are CONFIRMED**, not hedged. |
| Floor is an independent gate | (behavioural label, not a number) | **CONFIRMED** | `evidence_sliceB.json` c9 → `verdictSummary.per-paper-floor.floor-is-independent-gate = CONFIRMED` (PS-1 + EK-0116: carry-weaker-paper conditioned on clearing the floor). |
| Scale label | `criterion-referenced (absolute bar, not a curve)` | **CONFIRMED** | Chapter citation `EA-CRIT` (Audit A "CORRECT"). A label, not a plotted number. |

**Flagged / out-of-scope checks:**
- **No unbacked datum.** Every number in `props` (70, 65, 60, 64, 50) and every label is backed above.
- **The `~45% average never-recovers` figure is intentionally NOT in this visual.** It belongs to the
  prose/`keytakeaway` of §`per-paper-floor` (c10), is an *average* tendency (not a per-paper line), and
  plotting it would invite the very per-paper misreading the chapter corrects. Do **not** add a third
  line for it.
- **Hedge precision.** The `~` on the floor is folklore-variance hedging, **not** confidence hedging.
  The floor renders CONFIRMED/solid; only its printed glyph carries the tilde. Do not let the `~`
  leak into dashed/PLAUSIBLE styling.

### Type / layout
A **horizontal band ladder**, four stacked rows, highest band (A) at top descending to Fail at bottom,
with two horizontal reference lines crossing the ladder:

```
 ┌───────────────────────────────────────────────┐
 │  A    70+            · · · · (dashed) · · · ·   │  pass     PLAUSIBLE
 ├───────────────────────────────────────────────┤
 │  B    65–69          · · · · (dashed) · · · ·   │  pass     PLAUSIBLE
 │═══════════════ 65  PASS LINE (avg) ════════════│ ◀ amber, solid, CONFIRMED
 ├───────────────────────────────────────────────┤
 │  C+   60–64          (solid)                    │  borderline CONFIRMED
 ├───────────────────────────────────────────────┤
 │  Fail  below / any paper under floor (solid)    │  fail     CONFIRMED
 │┄┄┄┄┄┄┄┄┄┄┄┄┄ ~50  PER-PAPER FLOOR ┄┄┄┄┄┄┄┄┄┄┄┄│ ◀ fail-red, solid, CONFIRMED, tilde glyph
 └───────────────────────────────────────────────┘
```

- The **65 pass line** sits at the B/C+ boundary (it is the bottom edge of the pass region) and is the
  visual's focal element — drawn in amber `--accent`.
- The **~50 floor line** sits inside/below the Fail zone, drawn in `--fail`, clearly *a second, lower
  gate* — visually distinct from the 65 line so the reader reads two gates, not one scale.
- **Two-gate narrative band** (renders the `narrative` prop) below the ladder, two short side-by-side
  micro-callouts:
  1. *Average gate* — "One weak paper drags the three-paper **average** under 65." A tiny inline
     three-cell sparkline/mini-bars (P1, P2, P3) with their mean dipping below the amber line
     illustrates the drag. Static, no animation.
  2. *Floor gate* — "A single paper under ~50 **fails the practical regardless of the average.**" Show
     one of the three cells breached below the red floor while the mean is still above 65, to make the
     independence explicit.

  These mini-bars are **illustrative schematic, not real data** — label them as such (small muted
  "illustrative" tag) so they're never read as a real candidate's scores.

### Data → encoding
| Prop | Drives |
|---|---|
| `bands[].label` | Row label (left), Geist `font-medium`. |
| `bands[].range` | Row range figure (right of label), Geist `tabular-nums`. |
| `bands[].verdict` | Row accent stripe / text color: `pass`→`--success`, `borderline`→`--borderline`, `fail`→`--fail`. (Pass bands share success-green; the band labels distinguish A vs B.) |
| `bands[].confidence` | Border treatment of the row — see Confidence encoding. |
| `average.value` | Y-position + printed figure of the amber pass line (`tabular-nums`). |
| `average.label` | Hover/tap gloss + the line's inline caption. |
| `average.confidence` | Always `confirmed` → solid line. |
| `floor.value` + `floor.hedge` | Printed figure on the red floor line; `hedge` (`~`) prefixes the number → `~50`. |
| `floor.label` | Hover/tap gloss + inline caption. |
| `floor.confidence` | Always `confirmed` → solid line. |
| `scale` | A small muted caption pinned to the frame ("criterion-referenced — an absolute bar, not a curve"). Not plotted. |
| `narrative` | The two-gate micro-callout text below the ladder. |
| `confidenceLegend.{confirmed,plausible}` | A two-row legend keying solid vs dashed; text taken verbatim from the prop. |

### Confidence encoding (the crux — spec precisely)
Two and only two visual states. The encoding must make a hedged number *physically impossible* to
mistake for a fact.

**CONFIRMED** (C+ row, Fail row, the 65 average line, the ~50 floor line):
- Solid `1px solid var(--border)` row border (Cellar default), full-opacity text/figure.
- Reference lines: solid stroke, 2px. 65 line = `--accent` (amber, the focus). ~50 line = `--fail`.
- No tag.

**PLAUSIBLE** (A row, B row only):
- Row border **dashed**: `1px dashed var(--border)` (`stroke-dasharray: 4 3` if SVG).
- A small inline tag pill on the row, right-aligned: text **"plausible"**, `rounded-full`,
  `text-xs`, Geist, `--muted` text on a transparent/`--card` fill with a `1px dashed var(--border)`
  outline. **Never** amber, never a verdict color (the tag is meta, not a verdict).
- Row figure rendered at slightly reduced emphasis (e.g. `text-muted` for the range, or
  `opacity: 0.85`) so it visibly reads as "indicative."
- The A/B range numbers (`70+`, `65–69`) must **never** appear in a solid box or with the same weight
  as C+ `60–64`.

**Legend (always shown, drives the read):** two rows beneath the ladder —
- `── solid` → `confidenceLegend.confirmed` verbatim ("Report-verified: C+ = 60–64, the 65 average, the ~50 floor.")
- `┄ dashed + "plausible" pill` → `confidenceLegend.plausible` verbatim ("Sourced only to the unreadable 2021 Chief appendix: the A ≥ 70 and B 65–69 cut-points. Rendered hedged — never asserted as fact.")

**Invariant for the dev:** if `confidence === "plausible"`, the row gets dashed border + "plausible"
pill + reduced figure emphasis. If `confidence === "confirmed"`, solid + no pill. There is no third
path. The two reference lines are hard-coded CONFIRMED (their `confidence` is always `confirmed` and
the component may assert this).

### Cellar treatment (exact tokens)
- **Surface:** the whole visual sits in a card — `bg-card rounded-xl border border-border p-6`. No shadow.
- **Pass line (focus):** `--accent` (`#d97706`). This is the single amber energy point in the visual.
- **Floor line:** `--fail` (`#ef4444`), solid, visually lower and distinct from the amber line.
- **Verdict stripes/text:** `--success` (`#22c55e`) pass, `--borderline` (`#eab308`) borderline,
  `--fail` (`#ef4444`) fail. (Note: `--borderline` is yellow `#eab308`, deliberately NOT the amber
  `--accent-hover` — keep the C+ borderline marker yellow so it never reads as an interactive amber control.)
- **Borders, not shadows:** all separation via `var(--border)` (`#44403c`); solid for confirmed,
  dashed for plausible. No `shadow-*` anywhere in this visual (it does not float).
- **Type:** all labels Geist (`--font-geist-sans`); **all figures** (`70+`, `65–69`, `60–64`, `65`,
  `~50`) use `tabular-nums`. Captions/legend `text-xs` `--muted`. The "plausible" pill `text-xs` Geist.
- **Display title (optional):** if the visual carries a heading, Fraunces (`font-display`) at a display
  size only — e.g. a short "The two gates" title. Fraunces nowhere else in this component.
- **Radius:** card `rounded-xl`; the "plausible" pill `rounded-full`; any chip `rounded-md`.
- **No gradients, no decorative motion.**

### Interactivity (minimal-functional)
- **Hover/tap a reference line** → reveals its `label` (the amber line shows `average.label`; the red
  line shows `floor.label`) as a one-line gloss/tooltip. Color transition 150–250ms; no transform
  theatrics.
- **Hover/tap a PLAUSIBLE row** → reveals the source gloss ("Sourced only to the unreadable 2021 Chief
  appendix; not report-verified"). This reinforces the hedge on demand.
- No autoplay, no decorative animation. The mini-bars are static.

### Responsive
- **Desktop / tablet:** full ladder with both reference lines spanning the width; the two narrative
  micro-callouts side-by-side below.
- **Mobile (< ~640px):** ladder stays vertical (it already is); reference-line inline captions wrap
  under the line rather than floating beside it; the two narrative callouts **stack** (average gate
  above floor gate); the legend stacks to two full-width rows. The "plausible" pills stay on their
  rows. Figures keep `tabular-nums`. No horizontal scroll.

### Component contract (authoritative TypeScript `props` shape)

**Build-or-reuse:** `GradeBands` is **NEW** — it is in the Visual Registry (SCHEMA.md → Chapter 1) but
no React component exists yet. **Build required.** This is the precise contract the component must
implement.

```ts
type Confidence = "confirmed" | "plausible"; // GradeBands uses only these two of the
                                             // project's three tiers (curveball never applies here)
type Verdict = "pass" | "borderline" | "fail";

interface GradeBand {
  label: string;        // "A" | "B" | "C+" | "Fail"
  range: string;        // "70+" | "65–69" | "60–64" | "below — or any paper under the floor"
  verdict: Verdict;     // drives the verdict color (success/borderline/fail)
  confidence: Confidence; // "plausible" → dashed + "plausible" pill; "confirmed" → solid
}

interface ReferenceLine {
  value: number;        // 65 (average) | 50 (floor) — rendered with tabular-nums
  label: string;        // full gloss, shown inline + on hover
  confidence: Confidence; // always "confirmed" for both lines in Ch.1
  hedge?: string;       // optional glyph prefix on the figure, e.g. "~" → "~50"
}

interface GradeBandsProps {
  bands: GradeBand[];           // ordered top→bottom: A, B, C+, Fail
  average: ReferenceLine;       // the 65 pass line (amber --accent)
  floor: ReferenceLine;         // the ~50 per-paper floor (--fail)
  scale?: string;               // criterion-referenced label (muted caption; not plotted)
  narrative?: string;           // the two-gate explanatory sentence (drives the callouts)
  confidenceLegend?: {          // verbatim legend text keyed by tier
    confirmed: string;
    plausible: string;
  };
  // `caption` and `sourceRefs` live on the BLOCK (sibling to `props`), rendered by the reader
  // chrome — they are NOT part of GradeBandsProps.
}
```

**SCHEMA.md reconciliation (action for the dev / schema owner):** SCHEMA.md's example (lines ~87–98)
shows `average` and `floor` as **scalars** (`"average": 65, "floor": 50`). The Chapter 1 writer
authored the **richer object form** (`average`/`floor` as `ReferenceLine` objects with
`value`/`label`/`confidence`/`hedge`), plus `scale`, `narrative`, and `confidenceLegend`. **The
object form above is authoritative** — it is what `ch01_grading.json` ships and what the component must
implement. SCHEMA.md's scalar example is **illustrative and out of date**; update the SCHEMA.md
`GradeBands` example to the object form so the contract and the schema doc agree. (If backward-compat
with the scalar form is ever wanted, the component may accept `number | ReferenceLine` and normalize —
but the canonical, documented shape is the object form.)

**Conformance check against the shipped block:** the `props` in `ch01_grading.json` §`pass-standard`
match this contract exactly — `bands` (A/B plausible, C+/Fail confirmed), `average` object (65,
confirmed), `floor` object (50, confirmed, `hedge: "~"`), `scale`, `narrative`, `confidenceLegend`.
No prop is unbacked or extraneous.
