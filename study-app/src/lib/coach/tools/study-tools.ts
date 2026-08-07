// The remaining four read tools: tiered rulings, the decision trees, the candidate's own record,
// and the existing production-knowledge RAG.

import { neon } from "@neondatabase/serverless";
import type { CoachTool } from "../types";
import { masterTreeForPaper, studyDiagramForPaper } from "@/lib/master-trees";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";

export const queryEmpiricalKnowledge: CoachTool = {
  name: "query_empirical_knowledge",
  kind: "read",
  description:
    "Query the empirical knowledge base — evidence-cited rulings about how the MW exam is structured, " +
    "how examiners grade, what appears in each paper, and the question-generation rules. Every entry " +
    "carries a confidence TIER: STRONG SIGNAL (high confidence), PLAUSIBLE (worth considering), " +
    "CURVEBALL (low confidence, rare), PROCESS (how the system works). " +
    "Use this when the candidate asks what is likely vs unlikely, or challenges whether something " +
    "would really be examined. ALWAYS report the tier alongside the claim — a PLAUSIBLE entry stated " +
    "as fact is a wrong answer.",
  inputSchema: {
    type: "object",
    properties: {
      search: { type: "string", description: "Matched against title, claim and evidence." },
      paper: { type: "integer", enum: [1, 2, 3] },
      tier: { type: "string", enum: ["STRONG SIGNAL", "PLAUSIBLE", "CURVEBALL", "PROCESS"] },
      section: {
        type: "integer",
        description:
          "1 structure, 2 examiner mindset, 3 grading, 4 wine/price/style distribution, " +
          "5 question-generation rules, 6 feedback ledger, 7 app bugs, 8 cross-refs, 9 open questions.",
      },
      limit: { type: "integer", description: "Default 8, max 20." },
    },
  },
  async run(_ctx, input) {
    const sql = neon(process.env.DATABASE_URL!);
    const search = typeof input.search === "string" && input.search.trim() ? `%${input.search.trim()}%` : null;
    const paper = typeof input.paper === "number" ? input.paper : null;
    const tier = typeof input.tier === "string" ? input.tier : null;
    const section = typeof input.section === "number" ? input.section : null;
    const limit = Math.min(20, Math.max(1, typeof input.limit === "number" ? input.limit : 8));

    // superseded_by IS NULL: a ruling that has been replaced must never be quoted as current. The
    // doc is living and entries do get corrected (EK-0093's pass-standard error being the cautionary
    // example — it was wrong, and quoting it would have taught a false pass mark).
    const rows = (await sql`
      SELECT ek_id, section, tier, title, claim, evidence, paper
      FROM empirical_knowledge
      WHERE superseded_by IS NULL
        AND (${search}::text IS NULL OR title ILIKE ${search} OR claim ILIKE ${search} OR evidence ILIKE ${search})
        AND (${paper}::int IS NULL OR paper = ${paper})
        AND (${tier}::text IS NULL OR tier = ${tier})
        AND (${section}::int IS NULL OR section = ${section})
      ORDER BY
        CASE tier WHEN 'STRONG SIGNAL' THEN 0 WHEN 'PLAUSIBLE' THEN 1 WHEN 'PROCESS' THEN 2 ELSE 3 END,
        ek_id
      LIMIT ${limit}
    `) as Record<string, unknown>[];

    return { matched: rows.length, entries: rows };
  },
};

