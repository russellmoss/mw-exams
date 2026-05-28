# How We Built This: The Research Behind the MW Study Engine

## The Problem

The Master of Wine practical exam is widely regarded as one of the hardest professional examinations in the world. Candidates taste 36 wines blind across three papers and must identify grape variety, country and region of origin, assess quality, deduce winemaking methods, and evaluate commercial positioning -- all under brutal time pressure (~8 minutes of writing per wine). Pass rates hover around 10%.

Most candidates prepare by tasting widely and hoping pattern recognition develops. We took a different approach: treat the exam itself as a dataset, reverse-engineer how the examiners think, and build a study system grounded in what the exam actually does -- not what candidates assume it does.

---

## What We Started With

### The Corpus

We assembled the complete text of every MW practical exam paper from 2011 to 2025 -- 14 years of exams (2020 was cancelled due to COVID). This gave us:

- **153 questions** across 42 papers
- **504 individual wines** that candidates were asked to identify and assess
- The exact wording of every question stem, every sub-question, and every mark allocation

This is not a sample. It is the entire modern MW practical exam corpus. Every conclusion in this system is derived from this dataset.

### Examiner Reports

We obtained and synthesized 13 official examiner reports spanning 2017-2025 (8 practical examiner reports and 5 chief examiner reports). These are the documents the IMW publishes after each exam explaining what they were testing, what strong candidates did, and where weak candidates went wrong.

We did not skim these for tips. We systematically extracted every piece of guidance into a structured synthesis, identifying 7 recurring principles that appear across all years -- what we call the **Seven Cardinal Rules** of MW practical marking.

### Wine Research

Every one of the 504 wines in the corpus was individually researched from authoritative sources: producer websites, Wine Enthusiast, Decanter, Tim Atkin MW, JancisRobinson.com, CellarTracker, and regional wine board technical sheets. For each wine we documented tasting profile, technical specifications, vintage character, producer philosophy, and -- critically -- why the examiners likely chose it.

---

## How We Analyzed the Exam

### Step 1: Question-by-Question Stem Analysis

We analyzed all 112 questions from the 10-year core corpus (2015-2025) using a disciplined protocol. For each question, working from the stem alone -- without looking at the wines -- we asked:

- What does the paper number tell us? (Paper 1 = white still, Paper 2 = red still, Paper 3 = sparkling/fortified/sweet/rose/oxidative)
- What does the stem language constrain? ("Same single grape variety" eliminates most of the wine world. "Different countries" means exactly that.)
- What do the mark allocations signal? (Heavy marks on winemaking means the examiner expects genuine production knowledge, not just identification.)
- What has the IMW done historically in this position?

This produced 112 individual decision matrices -- structured documents that trace the logical path from question stem to plausible wine candidates, using three confidence tiers instead of percentages:

- **STRONG SIGNAL**: High confidence based on stem + historical patterns
- **PLAUSIBLE**: Worth considering, supported by evidence
- **CURVEBALL**: Low probability but historically documented in this position

We used confidence tiers rather than percentages because the corpus, while complete, is still only 10 years -- too small for reliable probability distributions.

### Step 2: Taxonomy Design

We discovered that MW practical questions are not random. They cluster into recurring structural families -- the same logic patterns reappear year after year, wearing different grapes and regions as costumes. We designed an 8-family classification system and tagged every question:

| Family | What It Tests | Share of Corpus |
|--------|--------------|----------------:|
| F1: Same Variety | Can you hold one grape across different origins/styles? | 22% |
| F2: Same Origin | Can you distinguish wines from one country/region? | 21% |
| F3: Blend Logic | Can you identify blends and their components? | 5% |
| F4: Mixed Breadth | Can you handle unrelated wines without anchoring bias? | 29% |
| F5: Method/Production | Can you deduce how a wine was made from what's in the glass? | 11% |
| F6: Style Mechanism | Can you map sweetness, alcohol, and production method? | 4% |
| F7: Hierarchy/Quality | Can you calibrate quality within a classification system? | 7% |

This taxonomy became the organizing spine for everything that followed. Each family has its own decision logic, its own traps, and its own study strategy.

### Step 3: Examiner Pattern Extraction

We extracted 30 numbered heuristics from the corpus -- recurring patterns that are invisible in any single exam year but emerge clearly across 10 years:

- Paper 1 includes Chardonnay in **100% of years** (10 out of 10)
- Riesling appears in Paper 1 in **80% of years**
- Paper 3 Question 1 has been a sparkling flight in **every year since 2021**
- "Same single grape variety" appears in 21% of all questions
- Commercial/market sub-questions appear in 26% of questions
- Tokaji appears in Paper 3 in 50% of years

These are not predictions. They are observed frequencies. They tell a candidate what the exam's center of gravity looks like before they walk into the room.

### Step 4: Curveball Analysis

We classified all 504 wines by difficulty:

- **75.9%** (383 wines) are standard -- benchmark wines a well-prepared candidate should recognize
- **17.9%** (90 wines) are moderate curveballs -- unusual but not exotic
- **6.2%** (31 wines) are high curveballs -- rare varieties, unexpected origins, or wines designed to break assumptions

