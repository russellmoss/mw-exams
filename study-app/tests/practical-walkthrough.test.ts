import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { TOUR_NARRATION } from "@/lib/tour-narration";

// The Practical-drills walkthrough teaches controls that live in two other files. The whole risk
// here is DRIFT: someone renames a mode, changes a time band or drops a control, and the walkthrough
// keeps confidently describing the old app to first-time users — who have no way to know it is
// wrong. So every mechanic the slides or the narration name is asserted against the live UI source
// rather than trusted.

const APP_ROOT = process.cwd();
const read = (path: string) => readFileSync(join(APP_ROOT, path), "utf8");

const walkthrough = read("src/app/components/PracticalWalkthrough.tsx");
const hub = read("src/app/practical/page.tsx");
const wizard = read("src/app/practical/dry-flights/page.tsx");
const live = read("src/app/live-tasting/page.tsx");
const session = read("src/app/live-tasting/[id]/page.tsx");
const narration = Object.entries(TOUR_NARRATION)
  .filter(([id]) => id.startsWith("practical-"))
  .map(([, text]) => text)
  .join("\n");

describe("what it says about Dry Flights is still true", () => {
  it("names the four modes exactly as the app does", () => {
    for (const mode of ["Full Question", "Stem Analysis Only", "Dry Notes", "Flash Notes"]) {
      expect(hub, `the hub no longer offers ${mode}`).toContain(mode);
      expect(wizard, `the wizard no longer offers ${mode}`).toContain(mode);
      expect(walkthrough, `the walkthrough dropped ${mode}`).toContain(mode);
    }
  });

  it("quotes the same time bands the hub advertises", () => {
    for (const band of ["20–30 min", "5–10 min", "15–25 min", "1–2 min/card"]) {
      expect(hub, `the hub no longer says ${band}`).toContain(band);
      expect(walkthrough, `the walkthrough dropped ${band}`).toContain(band);
    }
    expect(hub).toContain("2–30 min");
    expect(walkthrough).toContain("2–30 min");
  });

  it("walks the wizard in the order the wizard actually runs", () => {
    // The LandingStep union is the source of truth for the sequence.
    const steps = wizard.match(/type LandingStep =([\s\S]*?);/)?.[1] ?? "";
    for (const step of ["select-paper", "select-family", "select-mode", "acquire", "stem-detail"]) {
      expect(steps, `LandingStep no longer has ${step}`).toContain(step);
    }
    const flowOrder = ["Paper", "Family", "Mode", "Source", "Stem detail"];
    let cursor = walkthrough.indexOf('steps={[');
    for (const label of flowOrder) {
      const at = walkthrough.indexOf(`label: "${label}"`, cursor);
      expect(at, `the flow diagram is missing or misorders ${label}`).toBeGreaterThan(-1);
      cursor = at;
    }
  });

  it("keeps the banked-vs-new timing honest", () => {
    expect(wizard).toContain("Banked questions are instant; a fresh one takes about 30-60 seconds.");
    expect(walkthrough).toMatch(/Thirty to sixty seconds|30-60/);
    expect(narration).toContain("thirty to sixty seconds");
    // The other half of the claim: a banked question must be indistinguishable from a fresh one.
    expect(wizard).toContain('no "banked" marker ever reaches the candidate');
  });

  it("uses the candidate-facing stem-detail names, never the internal ones", () => {
    const stemDetail = read("src/lib/prompts/stemDetail.ts");
    expect(stemDetail).toContain('name: "Guided"');
    expect(stemDetail).toContain('name: "IMW Only"');
    expect(walkthrough).toContain("Guided");
    expect(walkthrough).toContain("IMW Only");
    // `exam_real` / `guided` are internal ids and the module says never to surface them.
    expect(walkthrough).not.toContain("exam_real");
    expect(narration).not.toContain("exam_real");
  });

  it("only claims the Paper 3 Focus control because it is Paper 3 only", () => {
    expect(wizard).toContain("selectedPaper === 3 && <FocusSelector");
    expect(walkthrough).toContain("Paper 3 only");
    expect(narration).toMatch(/only on Paper 3/i);
  });
});

