# Design System — MW Practical Exam Study Tool ("Cellar")

> Source of truth for all visual and UI decisions. Read this before changing anything visual.
> Codified 2026-05-30 by `/design-consultation`, grounded in the app's existing `study-app/src/app/globals.css`.

## Product Context
- **What this is:** an interactive blind-tasting practice tool for Master of Wine candidates — timed study sessions, per-question deductive feedback/debrief (with images + Mermaid infographics), history, and an admin cost dashboard.
- **Who it's for:** serious MW candidates (and the admin/author). Expert users under time pressure who want dense, precise information, not marketing gloss.
- **Space/industry:** wine education / exam prep. Adjacent feel: a professional study workbench, not a consumer wine app.
- **Project type:** data-dense web app (Next.js, Tailwind v4).

## Aesthetic Direction
- **Direction:** "Cellar" — refined-industrial dark. Warm near-black surfaces, a single amber accent (wine/candlelight), separation by border rather than shadow.
- **Decoration level:** minimal → intentional. No gradients, no decorative blobs, no drop-shadow stacks. Shadows are reserved for things that float above the page (modals, the diagram lightbox).
- **Mood:** a quiet, warm cellar at night. Serious and literate. The UI recedes; the wine reasoning and the candidate's work are the subjects.
- **Signature:** flat, **border-defined** cards on warm-stone dark; amber used as the one point of color energy; a display serif for the few wine-literate moments over an otherwise functional sans.

## Typography
Two faces. Geist does the work; Fraunces provides the wine-literate moments.

- **Display (`--font-fraunces`, Fraunces serif):** page titles (`<h1>`), debrief section headings (`.markdown-content h1/h2`), and wine-name / verdict headlines. **Display sizes only** — never body, never UI labels. Apply via the `font-display` utility or the global `h1` / `.markdown-content` rules. Weights loaded: 400/600/700.
- **Body / UI (`--font-geist-sans`, Geist):** everything else — paragraphs, labels, buttons, nav, form controls. The default `<body>` font.
- **Data / numbers (Geist + `tabular-nums`):** marks, scores, percentages, cost figures. Use `tabular-nums` so digits align in tables and stat cards.
- **Code / monospace (`--font-geist-mono`, Geist Mono):** inline code, technical tokens.
- **Loading:** `next/font/google` (self-hosted, no layout shift) in `layout.tsx`.
- **Scale (observed + codified):** body `text-sm` (0.875rem) is the workhorse; secondary/meta `text-xs` (0.75rem); page titles `text-2xl` (1.5rem) bold; hero/stat numbers `text-3xl`/`text-4xl`. Debrief: h1 1.6rem/600, h2 1.3rem/600, h3 1.05rem/600. Line-height 1.6–1.7 for prose.
- **Why:** Geist is a clean, modern, neutral grotesque — right for a dense functional tool. Fraunces at display sizes gives the product a distinctive, editorial, wine-literate face without slowing down the workbench.

## Color
Warm-stone neutrals + one amber accent + a three-state verdict system. All defined as CSS vars in `globals.css` `:root` and exposed to Tailwind via `@theme inline`.

| Token | Hex | Role |
|---|---|---|
| `--background` | `#0c0a09` | app background (warm near-black, stone-950) |
| `--foreground` | `#e7e5e4` | primary text (stone-200) |
| `--card` | `#1c1917` | card / surface (stone-900) |
| `--card-hover` | `#292524` | hovered/raised surface (stone-800) |
| `--border` | `#44403c` | borders, dividers (stone-700) — the primary separation device |
| `--muted` | `#78716c` | secondary text, captions, icons (stone-500) |
| `--accent` | `#d97706` | the one accent: links, primary actions, emphasis, active nav (amber-600) |
| `--accent-hover` | `#f59e0b` | accent hover (amber-500) |
| `--success` | `#22c55e` | PASS verdict, positive (green-500) |
| `--borderline` | `#eab308` | BORDERLINE verdict (yellow-500) |
| `--fail` | `#ef4444` | FAIL verdict, errors (red-500) |

