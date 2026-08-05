// p3-style-deficit.test.ts — small P3 categories must be reachable.
//
// The picker used to take the single largest ABSOLUTE share gap, which starves every small category
// permanently: a category's gap can never exceed its own target share, so rosé (7.6% of the P3
// target) could not out-rank sparkling (39.2%) until sparkling was itself nearly satisfied.
//
// Measured on the live bank, sparkling's gap was 25.8% while rosé's MAXIMUM conceivable gap was
// 7.6% — so rosé was unreachable until sparkling's actual share passed 31.6%. It sat at 1 question
// in ~70 while holding the largest relative shortfall in the bank.
//
// Dividing by the target share asks "how empty is this category relative to what it should be?",
// which puts categories of different sizes on comparable footing.
import { describe, it, expect } from "vitest";
import { relativeDeficits } from "../src/lib/prompts/question-generation-prompt";

// The shipped P3 weights.
const STYLES: [string, number][] = [
  ["sparkling", 31],
  ["sweet", 22],
  ["fortified", 18],
  ["rose", 6],
  ["oxidative", 2],
];

// The live bank when the starvation was found.
const OBSERVED = { fortified: 37, sparkling: 9, sweet: 9, oxidative: 8, still_dry: 3, rose: 1 };
const OBSERVED_TOTAL = 67;

describe("relativeDeficits", () => {
  it("ranks rosé above sparkling on the real observed bank", () => {
    // The whole point: rosé is 80% short of its target, sparkling 66% short. Under the old absolute
    // comparison sparkling won by a factor of four and rosé was never drawn.
    const d = relativeDeficits(STYLES, OBSERVED, OBSERVED_TOTAL);
    const byStyle = Object.fromEntries(d.map((x) => [x.style, x.relative]));
    expect(byStyle.rose).toBeGreaterThan(byStyle.sparkling);
  });

  it("gives a starved small category a real share of the draw", () => {
    // Under absolute gaps rosé's draw probability was exactly zero. Anything meaningful is the fix.
    const d = relativeDeficits(STYLES, OBSERVED, OBSERVED_TOTAL);
    const total = d.reduce((s, x) => s + x.relative, 0);
    const roseShare = (d.find((x) => x.style === "rose")?.relative ?? 0) / total;
    expect(roseShare).toBeGreaterThan(0.2);
  });

  it("excludes categories at or above target", () => {
    // fortified was 55% of the bank against a 22.8% target, oxidative 11.9% against 2.5%.
    const styles = relativeDeficits(STYLES, OBSERVED, OBSERVED_TOTAL).map((d) => d.style);
    expect(styles).not.toContain("fortified");
    expect(styles).not.toContain("oxidative");
  });

  it("returns nothing when every category is at target", () => {
    // Proportional shares of the weights => zero deficit everywhere. Caller falls back to plain
    // target weights, so generation never stalls for want of a deficit.
    const atTarget = { sparkling: 31, sweet: 22, fortified: 18, rose: 6, oxidative: 2 };
    expect(relativeDeficits(STYLES, atTarget, 79)).toHaveLength(0);
  });

  it("treats an empty category as maximally short, never as satisfied", () => {
    const noRose = { sparkling: 31, sweet: 22, fortified: 18, rose: 0, oxidative: 2 };
    const d = relativeDeficits(STYLES, noRose, 73);
    expect(d.find((x) => x.style === "rose")?.relative).toBeCloseTo(1, 5);
  });

  it("is safe on an empty bank", () => {
    expect(relativeDeficits(STYLES, {}, 0)).toEqual([]);
  });
});
