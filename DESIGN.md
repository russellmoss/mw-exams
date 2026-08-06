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
- **Dark mode:** the app is dark-native in its design language; the table above *is* the palette
  the system was designed in.
- **Light mode (added 2026-08-02; made the first-visit default 2026-08-06):** toggled from the icon
  next to the notification bell and persisted in `localStorage` under `mw-theme`. New visitors who
  have never toggled now land on **light**; dark remains one click away and sticks once chosen. It
  is an **override, not a redesign** — the same warm-stone family inverted, the same single amber
  accent, the same border-defined flat cards. Implemented as `:root[data-theme="light"]` overrides
  of the identical token set in `globals.css`, so any component built on the tokens themes itself
  for free.

| Token | Dark | Light | Note |
|---|---|---|---|
| `--background` | `#0c0a09` | `#fafaf9` | warm off-white (stone-50), never pure white |
| `--foreground` | `#e7e5e4` | `#1c1917` | stone-900 |
| `--card` | `#1c1917` | `#ffffff` | cards lift off the page in both themes |
| `--card-hover` | `#292524` | `#f5f5f4` | |
| `--border` | `#44403c` | `#d6d3d1` | still the primary separation device |
| `--muted` | `#78716c` | `#78716c` | unchanged — clears 4.5:1 on both |
| `--accent` | `#d97706` | `#b45309` | amber-700 on light for ~4.9:1 |
| `--accent-hover` | `#f59e0b` | `#92400e` | |
| `--success` | `#22c55e` | `#15803d` | |
| `--borderline` | `#eab308` | `#a16207` | |
| `--fail` | `#ef4444` | `#dc2626` | |
| `--emphasis` | `#fbbf24` | `#b45309` | `.markdown-content strong` |
| `--prose-secondary` | `#a8a29e` | `#57534e` | `.markdown-content em` / blockquote |
| `--code-bg` | `#292524` | `#f5f5f4` | inline code |

- **Light-mode rules:** every verdict/accent color steps to a darker shade so it clears ~4.5:1 against
  a near-white surface; nothing may use pure `#fff` as a page background. **Build with the tokens** —
  hardcoded hexes and raw Tailwind `stone-*`/`white`/`black` classes break the light theme.
  Deliberate exceptions: modal scrims (`bg-black/…`), toggle knobs, and `/mikey`, which is a
  self-contained neon page with its own background and stays dark in both themes. The `/diagrams`
  iframe (embedded on `/library`) is a separately built static site but is **theme-aware since
  2026-08-06**: its generated stylesheet carries both token sets and a head script follows the
  app's `mw-theme` localStorage key (same origin), live-switching on `storage` events.
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
| 2026-08-02 | Shipped an opt-in light theme (`[data-theme="light"]`) | Studying in daylight. Built as token overrides rather than a second design, so "Cellar" stays one system; dark remains the default and the native look. |
| 2026-08-02 | Methodology / Settings / Admin moved into a user menu | The nav row had grown to seven links. Study surfaces (Study, Stem Sniper, Diagrams, History) stay on the left; account-level destinations sit under the user's name on the right. |
| 2026-08-06 | Light becomes the first-visit default theme (owner decision) | New users land on the light token set; dark stays the design-native language and persists once toggled. `DEFAULT_THEME` in `src/lib/theme.ts`. |
| 2026-08-06 | Embedded diagrams site made theme-aware | The `/library` iframe previously stayed dark in both themes. Its builder (`scripts/build_study_diagrams_site.py`) now emits both palettes + a `mw-theme` sync script; the standalone Netlify build stays paper-light. |
