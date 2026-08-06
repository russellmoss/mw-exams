# Handoff: MW Exam Study App — IA Redesign (Shell + Screens)

## Overview
Redesign of the navigation and top-level information architecture of an MW Stage 2 exam study app, plus new screens for the Theory pillar being built. The redesign replaces the current flat 5-link nav (Study · Stem Sniper · Live Tasting · Diagrams · History) with a two-pillar structure mirroring the real exam (Theory / Practical), a thin launcher home page, a first-run intro presentation, and a spotlight UI tour.

Target implementation: **Next.js + Tailwind v4**, tokens as CSS variables (the existing app's stack — see `study-app/` in the source repo).

## About the Design Files
`MW Shell Redesign.dc.html` is a **design reference created in HTML** — a clickable prototype showing intended look and behavior, not production code. The task is to **recreate these designs in the existing Next.js codebase** using its established patterns (App Router pages, the existing `globals.css` token set, existing components like `NavBar`, `UserMenu`, `NotificationBell`, `FeedbackButton`, `HistoryView` as starting points).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and copy are final and use the app's own "Cellar" token system verbatim. Recreate pixel-perfectly. All data shown (scores, wines, questions, dates) is illustrative mock data.

## IA Decisions (the consultation record)
All decided with the product owner:

1. **Nav pattern**: Two pillars + supporting sections. Top nav: `Theory · Practical (with flyout) · Library · History`. The Practical flyout lists Dry Flights and Live Tastings with one-line descriptions. Clicking "Practical" itself goes to the hub; the chevron opens the flyout.
2. **Landing page `/`**: Thin launcher home (not a dashboard, not a doing-page). Continue card + pillar tiles + recent verdicts. Greeting + exam countdown.
3. **Practical hub**: TWO drills — **Dry Flights** (renamed from the Study wizard) and **Live Tastings**. Stem Sniper is REMOVED as a standalone destination; "Stem Analysis Only" remains as one of Dry Flights' four modes (Full Question, Stem Analysis Only, Dry Notes, Flash Notes). Flash Notes stays inside Dry Flights (not promoted). Mikey easter egg: hidden egg only, no visible trace.
4. **Theory landing**: Browse table leads; "Give me a question" randomizer is secondary (header button). The 54 no-rubric questions (2015, 2026) are hidden silently — UI says "243 questions · 2016–2025" everywhere with no footnote.
5. **History**: One unified timeline, Theory/Practical filter pills. Different card bodies per kind (rubric coverage bar for theory; 12-wine correctness grid for practical). Cards click through to full attempt detail.
6. **Naming**: "Practical" (not "Practice"), "Dry Flights", "Library" (not "Diagrams"/"Study Tools").
7. **Power-user speed**: Continue card (repeat last config AND resume in-progress) + nav flyouts. No ⌘K palette, no pinned drills (declined).
8. **Mobile**: Bottom tab bar — Home · Theory · Practical · History · More.
9. **User menu**: unchanged (Methodology, Settings, Admin, Sign out).

## Screens / Views

### 0. Intro presentation (first run)
- Full-screen overlay (`z-index` above everything), app background color.
- 6 scenes, **click-through only**: no skip, no auto-advance. Buttons at bottom center: `← Back` (from scene 2), `Learn more` (scenes 1–5), `Next →`. Scene counter "n / 6" top-right; progress dots (non-interactive) at bottom: active dot 24×8px amber pill, others 8×8px `--border`.
- Scene content (exact copy in the prototype): 1) "The MW practical exam is not random." 2) Stem analysis funnel 10,000+ → ~300 → ~40 → **8** (right-aligned Geist Mono numerals, final row amber + separated by top border) 3) Corpus stats 540/162/13/15 + "Not Reddit." line 4) Blind-test accuracy 89% (amber) / 64% + honesty framing 5) Theory: 243 rubrics from examiners' reports 6) "That's the edge." + **Start studying** (amber primary) + "Don't show this again" checkbox.
- Entrance animations: staggered fade-up (`translateY(24px)→0`, 500–700ms, delays 100–1800ms), eyebrow plain fade. Re-run per scene.
- **Learn more modal**: max-width 34rem card, Fraunces title, 3 paragraphs of user-facing depth per scene (copy in prototype), "Back to the tour" button, closes on backdrop click.
- Persistence: "Don't show this again" → user preference; otherwise show every session start. Skippable only in the sense that Back/Next let you re-review; exit is only via scene 6.