export const getDecisionTree: CoachTool = {
  name: "get_decision_tree",
  kind: "read",
  description:
    "Fetch a master decision tree or study diagram for one paper. The trees encode how to route a " +
    "question stem to likely varieties and regions (Layer A: pre-tasting stem signals; Layer B: " +
    "in-glass sensory evidence), with STRONG SIGNAL / PLAUSIBLE / CURVEBALL confidence tiers. " +
    "Use this to quiz the candidate on the trees, to explain a branch, or to explain how a stem " +
    "routes. Trees are long — pass a `search` term to get the relevant sections instead of all of it.",
  inputSchema: {
    type: "object",
    properties: {
      paper: { type: "integer", enum: [1, 2, 3], description: "1 whites, 2 reds, 3 mixed/special." },
      kind: { type: "string", enum: ["tree", "diagram"], description: "Default 'tree'." },
      search: { type: "string", description: "Return only sections mentioning this term." },
    },
    required: ["paper"],
  },
  async run(_ctx, input) {
    const paper = typeof input.paper === "number" ? input.paper : 1;
    const kind = input.kind === "diagram" ? "diagram" : "tree";
    const text = kind === "diagram" ? studyDiagramForPaper(paper) : masterTreeForPaper(paper);
    if (!text) return { error: `No ${kind} available for paper ${paper}.` };

    const search = typeof input.search === "string" ? input.search.trim().toLowerCase() : null;
    if (!search) return { paper, kind, text };

    const sections = text.split(/\n(?=##\s)/);
    const hits = sections.filter((s) => s.toLowerCase().includes(search));
    return {
      paper,
      kind,
      sectionsMatched: hits.length,
      text: hits.length ? hits.join("\n\n") : text,
      note: hits.length ? undefined : "No section mentioned that term; returning the whole document.",
    };
  },
};

export const queryMyPerformance: CoachTool = {
  name: "query_my_performance",
  kind: "read",
  description:
    "The candidate's own study record: pass/borderline/fail rates overall and by paper and question " +
    "family, plus the examiner-style feedback text from their recent graded attempts. " +
    "IMPORTANT LIMIT — there are no numeric marks stored. `marks_estimate` is null on essentially " +
    "every attempt, so you CANNOT compute an average mark, plot a trend, or say whether they are " +
    "improving numerically. Say so plainly if asked; do not substitute an impression for data. " +
    "What you CAN do is report the pass/fail split, compare families, and quote recurring themes from " +
    "their feedback text.",
  inputSchema: {
    type: "object",
    properties: {
      includeFeedbackText: {
        type: "boolean",
        description: "Include the grader's feedback prose from recent attempts. Default true.",
      },
      limit: { type: "integer", description: "How many recent attempts of feedback prose. Default 8, max 20." },
    },
  },
  async run(ctx, input) {
    const sql = neon(process.env.DATABASE_URL!);
    const userId = ctx.userId;
    const limit = Math.min(20, Math.max(1, typeof input.limit === "number" ? input.limit : 8));
    const includeText = input.includeFeedbackText !== false;

    // Feedback-tab rows live in user_attempts too (migration 053) with mode='full' and no question.
    // They are not attempts at anything, so they are excluded here — counting them would deflate the
    // pass rate by adding denominators that can never carry a pass_estimate.
    //
    // Written out inline rather than composed: the neon HTTP driver's tagged template does not
    // support nesting a fragment the way Prisma.sql does (see the porting note at the top of
    // src/lib/knowledge/retrieve.ts), so an interpolated sub-template would be passed as a
    // parameter, not as SQL.
    const [totals, byFamily, recent] = await Promise.all([
      sql`
        /* theory-mode-guard: all-modes -- the Coach reports across every study mode */
        SELECT
          COUNT(*)::int AS attempts,
          COUNT(completed_at)::int AS completed,
          COUNT(*) FILTER (WHERE pass_estimate = 'pass')::int AS pass,
          COUNT(*) FILTER (WHERE pass_estimate = 'borderline')::int AS borderline,
          COUNT(*) FILTER (WHERE pass_estimate = 'fail')::int AS fail,
          COUNT(marks_estimate)::int AS with_numeric_marks
        FROM user_attempts
        WHERE user_id = ${userId} AND (mode IS NULL OR mode = 'full')
          AND (source IS NULL OR source <> 'feedback_tab')
          AND (scope IS NULL OR scope <> 'general')`,
      sql`
        /* theory-mode-guard: all-modes -- deliberate. The Coach's family breakdown should reflect
           every PRACTICAL rep the candidate has done (full question, stem-only, dry notes, flash),
           because "where am I weakest" is a question about all of their practice, not just the
           scored full reps. Theory cannot enter this aggregate regardless: theory attempts carry
           theory_question_id and no question_id, so the JOIN below drops them. */
        SELECT q.paper, q.family, q.family_label,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE a.pass_estimate = 'pass')::int AS pass,
               COUNT(*) FILTER (WHERE a.pass_estimate = 'borderline')::int AS borderline,
               COUNT(*) FILTER (WHERE a.pass_estimate = 'fail')::int AS fail
        FROM user_attempts a
        JOIN generated_questions q ON a.question_id = q.question_id
        WHERE a.user_id = ${userId} AND a.completed_at IS NOT NULL
        GROUP BY q.paper, q.family, q.family_label
        ORDER BY total DESC`,
      includeText
        ? sql`
            /* theory-mode-guard: all-modes -- deliberate. Recurring themes in a candidate's grader
               feedback are worth surfacing whether they came from a practical debrief or a theory
               essay; the LEFT JOIN keeps theory rows (null paper/family) rather than dropping them. */
            SELECT a.completed_at, q.paper, q.family_label, a.pass_estimate, a.answer_feedback
            FROM user_attempts a
            LEFT JOIN generated_questions q ON a.question_id = q.question_id
            WHERE a.user_id = ${userId} AND a.answer_feedback IS NOT NULL
            ORDER BY a.completed_at DESC NULLS LAST
            LIMIT ${limit}`
        : Promise.resolve([]),
    ]);

    const t = (totals as Record<string, number>[])[0] || {};
    return {
      totals: t,
      byPaperAndFamily: byFamily,
      recentFeedback: recent,
      dataLimits:
        "No numeric mark series exists — marks_estimate is unpopulated on essentially all attempts. " +
        "Report pass/borderline/fail proportions and themes from the feedback text. Do not assert a " +
        "mark average, a trend, or 'you are improving' as if measured.",
    };
  },
};

export const searchWinemakingScience: CoachTool = {
  name: "search_winemaking_science",
  kind: "read",
  description:
    "Search a technical corpus of viticulture, enology and appellation law from research institutes " +
    "and regulatory bodies (AWRI, INAO cahiers des charges, Union des Maisons de Champagne, Consejo " +
    "Regulador del Jerez, IVDP, IVES, university extension programmes). " +
    "Use ONLY for how wine is made or how an appellation's rules work — fermentation, lees, oxidation, " +
    "flor, botrytis, pressing, permitted yields and varieties. " +
    "This corpus contains NOTHING about the MW exam: no past papers, no examiner commentary, no " +
    "question precedent. Never use it to answer what has appeared in an exam (query_corpus) or what " +
    "examiners reward (query_examiner_thinking).",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "A production-technique question in natural language." },
      topK: { type: "integer", description: "Passages to return. Default 6, max 10." },
    },
    required: ["query"],
  },
  async run(_ctx, input) {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    if (!query) return { error: "query is required." };
    const topK = Math.min(10, Math.max(1, typeof input.topK === "number" ? input.topK : 6));

    try {
      const passages = await retrieveKnowledge({ query, topK });
      return {
        matched: passages.length,
        passages: passages.map((p) => ({
          publisher: p.publisher,
          title: p.canonicalTitle,
          url: p.canonicalUrl,
          section: p.sectionPath,
          language: p.language,
          // The distinction matters: 'last-modified' is when a page was TOUCHED, not published, so
          // it must never be presented to the candidate as the age of the science.
          publishedAt: p.publishedAt,
          dateSource: p.dateSource,
          text: p.text,
        })),
      };
    } catch (err) {
      // VOYAGE_API_KEY absent, or the corpus is unreachable. Degrade to an honest "unavailable" —
      // the model must not fall back to its own recall and present it as a sourced retrieval.
      console.error("[coach] knowledge retrieval failed:", err);
      return { error: "The technical corpus is unavailable right now. Say so rather than answering from memory." };
    }
  },
};
