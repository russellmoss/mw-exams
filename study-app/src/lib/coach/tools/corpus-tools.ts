// Precedent and examiner-voice tools — the two that answer "what does the IMW actually do?".
//
// Both are deterministic filters over bundled data. Neither calls a model. That is the point: a
// question like "has Paper 1 single-variety ever been all Semillon?" is a claim about the absence of
// something across a complete 162-question set, and only an exhaustive scan can answer it honestly.

import type { CoachTool } from "../types";
import {
  historicalQuestions,
  loadPracticalCorpus,
  loadTheoryRubrics,
  normalize,
  type CorpusQuestion,
} from "../corpus";

/** Trim a flight down to what a precedent answer needs, so 40 matches don't blow the turn budget. */
function summarize(q: CorpusQuestion) {
  return {
    id: q.id,
    year: q.year,
    paper: q.paper,
    question: q.questionNumber,
    family: q.family,
    familyLabel: q.familyLabel,
    subcategory: q.subcategory,
    totalMarks: q.totalMarks,
    wines: q.wines.map((w) => w.fullText),
  };
}

export const queryCorpus: CoachTool = {
  name: "query_corpus",
  kind: "read",
  description:
    "Search the REAL past IMW practical papers (162 questions, 2011-2025) by paper, year, family, " +
    "or by text appearing in the wine list. Use this for any question about precedent or frequency — " +
    "what the examiners have actually set, how often, and in what combination. This is the ONLY tool " +
    "that can support a claim that something has or has not appeared in a real exam; it scans the " +
    "complete set, so a zero result genuinely means 'never', not 'not found'. " +
    "Do NOT use it for winemaking technique (use search_winemaking_science) or for what examiners " +
    "reward in an answer (use query_examiner_thinking). Generated practice questions are excluded — " +
    "only real papers count as precedent.",
  inputSchema: {
    type: "object",
    properties: {
      paper: { type: "integer", enum: [1, 2, 3], description: "1 = whites, 2 = reds, 3 = mixed/special." },
      family: {
        type: "string",
        description:
          "Question family code: F1 Same Variety, F2 Same Origin, F3 Blend Logic, F4 Mixed Breadth, " +
          "F5 Method/Production, F6 Style Mechanism, F7 Quality Hierarchy.",
      },
      yearFrom: { type: "integer" },
      yearTo: { type: "integer" },
      wineText: {
        type: "string",
        description:
          "Substring matched against every wine label in the flight, accent- and case-insensitive. " +
          "e.g. 'semillon', 'chablis', 'barossa'.",
      },
      limit: { type: "integer", description: "Max flights to return. Default 12, max 40." },
    },
  },
  async run(_ctx, input) {
    const paper = typeof input.paper === "number" ? input.paper : null;
    const family = typeof input.family === "string" ? input.family.toUpperCase() : null;
    const yearFrom = typeof input.yearFrom === "number" ? input.yearFrom : null;
    const yearTo = typeof input.yearTo === "number" ? input.yearTo : null;
    const wineText = typeof input.wineText === "string" ? normalize(input.wineText.trim()) : null;
    const limit = Math.min(40, Math.max(1, typeof input.limit === "number" ? input.limit : 12));

    const all = historicalQuestions();
    const matches = all.filter((q) => {
      if (paper !== null && q.paper !== paper) return false;
      if (family && (q.family || "").toUpperCase() !== family) return false;
      if (yearFrom !== null && q.year < yearFrom) return false;
      if (yearTo !== null && q.year > yearTo) return false;
      if (wineText) {
        const hit = q.wines.some((w) => normalize(w.fullText).includes(wineText));
        if (!hit) return false;
      }
      return true;
    });

    // `scanned` and `matched` are returned so the model can say "0 of 18 P1 single-variety flights"
    // rather than the much weaker "I didn't find any". The denominator is what makes an absence
    // claim credible, and without it the model tends to hedge a genuinely certain answer.
    return {
      scanned: all.length,
      matchedAfterFilters: matches.length,
      corpusYears: "2011-2025 (no 2020 exam)",
      returned: matches.slice(0, limit).map(summarize),
      truncated: matches.length > limit,
    };
  },
};

