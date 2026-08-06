import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guard for the Hobby-plan cron limits.
 *
 * A sub-daily cron in vercel.json does NOT produce a failed build — Vercel rejects the deployment
 * at creation time (`cron_jobs_limits_reached`), so nothing appears in the deployments list at all
 * and git auto-deploy simply goes silent. That is exactly how "0 * * * *" on /api/cron/bank-worker
 * stalled every production deploy for four hours on 2026-08-03.
 *
 * `npm test` is a blocking gate in feature-build.yml, so failing here stops that class of change
 * before it lands on master.
 *
 * If the account moves to Pro, delete the schedule/count assertions — Pro allows 100 crons on any
 * schedule — but keep the "route exists" one.
 */

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type Cron = { path: string; schedule: string };
const config = JSON.parse(fs.readFileSync(path.join(appDir, "vercel.json"), "utf8")) as {
  crons?: Cron[];
  git?: { deploymentEnabled?: boolean | Record<string, boolean> };
};
const crons = config.crons ?? [];

/** A field pins a single value only when it is a bare number — `*`, `,`, `-` and `/` all repeat. */
const isFixed = (field: string) => /^\d+$/.test(field);

describe("vercel.json crons (Hobby plan limits)", () => {
  it("declares at most two cron jobs", () => {
    expect(crons.length).toBeLessThanOrEqual(2);
  });

  it.each(crons)("$path runs at most once per day ($schedule)", ({ schedule }) => {
    const fields = schedule.trim().split(/\s+/);
    expect(fields).toHaveLength(5);
    const [minute, hour] = fields;
    // Fixed minute + fixed hour ⇒ one firing per day at most; the day fields can only thin it out.
    expect(isFixed(minute), `minute field "${minute}" fires more than once per hour`).toBe(true);
    expect(isFixed(hour), `hour field "${hour}" fires more than once per day`).toBe(true);
  });

  it.each(crons)("$path resolves to a route handler", ({ path: cronPath }) => {
    const route = path.join(appDir, "src", "app", cronPath, "route.ts");
    expect(fs.existsSync(route), `no route handler at ${path.relative(appDir, route)}`).toBe(true);
  });
});

describe("vercel.json git deploys (Hobby plan deployment quota)", () => {
  // Bot branches must NOT create deployments. Every branch push used to spawn a preview
  // deployment; on 2026-08-06 that exhausted the Hobby plan's 100-deployments/day quota
  // ("api-deployments-free-per-day") and production deploys of merged fixes were rate-limited for
  // hours. Note an ignoreCommand skip does NOT save quota — the deployment is still created — so
  // these must stay deploymentEnabled exclusions, which stop creation entirely. The patterns are
  // the work branches of the three bot pipelines (auto-feedback.yml, incl. bin-fix dispatches, and
  // feature-build.yml) plus claude/* worktree branches.
  const excludedBotBranches = ["claude/*", "auto-feedback/*", "bin-fix/*", "feature-request/*"];
  it.each(excludedBotBranches)("disables deployments for %s branches", (pattern) => {
    const enabled = config.git?.deploymentEnabled;
    expect(typeof enabled, "deploymentEnabled must be the per-branch object form").toBe("object");
    expect((enabled as Record<string, boolean>)[pattern]).toBe(false);
  });

  it("does not disable master (git auto-deploy is the only production deploy path)", () => {
    const enabled = config.git?.deploymentEnabled;
    if (typeof enabled === "object" && enabled !== null) {
      // Unlisted branches default to enabled; only an explicit false would break production.
      expect(enabled["master"]).not.toBe(false);
    } else {
      expect(enabled).not.toBe(false);
    }
  });
});
