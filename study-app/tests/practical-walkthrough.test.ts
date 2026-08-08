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

// JSX escapes the curly quotes in UI labels (&rsquo;, &ldquo;…), so a raw substring search for a
// label like "I’ll choose wines" misses depending on where in the markup it sits. Decode first and
// compare against what a reader actually sees.
const decode = (source: string) =>
  source
    .replaceAll("&rsquo;", "’")
    .replaceAll("&lsquo;", "‘")
    .replaceAll("&ldquo;", "“")
    .replaceAll("&rdquo;", "”")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");

const walkthrough = decode(read("src/app/components/PracticalWalkthrough.tsx"));
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

  // THE BLIND ROUTING IS THE LOAD-BEARING FEATURE and it gets its own slide. It is also the easiest
  // thing in the app to break silently: remove the send-brief route or the share link and the
  // walkthrough would keep promising a guarantee the app no longer makes, to people deciding whether
  // to spend £150 on bottles. Each half of the promise is pinned to the endpoint that delivers it.
  describe("the partner-blind routing", () => {
    it("has a slide of its own, not a clause", () => {
      expect(walkthrough).toContain('"Live Tastings — staying blind"');
      expect(walkthrough).toContain("The brief goes to your buyer, not to you");
    });

    it("promises the emailed brief because the endpoint exists", () => {
      const sendBrief = read("src/app/api/live-tasting/[id]/send-brief/route.ts");
      expect(sendBrief).toContain("sendPartnerBriefEmail");
      expect(sendBrief).toContain("entryUrl");
      expect(session).toContain("Send it to a partner and you stay fully");
      // …and that the candidate is not shown the brief on that path.
      expect(session).toContain("Brief sent — you&apos;re blind until the wines are in");
      expect(walkthrough).toMatch(/You are never shown it/);
      expect(narration).toMatch(/without ever reading it yourself/);
    });

    it("promises the partner can enter the bottles, because the partner page does that", () => {
      const shop = read("src/app/shop/[token]/page.tsx");
      expect(shop).toContain("Enter what you bought");
      expect(shop).toContain("don&apos;t tell them what you buy");
      expect(shop).toContain("Put each bottle in an opaque bag");
      expect(walkthrough).toMatch(/type in exactly what they bought/);
      expect(narration).toMatch(/enter what they actually bought/);
      // The payoff claim: the question is built around THEIR bottles.
      expect(walkthrough).toMatch(/the question is built around/i);
    });

    it("promises the pick-my-wines share link with the same limits the UI states", () => {
      expect(session).toContain("Share list with a partner");
      expect(session).toMatch(/never the\s+question or answers/);
      expect(walkthrough).toMatch(/never the question or the answers/);
      expect(narration).toMatch(/never the question or the answers/);
    });

    it("repeats the honesty stamp, in the app's own three states", () => {
      const lib = read("src/lib/live-tasting.ts");
      expect(lib).toContain("Blind kept — a partner handled the wines");
      expect(lib).toContain("You saw the wines before tasting");
      expect(lib).toContain("Shopping list never opened in-app");
      expect(walkthrough).toMatch(/a partner handled the wines/);
      expect(walkthrough).toMatch(/you saw them before tasting/);
      expect(walkthrough).toMatch(/never opened/);
      expect(narration).toMatch(/how blind it actually was/);
    });

    it("says it works for a tasting group, not only a solo candidate", () => {
      expect(walkthrough).toMatch(/for a[\s\S]{0,40}group/);
      expect(narration).toMatch(/tasting group/);
      expect(narration).toMatch(/nobody who tastes has to be the person who bought/);
    });

    it("keeps the routing decoupled from the session's scale", () => {
      // A full paper routes to a partner the same way a single question does.
      expect(walkthrough).toMatch(/full paper can go to a partner/);
      expect(narration).toMatch(/A full paper can go to a partner/);
    });
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

    // The invariant, rather than a literal that goes stale every time a stage is added: the number
    // the copy claims must equal the number of flags the button actually clears. This is what
    // silently rotted before — the reset cleared two flags while saying it cleared everything.
    // Anchor on introSeen — there are other JSON.stringify bodies on this page (the exam-date save,
    // for one), and matching the first would count zero flags and pass vacuously.
    const body = settings.match(/introSeen: false,[\s\S]*?\}\),/)?.[0] ?? "";
    const flags = body.match(/\w+: false,/g) ?? [];
    const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];
    expect(flags.length).toBeGreaterThanOrEqual(5);
    expect(settings, `the reset clears ${flags.length} flags — the copy must say "${WORDS[flags.length]}"`)
      .toContain(`Resets all ${WORDS[flags.length]}`);
  });
});