### 1. Nav shell (all pages)
- Max-width 64rem centered, padding 10px 24px, bottom border `--border`, background `--card` at 50% alpha.
- Left: logo (28px, links home) + links gap 20px: Theory, Practical (+chevron button, 12px, rotates 180° when open), Library, History. Links: Geist 0.875rem/500, `--muted`, active `--accent`, hover `--foreground`, 150ms.
- Active states include child routes (essay/essayResult → Theory; flights/live → Practical; detail → History).
- Practical flyout: 230px, `--card`, 1px `--border`, radius 12px, shadow `0 20px 40px rgba(0,0,0,0.45)`, items 8px 16px with name (0.75rem/500) + one-line description (`--muted`). Items: "Dry Flights — Simulated exam flights — no wine", "Live Tastings — Real bottles, timed event".
- Right, gap 8px: notification bell (20px icon, amber count badge 16px circle top-right), theme toggle (sun/moon), user menu ("Margaret" + chevron).
- **Bell dropdown** (320px, same card treatment): header "Feedback Analysis / 2 new"; rows = mono context label (truncate with ellipsis) + verdict chip (Accept=green, Reject=red, Analyzing…=yellow, pill style below) + 2-line-clamped feedback text + timestamp. Unread rows get amber 5% background tint.

### 2. Home launcher (`/`)
- Max-width 64rem, padding 40px 24px.
- Header row: "Good evening, Margaret" (Fraunces 1.5rem/700, letter-spacing -0.01em) ↔ "Wednesday 6 August · 34 days to Stage 2" (0.75rem `--muted`).
- **Continue card**: `--card`, **1px `--accent` border** (only amber-bordered card in the app), radius 12, padding 24. Left: eyebrow "CONTINUE" (0.6875rem/600, tracking 0.08em, amber) + "Dry Flights · Paper 2 · Full Question" (0.875rem/600) + explainer line. Right: primary button "Start same drill" (amber bg, `--background` text, 8px radius, padding 8px 20px) + outline button "Resume essay draft · 32 min left".
- **Nudge bar**: border-only row (1px `--border`, radius 12, padding 10px 24px): "**Paper 3 is your gap** — 4 of your last 6 P3 flights failed, and it's 34 days out." + text-button "Drill Paper 3 →" (amber, no bg). Data-driven: worst verdict line over recent attempts + exam countdown.
- **Pillar tiles** (2-col grid, gap 12): Fraunces 1.25rem title, one-line description, stat line with amber lead ("243 questions · 5 papers · 2016–2025" / "2 drills · Dry Flights · Live Tastings"). Hover: border `--muted`, bg `--card-hover`.
- **Recent work**: section label (uppercase 0.75rem `--muted`) + "All history →" link; 4-col grid of small cards: when + verdict pill, title (0.8125rem/600), meta (0.6875rem `--muted`).

### 3. First-run UI tour (after "Start studying")
- Spotlight overlay: target element outlined (1px `--accent`, radius 12, 6px inset padding) with the rest dimmed via `box-shadow: 0 0 0 9999px` background-at-75%-alpha. Spotlight animates between targets (250ms top/left/width/height).
- Card 356px anchored below (or above if no room) the target: eyebrow "n of 6", title 0.9375rem/600, body 0.8125rem `--muted`, then `Skip tour` (text, always available) ↔ `← Back` / `Next →` (last step "Done").
- Steps: 1 nav bar, 2 Continue card, 3 nudge bar, 4 pillar tiles, 5 recent work, 6 bell. Copy in prototype.
- Show once per user (persisted flag); re-triggerable from Settings ideally.

