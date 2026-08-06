import type { TheoryRetrievalResult } from "./retrieval";

export interface TheoryFactualDecision {
  claim: string;
  decision: "refuted" | "abstained" | "not_adjudicated";
  sourceUrls: string[];
  explanation: string;
}

export interface TheoryGradingMeta {
  verdict: "PASS" | "BORDERLINE" | "FAIL";
  retrievalStatus: "available" | "unavailable" | "error";
  factualDecisions: TheoryFactualDecision[];
}

export const THEORY_GRADING_META_INSTRUCTION = `## Machine-readable grading provenance (REQUIRED — emit LAST)
After all visible feedback, emit exactly one HTML comment in this form:
<!-- THEORY_GRADING_META {"verdict":"PASS|BORDERLINE|FAIL","retrievalStatus":"available|unavailable|error","factualDecisions":[{"claim":"candidate claim","decision":"refuted|abstained|not_adjudicated","sourceUrls":["https://..."],"explanation":"short reason"}]} -->

Record a factual decision only for a claim you discuss in **Factual check**. A refutation must name
the direct tier-1 source URL. When verification abstained, record one abstained decision explaining
the limitation. This comment is stored for audit and stripped from learner-visible feedback.`;

const META_RE = /<!--\s*THEORY_GRADING_META\s*(\{[\s\S]*?\})\s*-->/i;

export function extractTheoryGradingMeta(text: string): {
  meta: TheoryGradingMeta | null;
  cleanedText: string;
} {
  const match = META_RE.exec(text);
  let meta: TheoryGradingMeta | null = null;
  if (match) {
    try {
      const parsed = JSON.parse(match[1]) as TheoryGradingMeta;
      if (
        ["PASS", "BORDERLINE", "FAIL"].includes(parsed.verdict) &&
        ["available", "unavailable", "error"].includes(parsed.retrievalStatus) &&
        Array.isArray(parsed.factualDecisions)
      ) {
        meta = parsed;
      }
    } catch {
      // The full response is still useful; provenance records that metadata parsing failed.
    }
  }
  return { meta, cleanedText: text.replace(META_RE, "").trim() };
}

/** Hard audit gate: unsupported refutations or a hidden retrieval-status mismatch abort saving. */
export function assertTheoryGradingMeta(
  meta: TheoryGradingMeta | null,
  retrieval: TheoryRetrievalResult
): asserts meta is TheoryGradingMeta {
  if (!meta) throw new Error("Theory grader omitted valid machine-readable provenance");
  if (meta.retrievalStatus !== retrieval.status) {
    throw new Error(
      `Theory grader reported retrieval=${meta.retrievalStatus}; actual status was ${retrieval.status}`
    );
  }
  const retrievedUrls = new Set(retrieval.citations.map((citation) => citation.url));
  for (const [index, decision] of meta.factualDecisions.entries()) {
    if (
      !decision ||
      typeof decision.claim !== "string" ||
      typeof decision.explanation !== "string" ||
      !["refuted", "abstained", "not_adjudicated"].includes(decision.decision) ||
      !Array.isArray(decision.sourceUrls)
    ) {
      throw new Error(`Theory grader emitted malformed factual decision ${index}`);
    }
    if (decision.decision === "refuted") {
      if (retrieval.status !== "available" || decision.sourceUrls.length === 0) {
        throw new Error("Theory grader attempted a refutation while retrieval was abstaining");
      }
      if (decision.sourceUrls.some((url) => !retrievedUrls.has(url))) {
        throw new Error("Theory grader attempted a refutation with evidence it was not given");
      }
    }
  }
  if (
    retrieval.status !== "available" &&
    !meta.factualDecisions.some((decision) => decision.decision === "abstained")
  ) {
    throw new Error("Theory grader did not record the required factual abstention");
  }
}
