/**
 * The spoken script for the first-run tour — intro presentation, diagram walkthrough, Coach
 * walkthrough. One entry per slide, keyed `<surface>-<zero-based slide index>`.
 *
 * THE AUDIO IS PRE-GENERATED, NOT SYNTHESIZED AT RUNTIME. `npm run narration:build` reads this file,
 * synthesizes each clip once with ElevenLabs (George, `eleven_multilingual_v2`) and writes
 * `public/narration/<id>.mp3` plus a manifest recording the SHA-256 of the text each clip was made
 * from. That choice is deliberate:
 *
 *   • The intro plays on a user's FIRST session — before they have been anywhere near Settings, and
 *     so before they could possibly have an ElevenLabs key. A BYOK runtime path would be silent for
 *     exactly the audience this narration exists for.
 *   • The script is identical for every listener. Re-synthesizing fixed copy per user per session is
 *     latency and credits spent on producing the same twenty files over and over.
 *   • Committed audio can be listened to before it ships. Runtime audio cannot.
 *
 * THE TEXT AND THE AUDIO MUST NOT DRIFT. `tests/tour-narration.test.ts` re-hashes every string below
 * and fails the build if the manifest disagrees — so editing a line here without re-running
 * `npm run narration:build` is a build failure, not a clip that quietly says the old thing.
 *
 * HOW THE THREE SURFACES ARE WRITTEN, which is a product decision and not a style one:
 *
 *   • intro-*  — SPEAKS THE "LEARN MORE" CONTENT. Each intro scene used to hide the substance behind
 *     its headline in a dialog most people never opened. The narration covers all of it, so the
 *     depth reaches a listener who only ever clicks Next.
 *   • diagrams-* / coach-* — DO NOT READ THE SLIDE. Those slides are already dense with text and
 *     diagrams, and a voice reciting words the eye is reading is worse than silence. The narration
 *     says what the slide is FOR, and on the demo slides it commentates: what the Coach is doing
 *     while the status line runs, what to notice in the reply, why the card asks what it asks.
 *
 * THIS TEXT IS ALSO THE "LEARN MORE" CARD, on every slide of all three surfaces. The card shows the
 * transcript of what the voice says, which is why the prose below reads as speech — that is the
 * register it is quoted in, not sloppiness. Making the transcript the card content rather than a
 * second hand-written body is the whole point: there is exactly one version of the depth behind each
 * slide, so the spoken and the read can never disagree, and someone who mutes the narration (or
 * cannot play audio at all) loses nothing. The dialog's own headings are TITLES below, which carry
 * no audio and so can be edited freely.
 *
 * Written to be heard, not read: short sentences, numbers in the form a narrator should say them,
 * no markdown. Blank lines are paragraph breaks and ElevenLabs renders them as pauses.
 */

/** Where the generated clips live, relative to the site root. */
export const NARRATION_DIR = "/narration";

/** The public URL of a clip. */
export function narrationSrc(id: string): string {
  return `${NARRATION_DIR}/${id}.mp3`;
}

/** Slide count per surface — asserted against each component's own constant by the test. */
export const NARRATION_COUNTS = { intro: 6, diagrams: 7, coach: 7, practical: 8 } as const;

export type NarrationSurface = keyof typeof NARRATION_COUNTS;

