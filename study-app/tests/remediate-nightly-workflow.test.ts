import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * The review loop only ever subtracted until this workflow existed.
 *
 * A reviewer bins a question → the analysis accepts the critique → a rule ships → the corpus sweep
 * quarantines every other question carrying the same defect. All removal. 282 quarantined questions
 * were in a state nothing would ever bring back, while the servable pool shrank toward the point where
 * a reviewer starts seeing repeats. remediate-questions.mjs could always fix that and was never run.
 *
 * These tests guard the two things that make running it automatically safe: it is BOUNDED, and it
 * cannot run twice at once.
 */

const WF = join(__dirname, "..", "..", ".github", "workflows", "remediate-nightly.yml");

describe("remediate-nightly", () => {
  it("exists", () => {
    expect(existsSync(WF)).toBe(true);
  });

  const yml = () => readFileSync(WF, "utf-8");

  it("always passes an explicit --limit", () => {
    // The script's own default is Infinity. An unbounded scheduled run would regenerate the entire
    // quarantined backlog in one night — a generation, an enrichment, a key build and a model answer
    // apiece, retried until valid.
    expect(yml()).toMatch(/--limit="\$LIMIT"/);
    expect(yml()).toMatch(/LIMIT="\$\{\{ github\.event\.inputs\.limit \|\| '\d+' \}\}"/);
  });

  it("keeps the scheduled batch small", () => {
    // A number here is a nightly bill. Raising it is a pricing decision, not a tuning one.
    const fallback = Number(yml().match(/github\.event\.inputs\.limit \|\| '(\d+)'/)?.[1]);
    expect(fallback).toBeGreaterThan(0);
    expect(fallback).toBeLessThanOrEqual(10);
  });

  it("cannot run concurrently with itself", () => {
    // Both passes select the same quarantined rows; a second run would regenerate questions the first
    // is mid-way through replacing.
    expect(yml()).toMatch(/group:\s*remediate/);
    expect(yml()).toMatch(/cancel-in-progress:\s*false/);
  });

  it("has no ACTIVE schedule — unattended spending is suspended", () => {
    // Suspended 2026-08-10. Regenerations measured worse than the questions they replace (42.0% vs
    // 35.9% reject in #174; 44 of 45 rejected in the 2026-08-09/10 batch). Until a run beats its own
    // predecessors on the reviewer's votes, this is hand-run only. The cron line is kept commented so
    // restoring it is one edit — but a commented line is not a schedule, so strip comments first.
    const active = yml()
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .join("\n");
    expect(active).not.toMatch(/cron:/);
    expect(active).toMatch(/workflow_dispatch:/);
  });

  it("still runs after the audit whenever the schedule is restored", () => {
    // Guards the ordering constraint for the day someone uncomments the cron: remediation reads flags
    // that question-audit-daily sets, so it must run later in the day than the audit does.
    const remediate = yml().match(/cron:\s*"(\d+)\s+(\d+)/);
    const audit = readFileSync(join(__dirname, "..", "..", ".github", "workflows", "question-audit-daily.yml"), "utf-8")
      .match(/cron:\s*"(\d+)\s+(\d+)/);
    expect(remediate && audit).toBeTruthy();
    const mins = (m: RegExpMatchArray) => Number(m[2]) * 60 + Number(m[1]);
    expect(mins(remediate!)).toBeGreaterThan(mins(audit!));
  });

  it("regenerates into the review queue, never straight to a candidate", () => {
    // The row used to take the table default (status='approved' → review_state='kept'), so a
    // replacement was servable before anyone read it. That is how 77 unreviewed questions from a
    // 98%-rejected cohort ended up live. getEligibleBankedQuestions requires review_state='kept', so
    // 'pending' is what keeps them out while still listing them for review.
    const script = readFileSync(join(__dirname, "..", "scripts", "remediate-questions.mjs"), "utf-8");
    const save = script.match(/await saveGeneratedQuestion\(\{[\s\S]*?\}\);/);
    expect(save, "saveGeneratedQuestion call not found").toBeTruthy();
    expect(save![0]).toMatch(/status:\s*"pending"/);
  });

  it("invokes the script through ts-loader", () => {
    // It imports .ts modules with extensionless imports; plain node dies before doing any work.
    expect(yml()).toMatch(/--import \.\/scripts\/ts-loader\.mjs scripts\/remediate-questions\.mjs/);
  });

  it("tells the generator which producers are banned, like the engine does", () => {
    // The exclusion used to exist only as validateProducerExclusion REJECTING the finished draft, so
    // remediation kept drawing houses the reviewer has already banned — Domaine Weinbach twice in the
    // first live run — and paid a full generation AND the Tavily enrichment for each rejected attempt.
    // Cheap to prevent, and this is a scheduled job now.
    const script = readFileSync(join(__dirname, "..", "scripts", "remediate-questions.mjs"), "utf-8");
    expect(script).toMatch(/buildProducerExclusionBlock/);
    expect(script).toMatch(/buildGenerationProducerExclusion\(tally\.rows, recentProducers\)/);
    // Same helpers the engine calls, so the two paths cannot ban different sets.
    const engine = readFileSync(join(__dirname, "..", "src", "lib", "question-engine.ts"), "utf-8");
    expect(engine).toMatch(/buildGenerationProducerExclusion\(tally\.rows, recentProducers\)/);
  });

  it("has every key the pipeline needs", () => {
    // A missing TAVILY/VOYAGE key fails soft deep inside enrichment — the run would burn generations
    // and produce questions with no wine profiles, which the key builder then rejects.
    for (const secret of ["DATABASE_URL", "ANTHROPIC_API_KEY", "TAVILY_API_KEY", "VOYAGE_API_KEY"]) {
      expect(yml(), secret).toContain(`secrets.${secret}`);
    }
  });
});
