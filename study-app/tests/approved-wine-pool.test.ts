import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { buildApprovedPoolBlock, type WinePool } from "@/lib/approved-wine-pool";

/**
 * Wine selection is the dominant defect in the generated bank, and it is NOT distributional.
 *
 * Measured against the 160 real past papers: the bank matches the exam on Old/New World mix (P1 64/36
 * vs 63/37), is MORE anchored than the exam (P1 four-wine flights with no anchor: 0% vs 7%), and its
 * most-concentrated variety×region is 1.74% of slots against the corpus's own maximum of 3.1%.
 * Repetition does not explain it either — a repeated region inside the reviewer's last five cards
 * moved his reject rate from 39.2% to 39.8%.
 *
 * What he rejects is wine KNOWLEDGE, and fifteen rules written from individual rejections produced no
 * improvement (34% → 42% across 497 votes) because each over-fits. The pool reuses his verdicts
 * instead: 861 wines that appeared in flights he passed.
 */

const pool = (over: Partial<WinePool> = {}): WinePool => ({
  paper: 1,
  wines: [
    { label: "Dr Loosen, Wehlener Sonnenuhr Riesling Kabinett. Mosel, Germany.", endorsements: 4, usage: 1 },
    { label: "Knappstein, Hand Picked Riesling. Clare Valley, Australia.", endorsements: 3, usage: 0 },
  ],
  rejected: [],
  ...over,
});

describe("buildApprovedPoolBlock", () => {
  it("is a PREFERENCE, never a closed universe", () => {
    // The pool cannot always satisfy a stem: a same-variety flight over four countries needs four
    // wines of one grape, and P3's rosé pool is FIVE wines in total. Forbidding anything outside it
    // would make those unsatisfiable — the failure mode that deleted hist_2023_p3_q1 when an anchor
    // rule could not be met.
    const text = buildApprovedPoolBlock(pool());
    expect(text).toMatch(/prefer these/i);
    expect(text).toMatch(/Reach outside it only when the stem cannot be satisfied/i);
    expect(text).not.toMatch(/only use|must not use any other|exclusively/i);
  });

  it("tells the model what an outside wine has to clear", () => {
    // "Go outside the list" without a standard is how the obscure-producer problem comes back.
    expect(buildApprovedPoolBlock(pool())).toMatch(/same calibre[\s\S]{0,200}genuinely classic/i);
  });

  it("lists the wines", () => {
    const text = buildApprovedPoolBlock(pool());
    expect(text).toContain("Dr Loosen, Wehlener Sonnenuhr Riesling Kabinett. Mosel, Germany.");
    expect(text).toContain("Knappstein, Hand Picked Riesling. Clare Valley, Australia.");
  });

  it("says nothing at all when the pool is empty", () => {
    // A paper nobody has reviewed must generate exactly as it did before.
    expect(buildApprovedPoolBlock(pool({ wines: [] }))).toBe("");
  });

  it("carries the named rejections as a hard never", () => {
    const text = buildApprovedPoolBlock(pool({ rejected: ["Rockford, Black Shiraz, NV. Barossa Valley, Australia."] }));
    expect(text).toMatch(/NEVER use these/);
    expect(text).toContain("Rockford, Black Shiraz");
  });

  it("truncates to the best-attested wines and says how many it dropped", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ label: `Wine ${i}. Region, France.`, endorsements: 40 - i, usage: 0 }));
    const text = buildApprovedPoolBlock(pool({ wines: many }), 10);
    expect(text).toContain("Wine 0.");
    expect(text).not.toContain("Wine 39.");
    expect(text).toMatch(/30 more approved wines not listed/);
  });
});

describe("the pool's evidence rules", () => {
  const src = readFileSync(join(__dirname, "..", "src", "lib", "approved-wine-pool.ts"), "utf-8");

  it("does NOT blocklist every wine in a down-voted flight", () => {
    // Measured: only 1.5% of wines in down-voted flights (9 of 593) are named in the reviewer's note.
    // The rest are bystanders in a flight rejected for its marks, its stem, or one bad bottle among
    // four. Condemning them would discard mostly-innocent wines on guilt by association.
    expect(src).toMatch(/position\(lower\(btrim\(split_part\(w->>'fullText', ',', 1\)\)\) in lower\(qr\.reason_note\)\)/);
  });

  it("lets an explicit rejection beat an implicit approval", () => {
    // A wine can sit in an up-voted flight AND be named in another rejection. The named verdict wins.
    expect(src).toMatch(/rejectedSet\.has\(r\.label\.toLowerCase\(\)\)/);
  });

  it("scopes the pool by paper", () => {
    // A sweet Tokaji approved in a Paper 3 flight is not thereby approved for Paper 1.
    expect(src).toMatch(/g\.paper = \$\{paper\}/);
  });
});