/** The id for a slide, e.g. `narrationId("coach", 3)` → `"coach-3"`. */
export function narrationId(surface: NarrationSurface, index: number): string {
  return `${surface}-${index}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// The intro presentation (ShellOnboarding, 6 scenes)
//
// Scenes 1-5 each carry the whole of that scene's "Learn more" dialog. Where the dialog and the
// slide say the same thing, it is said once.
// ─────────────────────────────────────────────────────────────────────────────

const INTRO: string[] = [
  // Scene 1 — "The MW practical exam is not random." (INFO_PARAS[0])
  `Welcome. What is on the screen is the claim this whole system rests on: the MW practical exam is not random. It follows patterns that are invisible in any single year, and unmistakable across a decade.

Here is the evidence for that. Across any single exam year, wine selection looks arbitrary. Across fifteen years, it isn't. Paper 1 has included Chardonnay every single year. Riesling appears in 10 years out of 11. And Paper 3's first question has opened with a sparkling wine every year since 2021.

Curveballs follow a one-in-four rule. In a multi-wine question, typically exactly one wine is significantly harder. The rest are anchors. Knowing that changes how you allocate confidence across a flight.

None of this tells you what is in the glass. It tells you what the examiners have historically reached for, which is exactly the prior you want before you taste.`,

  // Scene 2 — the funnel. (INFO_PARAS[1])
  `On screen is a funnel, and it is the single most useful idea here. The world of wine: more than 10,000 candidates. Paper 1, still whites only: about 300. The phrase "the same single grape variety": about 40. Your candidate set, before you have smelled a thing: eight.

Stem analysis means reading the question text, the stem, as evidence, before you smell or taste anything. The paper number constrains colour and style. Phrases like "same single grape variety" eliminate most of the wine world. Mark allocations signal what the examiner expects you to write about.

Every historical question falls into one of a small number of structural families, and each family has its own decision tree, built from every stem construction in sixteen years of papers.

You will see exactly how that works in a moment. The walkthrough after this intro takes one real past question all the way from its stem to the wines that were actually in the glasses. You practise the skill yourself in the Stem Analysis mode of Dry Flights.`,

  // Scene 3 — the corpus. (INFO_PARAS[2])
  `Four numbers, and they describe the foundation everything else is built on.

This is the complete text of every MW practical exam from 2011 to 2026. Fifteen years, 45 papers, 540 wines. Not a sample: the entire modern corpus.

Every one of those 540 wines was individually researched from authoritative sources. Producer tech sheets, Decanter, Tim Atkin MW, JancisRobinson dot com, regional wine board data. Each entry documents the tasting profile, the technical specifications, the vintage character, and why the examiners likely chose it.

On top of that, 13 official examiner reports, from 2017 to 2025, systematically distilled into the marking principles the grading engine applies to your answers. Reasoning over identification. Quality in context. No shoehorning.

Tier-one sources throughout. Not Reddit.`,

  // Scene 4 — blind testing. (INFO_PARAS[3])
  `Two numbers here, and the honesty behind them matters more than either one.

The decision trees are never graded on questions they were built from. That would measure memory, not prediction. They are scored blind, against papers they have never seen.

On the 2026 paper, predicted before the exam was sat, the true variety was inside the candidate set for 89 percent of wines, and inside the top three calls for 64 percent. On the 2000 to 2010 stress test, 396 wines the trees never saw, those figures are 80 percent and 58 percent.

Just as important is what we do not claim. Top-one accuracy is about one in three, so the system never pretends to name the wine. It bounds the universe. You narrow from there, in the glass.`,

  // Scene 5 — theory. (INFO_PARAS[4])
  `This slide is about the other half of Stage 2. Every theory essay is marked against a rubric derived from the actual examiners' reports, with a model answer to compare against.

The theory library holds 243 real past essay questions from 2016 to 2025, across all five theory papers: viticulture, vinification, handling of wine, the business of wine, and contemporary issues.

Each question's grading rubric is derived from the actual examiners' report for that year. The core requirements they said were essential, the differentiators that separated strong answers, the traps that cost marks. Your essay is scored against that, and not against a generic AI opinion.

Every question also carries a model answer built from the rubric, so after grading you can compare your essay against what a full-marks answer actually looks like, point by point.

Real past questions. Real marking guidance. No invented standards.`,

  // Scene 6 — the close. No "Learn more" dialog on this scene.
  `That is the edge. Patterns, not guesswork.

Press "Start studying" and I will take you through how the decision diagrams work, using one real past question, and then introduce your Coach. Both take a couple of minutes, and both can be replayed later from the Library.

If you would rather not see this introduction again, tick the box underneath the button.`,
];

// ─────────────────────────────────────────────────────────────────────────────
// The diagram walkthrough (DiagramWalkthrough, 7 steps)
//
// Commentary, not recitation: what the step is teaching, and what to notice while it animates.
// ─────────────────────────────────────────────────────────────────────────────

const DIAGRAMS: string[] = [
  // 1 — the question
  `We are going to work one real question, end to end. This is 2014, Paper 1, Question 2, sat by real candidates under real time pressure.

Look at how the marks are split, because the split is itself information. Twenty-four marks for naming the variety once. Then ten marks per wine for origin, and nine marks per wine for quality and style. The examiner is telling you that more than half the marks on this page are for discussion rather than identification, and that a candidate who nails four origins but writes nothing about quality has left most of the paper on the table.

About twelve minutes a wine. You have not smelled anything yet. Watch how far the stem alone gets us.`,

  // 2 — where the diagrams live
  `Before we work it, here is where these diagrams actually live in the app, because a tree you cannot find in eight minutes is not a tree you own.

They are in the Library. One deck per paper, plus a card for every major grape variety. Our question is a white-wine paper, so we open Paper 1 Whites.

Every deck opens on the same first diagram, Stem Routing, and that is always your entry point. The habit to build is: read the stem, open the right deck, route it. You are not trying to memorise the tree. You are trying to know which page to turn to.`,

  // 3 — routing
  `What you are watching is the routing diagram resolving. It asks one thing at a time, and the first fork is the big one: does the stem fix the grape variety?

Ours says "the same single grape variety", so the answer is yes, and five of the six question families fall away in a single step. You land in family F1, Same Variety, which is the most common structure in Paper 1: thirteen of its forty questions.

The dimmed branch on the right is everything you no longer have to think about. Origin questions, blends, breadth, method. That is what routing buys you. It is not cleverness, it is elimination, and it costs you about fifteen seconds.`,

  // 4 — the tiers
  `Now you are at the leaf, and a leaf is a candidate set with confidence attached.

Strong signal means the examiners have reached for this repeatedly in exactly this construction. Lead with it. Plausible means attested, but less often. Keep it live, do not open with it. Curveball means rare, and usually the one wine in the flight designed to be hard. Taste carefully before you commit.

Then apply judgement, because the tree is not a substitute for thinking. It offers Chenin Blanc and Semillon as plausible. But the stem says four different countries, and Semillon from four different countries is not something the world reliably produces. So you rule it out yourself, and you can be fairly confident this is one of the strong-signal varieties.

Three tiers, deliberately, and not percentages. Fifteen years of papers is far too small a corpus to pretend to probabilities.`,

  // 5 — the tasting overlay
  `Everything so far happened before the glass. This second diagram is the sensory overlay, the half of the tree that runs while you are actually tasting.

Lime and citrus, searing acid, no oak. That resolves to Riesling, which was already a strong-signal call, so the glass has confirmed the paper rather than contradicted it. That agreement is worth noticing: when the stem and the glass point the same way, you can write with confidence and spend your minutes on quality instead of hedging.

Then alcohol and residual sugar split the world three ways. Low alcohol with sugar, slate and petrol, is Mosel Kabinett. Bone dry with firm extract and mineral power is a German Grosses Gewächs, the Rheingau, or Alsace. Bone dry with lime cordial, youthful, less extract, is Clare or Eden Valley. One grape, three very distant places, separated on two variables.`,

  // 6 — the reveal
  `Here is what was actually in the glasses, and the scoring is deliberately honest.

Clare Valley. Alsace. The Pfalz. And Central Otago. The variety was a strong call and it was right. Three of the four origins sat in the tree's named region list.

The fourth, a New Zealand Riesling, was a genuine miss at the time. It is now marked plausible, because this very question exposed the gap and the 2026 routing sweep added it. We are showing you a question the system originally got partly wrong, on purpose.

And notice the shape of it. One wine out of four was significantly harder than the rest. That is the one-in-four curveball rule from the introduction, playing out exactly as advertised, which is why you budget your confidence across a flight instead of spending it all on wine one.`,

  // 7 — what the tree is for
  `So, the honest summary.

The tree bounds the universe. You narrow from there. It will not name the wine for you and it never pretends to. Top-one accuracy is about one in three.

What it does is walk you into the room with a short, ranked list instead of the whole world, and that is the difference between eight minutes of deduction and eight minutes of panic. Eighty-nine percent of the time, the true variety is somewhere in that list. Thirteen of Paper 1's forty questions use the exact structure you have just walked.

Next, meet your Coach. And you can replay this walkthrough any time from the Library.`,
];

// ─────────────────────────────────────────────────────────────────────────────
// The Coach walkthrough (CoachWalkthrough, 7 steps)
//
// The demo slides play a scripted conversation. The narration commentates it — what the Coach is
// doing while the status line runs, and what is worth noticing in the reply.
// ─────────────────────────────────────────────────────────────────────────────

const COACH: string[] = [
  // 1 — meet the Coach
  `There is a Coach in the corner of every screen. Bottom right, always there.

It is not a general chatbot that happens to know about wine. It has read every modern MW paper, every examiner report we could obtain, and a curated library of wine science.

Three things on the screen are worth knowing before you use it. Opening it in the middle of a question pauses your answer timer and restarts it when you close, so asking never costs you exam minutes. It works mid-flight, and it will walk the decision tree with you, but it will not name the wine. That has to be yours. And it can see the question you are on, so you never have to paste anything in, while the answer key stays hidden from it.`,

  // 2 — technical demo
  `This is a real exchange, played back for you.

The candidate asks why Hunter Valley Semillon ages so well at 10 percent alcohol, which is a genuinely hard technical question. Watch the status line first: it is searching the technical corpus before it says anything.

Then watch the shape of the answer. It explains a mechanism rather than reciting a fact. Picked early at high acid, no oak, no malolactic, no lees, and under screwcap the development is reductive rather than oxidative, which is where the toast and lanolin come from and why none of it is barrel.

Then the candidate does the thing you should always do, and asks where that came from. Notice the reply: the corpus, not the open web, and every passage carries its publisher and section. An unattributed assertion earns nothing in an exam, and a wrong one costs marks.`,

  // 3 — the sources
  `This slide is the receipts behind the answer you just watched.

More than 6,700 curated technical passages. The AWRI, the INAO cahiers des charges, IVES, the Champagne and Jerez regulators, university extension programmes. Alongside 162 real exam questions, 540 individually researched wines, and 13 examiner reports distilled into marking principles.

The detail worth catching is in the second panel. When the Coach does reach the live web, the list of places it is allowed to look is enforced at the API itself, not merely suggested in a prompt. Blogs, forums, user ratings and retail listings cannot come back at all, however the question is phrased.

That combination is the point. The world's best wine science on one side, fifteen years of real papers and the examiners' own words on the other, and the willingness to say plainly when it does not know.`,

  // 4 — performance demo
  `Now a different kind of question, and the more valuable one.

The candidate asks where they are actually losing marks, and tells the Coach to be blunt. Watch the two status lines: it is reading their own record. Past attempts, what they wrote, and what it was marked against.

What comes back is not flattery. You are not losing marks on your palate, you are losing them on the page. The deduction that would have earned the origin mark is visible in the notes and never made it into the answer.

And then one change, not a list. Write the conclusion first, then justify it. That is the difference between a coach and a search engine: it looked at your work, found the single most recoverable loss, and gave you one thing to do about it.`,

  // 5 — challenge, and the Coach says no
  `Questions in this app are generated, and generation is good but it is not perfect. So arguing with a question is a first-class thing to do here.

Watch this candidate do exactly that, with confidence. They say the IMW would never set Semillon as a same-variety, different-country question.

The Coach searches fifteen years of past papers, and tells them no, with the receipt. 2023, Paper 1, Question 1 paired a Tyrrell's Semillon from the Hunter Valley with a Semillon Granito from the Maule Valley in Chile.

But look at what it does next. It gives them the fact behind their instinct: Semillon appears nine times in the corpus and eight of those are Australian. So the hunch was reasonable, it was just wrong, and now they know why. Then it declines to file the report.

Checking beats agreeing. The candidate has lost nothing and gained a precedent they can use.`,

  // 6 — challenge, and the candidate is right
  `Same conversation, but this time the complaint is real. A single wine, on its own, in Paper 2.

The Coach checks, and finds it is not merely unusual. In fifteen years there is exactly one single-wine question in the entire corpus, and it sits on Paper 3. Paper 2 has never had one. That is off-distribution, not rare, and it is a real defect.

Now watch the card, because it is asking you to agree to something specific. Not "send a complaint", but take a question out of circulation.

Confirm, and three things follow. It stops being served, to you and to everyone else, immediately, and that part needs no review at all. Your claim is then re-examined independently against the corpus, and it is allowed to disagree with the Coach; the verdict comes back to you in about a minute. And if it is accepted, the fix goes to the pipeline that changes the generator itself, usually live inside ten minutes.`,

  // 7 — why feedback matters
  `One last thing, and it is the part only you can do.

Generation is already validated against the corpus before anything reaches you. But the system has no way of knowing which of its questions actually landed. You are the only source of that signal.

Flag a bad one and it leaves rotation at once, and the reason becomes a rule. The generator learns the shape of the mistake, not just the single question, so it stops producing the whole family of them.

And do praise the good ones. "This is a good question" is worth filing, because praise is the only positive signal the generator ever gets. Without it, it can only ever learn what to avoid, and never what to aim for.

Next, a quick tour of where everything lives. You can replay this from the Library whenever you like.`,
];

// ─────────────────────────────────────────────────────────────────────────────
// The Practical-drills walkthrough (PracticalWalkthrough, 8 steps)
//
// Fires the first time /practical is opened (migration 061) and replays from the Practical header
// and the Library. Same rule as the other two walkthroughs: explain, don't recite.
//
// Every mechanic named below is read off the live UI, not remembered:
//   • the four modes and their times    → practical/page.tsx MODES + the mode cards in dry-flights
//   • the wizard order                  → dry-flights/page.tsx `LandingStep`
//   • banked instant / fresh 30-60s     → dry-flights/page.tsx, the "generating" step copy
//   • Guided vs IMW Only                → lib/prompts/stemDetail.ts STEM_DETAIL_META
//   • Paper 3 Focus override            → dry-flights/page.tsx, shown only when paper === 3
//   • pick-my-wines vs BYO, partner vs self brief, exam-conditions 68 min / 2h15
//                                       → live-tasting/page.tsx and live-tasting/[id]/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

const PRACTICAL: string[] = [
  // 1 — the two drills
  `There are two ways to practise the practical here, and they are for different problems.

Dry Flights need no wine at all. You get a question in the IMW style, you answer it on the clock, and it is marked the way the examiners mark. Anything from two minutes to half an hour, which means you can do one on a Tuesday morning without planning anything.

Live Tastings are the real thing. Actual bottles, bought near you, poured blind, about two and a quarter hours end to end.

The honest division of labour: Dry Flights train the writing and the reasoning, which is where most marks are lost. Live Tastings train the palate and the nerve, which is what you cannot fake on the day. You need both, but you will do many more of the first.`,

  // 2 — the Dry Flights wizard
  `Setting up a dry flight is four short questions, and none of them is a commitment.

First the paper: whites, reds, or the special paper. Then the question family, or Any if you would rather not choose. Then the mode. Then where the question comes from.

One thing worth knowing on Paper 3: because it is the mixed paper, you get an extra Focus control, so you can lean the sampling towards sparkling, fortified, sweet, or whatever you have been avoiding. It appears only on Paper 3, because the other two do not need it.

Pick Any family when you want the exam's own unpredictability. Pick a specific family when you know exactly which structure keeps beating you. Both are legitimate; they just train different things.`,

  // 3 — the four modes
  `The four modes are not difficulty levels. They isolate different halves of the task.

Full Question is the complete simulation: stem, flight, timed answer, full feedback with marks. Twenty to thirty minutes. This is the one that tells you where you actually stand.

Stem Analysis Only is the fastest useful thing in the app. Five to ten minutes, no tasting, just reading the question as evidence and getting coached on your reasoning, then seeing the wines. If you have a spare ten minutes, do one of these.

Dry Notes removes the identification gamble entirely: the wines are revealed up front, and you are graded on style, quality, maturity and commercial position alone. Use it when your problem is the writing, not the guessing.

Flash Notes is one prompt at a time, a minute or two each, with pace tracking. Volume and speed.`,

  // 4 — new or banked, and the stem dial
  `Then two setup choices that people tend to click past, and both matter.

New or banked. A banked question is one already written and validated that you personally have never seen, and it appears instantly. A new one is written for you on the spot and takes thirty to sixty seconds. They are built to the same standard and nothing marks a banked question as banked. Take a banked one when you want to start now; take a new one when you want something nobody has answered.

Then: how much should the stem tell you? Guided adds framing hints. IMW Only shows the stem exactly as the exam prints it. The sub-questions and the marks are identical either way — only the framing prose changes.

Start on Guided if the structure is still unfamiliar. Move to IMW Only well before the exam, because that is the only version you will get on the day.`,

  // 5 — the run itself
  `Once it starts, treat it as the exam.

The clock runs. You write the answer you would actually write, not the answer you would write with a reference book open. Then it is marked against principles distilled from thirteen examiners' reports: reasoning over identification, quality judged in the context of origin, no shoehorning a wine into a story it does not fit.

The debrief is the part worth your time. It is not a score, it is where the marks went and why. Every attempt lands in History with the question, your answer and the debrief kept together, so you can go back and see whether the same mistake keeps recurring.

And the Coach is there the whole time. Opening it pauses your clock, so asking a question never costs you exam minutes.`,

  // 6 — what a Live Tasting is
  `Live Tastings solve the problem that dry practice cannot touch: you can reason perfectly on paper and still be undone by an actual glass.

The idea is straightforward. You say which paper and how many wines, and the app builds a realistic flight out of bottles that are genuinely purchasable near you, checked against shops in your city and against your budget. Not a theoretical flight of things you would have to import.

Then it protects your blindness, which is the hard part of practising alone. The shopping brief can be sent to a partner who buys the wines and enters them, so you never see a label. Every session records how blind it actually was, so a result you got after seeing the bottles is never quietly counted as if you hadn't.

About two and a quarter hours, and it is the closest thing to the exam you can arrange for yourself.`,

  // 7 — setting one up
  `Setting one up has a few choices, and they change the character of the session completely.

A single question, or a full paper. A full paper is corpus-realistic: the question mix, the flight sizes and the wine spread mirror real exams, and you do not pick the families — just like the real thing.

Who picks the wines. "Pick my wines" builds the flight and finds the stockists. "I'll choose wines" gives you a brief for that paper and question type, you buy whatever fits, and the question is built around the bottles you actually got — which is the practical option when your local shops are thin.

And how you sit it. Flight by flight, at your own pace, or exam conditions on the real clock — sixty-eight minutes for a half paper, two hours fifteen for a full one, where anything unanswered at the deadline scores zero.

Do a couple flight by flight first. Save exam conditions for when you want the truth.`,

  // 8 — the day itself
  `On the day, the sequence is: brief, buy, bag, taste, write, submit, reveal.

Get the bottles bagged and numbered, ideally by someone who is not you, and poured in slot order. If you are shopping for yourself, buy across a few days and let someone else do the bagging — that is the difference between a real result and an expensive rehearsal.

Then you write, in the same two passes as the exam: stem analysis first, then the full answer. It autosaves as you go, so a closed laptop does not cost you the session.

Only after you submit does it grade and reveal what was actually in the glasses. The reveal is the point. Reading a wine wrong and then seeing exactly what it was, with your own note beside it, teaches more in one flight than a week of reading.

That is both drills. You can replay this walkthrough from the Practical page or the Library whenever you like.`,
];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * The heading on each slide's "Learn more" card.
 *
 * Deliberately NOT the slide's own headline — a card that repeats the title behind it tells the
 * reader nothing about whether it is worth opening. These name the QUESTION the card answers. They
 * are not spoken, carry no audio, and can be reworded without a re-record.
 */