describe("what it says about Live Tastings is still true", () => {
  it("names both wine-sourcing modes as the UI labels them", () => {
    expect(live).toContain("Pick my wines");
    expect(live).toContain("I&apos;ll choose wines");
    expect(walkthrough).toContain("Pick my wines");
    expect(walkthrough).toContain("I’ll choose wines");
  });

  it("quotes the real exam-conditions clocks", () => {
    expect(live).toContain('paperSize === "full" ? "2h15" : "68 min"');
    expect(live).toContain("questions unanswered at the deadline score zero");
    expect(walkthrough).toContain("68 minutes");
    expect(walkthrough).toContain("2h15");
    expect(walkthrough).toContain("scores zero");
  });

  it("describes the blind-integrity guarantee the session actually makes", () => {
    // The partner route is what keeps a solo candidate blind, and the session records which route
    // was taken — the walkthrough is allowed to promise both because both exist.
    expect(session).toContain("Send it to a partner and you stay fully");
    expect(live).toContain("blind kept via partner");
    expect(live).toContain("you saw the wines pre-taste");
    expect(walkthrough).toMatch(/never see a label/);
    expect(walkthrough).toMatch(/never counted as if you hadn/);
  });

  it("gets the tasting-day sequence and the autosave right", () => {
    expect(session).toContain("first your stem analysis, then your full exam answer");
    expect(session).toContain("autosaves");
    expect(walkthrough).toContain("autosaves");
    for (const label of ["Brief", "Buy", "Bag", "Taste", "Write", "Reveal"]) {
      expect(walkthrough, `the day flow is missing ${label}`).toContain(`label: "${label}"`);
    }
  });

  it("agrees with the hub on how long a live tasting takes", () => {
    expect(hub).toContain("2¼ hrs");
    expect(walkthrough).toContain("2¼ hrs");
  });
});

describe("first-visit trigger and replay", () => {
  it("is gated on its own flag, end to end", () => {
    expect(read("migrations/061_practical_walkthrough.sql")).toContain(
      "ADD COLUMN IF NOT EXISTS practical_walkthrough_seen"
    );
    expect(read("src/app/api/auth/me/route.ts")).toContain("practical_walkthrough_seen");
    expect(read("src/app/api/auth/me/route.ts")).toContain("practicalWalkthroughSeen");
    expect(read("src/app/api/user/shell-prefs/route.ts")).toContain("practicalWalkthroughSeen");
    expect(read("src/lib/auth-context.tsx")).toContain("practicalWalkthroughSeen");
  });

  it("opens on the first visit to Practical and marks itself seen", () => {
    expect(hub).toContain("user.practicalWalkthroughSeen");
    expect(hub).toContain("practicalWalkthroughSeen: true");
  });

  it("defers the StrictMode-sensitive commit into the timer callback", () => {
    // The trap ShellOnboarding documents: latching the ref in the effect body means the cancelled
    // first StrictMode run burns it and the walkthrough never appears in development.
    const effect = hub.match(/if \(authLoading \|\| !user \|\| decidedRef\.current\)[\s\S]*?\}, \[authLoading, user\]\);/)?.[0] ?? "";
    expect(effect).toContain("setTimeout");
    expect(effect).not.toContain("requestAnimationFrame");
    const latchAt = effect.indexOf("decidedRef.current = true");
    const timerAt = effect.indexOf("setTimeout");
    expect(latchAt, "decidedRef is latched outside the timer callback").toBeGreaterThan(timerAt);
  });

  it("is replayable from both the Practical header and the Library", () => {
    expect(hub).toContain("How the two drills work");
    const replay = read("src/app/components/WalkthroughReplayButton.tsx");
    expect(replay).toContain("PracticalWalkthrough");
    expect(replay).toContain("How the two drills work");
    expect(read("src/app/library/page.tsx")).toContain("WalkthroughReplayButtons");
  });

  it("does not re-write the flag on replay", () => {
    // Replaying from the header must not PATCH — the flag is already true, and a replay is
    // presentation-only in every other surface too.
    expect(hub).toContain("if (replaying) setReplaying(false);");
    expect(hub).toContain("else closeWalkthrough();");
  });

  it("is reset by the Settings replay button, which claims to reset everything", () => {
    const settings = read("src/app/settings/page.tsx");
    expect(settings).toContain("practicalWalkthroughSeen: false");
    // The copy must not still say "four".
    expect(settings).not.toMatch(/Resets all four/);
    expect(settings).toContain("Resets all five");
  });
});
