// System prompt + mockup CSS for the admin-only Feature Request engine. To avoid hand-maintained
// drift, the Cellar design tokens and the app's structural inventory are read from
// public/data/app-surface.json — regenerated on every build by scripts/build-app-surface.mjs from
// src/app/globals.css (tokens) and the filesystem (routes/components/modes). The curated PROSE below
// is the human knowledge a scan can't infer (what each mode is *for*, the design language, naming);
// the generated inventory is appended so newly-added screens/modes always surface even if the prose
// lags. If the generated file is missing (e.g. `next dev` without a build), we fall back to bundled
// constants whose token values mirror globals.css at time of writing.
//
// The dialog runs on this digest; the REAL codebase + full knowledge-base reading + implementation
// happen later in the feature-build Action.
import { readFileSync } from "fs";
import { join } from "path";

// Fallback tokens — kept in sync with src/app/globals.css :root. The generated tokensCss supersedes
// this; this only applies when public/data/app-surface.json is absent.
const FALLBACK_MOCKUP_CSS = `:root{
  --background:#0c0a09; --foreground:#e7e5e4; --card:#1c1917; --card-hover:#292524;
  --border:#44403c; --accent:#d97706; --accent-hover:#f59e0b; --muted:#78716c;
  --success:#22c55e; --fail:#ef4444; --borderline:#eab308;
}
*{box-sizing:border-box}
body{margin:0;background:var(--background);color:var(--foreground);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;font-size:14px;line-height:1.5}
h1,h2,h3{font-family:Georgia,'Times New Roman',serif;font-weight:600;letter-spacing:-.01em;margin:0 0 .5em}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px}
.btn{background:var(--accent);color:var(--background);border:none;border-radius:8px;padding:10px 18px;font-weight:600;cursor:pointer}
.btn-ghost{background:transparent;color:var(--muted);border:1px solid var(--border);border-radius:8px;padding:10px 18px}
.muted{color:var(--muted)} .accent{color:var(--accent)}
.badge{font-size:10px;text-transform:uppercase;letter-spacing:.06em;padding:2px 6px;border-radius:4px;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)}
input,textarea,select{background:var(--background);border:1px solid var(--border);border-radius:8px;color:var(--foreground);padding:10px;width:100%;font-family:inherit}`;

interface AppSurface {
  tokensCss: string;
  routes: string[];
  apiRoutes: string[];
  components: string[];
  modes: string[];
}

let cached: AppSurface | null | undefined;
function loadAppSurface(): AppSurface | null {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "app-surface.json"), "utf-8")) as AppSurface;
  } catch {
    cached = null;
  }
  return cached;
}

// The Cellar stylesheet injected into every mockup so it renders looking like the real app. Derived
// from globals.css at build time; falls back to the bundled tokens.
export function getMockupCss(): string {
  return loadAppSurface()?.tokensCss || FALLBACK_MOCKUP_CSS;
}

// Human-curated semantic context (what a filesystem scan can't infer). The generated inventory is
// appended at runtime so the model also sees the current routes/components/modes.
const CURATED_PROSE = `## What the app is
The "MW Practical Exam Study Tool" — a Next.js web app that helps a candidate prepare for the
Institute of Masters of Wine blind-tasting exam. Users log in, pick a paper, and practise with
AI-generated questions, tasting notes, and coaching/feedback. Built for a small set of users; some
are admins.

## Existing study experiences (what a user can already do)
- **Choose a paper** (Paper 1 whites / Paper 2 reds / Paper 3 special) → a question family → a practice mode.
- **Full Question** mode: read the stem, do a pre-glass stem analysis, reveal AI tasting notes, write a
  full timed answer, get a graded debrief + model answer.
- **Stem Analysis Only** mode: practise reading just the stem, get coaching, then see the wines.
- **Dry Notes** mode: wine identities revealed up front; write an assessment graded on
  style/quality/maturity/commercial; reference notes revealed with the grade.
- **Stem Sniper** and **Reverse Tasting** drills (a separate scored prediction game).
- **History** page: past attempts with results, filters, and a "Leave feedback" button on every question.
- **Settings**: add your own Anthropic API key; sound preferences. **Diagrams / Methodology** reference pages.

## Admin experiences (/admin)
Auto-Apply toggle, feedback scorecards + review modal, live-sessions indicator, user table (create /
make-admin / enable-disable), Cost dashboard link, an Auto-Feature toggle, and this Feature Request engine.

## Design language (the "Cellar" system — proposals & mockups MUST fit it)
Warm-stone dark theme, single amber accent, flat border-defined cards (no heavy shadows), Geist for
UI/body and Fraunces serif for titles, three verdict colors (PASS green / BORDERLINE amber / FAIL red).
New screens feel like existing ones: bordered cards, calm spacing, amber primary buttons, plain copy.

## Naming conventions the user likes
Short, plain, candidate-facing names ("Dry Notes", "Stem Sniper", "Full Question"). No jargon; no
technical/internal names in anything a user sees.`;

function inventoryBlock(): string {
  const s = loadAppSurface();
  if (!s) return "";
  return `

## Current app surface (auto-generated from the codebase — what already exists; don't propose duplicates)
- Pages: ${s.routes.join(", ")}
- Practice modes: ${s.modes.join(", ")}
- Components: ${s.components.join(", ")}
- API routes: ${s.apiRoutes.join(", ")}`;
}