### 4. Practical hub (`/practical`)
- Page header pattern (used on all hub/landing pages): full-width bottom border; inside 64rem container padding 24px: Fraunces 1.5rem/700 title + 0.875rem `--muted` subtitle ("The practical exam: three papers of twelve wines, tasted blind.").
- 2-col grid, gap 12. Cards: `--card`, `--border`, radius 12, padding 24, flex column.
  - **Dry Flights**: title ↔ "2–30 min"; description; 4 mode rows (top-border separated, name 0.8125rem/600 + desc 0.6875rem `--muted` ↔ time, times: 20–30 min / 5–10 min / 15–25 min / 1–2 min/card); primary button "Start a dry flight".
  - **Live Tastings**: title ↔ "2¼ hrs"; description; footer stat "Next event: Sat 9 Aug · Paper 1"; outline button "Plan a tasting".

### 5. Dry Flights wizard (`/practical/dry-flights`)
- Header: title + subtitle ↔ breadcrumb pills (selected paper/family/mode as outline pills).
- Step 1 papers: 3-col grid, big cards padding 32: emoji icon 1.875rem (🟡🔴🟣 — matches current app), "Paper N" 1.25rem/600, subtitle amber 0.9375rem/500 (White Wines / Red Wines / Special), description `--muted`.
- Step 2 families: "← Back" + heading; 2-col grid. "Any Family" spans full width, amber-tinted border + `--card-hover` bg. Family cards: mono code (F1–F7, amber, 0.75rem) + label ↔ bank count ("8 in bank" / "generates fresh"); description below. Codes/labels from `question-loader.ts`: F1 Common Variety, F2 Regional Diversity, F3 Blends, F4 Independent Wines, F5 Winemaking Mechanism, F6 Structural Axis, F7 Classification Tiers.
- Step 3 modes: 2-col grid of the four modes with time ranges.
- Step 4 acquire: 2 cards — "Banked question" (amber border, "14 unseen" pill, "Instant…") vs "New question" ("Generates fresh… 30–60 seconds"). Footnote: "Your default is banked-first — set in Settings."
- Hover on selectable cards: border → amber-at-60%, bg `--card-hover`, 200ms.

