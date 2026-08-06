"use client";

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
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Methodology</h1>
          <p className="text-sm text-muted mt-1">How we built this — research-driven exam preparation</p>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Hero */}
        <div className="text-center mb-8">
          <p className="text-xs font-semibold text-accent uppercase tracking-widest mb-3">Research-Driven Exam Preparation</p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            How We Built This
          </h2>
          <p className="text-lg text-muted max-w-2xl mx-auto leading-relaxed">
            A study engine grounded in 15 years of MW practical exam data, 13 examiner reports,
            and rigorous backtesting -- not intuition.
          </p>
        </div>

        {/* Key stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard value="540" label="Wines Researched" sub="Every wine from 2011-2026" />
          <StatCard value="162" label="Questions Analyzed" sub="15 years of exam papers" />
          <StatCard value="58%" label="Top-3 Variety" sub="Blind test: 396 unseen wines" />
          <StatCard value="80%" label="Candidate-Set Coverage" sub="Correct variety somewhere in the set" />
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
            We assembled the complete text of every MW practical exam paper from 2011 to 2026 -- 15 years
            of exams (2020 was cancelled). This is not a sample. It is the entire modern MW practical exam corpus.
          </p>

          <div className="grid grid-cols-3 gap-3 my-6">
            <div className="bg-background rounded-lg p-4 text-center border border-border/50">
              <div className="text-2xl font-bold text-foreground">15</div>
              <div className="text-xs text-muted mt-1">Exam Years</div>
            </div>
            <div className="bg-background rounded-lg p-4 text-center border border-border/50">
              <div className="text-2xl font-bold text-foreground">45</div>
              <div className="text-xs text-muted mt-1">Papers</div>
            </div>
            <div className="bg-background rounded-lg p-4 text-center border border-border/50">
              <div className="text-2xl font-bold text-foreground">540</div>
              <div className="text-xs text-muted mt-1">Individual Wines</div>
            </div>
          </div>

          <p className="text-muted leading-relaxed mb-4">
            Every one of the 540 wines was individually researched from authoritative sources: producer
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
            We analyzed all 120 questions from the 11-year core corpus using a disciplined protocol.
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
            This produced <strong>120 individual decision matrices</strong> -- each tracing the path from
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
            is 11 years: too small for reliable probability distributions.
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
                <TableRow cells={["F1: Same Variety", "Hold one grape across different origins and styles", "23%"]} />
                <TableRow cells={["F2: Same Origin", "Distinguish wines from one country or region", "22%"]} />
                <TableRow cells={["F3: Blend Logic", "Identify blends and their components", "5%"]} />
                <TableRow cells={["F4: Mixed Breadth", "Handle unrelated wines without anchoring bias", "30%"]} />
                <TableRow cells={["F5: Method/Production", "Deduce winemaking from what's in the glass", "10%"]} />
                <TableRow cells={["F6: Style Mechanism", "Map sweetness, alcohol, and production method", "4%"]} />
                <TableRow cells={["F7: Hierarchy/Quality", "Calibrate quality within a classification system", "7%"]} />
              </tbody>
            </table>
          </div>

          <Callout accent>
            <p className="text-sm text-foreground leading-relaxed">
              <strong>F4 (Mixed Breadth) is the largest family at 30%.</strong> These are the questions
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
              { stat: "100%", desc: "Paper 1 includes Chardonnay every year (11 of 11)" },
              { stat: "91%", desc: "Riesling appears in Paper 1 (10 of 11 years)" },
              { stat: "100%", desc: "P3 Q1 has included sparkling every year since 2021 (6 of 6)" },
              { stat: "45%", desc: "Tokaji appears in Paper 3 (5 of 11 years)" },
              { stat: "22%", desc: "Questions lock a shared grape variety in the stem" },
              { stat: "29%", desc: "Questions include a commercial sub-question" },
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
              We classified all 540 wines by difficulty. The critical finding: curveballs follow
              a <strong>&quot;1 in 4&quot; rule</strong>. In a multi-wine question, typically exactly one wine
              is significantly harder. The rest are anchors.
            </p>
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-background rounded-lg p-3 text-center border border-border/50">
                <div className="text-xl font-bold text-foreground">78.0%</div>
                <div className="text-xs text-muted mt-1">Standard</div>
              </div>
              <div className="bg-background rounded-lg p-3 text-center border border-border/50">
                <div className="text-xl font-bold text-borderline">15.7%</div>
                <div className="text-xs text-muted mt-1">Moderate</div>
              </div>
              <div className="bg-background rounded-lg p-3 text-center border border-border/50">
                <div className="text-xl font-bold text-fail">6.3%</div>
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
            From 120 individual question analyses, we synthesized three master decision trees
            -- one per paper. Each has a fallback gate, then two layers:
          </p>
          <p className="text-sm text-muted italic mb-4">
            The trees are synthesised from the full 2011-2026 corpus -- 162 questions, 540 wines,
            every stem construction those sixteen years contain. The 2000-2010 papers are excluded
            from synthesis and reserved as blind-test material (see Backtesting), and the 2027 sit
            is the next unseen test. Where a branch rests on only one or two historical instances,
            the tree says so in-line: single-instance rules are written as flags to widen the
            candidate set, never as predictors.
          </p>

          <div className="bg-background rounded-xl p-5 border border-border my-5">
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Branch 0: Unrecognised Construction</div>
            <p className="text-sm text-muted leading-relaxed">
              The trees&apos; first rule. If a stem matches no branch, don&apos;t force-fit the
              nearest one and inherit a prior that doesn&apos;t apply -- name the stem as
              unrecognised, fall back to the paper-level prior, keep the candidate set deliberately
              wide, and let the glass lead. On unseen material this is rare (6 of 111 stems on the
              2000-2010 blind test), and the stems that do land here are constructions Branch 0
              names explicitly: vintage verticals, single-wine isolation, open-vs-blind grids. An
              honest &quot;I don&apos;t recognise this shape&quot; beats a confident wrong branch.
            </p>
          </div>

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
              <strong>Paper 3 leads with your eyes.</strong> Before smelling anything, look at the
              glasses. Bubbles = sparkling. Amber = oxidative. Deep ruby = fortified red. Pink = rose.
              This single step collapses the Paper 3 universe from &quot;could be anything&quot; to a
              specific production category. Visual triage is not a footnote to the stem analysis --
              it is the <em>trunk</em> of Paper 3&apos;s in-glass tree, which is why the paper is read
              eyes-first and stem-second.
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
          <SectionTitle>Backtesting: How the Trees Are Measured</SectionTitle>
          <p className="text-muted leading-relaxed mb-4">
            One rule governs every number in this section: <strong>the trees are never graded on
            their own corpus.</strong> They are a single artifact built from all 162 questions of
            2011-2026, and those questions are named verbatim inside them -- strings like
            &quot;2016 P1 Q2&quot; attached to the leaf that predicts them -- so any score on those
            years measures recall, not prediction. For scale: the naive baseline of always guessing
            the most common variety per paper scores 16.9%.
          </p>

          <h3 className="text-lg font-semibold text-foreground mb-3">
            The blind test: what the trees score on wines they have never seen
          </h3>
          <p className="text-muted leading-relaxed mb-4">
            The corpus the trees are built from cannot grade them -- every 2011-2026 question is
            training material, and scores there measure recall. The measurement that stands is the
            <strong> 2000-2010 blind test</strong>: 111 questions and 396 wines that contribute
            nothing to the trees. Predictions are made from the stem and the tree alone -- wines
            withheld, no corpus access, ranked lists capped at eight varieties -- and scored by one
            deterministic, synonym-aware scorer against independently resolved ground truth.
          </p>

          <div className="overflow-x-auto mb-5">
            <table className="w-full text-sm">
              <thead>
                <TableRow header cells={["Metric", "Variety", "Country"]} />
              </thead>
              <tbody>
                <TableRow cells={["Top-1", "33%", "40%"]} />
                <TableRow cells={["Top-3", "58%", "69%"]} />
                <TableRow cells={["In candidate set", "80%", "90%"]} />
              </tbody>
            </table>
          </div>

          <Callout accent>
            <p className="text-sm text-foreground leading-relaxed">
              <strong>How to read these numbers.</strong> Do not act on the tree&apos;s top-1 answer
              -- it is right about one time in three. The tree&apos;s job is to <em>bound the
              universe</em>: four times in five the true variety is somewhere in the candidate set,
              and nine times in ten the true country is. You narrow from there in the glass. The
              trees know shapes, not bottles.
              <br /><br />
              <strong>What we do not claim.</strong> An earlier version of this page reported 72.8%
              top-1 and 89.2% top-3 from an in-sample pass. Those numbers are not reproducible and
              we do not quote them.
            </p>
          </Callout>

          <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">Stem routing</h3>
          <p className="text-muted leading-relaxed mb-4">
            Routing is the load-bearing layer, and it is audited as a first-class property of the
            system. Every stem routes on its trigger words -- linking constraints (&quot;same single
            grape variety&quot;, &quot;same country&quot;), wine counts, style keywords, mark
            allocations -- through explicit gates where more than one branch could claim it, with
            Branch 0 as the honest fallback. Against the full 2011-2026 corpus, <strong>94% of stems
            route cleanly on trigger words alone</strong>, the remainder resolve through documented
            ambiguity rules or Branch 0, and every wine in sixteen years of answer keys is contained
            in its routed branch&apos;s candidate set. On the unseen 2000-2010 papers, 6 of 111
            stems (5%) find no branch -- all of them constructions Branch 0 names explicitly. Each
            audit classifies every miss as either a routing defect or a knowledge gap, which is what
            keeps the trees&apos; candidate sets and their routing honest with each other.
          </p>

          <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">Exam Structure Prediction</h3>
          <p className="text-muted leading-relaxed mb-3">
            A separate model predicts what question types, varieties, and regions will appear.
            Backtested leave-one-year-out across 2022-2026 (each fold trains only on earlier years):
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard value="27%" label="Question Count" sub="4 of 15 paper-years; was mis-reported as 100%" />
            <StatCard value="98.0%" label="Style Prediction" sub="Top-3 hit rate" />
            <StatCard value="84.0%" label="Country Prediction" sub="Top-3 hit rate" />
            <StatCard value="60.0%" label="Variety Prediction" sub="Top-3 hit rate" />
          </div>

          <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">
            The 2026 Holdout -- the only out-of-sample test
          </h3>
          <p className="text-muted leading-relaxed mb-3">
            The 2026 forecast was committed before the exam was sat, then scored against the real
            papers once they were published. Every number above was measured on years the model had
            already seen; these were not. This is the honest measure of whether the system works.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard value="75%" label="Question Archetypes" sub="6 of 8 anticipated" />
            <StatCard value="96%" label="Country (matrices)" sub="24 of 25 named blind" />
            <StatCard value="1 of 3" label="Exact Question Count" sub="Matches the 27% backtest rate" />
            <StatCard value="61%" label="Country (structure model)" sub="Held-out recall" />
          </div>
          <Callout>
            <p className="text-sm text-muted">
              <strong>What we got wrong, stated plainly.</strong> This page previously reported
              &quot;100% question count&quot; accuracy. That number was not merely optimistic -- it was
              <strong>measuring nothing</strong>. The backtest forced its prediction to equal the actual
              question count and then checked whether the two matched, an identity true by construction;
              the real predictor was never called. Scored properly, question-count accuracy is
              <strong>27% -- 4 of 15 paper-years</strong>. On the held-out 2026 papers it was 1 of 3,
              which agrees. 2026 ran fewer, larger flights (a six-wine Paper 1 opener, an eight-wine
              Paper 3 pair-set), which is how a paper sheds a question while keeping twelve wines and
              300 marks. <strong>Do not plan around predicted question count.</strong> The archetype
              mix -- which question <em>types</em> appear -- held up out of sample at 75%, better than
              its own in-sample score, and that is the half worth trusting.
            </p>
          </Callout>
        </SectionCard>

        {/* ── GENERATION PIPELINE ── */}
        <SectionCard id="pipeline">
          <SectionTitle>Question Generation Pipeline</SectionTitle>
          <p className="text-muted leading-relaxed mb-4">
            A study tool that only replays historical questions is limited -- 120 questions is not enough
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
                <li>Built on the <strong>complete modern MW exam corpus</strong> (15 years, 540 wines)</li>
                <li>Decision trees <strong>blind-tested on 396 genuinely unseen wines</strong> (2000-2010) -- 58% top-3 variety, 80% candidate-set coverage</li>
                <li>Stem routing <strong>audited end-to-end</strong>: every stem construction in 16 years of papers has a route through the trees</li>
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
                <li>Infallible -- out-of-sample the top-1 prediction is wrong about 2 times in 3</li>
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
        </div>
      </main>
    </div>
  );
}