describe("generation wiring", () => {
  const engine = readFileSync(join(__dirname, "..", "src", "lib", "question-engine.ts"), "utf-8");

  // Anchored on the CALL SITES, not on the identifiers: both names also appear in the import block at
  // the top of the file, and matching those compares the order of two imports rather than the order
  // the prompt is actually assembled in.
  const exclusionAt = engine.indexOf("prompt.system += buildProducerExclusionBlock");
  const poolAt = engine.indexOf("prompt.system += buildApprovedPoolBlock");

  it("appends the pool AFTER the exclusions", () => {
    // Prohibitions before preferences, so a pool wine whose producer is currently excluded stays
    // excluded rather than being re-permitted by the shortlist.
    expect(exclusionAt).toBeGreaterThan(-1);
    expect(poolAt).toBeGreaterThan(exclusionAt);
  });

  it("degrades to previous behaviour if the pool cannot be read", () => {
    // The pool is thin in places (P3 rosé is five wines) and a data outage must not stop generation.
    expect(engine.slice(poolAt - 800, poolAt + 800)).toMatch(/catch \(poolErr\)/);
  });
});

describe("remediation gets the pool too", () => {
  // question-engine appends the pool inside generateFreshQuestion; remediate-questions.mjs assembles
  // its OWN prompt and would silently have missed it — the same drift that left this script running
  // Opus while the bank was built on Sonnet, and generating without the producer ban.
  //
  // It matters most here. Measured over 497 reviewer votes, questions this script regenerated were
  // rejected 42.0% of the time against 35.9% for the originals they replaced: regeneration has been
  // making the bank slightly worse, and wine choice is the reason.
  const script = readFileSync(join(__dirname, "..", "scripts", "remediate-questions.mjs"), "utf-8");

  it("appends the approved pool", () => {
    expect(script).toMatch(/prompt\.system \+= buildApprovedPoolBlock\(pool\)/);
  });

  it("appends it after the producer exclusion, as the engine does", () => {
    expect(script.indexOf("buildProducerExclusionBlock(excluded")).toBeLessThan(
      script.indexOf("buildApprovedPoolBlock(pool)")
    );
  });
});

describe("the pool must not become a repetition engine", () => {
  // The first version sliced the top N by endorsement count, handing the model the SAME most-endorsed
  // wines on every call — a repetition engine wearing a quality label, and exactly the "we keep seeing
  // the same question" the reviewer has raised eight times. The pool's value is the examiner's
  // approval; its risk is convergence onto whatever is already in it.
  const wines = [
    { label: "Penfolds, Grange. Barossa, Australia.", endorsements: 9, usage: 12 },
    { label: "Torbreck, The Laird. Barossa, Australia.", endorsements: 2, usage: 0 },
    { label: "Henschke, Hill of Grace. Eden Valley, Australia.", endorsements: 3, usage: 1 },
    { label: "Clarendon Hills, Astralis. McLaren Vale, Australia.", endorsements: 1, usage: 0 },
  ];

  it("offers the LEAST-used approved wines first, not the most-endorsed", () => {
    const text = buildApprovedPoolBlock(pool({ wines }), 2);
    // Torbreck and Clarendon Hills are unused; Penfolds is the most endorsed AND the most poured.
    expect(text).toContain("Torbreck, The Laird");
    expect(text).toContain("Clarendon Hills, Astralis");
  });

  it("moves an over-poured wine out of the offer list and asks for a peer", () => {
    const text = buildApprovedPoolBlock(pool({ wines }));
    const offerAt = text.indexOf("Penfolds, Grange");
    expect(text).toMatch(/use a PEER, not these/i);
    // It appears only in the peer section, with its usage named — never as something to reach for.
    expect(text).toMatch(/Penfolds, Grange[^\n]*already in 12 questions/);
    expect(text.slice(0, offerAt)).toMatch(/use a PEER, not these/i);
  });

  it("defines a peer as same class, different producer — not merely 'something else'", () => {
    // "Vary the wines" without a standard is how the obscure-producer problem returns.
    const text = buildApprovedPoolBlock(pool({ wines }));
    expect(text).toMatch(/same region and style, comparable quality and price tier, different producer/i);
  });

  it("tells the model the list rotates, so it does not read it as the whole pool", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ label: `Wine ${i}. Region, France.`, endorsements: 1, usage: 0 }));
    expect(buildApprovedPoolBlock(pool({ wines: many }), 5)).toMatch(/the list rotates/i);
  });
});
