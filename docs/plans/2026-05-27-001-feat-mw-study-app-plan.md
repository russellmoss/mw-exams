---
title: MW Practical Exam Interactive Study App
type: feat
status: draft
date: 2026-05-27
branch: feat/study-app
depth: standard
units: 8
---

## Overview

An interactive study app for a friend preparing for the MW practical exam. Uses the existing mock exam pipeline (questions, wines, model answers, decision trees) as content. The friend visits a Vercel URL, picks a paper, practices the stem-analysis-to-answer loop, and gets AI coaching feedback. Server-side Anthropic API key, no auth needed, no database.

## Problem Frame

The mock exam system produces excellent study materials but they're static markdown. There's no feedback loop on reasoning, no simulated tasting experience, and no way for someone other than us to use it. The app closes the loop: the friend practices, gets coaching on their stem logic against the decision trees, answers questions, and gets graded against the model answers using the IMW examiner rubric.

## Requirements

- MUST: Pick Paper 1, 2, or 3 and receive a question from the exam corpus
- MUST: Submit pre-glass reasoning (stem analysis) and receive coaching feedback
- MUST: Pre-glass feedback compares logic to decision tree approach, lenient coaching tone, spots gaps but doesn't penalize different-but-valid reasoning
- MUST: Reveal tasting descriptions for all wines in the flight after pre-glass phase
- MUST: Submit full answer to the exam question
- MUST: AI evaluates answer against model answer using examiner-report rubric
- MUST: Pass/fail assessment with specific, constructive feedback per sub-question
- MUST: Model answer + decision tree walkthrough revealed after evaluation
- MUST: Deployed to Vercel, accessible via URL
- MUST: Server-side API key (user's friend just opens the URL and goes)
- SHOULD: Stream AI feedback in real-time
- SHOULD: Track session history in localStorage (questions attempted, scores)
- SHOULD: "Next Question" button to repeat the loop
- NICE: Mobile-responsive

## Scope Boundaries

**In scope:**
- Next.js app deployed to Vercel
- Question bank from mock exams (v1-v10) + historical exams (2011-2025)
- Pre-glass reasoning evaluation against decision trees
- Tasting note generation from wine research files
- Answer evaluation against model answers + examiner rubric
- Session tracking in localStorage
- Git repo at github.com/russellmoss/mw-exams

**Out of scope:**
- User accounts, auth, database
- Generating new mock exams from the app
- Timer / full exam simulation mode
- Wine images or labels
- Admin panel

## Research Summary

### Data Available
- 112 historical questions in `data/exams.json`
- ~100+ mock exam questions across `outputs/mock_exams/mock_full_*_v*.md`
- 502 wine research files in `data/wine_research/` (YAML frontmatter + tasting profiles)
- 3 master decision trees in `outputs/master_trees/`
- 3 study diagrams in `outputs/study_diagrams/`
- 100+ decision matrices in `outputs/decision_matrices/`
- Model answers with annotations, reasoning traces, study diagram assists
- Examiner report synthesis with grading rubric

### Tech Stack
- Next.js App Router, TypeScript, Tailwind CSS
- `@anthropic-ai/sdk` server-side (`runtime = "nodejs"`)
- SSE streaming via ReadableStream in Route Handlers
- `useReducer` with discriminated union for multi-step flow
- `ANTHROPIC_API_KEY` as Vercel environment variable (same key from Dashboard project)
- Model: `claude-sonnet-4-6` for evaluation
- Prompt caching on stable system prompt blocks (decision trees, examiner rubric)
- Deploy: Vercel (connected to github.com/russellmoss/mw-exams)

### Infrastructure
- Anthropic API key: `ANTHROPIC_API_KEY` (already exists in Dashboard .env, will set as Vercel env var)
- Git remote: `https://github.com/russellmoss/mw-exams`
- Vercel CLI already installed and authenticated

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| API key | Server-side env var | User-provided in browser | App is for one friend. No need for him to get an API key. Server-side is simpler and more secure. |
| Database | None (localStorage only) | Neon Postgres | Single user, single device. localStorage handles session history. No auth needed. |
| Data loading | Pre-process into JSON at build time | Parse markdown on demand | Faster runtime, smaller bundle. Markdown parsing happens once during build. |
| Tasting notes | Generate on-the-fly from wine research via Claude | Pre-generate for all wines | Wine research varies in depth. On-the-fly ensures consistent format. Cache in localStorage after first generation. |
| Question source | Mock exams + historical, unified index | Mock exams only | Historical exams have wine research + decision matrices. Both valuable. |
| Hosting | Vercel | Local dev only | Friend needs a URL, not our dev server |

## Implementation Units

### Unit 1: Project scaffold, git repo, data index

**Goal:** Create the Next.js project, connect to GitHub, and build a JSON index of all questions
**Files:**
- `study-app/package.json`
- `study-app/tsconfig.json`
- `study-app/next.config.ts`
- `study-app/tailwind.config.ts`
- `scripts/build-question-index.ts`
- `study-app/public/data/question-index.json` (generated)
- `study-app/public/data/` (wine research, trees, answers copied/transformed)
**Approach:** Initialize Next.js inside a `study-app/` subdirectory of the MW_exam repo (keeps study content and app code together). Write a build script that parses mock exam files + `data/exams.json` into a unified question index JSON. Each entry: question ID, paper, question text, wine slots with full_text, marks, pointers to answer content + decision tree content, AND taxonomy tags (family + subcategory from `outputs/heuristics/question_taxonomy.md`). The taxonomy tagging uses the question stem text to classify each question into its family (F1-F7) and subcategory. Also copy/transform wine research files and decision trees into JSON for the app. Git init the MW_exam repo, add remote to github.com/russellmoss/mw-exams.
**Tests:** Build script produces index with 200+ questions, no missing fields
**Depends on:** none
**Verification:** `node scripts/build-question-index.ts` succeeds, index JSON is valid

### Unit 2: Core UI layout and study flow state machine

**Goal:** Build the multi-step study UI with 6 states
**Files:**
- `study-app/app/layout.tsx`
- `study-app/app/page.tsx`
- `study-app/app/study/page.tsx`
- `study-app/lib/study-session.ts` (state machine)
- `study-app/app/globals.css`
**Approach:** `useReducer` with discriminated union: `select-paper` -> `question` -> `pre-glass` -> `reveal` -> `answer` -> `feedback`. Clean UI: question display panel, textarea for reasoning/answers, streaming markdown panel for feedback. Tailwind for styling. Simple, functional, not fancy.
**Tests:** Manual click-through of all states with placeholder data
**Depends on:** Unit 1
**Verification:** `npm run dev`, navigate to /study, all states render

### Unit 3: Question selection with taxonomy filtering

**Goal:** User picks Paper 1/2/3, optionally filters by question family/subcategory, gets a question
**Files:**
- `study-app/app/components/PaperSelector.tsx`
- `study-app/app/components/FamilyFilter.tsx`
- `study-app/app/components/QuestionDisplay.tsx`
- `study-app/lib/question-loader.ts`
**Approach:** Two-step selection: (1) Pick paper (P1 Whites / P2 Reds / P3 Special), (2) Optionally filter by question family. The family filter shows human-readable labels with question counts:
- F1: Same Variety ("4 Chardonnays from different countries") — N questions available
- F2: Same Origin ("wines from the same country, different varieties") — N questions
- F3: Blend Logic ("compare blends across origins") — N questions
- F4: Mixed Breadth ("each wine independent, test your range") — N questions
- F5: Method/Production ("sparkling methods, sweet mechanisms") — N questions
- F6: Style Mechanism ("maturity axis, sweetness spectrum") — N questions
- F7: Quality Hierarchy ("Village → 1er Cru → Grand Cru") — N questions
- "Any" (random across all families)

After filtering, random selection within the filtered set. Display question stem + marks breakdown. Show wine count but NOT wine identities (hidden until reveal). Show sub-questions (a, b, c, d) with their mark allocations. The family filter lets the friend drill specifically what they're weak on rather than only random practice.
**Tests:** Select P2 + F7, verify you get a quality hierarchy red question. Select P3 + F5, verify you get a method/production question. Select "Any", verify random.
**Depends on:** Unit 1, Unit 2
**Verification:** Each filter combination shows appropriate questions. Counts match the index.

### Unit 4: Pre-glass reasoning evaluation API route

**Goal:** Accept stem analysis, evaluate against decision tree, return coaching feedback
**Files:**
- `study-app/app/api/evaluate-reasoning/route.ts`
- `study-app/lib/prompts/pre-glass-prompt.ts`
**Approach:** Route receives: user reasoning, question text, paper number. Loads relevant decision tree + decision matrix (if available). System prompt instructs Claude to: (1) summarize user's reasoning, (2) walk through what the tree would suggest for this stem, (3) identify logic gaps or missed signals, (4) be coaching-oriented, not grading. Key instruction: "The candidate may reason differently than the tree and still be right. Only flag genuine blind spots, not stylistic differences." Stream response as SSE. Use prompt caching on the decision tree block.
**Tests:** Submit reasoning for a P1 question, verify feedback references tree routing
**Depends on:** Unit 2, Unit 3
**Verification:** Submit wrong reasoning, get gentle correction. Submit good reasoning, get confirmation.

### Unit 5: Tasting note generation and wine reveal

**Goal:** After pre-glass feedback, reveal simulated tasting descriptions for each wine
**Files:**
- `study-app/app/api/generate-tasting/route.ts`
- `study-app/lib/prompts/tasting-prompt.ts`
- `study-app/app/components/WineReveal.tsx`
**Approach:** For each wine, load wine research file data. Send to Claude with a prompt that generates a blind tasting note: appearance (color, clarity, intensity), nose (intensity, development, descriptors), palate (sweetness, acidity, tannin, alcohol, body, flavor descriptors, finish length). Notes read like what a candidate perceives in the glass, NOT like a tech sheet or reveal. Cache generated notes in localStorage by wine_id.
**Tests:** Verify tasting notes have consistent structure, read as sensory descriptions
**Depends on:** Unit 4
**Verification:** See tasting notes for 3-4 wines, verify blind-tasting format

### Unit 6: Answer evaluation API route

**Goal:** Accept full answer, evaluate against model answer using examiner rubric
**Files:**
- `study-app/app/api/evaluate-answer/route.ts`
- `study-app/lib/prompts/answer-evaluation-prompt.ts`
- `study-app/app/components/FeedbackDisplay.tsx`
**Approach:** Route receives: user answer, question text, model answer, paper number. System prompt includes examiner report synthesis (seven cardinal rules, what's rewarded/penalized) and the specific model answer. Claude evaluates per sub-question: identification accuracy, reasoning quality, winemaking knowledge, quality/commercial specificity. Returns: overall pass/likely-fail assessment, estimated marks range, specific feedback per sub-part, key things the model answer included that the user missed. Streaming SSE. Prompt caching on examiner rubric block.
**Tests:** Submit good answer -> pass. Submit wrong answer -> fail with specific feedback.
**Depends on:** Unit 4, Unit 5
**Verification:** Full answer cycle produces calibrated pass/fail with useful feedback

### Unit 7: Post-feedback reveal and session tracking

**Goal:** Show model answer + study diagram assist after evaluation, track session history
**Files:**
- `study-app/app/components/ModelAnswerReveal.tsx`
- `study-app/app/components/SessionHistory.tsx`
- `study-app/lib/session-tracker.ts`
**Approach:** After feedback, reveal full model answer, proposed annotation, and study diagram assist walkthrough. "Next Question" button resets to paper selection. Track attempts in localStorage: question ID, paper, timestamp, pass/fail, marks estimate. Simple history panel on landing page.
**Tests:** Complete full cycle, verify reveal. Do 3 questions, verify history.
**Depends on:** Unit 6
**Verification:** Complete 3 questions, history shows all 3 with paper labels and results

### Unit 8: Vercel deployment

**Goal:** Deploy to Vercel, connected to GitHub repo
**Files:**
- `study-app/.env.local` (local dev)
- `study-app/vercel.json` (if needed for monorepo root directory setting)
- `.gitignore` updates
**Approach:** Git init the MW_exam repo (if not already), add remote to github.com/russellmoss/mw-exams, push. Set `ANTHROPIC_API_KEY` as Vercel environment variable. Configure Vercel project with root directory set to `study-app/`. Deploy. Verify the friend can access the URL and complete a full study cycle.
**Tests:** Friend opens URL, completes one question cycle end-to-end
**Depends on:** All prior units
**Verification:** Live URL works, streaming feedback renders, session history persists

## Test Strategy

**Unit tests:** Not prioritized for MVP. Logic lives in prompts and data pipeline (already validated).
**Manual verification:** Complete 3 full study sessions with real questions, verify coaching feedback quality, tasting note quality, answer evaluation calibration.
**Production smoke test:** Friend completes one question on the live Vercel URL.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Pre-glass feedback too lenient or harsh | MED | HIGH | Iterate the coaching prompt. Start lenient. Use concrete tree examples in system prompt. |
| Tasting notes inconsistent quality | MED | MED | Tight structured-output prompt. Cache good results. |
| API costs on your key | LOW | MED | Sonnet not Opus. Prompt caching. ~$0.10-0.30 per 3-question session. Monitor usage. |
| Wine research missing for mock exam wines | MED | LOW | Mock wines may lack research files. Fallback to wine full_text + Claude's knowledge. |
| Build script breaks on edge-case markdown | MED | LOW | Test against all 10 mock versions. Handle YAML frontmatter variants. |

## Success Criteria

- [ ] Friend opens a URL and sees a clean landing page
- [ ] Selects Paper 1/2/3 and gets a question
- [ ] Submits pre-glass reasoning and gets coaching feedback referencing the decision tree
- [ ] Tasting notes appear for all wines after pre-glass phase
- [ ] Submits answer and gets pass/fail evaluation with per-sub-question feedback
- [ ] Model answer and study diagram assist revealed after evaluation
- [ ] "Next Question" works and session history tracks attempts
- [ ] Streaming works for all AI feedback
- [ ] Deployed on Vercel, accessible via URL
