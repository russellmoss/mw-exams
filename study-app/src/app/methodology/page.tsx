"use client";

import Link from "next/link";
import Image from "next/image";

function StatCard({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 text-center">
      <div className="text-3xl font-bold text-accent mb-1">{value}</div>
      <div className="text-sm font-medium text-foreground">{label}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

function SectionCard({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="bg-card rounded-2xl border border-border p-6 md:p-8">
      {children}
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-bold text-foreground mb-4">{children}</h2>;
}

function Callout({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-5 my-5 border-l-4 ${accent ? "bg-accent/10 border-accent" : "bg-card-hover border-border"}`}>
      {children}
    </div>
  );
}

function TableRow({ cells, header }: { cells: string[]; header?: boolean }) {
  const Tag = header ? "th" : "td";
  return (
    <tr className={header ? "border-b border-border" : "border-b border-border/30"}>
      {cells.map((cell, i) => (
        <Tag key={i} className={`py-2.5 px-3 text-left text-sm ${header ? "font-semibold text-foreground" : i === 0 ? "font-medium text-foreground" : "text-muted"} ${i === cells.length - 1 && !header ? "text-right tabular-nums" : ""}`}>
          {cell}
        </Tag>
      ))}
    </tr>
  );
}

const NAV_ITEMS = [
  { id: "corpus", label: "The Corpus" },
  { id: "analysis", label: "Analysis" },
  { id: "taxonomy", label: "Taxonomy" },
  { id: "trees", label: "Decision Trees" },
  { id: "backtest", label: "Backtesting" },
  { id: "pipeline", label: "Generation" },
  { id: "evaluation", label: "Evaluation" },
  { id: "feedback", label: "Feedback Loop" },
];

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="shrink-0">
              <Image src="/logo.png" alt="BWC" width={28} height={28} />
            </Link>
            <span className="text-sm font-medium text-accent">Methodology</span>
          </div>
          <Link href="/" className="text-sm text-muted hover:text-foreground transition-colors">
            Back to Study App
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Hero */}
        <div className="text-center mb-12">
          <p className="text-xs font-semibold text-accent uppercase tracking-widest mb-3">Research-Driven Exam Preparation</p>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            How We Built This
          </h1>
          <p className="text-lg text-muted max-w-2xl mx-auto leading-relaxed">
            A study engine grounded in 14 years of MW practical exam data, 13 examiner reports,
            and rigorous backtesting -- not intuition.
          </p>
        </div>

        {/* Key stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard value="504" label="Wines Researched" sub="Every wine from 2011-2025" />
          <StatCard value="153" label="Questions Analyzed" sub="14 years of exam papers" />
          <StatCard value="72.8%" label="Top-1 Variety Accuracy" sub="Backtested prediction rate" />
          <StatCard value="95.6%" label="Candidate-Set Coverage" sub="Correct variety in prediction set" />
        </div>

        {/* Section nav */}
        <nav className="flex flex-wrap gap-2 justify-center py-4">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-border bg-card hover:border-accent hover:text-accent transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* ── THE CORPUS ── */}
        <SectionCard id="corpus">
          <SectionTitle>The Corpus: Every MW Exam Since 2011</SectionTitle>
          <p className="text-muted leading-relaxed mb-4">
            We assembled the complete text of every MW practical exam paper from 2011 to 2025 -- 14 years
            of exams (2020 was cancelled). This is not a sample. It is the entire modern MW practical exam corpus.
          </p>

          <div className="grid grid-cols-3 gap-3 my-6">
            <div className="bg-background rounded-lg p-4 text-center border border-border/50">
              <div className="text-2xl font-bold text-foreground">14</div>
              <div className="text-xs text-muted mt-1">Exam Years</div>
            </div>
            <div className="bg-background rounded-lg p-4 text-center border border-border/50">
              <div className="text-2xl font-bold text-foreground">42</div>
              <div className="text-xs text-muted mt-1">Papers</div>
            </div>
            <div className="bg-background rounded-lg p-4 text-center border border-border/50">
              <div className="text-2xl font-bold text-foreground">504</div>
              <div className="text-xs text-muted mt-1">Individual Wines</div>
            </div>
          </div>

          <p className="text-muted leading-relaxed mb-4">
            Every one of the 504 wines was individually researched from authoritative sources: producer
            websites, Wine Enthusiast, Decanter, Tim Atkin MW, JancisRobinson.com, and regional wine board
            technical sheets. For each wine we documented tasting profile, technical specifications, vintage
            character, and -- critically -- why the examiners likely chose it.
          </p>

          <p className="text-muted leading-relaxed">
            We also obtained and synthesized <strong>13 official examiner reports</strong> spanning 2017-2025,
            systematically extracting every piece of marking guidance into what we call
            the <strong>Seven Cardinal Rules</strong> of MW practical marking.
          </p>
        </SectionCard>

        {/* ── SEVEN CARDINAL RULES ── */}
        <SectionCard>
          <SectionTitle>The Seven Cardinal Rules</SectionTitle>
          <p className="text-muted leading-relaxed mb-5">
            Extracted from 13 official examiner reports (2017-2025). These principles appear
            in every report -- they are how the IMW actually marks.
          </p>
          <div className="space-y-3">
            {[
              { n: "1", title: "Reasoning > Identification", desc: "A wrong answer with sound reasoning earns more marks than a right answer with no reasoning." },
              { n: "2", title: "Quality Must Be Contextualized", desc: "\"Very good quality\" without an official classification or price anchor scores zero. Name the tier." },
              { n: "3", title: "No Shoehorning", desc: "Don't force tasting notes to fit a predetermined identity. Let structure lead; aromatics confirm." },
              { n: "4", title: "Answer the Question Asked", desc: "If the question asks about winemaking, don't write about geography. Read the sub-questions." },
              { n: "5", title: "Maturity Has Four Required Elements", desc: "Current age, readiness assessment, improvement window, and decline horizon. Miss one, lose marks." },
              { n: "6", title: "Commercial Must Be Specific", desc: "Channel, geography, price bracket, competitive set, target consumer. Never just \"fine dining restaurants.\"" },
              { n: "7", title: "Structural Evidence Is Foundation", desc: "Acidity, tannin, body, and alcohol are the foundation. Aromatics verify; they don't decide." },
            ].map((rule) => (
              <div key={rule.n} className="flex gap-4 bg-background rounded-lg p-4 border border-border/50">
                <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-accent">{rule.n}</span>
                </div>
                <div>
                  <div className="font-semibold text-foreground text-sm">{rule.title}</div>
                  <div className="text-sm text-muted mt-0.5">{rule.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── ANALYSIS ── */}
        <SectionCard id="analysis">
          <SectionTitle>Question-by-Question Analysis</SectionTitle>
          <p className="text-muted leading-relaxed mb-4">
            We analyzed all 112 questions from the 10-year core corpus using a disciplined protocol.
            For each question, working from the stem alone -- without looking at the wines -- we mapped
            the logical path from question text to plausible wine candidates.
          </p>

          <Callout>
            <p className="text-sm font-semibold text-foreground mb-2">Each analysis asks:</p>
            <ul className="text-sm text-muted space-y-1.5 list-disc ml-4">
              <li>What does the paper number constrain? (Paper 1 = white, Paper 2 = red, Paper 3 = special)</li>
              <li>What does the stem language narrow? (&quot;Same single grape variety&quot; eliminates most of the wine world)</li>
              <li>What do mark allocations signal? (Heavy winemaking marks = examiner expects production knowledge)</li>
              <li>What has the IMW done historically in this question position?</li>
            </ul>
          </Callout>

          <p className="text-muted leading-relaxed mb-4">
            This produced <strong>112 individual decision matrices</strong> -- each tracing the path from
            stem to candidates using three confidence tiers:
          </p>

          <div className="grid grid-cols-3 gap-3 my-5">
            <div className="bg-success/10 rounded-lg p-4 border border-success/20 text-center">
              <div className="text-sm font-bold text-success">STRONG SIGNAL</div>
              <div className="text-xs text-muted mt-1">High confidence from stem + history</div>
            </div>
            <div className="bg-borderline/10 rounded-lg p-4 border border-borderline/20 text-center">
              <div className="text-sm font-bold text-borderline">PLAUSIBLE</div>
              <div className="text-xs text-muted mt-1">Worth considering, evidence supports</div>
            </div>
            <div className="bg-fail/10 rounded-lg p-4 border border-fail/20 text-center">
              <div className="text-sm font-bold text-fail">CURVEBALL</div>
              <div className="text-xs text-muted mt-1">Low probability but historically seen</div>
            </div>
          </div>

          <p className="text-sm text-muted italic">
            We use confidence tiers rather than percentages because the corpus -- while complete --
            is 10 years: too small for reliable probability distributions.
          </p>

          <p className="text-muted leading-relaxed mt-4">
            Each matrix was then re-analyzed through the lens of the master decision trees
            (Phase 5B), adding structured pre-taste and in-taste templates with explicit
            anti-collapse rules: &quot;Do not infer wine N from wine N-1.&quot;
          </p>
        </SectionCard>

        {/* ── TAXONOMY ── */}
        <SectionCard id="taxonomy">
          <SectionTitle>Question Taxonomy: The Hidden Structure</SectionTitle>
          <p className="text-muted leading-relaxed mb-4">
            MW practical questions are not random. They cluster into recurring structural families
            -- the same logic patterns reappear year after year. We designed an 8-family classification
            system and tagged every historical question.
          </p>

          <div className="overflow-x-auto my-5">
            <table className="w-full text-sm">
              <thead>
                <TableRow header cells={["Family", "What It Tests", "Share"]} />
              </thead>
              <tbody>
                <TableRow cells={["F1: Same Variety", "Hold one grape across different origins and styles", "22%"]} />
                <TableRow cells={["F2: Same Origin", "Distinguish wines from one country or region", "21%"]} />
                <TableRow cells={["F3: Blend Logic", "Identify blends and their components", "5%"]} />
                <TableRow cells={["F4: Mixed Breadth", "Handle unrelated wines without anchoring bias", "29%"]} />
                <TableRow cells={["F5: Method/Production", "Deduce winemaking from what's in the glass", "11%"]} />
                <TableRow cells={["F6: Style Mechanism", "Map sweetness, alcohol, and production method", "4%"]} />
                <TableRow cells={["F7: Hierarchy/Quality", "Calibrate quality within a classification system", "7%"]} />
              </tbody>
            </table>
          </div>

          <Callout accent>
            <p className="text-sm text-foreground leading-relaxed">
              <strong>F4 (Mixed Breadth) is the largest family at 29%.</strong> These are the questions
              where each wine is a separate identification problem with no linking thread. The examiner
              is testing whether you can reset between wines rather than anchor on patterns from the
              previous glass.
            </p>
          </Callout>
        </SectionCard>

        {/* ── PATTERNS ── */}
        <SectionCard>
          <SectionTitle>Patterns Hidden in Plain Sight</SectionTitle>
          <p className="text-muted leading-relaxed mb-5">
            30 numbered heuristics extracted from the corpus -- patterns invisible in any single
            exam year but unmistakable across a decade:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { stat: "100%", desc: "Paper 1 includes Chardonnay every year (10 of 10)" },
              { stat: "80%", desc: "Riesling appears in Paper 1 (8 of 10 years)" },
              { stat: "100%", desc: "P3 Q1 has been sparkling since 2021 (4 of 4 years)" },
              { stat: "50%", desc: "Tokaji appears in Paper 3 (5 of 10 years)" },
              { stat: "21%", desc: "Questions use \"same single grape variety\" in the stem" },
              { stat: "26%", desc: "Questions include a commercial/market sub-question" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 bg-background rounded-lg p-3 border border-border/50">
                <span className="text-lg font-bold text-accent shrink-0 w-14 text-right tabular-nums">{item.stat}</span>
                <span className="text-sm text-muted leading-relaxed">{item.desc}</span>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-semibold text-foreground mb-3">Curveball Analysis</h3>
            <p className="text-muted leading-relaxed mb-4">
              We classified all 504 wines by difficulty. The critical finding: curveballs follow
              a <strong>&quot;1 in 4&quot; rule</strong>. In a multi-wine question, typically exactly one wine
              is significantly harder. The rest are anchors.
            </p>
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-background rounded-lg p-3 text-center border border-border/50">
                <div className="text-xl font-bold text-foreground">75.9%</div>
                <div className="text-xs text-muted mt-1">Standard</div>
              </div>
              <div className="bg-background rounded-lg p-3 text-center border border-border/50">
                <div className="text-xl font-bold text-borderline">17.9%</div>
                <div className="text-xs text-muted mt-1">Moderate</div>
              </div>
              <div className="bg-background rounded-lg p-3 text-center border border-border/50">
                <div className="text-xl font-bold text-fail">6.2%</div>
                <div className="text-xs text-muted mt-1">High Curveball</div>
              </div>
              <div className="bg-background rounded-lg p-3 text-center border border-border/50">
                <div className="text-xl font-bold text-accent">31</div>
                <div className="text-xs text-muted mt-1">Total High CBs</div>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── DECISION TREES ── */}
        <SectionCard id="trees">
          <SectionTitle>The Decision Trees</SectionTitle>
          <p className="text-muted leading-relaxed mb-4">
            From 112 individual question analyses, we synthesized three master decision trees
            -- one per paper. Each tree has two layers:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-5">
            <div className="bg-background rounded-xl p-5 border border-accent/20">
              <div className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Layer A: Pre-Tasting</div>
              <p className="text-sm text-muted leading-relaxed">
                What the question stem tells you before you smell or taste. Routes you to the right
                family, narrows variety/region candidates, sets expectations for what to look for.
              </p>
            </div>
            <div className="bg-background rounded-xl p-5 border border-accent/20">
              <div className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Layer B: In-Glass</div>
              <p className="text-sm text-muted leading-relaxed">
                Sensory confirmation. Which Layer A predictions survive what you actually taste?
                Uses specific aromatic, structural, and textural markers to confirm or redirect.
              </p>
            </div>
          </div>

          <Callout accent>
            <p className="text-sm text-foreground leading-relaxed">
              <strong>Paper 3 has a unique Layer A.5: Visual Triage.</strong> Before smelling anything,
              look at the glasses. Bubbles = sparkling. Amber = oxidative. Deep ruby = fortified red.
              Pink = rose. This single step collapses the Paper 3 universe from &quot;could be anything&quot;
              to a specific production category.
            </p>
          </Callout>

          <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">What the Trees Target</h3>
          <p className="text-muted leading-relaxed">
            <strong>Variety + region accuracy.</strong> Correctly identifying the grape variety AND the country
            or major region (e.g., &quot;Barossa Shiraz&quot; or &quot;Burgundy Chardonnay&quot;). A candidate who nails
            variety + region passes. A candidate who guesses the exact producer but misidentifies the
            variety fails. The trees encode this priority.
          </p>
        </SectionCard>

        {/* ── BACKTESTING ── */}
        <SectionCard id="backtest">
          <SectionTitle>Backtesting: Proof, Not Promises</SectionTitle>
          <p className="text-muted leading-relaxed mb-4">
            We tested the decision trees using <strong>Leave-One-Year-Out (LOYO) cross-validation</strong>:
            train on 9 years, predict the held-out year, repeat for all 10 folds. Then we scored
            every prediction against the actual wines.
          </p>

          <h3 className="text-lg font-semibold text-foreground mb-3">Initial Results</h3>
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-sm">
              <thead>
                <TableRow header cells={["Metric", "Score", "Baseline", "vs. Guessing"]} />
              </thead>
              <tbody>
                <TableRow cells={["Top-1 variety accuracy", "51.3%", "16.9%", "+34.4 points"]} />
                <TableRow cells={["Top-3 variety accuracy", "70.7%", "--", "PASS (target: 70%)"]} />
                <TableRow cells={["Candidate-set hit rate", "82.5%", "--", "NEAR TARGET (85%)"]} />
              </tbody>
            </table>
          </div>

          <p className="text-muted leading-relaxed mb-4">
            The naive baseline -- always predicting the most common variety per paper -- scores 16.9%.
            Our trees achieved a <strong>+34 percentage point improvement</strong> over guessing.
          </p>

          <h3 className="text-lg font-semibold text-foreground mb-3">After Iteration</h3>
          <p className="text-muted leading-relaxed mb-4">
            We audited the results, identified scoring artifacts vs genuine tree weaknesses, and iterated.
            Specific fixes: added missing variety nodes, region-specific blend rules, category routing
            for non-Champagne sparkling, anti-collapse rules for mixed-category questions.
          </p>

          <div className="overflow-x-auto mb-5">
            <table className="w-full text-sm">
              <thead>
                <TableRow header cells={["Metric", "Before", "After", "Improvement"]} />
              </thead>
              <tbody>
                <TableRow cells={["Top-1 variety", "51.3%", "72.8%", "+21.5 points"]} />
                <TableRow cells={["Top-3 variety", "70.7%", "89.2%", "+18.5 points"]} />
                <TableRow cells={["Candidate-set hit", "82.5%", "95.6%", "+13.1 points"]} />
              </tbody>
            </table>
          </div>

          <Callout accent>
            <p className="text-sm text-foreground leading-relaxed">
              <strong>For nearly 3 out of 4 wines</strong>, the tree&apos;s top prediction is the correct variety.
              For <strong>nearly 9 out of 10</strong>, the correct variety is in the top 3.
              And for <strong>over 95% of wines</strong>, the correct variety appears somewhere in the candidate set.
            </p>
          </Callout>

          <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">Exam Structure Prediction</h3>
          <p className="text-muted leading-relaxed mb-3">
            A separate model predicts what question types, varieties, and regions will appear. Backtested on 2022-2025:
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard value="100%" label="Question Count" sub="Exact per-paper prediction" />
            <StatCard value="97.6%" label="Style Prediction" sub="Top-3 hit rate" />
            <StatCard value="81.0%" label="Country Prediction" sub="Top-3 hit rate" />
            <StatCard value="59.5%" label="Variety Prediction" sub="Top-3 hit rate" />
          </div>
        </SectionCard>

        {/* ── GENERATION PIPELINE ── */}
        <SectionCard id="pipeline">
          <SectionTitle>Question Generation Pipeline</SectionTitle>
          <p className="text-muted leading-relaxed mb-4">
            A study tool that only replays historical questions is limited -- 112 questions is not enough
            practice material. We built a generation pipeline that produces new questions indistinguishable
            from real MW exam questions in structure, difficulty, and marking philosophy.
          </p>

          <h3 className="text-lg font-semibold text-foreground mb-3">Three Layers of Quality Control</h3>

          <div className="space-y-4 my-5">
            <div className="bg-background rounded-xl p-5 border border-border/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-accent">1</span>
                </div>
                <div className="font-semibold text-foreground">Agent-Level Constraints</div>
              </div>
              <ul className="text-sm text-muted space-y-1.5 ml-11 list-disc">
                <li>Wine deduplication (10% repeat cap across all generated questions)</li>
                <li>Country concentration limits (max 6-8 countries per paper)</li>
                <li>Variety ledger verification (wine count must match stem promises)</li>
                <li>Curveball budget (max 1 per question, 2-3 per paper)</li>
                <li>Sweet wine mechanism diversity minimums</li>
                <li>Price-tier balance within each flight</li>
              </ul>
            </div>

            <div className="bg-background rounded-xl p-5 border border-border/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-accent">2</span>
                </div>
                <div className="font-semibold text-foreground">Prompt-Level Guardrails</div>
              </div>
              <ul className="text-sm text-muted space-y-1.5 ml-11 list-disc">
                <li>Paper scope enforcement (no reds in Paper 1, no whites in Paper 2)</li>
                <li>Same-origin variety diversity (no hidden grape repetition in flights)</li>
                <li>Different-country truthfulness (the real exam is 100% truthful with geographic claims)</li>
                <li>Mark allocation follows modern examiner trends</li>
                <li>Metadata sanitization prevents answer leakage</li>
              </ul>
            </div>

            <div className="bg-background rounded-xl p-5 border border-border/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-accent">3</span>
                </div>
                <div className="font-semibold text-foreground">Server-Side Validators</div>
              </div>
              <ul className="text-sm text-muted space-y-1.5 ml-11 list-disc">
                <li>5 automated validators run against every generated question</li>
                <li>Paper scope checked with 30+ grape-variety pattern matching</li>
                <li>Appellation-to-grape lookup verifies variety consistency</li>
                <li>Country-count enforcement against stem claims</li>
                <li>Similarity check prevents back-to-back repetitive questions</li>
                <li>Up to 5 generation attempts -- all validators must pass with zero violations</li>
              </ul>
            </div>
          </div>
        </SectionCard>

        {/* ── EVALUATION ── */}
        <SectionCard id="evaluation">
          <SectionTitle>Examiner-Calibrated Evaluation</SectionTitle>
          <p className="text-muted leading-relaxed mb-4">
            When you submit an answer, the evaluation is not a generic AI assessment. It is calibrated
            against the same examiner reports that inform question generation.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-5">
            <div className="bg-background rounded-xl p-5 border border-border/50">
              <div className="text-sm font-semibold text-accent mb-2">Pre-Glass Coaching</div>
              <ul className="text-sm text-muted space-y-1 list-disc ml-4">
                <li>Evaluates stem analysis against the decision tree routing</li>
                <li>Identifies missed signals and blind spots</li>
                <li>Provides what to look for in the glass</li>
              </ul>
            </div>
            <div className="bg-background rounded-xl p-5 border border-border/50">
              <div className="text-sm font-semibold text-accent mb-2">Full Answer Evaluation</div>
              <ul className="text-sm text-muted space-y-1 list-disc ml-4">
                <li>Applies the Seven Cardinal Rules as marking rubric</li>
                <li>Scores each sub-question with estimated marks</li>
                <li>Pass / borderline / fail assessment</li>
                <li>Comparison against model answer</li>
              </ul>
            </div>
          </div>

          <p className="text-muted leading-relaxed">
            The system rewards sound reasoning even when identification is wrong (Cardinal Rule 1),
            penalizes uncontextualized quality claims (Rule 2), and flags shoehorning (Rule 3). Model
            answers are written in blind-tasting deductive style -- the way a candidate would actually
            write in the exam room, not as academic study notes.
          </p>
        </SectionCard>

        {/* ── FEEDBACK LOOP ── */}
        <SectionCard id="feedback">
          <SectionTitle>The Feedback Loop</SectionTitle>
          <p className="text-muted leading-relaxed mb-4">
            When candidates flag issues with generated questions, each piece of feedback is analyzed
            against the corpus before any change is made.
          </p>

          <Callout accent>
            <p className="text-sm text-foreground leading-relaxed">
              <strong>The corpus is authoritative.</strong> If a candidate says &quot;the exam would never do this&quot;
              but the corpus shows it has, the feedback is rejected with an educational explanation and
              historical citation. If the feedback identifies a genuine gap, the pipeline is updated
              with a tightly scoped fix.
            </p>
          </Callout>

          <p className="text-muted leading-relaxed">
            This prevents two failure modes: ignoring legitimate issues and over-correcting based on
            candidate assumptions that don&apos;t match exam reality.
          </p>
        </SectionCard>

        {/* ── WHAT THIS IS ── */}
        <SectionCard>
          <SectionTitle>What This Is -- and What It Isn&apos;t</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <div className="text-sm font-semibold text-success mb-3">What it is</div>
              <ul className="text-sm text-muted space-y-2 list-disc ml-4">
                <li>Built on the <strong>complete modern MW exam corpus</strong> (14 years, 504 wines)</li>
                <li>Decision trees <strong>backtested to 72.8% accuracy</strong></li>
                <li>Question generation constrained by <strong>historical norms and three layers of validation</strong></li>
                <li>Evaluation calibrated to <strong>official examiner guidance</strong></li>
                <li>A framework for <strong>narrowing down before you taste</strong></li>
              </ul>
            </div>
            <div>
              <div className="text-sm font-semibold text-fail mb-3">What it isn&apos;t</div>
              <ul className="text-sm text-muted space-y-2 list-disc ml-4">
                <li>A shortcut -- the trees give a better starting position, not a guaranteed answer</li>
                <li>A replacement for tasting practice</li>
                <li>Infallible -- 72.8% means ~1 in 4 top predictions is wrong</li>
                <li>Static -- new exam years and user feedback drive continuous improvement</li>
              </ul>
            </div>
          </div>
        </SectionCard>

        {/* ── CLOSING ── */}
        <div className="text-center py-8">
          <div className="bg-card rounded-2xl border border-accent/20 p-8 max-w-2xl mx-auto">
            <h2 className="text-xl font-bold text-foreground mb-3">The Core Insight</h2>
            <p className="text-muted leading-relaxed">
              The MW practical exam is not random. It follows patterns -- in question structure,
              wine selection, mark allocation, and what examiners reward. These patterns are
              invisible in any single year but emerge clearly across a decade.
            </p>
            <p className="text-foreground leading-relaxed mt-3 font-medium">
              The trees don&apos;t tell you what the wine is. They tell you what it&apos;s most likely to be,
              what it could plausibly be, and what to taste for to tell the difference. That&apos;s the edge.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