- **Approach:** restrained. Color is rare and meaningful. Most of the UI is stone neutrals; amber is the single point of energy; green/yellow/red appear only as grading verdicts and status.
- **Emphasis text:** bold body text uses amber-400 (`#fbbf24`); italic/secondary uses stone-400 (`#a8a29e`). Amber is the brand/accent/emphasis color — used intentionally for warmth, not decoration.
- **Verdict system (first-class):** PASS = `--success`, BORDERLINE = `--borderline`, FAIL = `--fail`. These three drive grading badges and the pass-estimate UI.
- **Dark mode:** the app is dark-native; this *is* the palette. No separate light theme is shipped.
- **Resolved issue (2026-05-30):** `--borderline` was `#f59e0b`, identical to `--accent-hover`, so a BORDERLINE badge could read as an interactive amber control. Moved to `#eab308` (yellow) so verdict colors are unambiguous and never look clickable.

## Spacing
- **Base unit:** 4px (Tailwind default scale).
- **Density:** comfortable-compact. This is a data tool; tighter than a marketing site, looser than a spreadsheet.
- **Scale in use:** `gap-3` (12px) is the default gap, `gap-2` (8px) tight, `gap-4` (16px) loose. Padding: `p-4` (16px) default, `p-6` (24px) for cards/panels, `p-3` (12px) for compact controls.

## Layout
- **Approach:** grid-disciplined. Predictable alignment, no editorial grid-breaking.
- **Composition:** a centered single column for reading/working screens (study, debrief, history); wider multi-column grids for the admin dashboard.
- **Separation:** **borders, not shadows.** A card is `bg-card` + `1px solid var(--border)`. Reserve `shadow-*` for true overlays (modals, the diagram/image lightbox).
- **Border radius (hierarchical, observed):** `rounded-lg` (8px) = default for controls/inputs/buttons; `rounded-xl` (12px) = cards and panels; `rounded-full` = pills, dots, avatars, status indicators. `rounded-md` (6px) only for tiny chips; avoid `rounded-2xl`+ except large feature surfaces.

## Motion
- **Approach:** minimal-functional. Motion clarifies state; it never performs.
- **Durations:** micro 60ms (hover, transform, lightbox pan), short 150–250ms (state/color transitions), streaming pulse 1.5s (the "thinking" dot / skeletons).
- **Easing:** ease-out for enter, ease-in-out for movement/transforms.
- **Patterns in use:** `streaming-dot` pulse for live generation, `animate-pulse` skeletons for pending diagrams/images, color transitions on nav/buttons. New motion should fit these, not exceed them.

## Component conventions
- **Card:** `bg-card rounded-xl border border-border p-6`.
- **Primary button:** amber accent background or accent text; `rounded-lg`; Geist `font-medium`.
- **Secondary/ghost control:** `border border-border text-muted hover:text-foreground hover:border-muted rounded-lg`.
- **Verdict badge:** the three verdict colors; pill (`rounded-full`) or strong text; never amber.
- **Page title:** `<h1 className="text-2xl font-bold text-foreground tracking-tight">` — automatically display-serif via the global `h1` rule.
- **Feedback / debrief prose:** wrap in `.markdown-content`; headings are display-serif, hero image is full-width `contain`, images are click-to-zoom, Mermaid renders as diagrams (with a fullscreen lightbox).

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-30 | Initial "Cellar" system codified from existing CSS | Grounded the system in the proven warm-stone + amber dark theme rather than redesigning. |
| 2026-05-30 | Added Fraunces display serif (display sizes only) | Wine-literate, editorial character for titles/headings/wine names; Geist stays the functional face. |
| 2026-05-30 | `--borderline` `#f59e0b` → `#eab308` | Removed collision with `--accent-hover`; BORDERLINE badge no longer reads as an interactive control. |
| 2026-05-30 | Kept amber as accent + emphasis (considered reserving it) | The warm amber-everywhere is a deliberate identity for a wine tool, not slop; codified as intentional. |