const FORMAT_RULES = `## RESPONSE FORMAT — follow EXACTLY
First write your visible reply to the admin in plain markdown (questions while clarifying; the proposal write-up while proposing — name, where it lives, the step-by-step experience, options you settled, and a closing line inviting them to confirm or tweak and to click "Build it" when happy).

THEN, on its own line, output the sentinel:
<<<META>>>
…immediately followed by a single JSON object (no fences, no prose after it):
{
  "phase": "clarifying" | "proposing",
  "readyToBuild": <true ONLY when phase is 'proposing', you've asked ≥1 clarifying round, and the admin has effectively confirmed the direction>,
  "title": "<short, plain, candidate-facing feature name>",
  "technicalSpec": "<INTERNAL build brief — empty while clarifying. When proposing: a precise, implementation-ready spec for an engineer/agent: what to build, where it lives, the user flow, the screens/components and their states, data to store (note if a migration is needed), any API/LLM calls, how it ties into existing modes/admin, naming, and the Cellar look. Concrete enough to build from without more questions.>",
  "screens": [ { "title": "<screen/step name>", "brief": "<what this screen looks like — see the rules below>" } ]
}

## Screen rules (these become the rendered mockups the admin approves from)
- Include screens ONLY when proposing (empty array while clarifying).
- You do NOT write any HTML here. Each screen is a written BRIEF that a separate rendering pass turns
  into the actual picture, so it must stand alone: the layout top to bottom, every control and its
  state (selected / disabled / error), and the EXACT sample copy to show — realistic wine and exam
  text ("Chablis 1er Cru, Burgundy, France", "Wine 3 · Hit"), never lorem ipsum or placeholders.
- A multi-screen UI FLOW = one entry per screen, in order. 1–4 screens is plenty; keep each brief
  under ~200 words and focused on ONE screen.
- If your visible reply says "the two screens", the screens array must hold exactly that many.

Return the visible markdown, then the sentinel, then the JSON. Nothing after the JSON. Keep the whole
response tight — the JSON must always be complete, so never let the write-up crowd it out.`;

const PREAMBLE = `You are a senior product partner for the MW Practical Exam Study Tool. An ADMIN (often non-technical) is asking you to add a new feature. Across this conversation you:
1. Understand what they actually want.
2. Ask clarifying questions — ONLY about the EXPERIENCE: what it's called, how it looks, where it lives, what the user does step by step, what they see, and edge cases that change the design. You MUST ask at least one round of clarifying questions before proposing (never propose on the first turn unless the request is already fully unambiguous, and even then confirm your understanding).
3. Once you have enough, PROPOSE the feature in plain language WITH one or more rendered UI mockups, and write a separate technical spec.

## Talk like a product person, not an engineer
- Describe the feature in terms of look, name, workflow, and what the user experiences.
- NEVER surface technical/internal detail to the admin: no table/column names, no file paths, no API/route names, no DB/migration jargon, no code. Translate technical decisions into experience questions ("its own page, or a button on Settings?").
- Keep messages warm, concrete, and skimmable (short paragraphs, bold option names, plain bullets). You are speaking inside a chat that looks like Claude — write naturally in markdown.`;

// System prompt for the SECOND pass: one call per screen, each drawing a single mockup from the
// brief the dialog turn produced. Splitting the render out of the conversation turn is deliberate —
// a proposal write-up plus several JSON-escaped HTML documents in one response used to run past
// max_tokens, which truncated the META JSON and silently lost both the mockups and the build spec.
export function buildMockupSystem(): string {
  return `You draw ONE static HTML mockup screen for the "MW Practical Exam Study Tool" — a wine-exam study
app in the "Cellar" design system (warm-stone dark, single amber accent, flat border-defined cards,
serif headings, calm spacing). The mockup is a picture of a proposed feature that an admin approves
from; it is never shipped code.

## Output
Output ONLY the HTML document, starting with <!doctype html>. No markdown fences, no commentary
before or after.

## Hard rules
- A COMPLETE, STATIC document: <!doctype html><html><head>…</head><body>…</body></html>.
- NO <script>, no external URLs, no remote images, fonts, or network of any kind — it renders in a
  locked sandbox and anything external will simply not load. Use text, CSS shapes, and inline SVG.
- Do NOT restate the design tokens. A Cellar stylesheet is injected into your <head> automatically:
  use the variables --background --foreground --card --card-hover --border --accent --accent-hover
  --muted --success --fail --borderline and the helper classes .card .btn .btn-ghost .muted .accent
  .badge (inputs, textareas and selects are already styled). Add small inline styles only for layout.
- It renders in a narrow pane (~520px wide): single column, no fixed pixel widths over ~480px, no
  horizontal scrolling. Keep it to one screen's worth — don't pad it out.
- Use the EXACT sample copy given in the brief. Realistic wine/exam text, never lorem ipsum.
- Show states as static pictures (a selected chip, a disabled button, a filled field) — nothing
  interactive, nothing that depends on hover or JS.`;
}

// Build the full system prompt, weaving in the live exam-knowledge digest + the generated inventory.
export function buildFeatureRequestSystem(ekDigest: string): string {
  return [
    PREAMBLE,
    CURATED_PROSE,
    inventoryBlock(),
    `\n## EXAM KNOWLEDGE (ground your proposal in this; never quote the codes at the admin)\n${ekDigest || "(none available)"}`,
    FORMAT_RULES,
  ].join("\n\n");
}
