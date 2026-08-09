import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BAND_FLOOR, MARKING_BANDS_PROSE, bandForScore } from "@/lib/marking-bands";
import { MARKING_PRINCIPLES } from "@/lib/prompts/marking-principles";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("verdict bands", () => {
  it("has no gap — every score belongs to exactly one band", () => {
    // THE BUG THIS EXISTS FOR. The rubric used to say "FAIL < 50, BORDERLINE ≈ 55–64, PASS ≥ 65",
    // leaving 50–54 undefined, so a script on 52 got whichever band the model invented that run.
    for (let score = 0; score <= 100; score++) {
      expect(["pass", "borderline", "fail"], `score ${score}`).toContain(bandForScore(score));
    }
    for (let score = 50; score <= 54; score++) {
      expect(bandForScore(score), `score ${score} fell in the old gap`).toBe("borderline");
    }
  });

  it("puts the edges on the IMW's own numbers", () => {
    expect(bandForScore(49.9)).toBe("fail");
    expect(bandForScore(50)).toBe("borderline");
    expect(bandForScore(64.9)).toBe("borderline");
    expect(bandForScore(65)).toBe("pass");
    expect(BAND_FLOOR.borderline).toBe(50); // published per-paper floor
    expect(BAND_FLOOR.pass).toBe(65); // published pass standard
  });

  it("bands a nonsense score rather than throwing", () => {
    // A grader that returns 104 has made an arithmetic slip; refusing to band it would turn a
    // slightly-wrong mark into a failed debrief.
    expect(bandForScore(140)).toBe("pass");
    expect(bandForScore(-20)).toBe("fail");
    expect(bandForScore(NaN)).toBe("borderline");
  });
});

describe("the prompt and the code cannot drift apart", () => {
  it("injects the shared band prose into the marking rubric", () => {
    expect(MARKING_PRINCIPLES).toContain(MARKING_BANDS_PROSE);
  });

  it("leaves no hand-written band table anywhere else", () => {
    // Flash Notes previously carried THREE band definitions that disagreed: its prompt said
    // "BORDERLINE 50–64", the MARKING_PRINCIPLES it also injected said "≈55–64", and its own
    // code comment said "~55–64" over a body that used 50. Every copy is now derived.
    const files = ["src/app/api/flash-notes/grade/produce.ts", "src/lib/prompts/marking-principles.ts"];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(appDir, rel), "utf8");
      expect(src, `${rel} re-states the bands by hand`).not.toMatch(/BORDERLINE\s*[≈~]?\s*5\d\s*[-–]\s*64/);
    }
  });

  it("states plainly that the bands are exhaustive", () => {
    // The model reads this. If it ever stops saying so, the gap can come back through the prompt
    // even while the code stays total.
    expect(MARKING_BANDS_PROSE).toMatch(/exhaustive and have no gaps/i);
  });
});