### 6. Live Tastings (`/practical/live-tastings`)
- Narrower container (42rem). Header + subtitle ("A real blind flight from wines you can actually buy near {city} — shop, bag, taste blind, get graded.").
- **New Live Tasting card**: stacked segmented controls (label 0.875rem/500 above each): What are you building? [One question | Full paper]; Who picks the wines? [Pick my wines | I'll choose wines]; Paper [1 · Whites | 2 · Reds | 3 · Special]; then per-type: question → Wines [2|3|4] + Budget/bottle number input; paper → Paper size [Half — 6 bottles | Full — 12 bottles]. Segment style: padding 8px 16px, radius 8, active = amber text + amber border + amber 10% bg; inactive = `--border` + `--muted`. Conditional helper text under type/mode picks. Submit button label switches: "Build my flight" / "Get my shopping brief" / "Build my {half|full} paper".
- **Your papers** / **Your sessions** lists: row cards (title 0.875rem/500 + meta 0.75rem `--muted` ↔ status chip). Status chips: colored text + 40% border + 10% bg pill — Complete/Tasted=`--success`, Shopping=`--accent`, Tasting prep=`--borderline`.

### 7. Theory landing (`/theory`)
- Header: title + "243 past questions, 2016–2025 · graded against the examiners' reports" ↔ primary button "Give me a question" (random unattempted).
- Filter row: paper pills (All papers, P1 Viticulture … P5 Contemporary issues; active = amber bg pill) ↔ "Unattempted only" toggle pill.
- Table card: grid columns `64px 170px 1fr 90px 70px` (Year / Paper / Question / Budget / Status). Header row uppercase 0.6875rem. Rows are buttons, hover `--card-hover` 60ms, bottom-bordered. Status pill: "New" amber / "Attempted" muted. Budget: "60 min", paper 5 "90 min". Footer: "Showing N of 243" ↔ "Papers 1–4: 60 min · Paper 5: 90 min".
- The 54 rubric-less questions are excluded from data entirely.

### 8. Theory essay surface (`/theory/[id]`)
- Narrow container 46rem. Top row: "← Theory" ↔ autosave label ("Draft restored" / "Saved just now") + countdown timer (Geist Mono 1.125rem, tabular-nums; turns `--fail` under 5:00; ticks every second).
- Question card: eyebrow meta ("2022 · Paper 4 · Business of wine · Q3 · 60 min") + Fraunces 1.375rem question.
- Textarea: min-height 340px, `--card` bg, padding 24, 0.9375rem/1.7, focus border `--accent`. Placeholder: "Plan first. Examiners reward structure — a clear line of argument beats a list of facts."
- Bottom: word count ↔ "Save & exit" (outline) + "Submit for grading" (primary).

### 9. Graded essay result (`/theory/[id]/result` — also History click-through for theory)
- 46rem. "← History". Header card: meta eyebrow + Fraunces question ↔ right-aligned score block (Fraunces 2.25rem "64" / "/100" / PASS pill).
- **Rubric coverage card**: header ↔ 120px progress bar (amber fill) + "71%". Sections: "CORE REQUIREMENTS · 4 OF 5" then "DIFFERENTIATORS · 1 OF 2" — rows of ✓/✗ (18px circle, green/red 12% bg) + requirement text; missed core items get an italic examiners'-report quote with 2px left border. Bottom (top-border): CREDIT (green pill) and TRAP (yellow pill) rows.
- **Examiner-style summary card**: prose paragraph, 0.875rem/1.7 `--muted`.
- **Model answer card**: title + description ↔ "Reveal" outline button (amber text).

### 10. History (`/history`)
- Header: "History" + "Every attempt, theory and practical, newest first".
- Stat cards, 4-col: 1.875rem/700 tabular-nums number (pass-rate green) + 0.75rem label. (Attempts, Pass rate last 30 days, Theory essays graded, Day streak.)
- Filter pills: All / Theory / Practical.
- Attempt cards (clickable → detail screens): kind tag (uppercase outline chip) + meta line (truncates) ↔ score + verdict pill; title 0.875rem/600. Theory cards add rubric-coverage bar (4px, amber) + "%" label. Practical cards add 12 wine squares (14px, radius 3: green 30% bg/green border = correct, red 25%/red = missed; title tooltip per wine).
- Verdict pills: 0.625rem/700 pill, colored text on 12% same-color bg — PASS `--success`, BORDERLINE `--borderline`, FAIL `--fail`. **Verdict colors are never used on interactive controls.**

### 11. Practical attempt detail (History click-through)
- 46rem. "← History". Header card: meta line (drill · paper · family code+name · mode · datetime · duration ↔ score + verdict) + Fraunces question text.
- Cards in order: **The flight** ("revealed after grading"; rows "Wine N" mono + full wine description) → **Your answer** (prose, "Show full answer" link) → **Debrief** (header ↔ section marks "Identification 14/18 · Assessment 10/15 · Quality 7/12"; paragraphs with amber bold lead-ins) → **Your feedback on this question**: chat-style thread — user message card (author + time, then text), then system reply card (amber 4% bg tint) with ACCEPT/REJECT pill and resolution line ("Accepted · fix applied to the question bank · reviewed 6 Aug").

### 12. Library (`/library`)
- Header + "Study diagrams and decision trees. Learning units coming soon." 3-col grid of simple cards (title + meta). Current diagrams iframe content moves here.

### 13. Feedback (global)
- Floating pill bottom-left (fixed, 20px inset): chat icon + "Feedback", `--card` bg, hover amber-tinted border.
- Modal (28rem): header "Leave Feedback" + close ×; helper text; textarea (min 100px, `--background` bg) with mic dictation button top-right inside; "Send Feedback" primary, **disabled until text entered** (then `--border` bg + `--muted` text, not-allowed cursor); success state "Thanks! Feedback saved. / Analysis will appear in your notifications." then auto-close ~2.5s. Matches existing `FeedbackButton.tsx` behavior incl. speech-to-text.

### 14. Mobile (phone width)
- Bottom tab bar: `--card` bg, top border, 5 tabs (Home · Theory · Practical · History · More), active = amber icon+label, 44px min hit targets, safe-area bottom padding.
- Home stacks: Continue card (full-width button) → pillar cards → last verdict row. Theory: title header, horizontally scrolling paper pills, stacked question cards. See the two phone mockups on the "mobile" view of the prototype.

## Interactions & Behavior
- Transitions: hovers 60–150ms, state changes 150–250ms. Nothing performs; shadows only on true overlays (flyout, bell dropdown, modals, tour card, phone mockups).
- Essay timer ticks 1s; red under 5 min. Autosave on input.
- Theory filters combine (paper ∧ unattempted). Count line updates.
- History cards: theory → essay result screen; practical → attempt detail.
- Flyout and bell dropdown are mutually exclusive; close on outside click (prototype closes on navigation).
- Continue card: primary repeats last drill config; secondary resumes in-progress attempt with time remaining. If nothing in progress, show only the repeat action.
- Intro: per-scene entrance animations re-run on scene change; Back/Next both available; exit only via final scene (Start studying, which also fires the tour on first run).
- Tour: measured against live DOM rects (re-measure on resize); spotlight + card animate 250ms between steps.

## State Management
- `theme` ('dark'|'light') — existing theme context; token swap on `:root`.
- `introSeen`, `tourSeen` booleans — user preference (server-side per user, since intro offers "don't show again").
- Last drill config (paper, family, mode, acquire choice) — persisted per user for the Continue card.
- In-progress essay attempt: draft text, elapsed time, autosave timestamps.
- Theory question list: static JSON (existing `theory` data dir), filtered client-side; attempted state from user history.
- Feedback: submission → async analysis pipeline → notification items with accept/reject verdicts (existing `NotificationBell` + `FeedbackAnalysisPanel` flow).

## Design Tokens (Cellar — exact, already in `globals.css`)
| Token | Dark | Light |
|---|---|---|
| --background | #0c0a09 | #fafaf9 |
| --foreground | #e7e5e4 | #1c1917 |
| --card | #1c1917 | #ffffff |
| --card-hover | #292524 | #f5f5f4 |
| --border | #44403c | #d6d3d1 |
| --muted | #78716c | #78716c |
| --accent | #d97706 | #b45309 |
| --accent-hover | #f59e0b | #92400e |
| --success | #22c55e | #15803d |
| --borderline | #eab308 | #a16207 |
| --fail | #ef4444 | #dc2626 |

- Type: Fraunces (display only: page titles, section headings, big scores; 400/600/700, letter-spacing -0.01em) · Geist (all body/UI; workhorse 0.875rem, meta 0.75rem, page title 1.5rem/700, stats 1.875–2.25rem tabular-nums) · Geist Mono (timers, family codes, wine slots, funnel numerals).
- Radii: cards 12px, controls 8px, pills 999px. Card padding 24px. Base spacing 4px, default gap 12px. Separation by border, never shadow (except true overlays).
- Alpha tints via `color-mix(in srgb, <token> N%, transparent)`: verdict pill bg 12%, unread tint 5%, system-reply tint 4%, chip bg 10%, chip border 40%.

## Assets
- `assets/logo.png` — copied from `study-app/public/logo.png`.
- Icons: inline SVG outline icons (bell, sun/moon, chevron, ×, mic, chat) at 1.8–2.5 stroke — match existing heroicons-style usage in the app.
- Wizard paper emoji (🟡🔴🟣) retained from the current `PaperSelector.tsx`.

## Open items (decide during implementation)
- Where Flash Notes pace history surfaces (currently nowhere; History card variant?).
- Methodology page redesign (linked from user menu, unmocked).
- Keyboard shortcuts / ⌘K were declined for v1; nav flyouts + Continue card carry power-user speed.
- Mikey easter egg trigger location (hidden; owner's choice).

## Files
- `MW Shell Redesign.dc.html` — the full clickable prototype. All screens are in one file, switched by internal routing; a `startScreen` prop enumerates: home, practice (hub), flights (wizard), live, theory, essay, essayResult, history, detail, library, mobile. `showIntro` toggles the intro. Open in a browser; everything is inline-styled against the token names above.
- `assets/logo.png`