We identified four curveball categories:
1. **Rare Variety** (~35%): Torrontes, Nerello Mascalese, Xinomavro, Furmint
2. **Rare Style** (~30%): Vin Jaune, Rutherglen Muscat, Lambrusco, Szamorodni
3. **Unexpected Origin** (~20%): known grapes from unusual places
4. **Hidden Identity** (~15%): wines that taste like something they're not

The critical finding: curveballs follow a **"1 in 4" rule**. In a multi-wine question, typically exactly one wine is significantly harder. The rest are anchors. If you chase the curveball and lose the anchors, you lose more marks than the curveball is worth.

---

## How We Built the Decision Trees

### Synthesis

From the 112 individual question analyses, we synthesized three master decision trees -- one per paper -- plus detailed family-level routing guides.

Each tree has two layers:

**Layer A (Pre-tasting)**: What the question stem tells you before you smell or taste anything. This routes the candidate to the right family, narrows the variety/region universe, and sets expectations for what to look for in the glass.

**Layer B (In-glass)**: Sensory confirmation. Once you taste, which observations survive from Layer A and which get eliminated? This layer uses specific aromatic, structural, and textural markers to confirm or redirect the prediction.

For Paper 3 (the most diagnostically complex paper, covering everything from Champagne to Sherry to Icewine), we added a unique **Layer A.5: Visual Triage**. Before smelling anything, the candidate looks at the glasses. Bubbles mean sparkling. Amber means oxidative or aged sweet. Deep ruby means young fortified red. Pink means rose. This single step collapses the Paper 3 universe from "could be anything" to a specific production category.

### What the Trees Target

The trees target **variety + region accuracy** -- correctly identifying the grape variety AND the country or major region. This is the scoring rubric the exam rewards most heavily. A candidate who correctly identifies "Barossa Shiraz" or "Burgundy Chardonnay" passes. A candidate who guesses the exact producer but misidentifies the variety fails.

Producer, vintage, and vineyard identification are bonus, not the target. The trees are designed around this priority.

---

## How We Proved It Works

### Leave-One-Year-Out Cross-Validation

We tested the decision trees using the most rigorous method available for a small corpus: Leave-One-Year-Out (LOYO) cross-validation. For each of the 10 exam years, we trained on the other 9 years and predicted the held-out year. Then we scored every prediction against the actual wines.

**Initial results** (112 questions, 360 wines scored):

