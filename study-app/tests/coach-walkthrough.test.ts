import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appDir, "..");

const read = (p: string) => fs.readFileSync(path.join(appDir, p), "utf8");
const walkthrough = read("src/app/components/CoachWalkthrough.tsx");
const shell = read("src/app/components/ShellOnboarding.tsx");
const sim = read("src/app/components/coach/CoachChatSim.tsx");

interface ExamQuestion { n: number; wines: number[]; text: string }
interface ExamPaper { paper: number; questions: ExamQuestion[] }
interface ExamYear { year: number; papers: ExamPaper[] }
interface Wine { id: string; year: number; paper: number; slot: number; full_text: string }

const exams: ExamYear[] = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "data/exams.json"), "utf8")
);
const wines: Wine[] = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "data/wines.json"), "utf8")
);

// ── The claims the walkthrough makes about the corpus ────────────────────────────────────────────
//
// This is the point of the file. The walkthrough tells a candidate, in the Coach's voice, that
// specific things are and are not in fifteen years of real papers. If the corpus is re-parsed or
// extended and one of those stops being true, the walkthrough would go on asserting it to every new
// user — confidently, and in the voice of the thing they are being taught to trust. So each claim is
// re-derived from data/ here rather than trusted.

describe("the corpus claims are still true", () => {
  it("still holds 162 questions across 15 years", () => {
    const questions = exams.flatMap((y) => y.papers.flatMap((p) => p.questions));
    expect(questions).toHaveLength(162);
    expect(exams).toHaveLength(15);
    expect(walkthrough).toMatch(/162/);
  });

  it("2023 Paper 1 Q1 really did pair one variety across different countries", () => {
    // The receipt the Coach produces on step 4, where the candidate is wrong.
    const q = exams
      .find((y) => y.year === 2023)!
      .papers.find((p) => p.paper === 1)!
      .questions.find((x) => x.n === 1)!;
    expect(q.text).toMatch(/four different countries/i);
    expect(q.text).toMatch(/3 & 4 are a pair/i);
    expect(q.wines).toEqual([1, 2, 3, 4]);

    const w3 = wines.find((w) => w.id === "2023_p1_w3")!;
    const w4 = wines.find((w) => w.id === "2023_p1_w4")!;
    // Semillon on both sides, Australia against Chile — which is what makes the challenge wrong.
    expect(w3.full_text).toMatch(/semillon/i);
    expect(w3.full_text).toMatch(/Hunter Valley/i);
    expect(w4.full_text).toMatch(/semillon/i);
    expect(w4.full_text).toMatch(/Chile/i);

    expect(walkthrough).toMatch(/2023 Paper 1 Question 1/);
    expect(walkthrough).toMatch(/Maule Valley, Chile/);
  });

  it("Semillon is still nine appearances, eight of them Australian", () => {
    const sem = wines.filter((w) => /semillon|s.millon/i.test(w.full_text));
    expect(sem).toHaveLength(9);
    expect(sem.filter((w) => /Australia/i.test(w.full_text))).toHaveLength(8);
    expect(walkthrough).toMatch(/nine times in fifteen years and eight of those are Australian/);
  });

  it("a single-wine question has happened exactly once, on Paper 3, never on Paper 2", () => {
    // The claim that makes the step-5 defect a real defect, and the reason the real user feedback
    // quoted in its verdict was accepted.
    const singles = exams.flatMap((y) =>
      y.papers.flatMap((p) =>
        p.questions.filter((q) => q.wines.length === 1).map(() => ({ paper: p.paper }))
      )
    );
    expect(singles).toHaveLength(1);
    expect(singles[0].paper).toBe(3);
    expect(walkthrough).toMatch(/exactly one single-wine question in the entire corpus/);
    expect(walkthrough).toMatch(/Paper 2 question ever set has been a flight of two or more/);
  });
});

// ── Honesty about what the pipeline guarantees ───────────────────────────────────────────────────