const TITLES: Record<string, string> = {
  // The first five are the headings the intro's dialog already used.
  "intro-0": "Why patterns matter",
  "intro-1": "What is stem analysis?",
  "intro-2": "What’s actually in the corpus",
  "intro-3": "How we measure honestly",
  "intro-4": "How theory grading works",
  "intro-5": "What happens next",

  "diagrams-0": "Why the mark split matters",
  "diagrams-1": "Finding the right deck in eight minutes",
  "diagrams-2": "What routing actually buys you",
  "diagrams-3": "How to read a leaf",
  "diagrams-4": "When the glass agrees with the paper",
  "diagrams-5": "What the tree got right — and wrong",
  "diagrams-6": "What the tree is for",

  "coach-0": "What the Coach is, and isn’t",
  "coach-1": "How to read a technical answer",
  "coach-2": "Where the answers come from",
  "coach-3": "Coaching, not searching",
  "coach-4": "When the Coach tells you no",
  "coach-5": "When you are right",
  "coach-6": "Why your feedback matters",

  "practical-0": "Which drill, and when",
  "practical-1": "Choosing your ground",
  "practical-2": "What each mode isolates",
  "practical-3": "The two setup choices that matter",
  "practical-4": "Treating it like the exam",
  "practical-5": "Why taste real bottles",
  "practical-6": "Choosing the shape of a tasting",
  "practical-7": "How tasting day runs",
};

/** The "Learn more" heading for a slide. */
export function narrationTitle(id: string): string {
  return TITLES[id] ?? "Learn more";
}

/** The transcript, split for rendering. Blank lines in the script are paragraph breaks. */
export function narrationParagraphs(id: string): string[] {
  return (TOUR_NARRATION[id] ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

function index(surface: NarrationSurface, lines: string[]): Record<string, string> {
  return Object.fromEntries(lines.map((text, i) => [narrationId(surface, i), text.trim()]));
}

/** id → spoken text. The generator's input and the drift test's source of truth. */
export const TOUR_NARRATION: Readonly<Record<string, string>> = {
  ...index("intro", INTRO),
  ...index("diagrams", DIAGRAMS),
  ...index("coach", COACH),
  ...index("practical", PRACTICAL),
};

export const NARRATION_IDS = Object.keys(TOUR_NARRATION);