| What we measured | Score |
|-----------------|------:|
| Top-1 variety accuracy (is the #1 prediction correct?) | 51.3% |
| Top-3 variety accuracy (is the correct variety in the top 3?) | 70.7% |
| Candidate-set hit rate (is the correct variety anywhere in the prediction set?) | 82.5% |

For context, the naive baseline -- always predicting the most common variety per paper (Chardonnay for whites, Pinot Noir for reds) -- scores 16.9%. Our trees achieved a **+34 percentage point improvement** over guessing.

### Iteration and Improvement

We then audited the results, identified scoring artifacts vs genuine tree weaknesses, and iterated:

- Fixed 5 scoring logic defects in the evaluation pipeline
- Added missing variety nodes (Melon de Bourgogne/Muscadet for Paper 1)
- Added region-specific blend rules (Rhone blends for Paper 2)
- Added category-specific routing (non-Champagne sparkling for Paper 3)
- Implemented anti-collapse rules for mixed-category questions

**Post-iteration results**:

| Metric | Before | After | Improvement |
|--------|-------:|------:|------------:|
| Top-1 variety | 51.3% | **72.8%** | +21.5 points |
| Top-3 variety | 70.7% | **89.2%** | +18.5 points |
| Candidate-set hit | 82.5% | **95.6%** | +13.1 points |

This means: for nearly 3 out of 4 wines, the tree's top prediction is the correct variety. For nearly 9 out of 10, the correct variety is in the top 3. And for over 95% of wines, the correct variety appears somewhere in the candidate set.

These are not guarantees. They are empirically measured probabilities that represent a significantly better starting position than intuition alone.

### Exam Structure Prediction

We also built and backtested a separate model that predicts the structure of future exams -- what question types will appear, in what order, testing what varieties and regions. Backtested on 2022-2025:

- Predicted the exact question count per paper correctly in **every year**
- Style prediction (sparkling/fortified/sweet/etc.): **97.6%** top-3 hit rate
- Country prediction: **81.0%** top-3 hit rate
- Variety prediction: **59.5%** top-3 hit rate

---

## How We Built the Question Generation Pipeline

### The Challenge

A study tool that only replays historical questions is limited -- 112 questions is not enough practice material, and candidates quickly memorize the answers. We needed to generate new questions that are indistinguishable from real MW exam questions in structure, difficulty, wine selection, and marking philosophy.

### Examiner-Calibrated Design

The question generation system is not a generic LLM prompt. It is constrained by every analytical layer described above:

**Wine selection is governed by historical norms.** We computed the statistical distribution of varieties, regions, price tiers, and winemaking styles across the entire corpus. Generated questions must fall within the historical envelope. If the real exam has never put two luxury-tier wines in the same flight, neither can we.

**Question structure follows the taxonomy.** Each generated question is assigned to a family (F1-F7) and must follow the structural logic of that family. An F1 (same variety) question gets a different constraint set than an F4 (mixed breadth) question.

**Curveball design follows the 1-in-4 rule.** Each generated question budgets at most one curveball wine, paired with anchor wines that give the candidate footholds.

**Mark allocation reflects examiner priorities.** Based on the trend we identified in examiner reports -- identification marks dropping from 46% to 39%, quality/maturity rising from 22% to 37% -- generated questions allocate marks in the proportions the modern exam actually uses.

### Three Layers of Quality Control

Every generated question passes through three layers of validation before reaching a candidate:

1. **Agent-level constraints**: The generation system follows ~300 lines of hard rules covering wine deduplication, country concentration limits (no paper should feature more than 6-8 countries), variety ledger verification (the number of varieties in the wines must exactly match what the stem promises), price-tier balance, and method-contrast requirements.

2. **Prompt-level guardrails**: The generation prompt enforces paper scope (no red wines in Paper 1), same-origin variety diversity (no hidden grape repetition in flights that should test different varieties), different-country truthfulness (if the stem says "different countries," every wine must be from a genuinely different country -- the real exam is 100% truthful with geographic claims across 10 years), and metadata sanitization (question metadata never leaks the answer).

3. **Server-side validators**: Five automated checks run against every generated question. If any check fails, the question is rejected and regenerated (up to 5 attempts). The validators catch paper-scope violations using 30+ grape-variety regex patterns, variety-consistency errors using appellation-to-grape lookup tables, origin-diversity problems, country-claim violations, and repetition against recent questions.

### Model Answer Generation

Each generated question receives a model answer written in blind-tasting deductive style -- the way a candidate would actually write in the exam room:

- Variety identification leads with structural evidence (acidity, tannin, body, alcohol), confirmed by aromatics
- Origin narrows from broad (Old World vs New World) to specific (country, region, sub-region) using climate markers, soil signatures, and winemaking style
- Quality is benchmarked against official classifications with specific price anchors
- Commercial positioning names channels, geographies, competitive sets, and price brackets -- never generic "fine dining restaurants"
- Maturity assessment includes all four elements the examiners require: current age, readiness, improvement window, and decline horizon

### Answer Evaluation

When a candidate submits an answer, the evaluation system is calibrated against the same examiner reports that inform question generation. The AI coach:

- Applies the **Seven Cardinal Rules** as its marking rubric
- Evaluates pre-glass stem analysis against the decision tree's predicted routing
- Scores each sub-question separately with estimated marks
- Provides a pass/borderline/fail assessment
- Identifies specific, actionable improvements rather than generic encouragement

The evaluation system was refined using the examiner report synthesis to match real MW marking standards. It rewards sound reasoning even when identification is wrong (Cardinal Rule 1), penalizes uncontextualized quality claims (Cardinal Rule 2), and flags when candidates shoehorn their notes to fit a predetermined identity (Cardinal Rule 3).

---

## How We Handle User Feedback

The system includes a feedback loop. When candidates flag issues with generated questions -- disputed evaluations, unrealistic wine selections, structural problems -- each piece of feedback is analyzed against the corpus before any pipeline change is made.

The key principle: **the corpus is authoritative.** If a candidate says "the exam would never do this" but the corpus shows it has, the feedback is rejected and the candidate gets an educational explanation with the historical citation. If the feedback identifies a genuine gap not seen in the corpus, the pipeline is updated with a tightly scoped fix.

This prevents two failure modes: ignoring legitimate issues, and over-correcting based on candidate assumptions that don't match exam reality.

---

## What This Is and What It Isn't

### What it is

- A study system built on the **complete modern MW practical exam corpus** (14 years, 504 wines, 153 questions)
- Decision trees **backtested to 72.8% top-1 variety accuracy** and **95.6% candidate-set coverage**
- Question generation constrained by **historical norms, examiner guidance, and three layers of automated validation**
- Evaluation calibrated to the **Seven Cardinal Rules** extracted from official examiner reports
- A framework for **narrowing down possibilities before you taste**, not a crystal ball that tells you what the wine is

### What it isn't

- A shortcut. The trees give you a better starting position, not a guaranteed answer.
- A replacement for tasting practice. The trees tell you what to look for; your palate tells you what you've found.
- Infallible. 72.8% top-1 means roughly 1 in 4 top predictions is wrong. The system is transparent about this.
- Static. The pipeline is designed to incorporate new exam years as they become available, and user feedback drives targeted improvements.

### The core insight

The MW practical exam is not random. It follows patterns -- in question structure, in wine selection, in mark allocation, in what the examiners reward and penalize. These patterns are invisible in any single year but emerge clearly across a decade. By systematically extracting these patterns and encoding them into decision tools, candidates can walk into the exam room with a better-informed starting position than pure intuition provides.

The trees don't tell you what the wine is. They tell you what it's most likely to be, what it could plausibly be, and what to taste for to tell the difference. That's the edge.
