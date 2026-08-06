import { describe, expect, it, vi } from "vitest";
import { getTheoryRubric, type TheoryRubric } from "@/lib/theory/rubric";
import {
  buildTheoryRetrievalPlan,
  getTheoryRetrieval,
  type TheoryRetrievalDeps,
  type TheoryRetrievalResult,
  type TheorySourcePassage,
} from "@/lib/theory/retrieval";
import type { RetrievedPassage } from "@/lib/knowledge/retrieve";

const kbFixture: RetrievedPassage = {
  chunkId: "chunk-1",
  documentId: "doc-1",
  publisher: "AWRI",
  tier: 1,
  canonicalUrl: "https://www.awri.com.au/example",
  canonicalTitle: "Technical reference",
  publishedAt: new Date("2025-01-01T00:00:00Z"),
  dateSource: "published",
  sectionPath: "SO2",
  language: "en",
  topic: "stabilisation",
  isRegionalPractice: false,
  text: "A tier-1 passage that contradicts or adjudicates a candidate claim.",
};
const webFixture: TheorySourcePassage = {
  kind: "web",
  publisher: "oiv.int",
  title: "State of the sector",
  url: "https://www.oiv.int/example",
  publishedAt: "2026-04-01",
  tier: 1,
  text: "Current market evidence.",
};

function deps(overrides: Partial<TheoryRetrievalDeps> = {}): TheoryRetrievalDeps {
  return {
    retrieveKb: vi.fn(async () => [kbFixture]),
    searchWeb: vi.fn(async () => [webFixture]),
    cacheGet: vi.fn(async () => null),
    cachePut: vi.fn(async () => undefined),
    now: () => new Date("2026-08-06T12:00:00Z"),
    ...overrides,
  };
}

describe("Theory retrieval gate", () => {
  it("routes a Paper 3 SO2/bottling question to the KB", async () => {
    const rubric = getTheoryRubric("th_2016_p3_q2")!;
    const d = deps();
    const result = await getTheoryRetrieval(rubric, {}, d);
    expect(result.route).toBe("kb");
    expect(result.status).toBe("available");
    expect(d.retrieveKb).toHaveBeenCalledOnce();
  });

  it("drops non-tier-1 KB passages instead of presenting them as authoritative evidence", async () => {
    const rubric = getTheoryRubric("th_2016_p3_q2")!;
    const d = deps({
      retrieveKb: vi.fn(async () => [{ ...kbFixture, tier: 2 }]),
    });
    const result = await getTheoryRetrieval(rubric, {}, d);
    expect(result.status).toBe("unavailable");
    expect(result.factualChecking).toBe("abstain");
    expect(result.passages).toEqual([]);
  });

  it("routes a Paper 4 Prosecco/rosé market question to web and never touches the KB", async () => {
    const rubric = getTheoryRubric("th_2024_p4_q1")!;
    const d = deps();
    const result = await getTheoryRetrieval(rubric, { tavilyKey: "tvly-test" }, d);
    expect(result.route).toBe("web");
    expect(d.searchWeb).toHaveBeenCalledOnce();
    expect(d.retrieveKb).not.toHaveBeenCalled();
  });

  it("routes an appellation-law question to the KB even when it sits in Paper 1", () => {
    const base = getTheoryRubric("th_2017_p1_q1")!;
    const rubric = {
      ...base,
      questionText: "What are Barolo's permitted varieties, yield limits and ageing minimum?",
      coreRequirements: [
        {
          element: "State the Barolo DOCG rules",
          quote: "fixture",
          temporalClass: "evergreen",
          temporalRationale: "fixture",
          temporalSource: null,
        },
      ],
      differentiators: [],
      creditSignals: [],
    } satisfies TheoryRubric;
    expect(buildTheoryRetrievalPlan(rubric).route).toBe("kb");
  });

  it("abstains on textbook vine-temperature physiology rather than retrieving irrelevant trials", async () => {
    const rubric = getTheoryRubric("th_2017_p1_q1")!;
    const d = deps();
    const result = await getTheoryRetrieval(rubric, {}, d);
    expect(result.route).toBe("none");
    expect(result.factualChecking).toBe("abstain");
    expect(d.retrieveKb).not.toHaveBeenCalled();
  });

  it("states that web fact-checking abstained when the user has no Tavily key", async () => {
    const rubric = getTheoryRubric("th_2024_p4_q1")!;
    const d = deps();
    const result = await getTheoryRetrieval(rubric, { tavilyKey: null }, d);
    expect(result.status).toBe("unavailable");
    expect(result.notice).toMatch(/No Tavily key.*abstained/i);
    expect(d.searchWeb).not.toHaveBeenCalled();
  });

  it("states a retrieval error when the per-user Tavily key lookup fails", async () => {
    const rubric = getTheoryRubric("th_2024_p4_q1")!;
    const d = deps();
    const result = await getTheoryRetrieval(rubric, { tavilyKeyError: "database unavailable" }, d);
    expect(result.status).toBe("error");
    expect(result.notice).toMatch(/key lookup failed.*abstained/i);
    expect(d.searchWeb).not.toHaveBeenCalled();
  });

  it("uses the question/date cache and makes no second retrieval call", async () => {
    const rubric = getTheoryRubric("th_2016_p3_q2")!;
    const memory = new Map<string, TheoryRetrievalResult>();
    const retrieveKb = vi.fn(async () => [kbFixture]);
    const d = deps({
      retrieveKb,
      cacheGet: vi.fn(async (id, bucket) => memory.get(`${id}:${bucket}`) ?? null),
      cachePut: vi.fn(async (result) => {
        memory.set(`${result.questionId}:${result.dateBucket}`, result);
      }),
    });
    const first = await getTheoryRetrieval(rubric, {}, d);
    const second = await getTheoryRetrieval(rubric, {}, d);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(retrieveKb).toHaveBeenCalledOnce();
  });
});