export const queryExaminerThinking: CoachTool = {
  name: "query_examiner_thinking",
  kind: "read",
  description:
    "Retrieve what the IMW examiners themselves said, in their own words. Two sources: a synthesis of " +
    "8 practical + 5 chief examiners' reports (2017-2025) covering mark allocation, the recurring " +
    "cardinal rules, and quoted examiner commentary; and the per-question theory rubrics (243 " +
    "questions, 2016-2025) carrying verbatim quotes on what earned and lost marks. " +
    "Use this for 'how do the examiners think', 'what are they looking for', 'why did this lose marks', " +
    "or any question about how answers are judged. Always quote the examiners rather than paraphrasing. " +
    "Do NOT use it for what wines have appeared (use query_corpus).",
  inputSchema: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["practical", "theory"],
        description: "'practical' returns the cross-report synthesis; 'theory' returns per-question rubrics.",
      },
      search: {
        type: "string",
        description:
          "For theory: matched against question text, command word, credit/penalty signals. " +
          "For practical: matched against the synthesis, returning the sections that mention it.",
      },
      year: { type: "integer", description: "Theory only." },
      paper: { type: "integer", description: "Theory only: 1 viticulture, 2 vinification, 3 handling, 4 business, 5 contemporary." },
      limit: { type: "integer", description: "Theory only. Default 4, max 10." },
    },
    required: ["scope"],
  },
  async run(_ctx, input) {
    const scope = input.scope === "theory" ? "theory" : "practical";

    if (scope === "practical") {
      const rubric = loadPracticalCorpus().examinerRubric;
      if (!rubric) return { error: "The practical examiner synthesis is unavailable." };
      const search = typeof input.search === "string" ? normalize(input.search.trim()) : null;
      if (!search) return { source: "8 practical + 5 chief examiners' reports, 2017-2025", text: rubric };
      // Section-level slice: the synthesis is markdown with `## n. Heading` sections, and returning
      // the two or three that mention the term beats returning 14KB every time.
      const sections = rubric.split(/\n(?=##\s)/);
      const hits = sections.filter((s) => normalize(s).includes(search));
      return {
        source: "8 practical + 5 chief examiners' reports, 2017-2025",
        sectionsMatched: hits.length,
        text: hits.length ? hits.join("\n\n") : rubric,
        note: hits.length ? undefined : "No section mentioned that term; returning the full synthesis.",
      };
    }

    const search = typeof input.search === "string" ? normalize(input.search.trim()) : null;
    const year = typeof input.year === "number" ? input.year : null;
    const paper = typeof input.paper === "number" ? input.paper : null;
    const limit = Math.min(10, Math.max(1, typeof input.limit === "number" ? input.limit : 4));

    const all = loadTheoryRubrics();
    const matches = all.filter((r) => {
      if (year !== null && r.year !== year) return false;
      if (paper !== null && r.paper !== paper) return false;
      if (!search) return true;
      const hay = normalize(
        [
          r.questionText,
          r.commandWord ?? "",
          r.commandWordDemand ?? "",
          r.performanceNote ?? "",
          ...(r.creditSignals || []).map((c) => `${c.signal} ${c.quote}`),
          ...(r.penaltySignals || []).map((c) => `${c.signal} ${c.quote}`),
          ...(r.coreRequirements || []).map((c) => `${c.element} ${c.quote}`),
        ].join(" ")
      );
      return hay.includes(search);
    });

    return {
      source: "IMW examiners' reports, per-question rubrics",
      matched: matches.length,
      coverage: `${all.length} of 297 theory questions have examiner-derived rubrics (2016-2019, 2021-2025)`,
      returned: matches.slice(0, limit).map((r) => ({
        id: r.id,
        year: r.year,
        paper: r.paper,
        paperTitle: r.paperTitle,
        questionText: r.questionText,
        commandWord: r.commandWord,
        commandWordDemand: r.commandWordDemand,
        coreRequirements: r.coreRequirements,
        creditSignals: r.creditSignals,
        penaltySignals: r.penaltySignals,
        scopeTraps: r.scopeTraps,
        performanceNote: r.performanceNote,
        evidenceQuality: r.evidenceQuality,
        // Passed through so the model can caveat a transcribed quote. 2021 and 2022 reports were
        // image-only PDFs transcribed from page renders — the quote gate proves a quote matches the
        // TRANSCRIPTION, not that the transcription matches the printed report.
        textSource: r.textSource,
      })),
    };
  },
};
