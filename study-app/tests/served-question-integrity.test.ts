// served-question-integrity.test.ts — the reveal/serving surfaces must be provably reading ONE keyed
// question record (recurring fault cluster, cross-paper: fb_344, fb_185, fb_161).
//
// Three accepted feedbacks describe the same divergence:
//   • fb_344 — the stem shown at reveal differed from the stem shown at stem analysis ("this question
//     says the same single variety, which the previous screen did not show"): a surface re-derived the
//     stem instead of reading the stored record.
//   • fb_185 — "it only displayed 1 wine of the three": the served flight silently truncated.
//   • fb_161 — the reveal showed pictures of regions/wines that were not in the correct answer.
//
// assertServedQuestionIntegrity() is called at every phase transition (stem → answer → reveal):
//   Check 1 — the stem/sub-part/mark-table hash must be byte-equal across the three phases.
//   Check 2 — the rendered wine array length must equal the wine count the stem/multiplier declares.
//   Check 3 — reveal media must reference an answer wine's producer/region/appellation; drop the rest.
import { describe, it, expect } from "vitest";
import {
  assertServedQuestionIntegrity,
  computeServedStemHash,
  filterRevealMedia,
  ServedQuestionIntegrityError,
  type ServedQuestionPayload,
} from "../src/lib/question-validator";

// A well-formed two-wine flight (fb_344's shape: a same-variety pair from different countries).
const TWO_WINE_TEXT = `Wines 1 and 2 are made from the same single grape variety and are from different countries.
a) Identify the grape variety and region of origin as closely as possible. (2 x 10 marks)
b) Comment on the style of each wine. (2 x 15 marks)`;

const twoWinePayload = (): ServedQuestionPayload => ({
  questionId: "q1",
  paper: 2,
  questionText: TWO_WINE_TEXT,
  wines: [
    { slot: 1, region: "Loire", country: "France", fullText: "Domaine A, Sancerre, Loire, France" },
    { slot: 2, region: "Mosel", country: "Germany", fullText: "Weingut B, Mosel, Germany" },
  ],
});

describe("Check 1 — stem-hash byte equality across the three phases (fb_344)", () => {
  it("the same question text hashes identically at stem, answer and reveal", () => {
    const stem = assertServedQuestionIntegrity("stem", twoWinePayload());
    const answer = assertServedQuestionIntegrity("answer", twoWinePayload(), stem.stemHash);
    const reveal = assertServedQuestionIntegrity("reveal", twoWinePayload(), stem.stemHash);
    // Snapshot: one record, one hash, at every surface.
    expect(answer.stemHash).toBe(stem.stemHash);
    expect(reveal.stemHash).toBe(stem.stemHash);
    expect(computeServedStemHash(TWO_WINE_TEXT)).toBe(stem.stemHash);
  });

  it("throws with the phase and field when a surface re-derives a different stem", () => {
    const stem = assertServedQuestionIntegrity("stem", twoWinePayload());
    // fb_344: the reveal stem gained 'the same single variety' the analysis stem did not carry.
    const reworded = twoWinePayload();
    reworded.questionText = reworded.questionText.replace(
      "the same single grape variety",
      "the same single variety"
    );
    let err: unknown;
    try {
      assertServedQuestionIntegrity("reveal", reworded, stem.stemHash);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ServedQuestionIntegrityError);
    expect((err as ServedQuestionIntegrityError).phase).toBe("reveal");
    expect((err as ServedQuestionIntegrityError).field).toBe("stem-hash");
  });

  it("does not throw on the first serve when no prior hash is supplied", () => {
    expect(() => assertServedQuestionIntegrity("stem", twoWinePayload())).not.toThrow();
  });
});