describe("the walkthrough does not overpromise", () => {
  it("says the fix depends on auto-apply rather than promising it unconditionally", () => {
    // Auto-Apply is a runtime toggle that defaults to OFF (lib/settings.ts). Telling a candidate
    // their accepted report always ships itself would be false whenever an admin turns it off.
    expect(walkthrough).toMatch(/If auto-apply is off/);
    expect(walkthrough).toMatch(/an admin reviews it/);
  });

  it("says the independent review can disagree with the Coach", () => {
    expect(walkthrough).toMatch(/it can disagree with the Coach/);
  });

  it("concedes that generation can be wrong", () => {
    expect(walkthrough).toMatch(/it can be wrong/);
  });

  it("does not claim the Coach names the wine during an attempt", () => {
    expect(walkthrough).toMatch(/it will not name the wine/);
  });
});

// ── The simulated conversation has to reflect the real one ───────────────────────────────────────

describe("the simulation matches the real Coach", () => {
  const runLabels = read("src/lib/coach/run.ts");

  it("only uses status labels the real loop actually emits", () => {
    const scripted = [...walkthrough.matchAll(/kind: "status", label: "([^"]+)"/g)].map((m) => m[1]);
    expect(scripted.length).toBeGreaterThan(0);
    for (const label of scripted) {
      expect(runLabels, label).toContain(label);
    }
  });

  it("only names tools that exist, in its Checked: footers", () => {
    const registry = read("src/lib/coach/registry.ts");
    const tools = read("src/lib/coach/tools/study-tools.ts") + read("src/lib/coach/tools/corpus-tools.ts") +
      read("src/lib/coach/tools/screen-tools.ts") + read("src/lib/coach/tools/debrief-tools.ts") +
      read("src/lib/coach/tools/web-tools.ts") + read("src/lib/coach/tools/write-tools.ts");
    const checked = [...walkthrough.matchAll(/checked: \[([^\]]+)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
    expect(checked.length).toBeGreaterThan(0);
    for (const tool of checked) {
      expect(tools + registry, tool).toContain(`name: "${tool}"`);
    }
  });

  it("shows the same verdict wording the real card uses", () => {
    const chat = read("src/app/components/coach/CoachChat.tsx");
    expect(chat).toContain("Accepted — you were right");
    expect(walkthrough).toContain("Accepted — you were right");
    expect(chat).toContain("Reviewing your report against the record…");
    expect(sim).toContain("Reviewing your report against the record…");
  });

  it("covers all four verdict tones, matching the real map", () => {
    for (const tone of ["accept", "partial", "reject", "endorse"]) {
      expect(sim).toMatch(new RegExp(`\\b${tone}:`));
    }
  });
});

// ── Playback has to stay interactive ─────────────────────────────────────────────────────────────

describe("playback is interactive, not a video", () => {
  it("stops auto-scrolling once the reader scrolls away", () => {
    // The brief was explicit that the reader can scroll back through the transcript mid-playback.
    // Auto-scrolling unconditionally would drag them forward on every revealed word.
    expect(sim).toMatch(/stickToBottom/);
    expect(sim).toMatch(/if \(!el \|\| !stickToBottom\.current\) return/);
  });

  it("offers pause, skip and replay", () => {
    expect(sim).toMatch(/Skip to end/);
    expect(sim).toMatch(/Replay/);
    expect(sim).toMatch(/paused \? "Resume" : "Pause"/);
  });

  it("honours pause and unmount inside the sleep, not just between beats", () => {
    // A beat can be seconds long; checking the flags only at beat boundaries would make Pause feel
    // broken and would leak timers past unmount.
    expect(sim).toMatch(/if \(cancelled\) return false/);
    expect(sim).toMatch(/if \(!pausedRef\.current\) waited \+= step/);
  });

  it("scopes cancellation per run, so StrictMode cannot double the transcript", () => {
    // Both directions of this were live bugs. A SHARED ref that the effect re-armed revived
    // StrictMode's discarded first run — two loops appending to one transcript, every message
    // rendered twice, duplicate React keys. A shared ref that it did NOT re-arm left the flag set
    // from the first cleanup, so the real run aborted on its first sleep and nothing played at all.
    expect(sim).toMatch(/let cancelled = false;/);
    expect(sim).not.toMatch(/cancelRef/);
    // The cleanup must close over that per-run variable, not a ref shared across mounts.
    expect(sim).toMatch(/return \(\) => \{\s*cancelled = true;\s*\};/);
  });

  it("restarts by remounting rather than clearing state in an effect", () => {
    expect(sim).toMatch(/key=\{`\$\{runKey\}:\$\{replays\}`\}/);
  });
});

// ── Pacing ───────────────────────────────────────────────────────────────────────────────────────
//
// The brief was that a reader must have time to read everything as it arrives. That is a number, not
// a feeling, so it is asserted as one: for every scripted answer, the time from its first word to the
// next beat must correspond to a reading speed a person can actually sustain.
//
// The first implementation failed this badly — it revealed a 106-word answer in six seconds and moved
// on, which needs about 1,060 wpm. Without this test that regresses the moment someone tunes a
// constant to make the demo feel snappier.

describe("a reader can keep up", () => {
  const constant = (name: string) => Number(sim.match(new RegExp(`const ${name} = (\\d+);`))![1]);
  const WORD_MS = constant("WORD_MS");
  const READ_PER_WORD_MS = constant("READ_PER_WORD_MS");
  const DWELL_MIN_MS = constant("DWELL_MIN_MS");
  const DWELL_MAX_MS = constant("DWELL_MAX_MS");
  const dwellFor = (w: number) =>
    Math.min(DWELL_MAX_MS, Math.max(DWELL_MIN_MS, w * READ_PER_WORD_MS));

  /** Every `text:` on a `kind: "say"` beat, with its word count. */
  const answers = [...walkthrough.matchAll(/kind: "say",\s*\n?\s*text:\s*((?:\s*"(?:[^"\\]|\\.)*"\s*\+?)+)/g)]
    .map((m) => m[1])
    // Concatenate the adjacent string literals the way the compiler would, then count words.
    .map((lit) => [...lit.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((s) => s[1]).join(""))
    .map((text) => text.split(/\s+/).filter(Boolean).length);

  it("measured every scripted answer, not just the ones the regex happened to catch", () => {
    // Counted independently: a partial match would silently exempt the unmatched answers from the
    // budget assertion below, which is the one thing this block exists to enforce.
    const sayBeats = (walkthrough.match(/kind: "say"/g) || []).length;
    expect(sayBeats).toBeGreaterThan(0);
    expect(answers).toHaveLength(sayBeats);
    // And the counts are real word counts, not zeroes from a failed capture.
    expect(Math.min(...answers)).toBeGreaterThan(20);
    expect(Math.max(...answers)).toBeGreaterThan(60);
  });

  it("gives every answer a sustainable reading budget", () => {
    for (const words of answers) {
      const ms = words * WORD_MS + dwellFor(words);
      const wpm = words / (ms / 60000);
      // 320 is brisk but followable; past that the reader is being outrun by the animation.
      expect(wpm, `${words} words at ${Math.round(wpm)} wpm`).toBeLessThan(320);
    }
  });

  it("does not let the dwell cap punish the longest answers", () => {
    // When the cap bites, the longest replies become the most rushed — exactly backwards.
    expect(Math.max(...answers) * READ_PER_WORD_MS).toBeLessThanOrEqual(DWELL_MAX_MS);
  });

  it("keeps each conversation short enough to sit through", () => {
    // Slides are click-through, so a conversation that outlasts the reader's patience is a slide
    // they will skip — and the challenge scripts are the whole point of the walkthrough.
    const longest = Math.max(...answers) * WORD_MS + dwellFor(Math.max(...answers));
    expect(longest).toBeLessThan(30_000);
  });
});

// ── Where it sits in the first-run chain ─────────────────────────────────────────────────────────

describe("the first-run chain", () => {
  it("runs after the diagram walkthrough and before the spotlight tour", () => {
    const stage = shell.match(/type Stage =([^;]+);/)![1];
    expect(stage).toMatch(/"intro"/);
    expect(stage.indexOf('"walkthrough"')).toBeLessThan(stage.indexOf('"coach"'));
    expect(stage.indexOf('"coach"')).toBeLessThan(stage.indexOf('"tour"'));

    // The resume ladder picks the earliest stage the user still owes, in the same order.
    const ladder = shell.match(/const next: Stage =[\s\S]*?: null;/)![0];
    expect(ladder.indexOf("walkthroughSeen")).toBeLessThan(ladder.indexOf("coachWalkthroughSeen"));
    expect(ladder.indexOf("coachWalkthroughSeen")).toBeLessThan(ladder.indexOf("tourSeen"));
  });

  it("gates on its own flag, so users who saw the diagram teach still get this one", () => {
    // Reusing walkthrough_seen would mean every existing user — the ones most likely to have
    // opinions worth filing — never sees it.
    expect(shell).toMatch(/coachWalkthroughSeen: true/);
    const migration = fs.readFileSync(
      path.join(appDir, "migrations/056_coach_walkthrough.sql"),
      "utf8"
    );
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS coach_walkthrough_seen/);
  });

  it("is reachable and persisted end to end", () => {
    expect(read("src/app/api/user/shell-prefs/route.ts")).toMatch(/coachWalkthroughSeen/);
    expect(read("src/app/api/auth/me/route.ts")).toMatch(/coach_walkthrough_seen/);
    expect(read("src/lib/auth-context.tsx")).toMatch(/coachWalkthroughSeen\?: boolean/);
  });

  it("hands off from the diagram walkthrough with a label naming what comes next", () => {
    expect(read("src/app/components/DiagramWalkthrough.tsx")).toMatch(/Now meet your Coach/);
  });

  it("is replayable without re-writing the seen flag", () => {
    const replay = read("src/app/components/WalkthroughReplayButton.tsx");
    expect(replay).toMatch(/CoachWalkthrough/);
    expect(replay).not.toMatch(/saveShellPref|coachWalkthroughSeen/);
  });
});

describe("Settings can replay the whole first run", () => {
  const settings = read("src/app/settings/page.tsx");
  const reset = settings.match(/JSON\.stringify\(\{[^}]*introSeen: false[\s\S]*?\}\)/)![0];

  it("clears every flag the chain gates on", () => {
    // The bug this pins: the button reset only intro_seen and tour_seen, so a user asking to see
    // onboarding again silently skipped BOTH walkthroughs — the longest part of it. Derived from the
    // chain rather than hard-coded, so a stage added later that forgets this fails here.
    const gated = [...shell.matchAll(/!user\.(\w+Seen)\b/g)].map((m) => m[1]);
    expect(new Set(gated).size).toBe(4);
    for (const flag of new Set(gated)) {
      expect(reset, flag).toContain(`${flag}: false`);
    }
  });

  it("clears the once-per-session guard, or the reset would not take until a new tab", () => {
    expect(settings).toMatch(/removeItem\("mw-intro-shown-this-session"\)/);
  });

  it("confirms visibly, and admits it when the save fails", () => {
    expect(settings).toMatch(/border-success bg-success\/10 text-success/);
    expect(settings).toMatch(/setReplayState\("error"\)/);
    // The old handler swallowed failures in a bare .catch(() => {}), so a 500 looked like success.
    expect(settings).toMatch(/if \(!res\.ok\) throw new Error/);
  });
});