describe("Check 2 — rendered wine count must equal the declared count (fb_185)", () => {
  it("a stem declaring three wines rendered with a one-wine array is a hard fail", () => {
    const payload: ServedQuestionPayload = {
      questionId: "q2",
      paper: 1,
      questionText: `Wines 1 to 3 are single-variety wines from different countries.
a) Identify the grape variety and the origin as closely as possible. (3 x 8 marks)
b) Comment on the style of each wine. (3 x 8 marks)`,
      // fb_185: "it only displayed 1 wine of the three".
      wines: [{ slot: 1, region: "Chablis", country: "France", fullText: "Domaine C, Chablis, France" }],
    };
    let err: unknown;
    try {
      assertServedQuestionIntegrity("reveal", payload);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ServedQuestionIntegrityError);
    expect((err as ServedQuestionIntegrityError).field).toBe("wine-count");
    expect((err as ServedQuestionIntegrityError).message).toMatch(/declares 3 wines .* rendered 1/);
  });

  it("accepts the flight when the rendered count matches the declared count", () => {
    expect(() => assertServedQuestionIntegrity("reveal", twoWinePayload())).not.toThrow();
  });

  it("falls back to an N x M marks multiplier when the stem states no count", () => {
    const payload: ServedQuestionPayload = {
      questionId: "q3",
      paper: 3,
      questionText: `For each wine:
a) Identify the origin as closely as possible. (3 x 8 marks)`,
      wines: [{ slot: 1, fullText: "A" }], // multiplier implies 3, only 1 rendered
    };
    expect(() => assertServedQuestionIntegrity("reveal", payload)).toThrow(ServedQuestionIntegrityError);
  });

  it("skips the count check when neither the stem nor the marks declare a count", () => {
    const payload: ServedQuestionPayload = {
      questionId: "q4",
      paper: 3,
      questionText: `The flight below shows several wines.
a) Comment on the style. (25 marks)`,
      wines: [{ slot: 1, fullText: "A" }],
    };
    expect(() => assertServedQuestionIntegrity("reveal", payload)).not.toThrow();
  });
});

describe("Check 3 — reveal media must be about the answer wines (fb_161)", () => {
  const wines: ServedQuestionPayload["wines"] = [
    { slot: 1, region: "Loire", country: "France" },
    { slot: 2, region: "Mosel", country: "Germany" },
  ];

  it("drops an image tagged 'Barossa' from a Loire/Mosel reveal", () => {
    const media = [
      { tag: "Loire", caption: "Sancerre vineyards, Loire" },
      { tag: "Barossa", caption: "Barossa Valley, South Australia" },
      { tag: "Mosel", caption: "Steep Mosel slopes" },
    ];
    const kept = filterRevealMedia(media, wines);
    const tags = kept.map((m) => m.tag);
    expect(tags).toContain("Loire");
    expect(tags).toContain("Mosel");
    expect(tags).not.toContain("Barossa");
  });

  it("assertServedQuestionIntegrity('reveal') returns the filtered media", () => {
    const payload: ServedQuestionPayload = {
      questionId: "q5",
      paper: 2,
      questionText: TWO_WINE_TEXT,
      wines,
      media: [
        { tag: "Loire" },
        { tag: "Barossa" },
      ],
    };
    const res = assertServedQuestionIntegrity("reveal", payload);
    expect(res.media.map((m) => m.tag)).toEqual(["Loire"]);
  });

  it("does not filter media before the reveal phase", () => {
    const payload: ServedQuestionPayload = {
      questionId: "q6",
      paper: 2,
      questionText: TWO_WINE_TEXT,
      wines,
      media: [{ tag: "Barossa" }],
    };
    // At stem/answer the media rides along untouched — filtering is a reveal-only repair.
    expect(assertServedQuestionIntegrity("stem", payload).media.map((m) => m.tag)).toEqual(["Barossa"]);
  });

  it("fails safe: keeps everything when no wine anchors can be resolved", () => {
    const media = [{ tag: "Barossa" }];
    expect(filterRevealMedia(media, [{ slot: 1 }])).toEqual(media);
  });
});
