"use client";

import { useReducer, useEffect, useState, useCallback, useRef, useSyncExternalStore } from "react";
import { readSessionValue, subscribeToSessionStorage } from "@/lib/session-value";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  studyReducer,
  initialStudyState,
  type Question,
  type ModelAnswerPatch,
} from "@/lib/study-session";
import { useStreaming } from "@/lib/use-streaming";
import { useProgressStream } from "@/lib/use-progress-stream";
import { ThinkingTrace } from "../components/ThinkingTrace";
import { stemForLevel } from "../components/StemDetailControl";
import { isStemDetailLevel, stepUpLevel, type StemDetailLevel } from "@/lib/prompts/stemDetail";
import { QuestionDisplay } from "../components/QuestionDisplay";
import { PreGlassReasoning } from "../components/PreGlassReasoning";
import { StreamingFeedback } from "../components/StreamingFeedback";
import { SectionMarksRow, parseSectionMarks, stripSectionMarksTag } from "../components/SectionMarksRow";
import { WineReveal } from "../components/WineReveal";
import type { WineProvenance } from "@/lib/wine-provenance";
import { AnswerInput } from "../components/AnswerInput";
import { ModelAnswerReveal } from "../components/ModelAnswerReveal";
import { DecisionTreeWalkthrough } from "../components/DecisionTreeWalkthrough";
import { StudyTimerDisplay, FloatingTimer, TimingFeedback, useStudyTimer } from "../components/StudyTimer";
import { FlagQuestionButton } from "../components/FlagQuestionButton";
import { PaceStrip } from "../components/PaceStrip";
import { PaceReport } from "../components/PaceReport";
import { QuestionRecap } from "../components/QuestionRecap";
import {
  benchmarkFor,
  computePaceData,
  DEFAULT_PACE_PREFERENCE,
  type PaceData,
  type PaceMode,
  type SpeedSeconds,
} from "@/lib/pace";
import { useFeedbackContext, useFeedbackTimer } from "@/lib/feedback-context";

export default function StudyPage() {
  const router = useRouter();
  const { user } = useAuth();
  const userIdRef = useRef(user?.id);
  const [state, dispatch] = useReducer(studyReducer, initialStudyState);
  const [tastingNotes, setTastingNotes] = useState<string[]>([]);
  // Where each tasting note's reference profile came from. Rendered only after the candidate has
  // answered — the source URLs name the producer.
  const [tastingProvenance, setTastingProvenance] = useState<WineProvenance[]>([]);
  const [tastingLoading, setTastingLoading] = useState(false);
  // Live progress for the tasting-note generation. The generator runs a
  // generate-validate-regenerate loop (a red note on a white wine fixes itself), which is a real
  // wait — this reports it instead of parking the button on "Generating tasting notes…".
  // Used by both call sites; they belong to different study modes so never overlap.
  const tastingTrace = useProgressStream();
  // DERIVED, not owned. The home page writes "mw-study-mode" before navigating here; /study only
  // ever read it, once, in a mount effect — which painted "full" first and is what
  // react-hooks/set-state-in-effect flags. useSyncExternalStore reads sessionStorage directly, using
  // the server snapshot during SSR and hydration so the markup matches, then re-rendering with the
  // real value before paint.
  const studyMode = useSyncExternalStore(
    subscribeToSessionStorage,
    () => {
      const m = readSessionValue("mw-study-mode");
      return m === "stem-only" || m === "known-wine" ? m : "full";
    },
    () => "full" as const
  );
  const [modelAnswerReady, setModelAnswerReady] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const s = sessionStorage.getItem("mw-current-question");
      if (s) {
        const q = JSON.parse(s);
        return !!(q.modelAnswer && q.modelAnswer.length >= 100);
      }
    } catch {}
    return false;
  });
  const modelAnswerReadyRef = useRef(modelAnswerReady);
  // The live model answer text. A ref, not derived from `state`, because the submit gate installs a
  // late answer and grades in the same tick — reading `state.question` there would get the
  // pre-dispatch closure. Same pattern (and same reason) as the pace refs below.
  const modelAnswerTextRef = useRef<string>("");
  const [waitingForModel, setWaitingForModel] = useState(false);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [preGlassReasoning, setPreGlassReasoning] = useState("");
  const [isGeneratingFresh, setIsGeneratingFresh] = useState(false);
  // Stem Detail: the level this attempt STARTED at (chosen on the setup screen), and the level it
  // has been escalated to via "Add detail". Escalation is one-way and both are recorded on the
  // attempt, so a run that needed extra framing is never scored as if it didn't.
  // Derived for the same reason as studyMode above.
  const stemDetailStart = useSyncExternalStore(
    subscribeToSessionStorage,
    () => {
      const level = readSessionValue("mw-stem-detail");
      return isStemDetailLevel(level) ? level : "exam_real";
    },
    () => "exam_real" as StemDetailLevel
  );
  const [stemDetailEscalatedTo, setStemDetailEscalatedTo] = useState<StemDetailLevel | null>(null);

  const evalStream = useStreaming();
  const modelAnswerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timer = useStudyTimer();

  // ── Pace (Full Question + Dry Notes only) ──
  // Session benchmark (seeded from the user's default; switchable for THIS session only until the
  // first wine is banked), the per-wine banked times, and the total-elapsed mark at which the active
  // wine's clock started. The computed report is set at submit and rendered on the debrief.
  const paceEnabled = studyMode === "full" || studyMode === "known-wine";
  const [sessionPaceMode, setSessionPaceMode] = useState<PaceMode>(DEFAULT_PACE_PREFERENCE.pace);
  const [sessionSpeedSeconds, setSessionSpeedSeconds] = useState<SpeedSeconds>(DEFAULT_PACE_PREFERENCE.speedSeconds);
  const [bankedWineTimes, setBankedWineTimes] = useState<number[]>([]);
  const [activeWineStart, setActiveWineStart] = useState(0);
  const [paceResult, setPaceResult] = useState<PaceData | null>(null);
  // Refs mirror the pace session so the submit handler (whose useCallback deps intentionally omit
  // these fast-changing values) always reads the live figures.
  const bankedWineTimesRef = useRef<number[]>([]);
  const activeWineStartRef = useRef(0);
  const sessionPaceModeRef = useRef<PaceMode>(sessionPaceMode);
  const sessionSpeedSecondsRef = useRef<SpeedSeconds>(sessionSpeedSeconds);
  useEffect(() => { bankedWineTimesRef.current = bankedWineTimes; }, [bankedWineTimes]);
  useEffect(() => { activeWineStartRef.current = activeWineStart; }, [activeWineStart]);
  useEffect(() => { sessionPaceModeRef.current = sessionPaceMode; }, [sessionPaceMode]);
  useEffect(() => { sessionSpeedSecondsRef.current = sessionSpeedSeconds; }, [sessionSpeedSeconds]);

  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);

  // THE single writer for a late-arriving model answer. Every arrival path (the on-mount
  // generate call, the background poll, the submit gate's poll) funnels through here so the four
  // places that need to know can never disagree again:
  //   - the ref, read synchronously by grading
  //   - study state, which is what the debrief actually renders
  //   - sessionStorage, which is only there to survive a reload
  //   - the readiness flag that ungates submit
  // The old code updated sessionStorage alone, so the debrief rendered an empty answer for the
  // whole of every on-the-fly question. See ATTACH_MODEL_ANSWER in lib/study-session.ts.
  const applyModelAnswer = useCallback((patch: ModelAnswerPatch) => {
    if (!patch.modelAnswer) return;
    modelAnswerTextRef.current = patch.modelAnswer;
    dispatch({ type: "ATTACH_MODEL_ANSWER", answer: patch });
    try {
      const stored = sessionStorage.getItem("mw-current-question");
      if (stored) {
        const q = JSON.parse(stored);
        sessionStorage.setItem(
          "mw-current-question",
          JSON.stringify({
            ...q,
            modelAnswer: patch.modelAnswer,
            hasModelAnswer: true,
            ...(patch.proposedAnnotation ? { proposedAnnotation: patch.proposedAnnotation } : {}),
            ...(patch.studyDiagramAssist ? { studyDiagramAssist: patch.studyDiagramAssist } : {}),
          })
        );
      }
    } catch {}
    modelAnswerReadyRef.current = true;
    setModelAnswerReady(true);
  }, []);

  // Seed the session pace from the user's saved default (does not touch a flight already underway).
  useEffect(() => {
    if (!user?.id) return;
    fetch("/api/user/pace-preference")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        if (bankedWineTimesRef.current.length > 0) return; // flight underway — don't re-seed
        if (d.pace === "exam" || d.pace === "speed") setSessionPaceMode(d.pace);
        if (d.speedSeconds === 480 || d.speedSeconds === 540) setSessionSpeedSeconds(d.speedSeconds);
      })
      .catch(() => {});
  }, [user?.id]);

  // Switch the benchmark for THIS session (ignored once the flight is underway).
  const handleSelectPace = useCallback((mode: PaceMode) => {
    if (bankedWineTimesRef.current.length > 0) return;
    setSessionPaceMode(mode);
  }, []);

  // Bank the active wine's elapsed seconds and start the next chip at 0.
  const handleNextWine = useCallback(() => {
    const now = timer.getElapsed();
    setBankedWineTimes((prev) => [...prev, Math.max(0, now - activeWineStartRef.current)]);
    setActiveWineStart(now);
  }, [timer]);

  // Load question and mode from sessionStorage on mount
  useEffect(() => {
    // studyMode and stemDetailStart are read via useSyncExternalStore above, not restored here.
    const stored = sessionStorage.getItem("mw-current-question");
    if (stored) {
      try {
        const question: Question = JSON.parse(stored);
        dispatch({ type: "SELECT_QUESTION", question });

        const hasAnswer = question.modelAnswer && question.modelAnswer.length >= 100;
        if (!hasAnswer) {
          fetch("/api/generate-model-answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              questionId: question.id,
              // Canonical, NOT the level-resolved stem: the model answer is cached per question_id
              // and shared by all three levels, so it must not vary with the candidate's dial.
              questionText: question.text,
              wines: question.wines,
              paper: question.paper,
              family: question.family,
            }),
          })
            .then((r) => r.json())
            .then((d) => {
              if (d.success && d.question?.model_answer) {
                applyModelAnswer({
                  modelAnswer: d.question.model_answer,
                  proposedAnnotation: d.question.proposed_annotation,
                  studyDiagramAssist: d.question.study_diagram_assist,
                });
              }
            })
            .catch(() => {});
        } else {
          // Resuming a question whose answer was already in the snapshot — seed the grading ref
          // from it, since applyModelAnswer will never run for this attempt.
          modelAnswerTextRef.current = question.modelAnswer ?? "";
          modelAnswerReadyRef.current = true;
        }
      } catch {
        router.push("/practical/dry-flights");
      }
    } else {
      router.push("/practical/dry-flights");
    }
  }, [router, applyModelAnswer]);

  // Create attempt once auth is loaded — ensures user_id is never null
  useEffect(() => {
    if (!user?.id || attemptId) return;
    const stored = sessionStorage.getItem("mw-current-question");
    if (!stored) return;
    try {
      const question: Question = JSON.parse(stored);
      // Tag Dry Notes (known-wine) attempts so /history can label and filter them. Read the mode
      // from sessionStorage rather than the studyMode state, which may not be set yet on first run.
      const persistMode = sessionStorage.getItem("mw-study-mode") === "known-wine" ? "known-wine" : null;
      // Read the level from sessionStorage rather than stemDetailStart, for the same reason as mode:
      // this effect can run before the state-setting effect above has committed.
      const storedLevel = sessionStorage.getItem("mw-stem-detail");
      const persistStemDetail = isStemDetailLevel(storedLevel) ? storedLevel : "exam_real";
      fetch("/api/save-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          questionId: question.id,
          userId: user.id,
          mode: persistMode,
          stemDetail: persistStemDetail,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.attempt?.id) setAttemptId(d.attempt.id);
        })
        .catch(() => {});
    } catch {}
  }, [user?.id, attemptId]);

  // Stem Detail: the level currently in force, the prose to render at it, and the next level up.
  // stemForLevel falls back to the canonical stem for any level not yet backfilled, so this is
  // always a real question even if the out-of-band derivation hasn't run.
  const stemDetailLevel = stemDetailEscalatedTo ?? stemDetailStart;
  // StudyState is a discriminated union — only the "select-paper" arm has no question. Declared
  // here (rather than further down) because the submit callbacks below need the resolved stem.
  const currentQuestion = state.step !== "select-paper" ? state.question : null;
  const displayedStem = currentQuestion ? stemForLevel(currentQuestion, stemDetailLevel) : "";
  const nextStemDetailLevel = stepUpLevel(stemDetailLevel);

  // ── Coach screen-context wiring ──
  // Publish the on-screen question so the Coach can anchor a report to it, and hand it pause/resume
  // + a live remaining getter so opening the dock pauses the clock. The Coach is the only consumer
  // now that the floating Feedback pill is gone, and report_question/flag_defect BLOCK without a
  // questionId here — so this is load-bearing, not decoration.
  const { setFeedbackContext, clearFeedbackContext } = useFeedbackContext();
  const { registerTimer } = useFeedbackTimer();

  useEffect(() => {
    if (!currentQuestion) {
      clearFeedbackContext();
      return;
    }
    setFeedbackContext({
      paper: currentQuestion.paper,
      questionNumber: currentQuestion.questionNumber,
      questionId: currentQuestion.id,
      attemptId,
      mode: studyMode,
      route: "/study",
    });
  }, [currentQuestion, attemptId, studyMode, setFeedbackContext, clearFeedbackContext]);

  useEffect(() => () => clearFeedbackContext(), [clearFeedbackContext]);

  // The Coach only shows/pauses a countdown when there is a live per-wine benchmark (Full
  // Question / Dry Notes) and the clock is genuinely running.
  const feedbackTimerActiveRef = useRef(false);
  // Keep the live "is the countdown active?" flag in a ref for getRemainingSeconds to read, syncing
  // it in an effect (refs must not be written during render).
  useEffect(() => {
    feedbackTimerActiveRef.current =
      paceEnabled &&
      currentQuestion != null &&
      !timer.stopped &&
      state.step !== "select-paper" &&
      state.step !== "reveal-answer" &&
      state.step !== "feedback";
  });

  useEffect(() => {
    registerTimer({
      pause: () => timer.pause(),
      resume: () => timer.resume(),
      getRemainingSeconds: () => {
        if (!feedbackTimerActiveRef.current) return null;
        const benchmark = benchmarkFor(sessionPaceModeRef.current, sessionSpeedSecondsRef.current);
        const activeElapsed = timer.getElapsed() - activeWineStartRef.current;
        return Math.max(0, benchmark - activeElapsed);
      },
    });
    return () => registerTimer(null);
    // timer's pause/resume/getElapsed are stable callbacks; the refs carry the live values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerTimer]);

  // "Add detail" — one-way step up. Persist the level the candidate ENDED at so history and grading
  // can tell an unaided run from an assisted one.
  const handleAddDetail = useCallback(() => {
    const next = stepUpLevel(stemDetailEscalatedTo ?? stemDetailStart);
    if (!next) return;
    setStemDetailEscalatedTo(next);
    if (attemptId) {
      fetch("/api/save-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", attemptId, stem_detail_escalated_to: next }),
      }).catch(() => {});
    }
  }, [attemptId, stemDetailEscalatedTo, stemDetailStart]);

  // Broadcast current step for live admin view
  useEffect(() => {
    if (!attemptId || state.step === "select-paper") return;
    fetch("/api/save-attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", attemptId, current_step: state.step }),
    }).catch(() => {});
  }, [state.step, attemptId]);

  // Poll for model answer readiness (if generated in background)
  useEffect(() => {
    if (modelAnswerReady) return;
    if (state.step === "select-paper") return;

    const question = state.question;

    modelAnswerPollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/check-model-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: question.id }),
        });
        const data = await res.json();
        if (data.ready) {
          // Install the text, not just the flag. This poll is the safety net for the case where
          // the on-mount generate call never resolves (tab backgrounded, request dropped, or the
          // server-side background writer got there first).
          applyModelAnswer({
            modelAnswer: data.modelAnswer,
            proposedAnnotation: data.proposedAnnotation,
            studyDiagramAssist: data.studyDiagramAssist,
          });
          if (modelAnswerPollRef.current) {
            clearInterval(modelAnswerPollRef.current);
          }
        }
      } catch {}
    }, 5000);

    return () => {
      if (modelAnswerPollRef.current) clearInterval(modelAnswerPollRef.current);
    };
  }, [modelAnswerReady, state, applyModelAnswer]);

  // Handle pre-glass reasoning submission
  const handleReasoningSubmit = useCallback(
    async (reasoning: string) => {
      if (state.step !== "pre-glass") return;
      setPreGlassReasoning(reasoning);

      // Save to Neon
      if (attemptId) {
        fetch("/api/save-attempt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            attemptId,
            pre_glass_reasoning: reasoning,
          }),
        }).catch(() => {});
      }

      dispatch({ type: "SUBMIT_REASONING", reasoning });

      if (studyMode === "stem-only") {
        // In stem-only mode, stream the pre-glass feedback immediately
        const wineAppearances = state.question.wines
          .filter((w) => w.appearance)
          .map((w) => ({ slot: w.slot, appearance: w.appearance! }));

        const feedback = await evalStream.startStream("/api/evaluate-reasoning", {
          // The stem the candidate actually read. Coaching them on cues that were withheld at
          // their level (or crediting them for cues they never saw) is worse than no feedback.
          questionText: displayedStem,
          reasoning,
          paper: state.question.paper,
          ...(wineAppearances.length > 0 && { wineAppearances }),
        });

        if (attemptId && feedback) {
          fetch("/api/save-attempt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update", attemptId, pre_glass_feedback: feedback }),
          }).catch(() => {});
        }

        dispatch({ type: "PRE_GLASS_FEEDBACK_DONE", feedback: feedback || "" });
      } else {
        // Full mode: skip straight to reveal (feedback shown at end)
        dispatch({
          type: "PRE_GLASS_FEEDBACK_DONE",
          feedback: "(Feedback will be shown at the end)",
        });
      }
    },
    [state, attemptId, studyMode, evalStream, displayedStem]
  );

  // Handle wine reveal
  const handleRevealWines = useCallback(async () => {
    if (state.step !== "reveal") return;
    setTastingLoading(true);
    timer.pause();

    try {
      const data = await tastingTrace.run<{ tastingNotes: string[]; provenance?: WineProvenance[] }>(
        "/api/generate-tasting/stream",
        { wines: state.question.wines, questionId: state.question.id }
      );
      if (!data?.tastingNotes) {
        // errorRef, not error: the closure's `error` predates the stream (see use-progress-stream).
        throw new Error(tastingTrace.errorRef.current || "Failed to generate tasting notes");
      }
      setTastingNotes(data.tastingNotes);
      setTastingProvenance(data.provenance ?? []);

      // Save tasting notes to Neon
      if (attemptId) {
        fetch("/api/save-attempt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            attemptId,
            tasting_notes: data.tastingNotes,
          }),
        }).catch(() => {});
      }

      dispatch({ type: "REVEAL_WINES", tastingNotes: data.tastingNotes });
    } catch (err) {
      console.error("Tasting generation error:", err);
      const fallback = state.question.wines.map(
        (w) => `**Wine ${w.slot}**\n\nTasting notes unavailable.`
      );
      setTastingNotes(fallback);
      dispatch({ type: "REVEAL_WINES", tastingNotes: fallback });
    } finally {
      setTastingLoading(false);
      timer.resume();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, attemptId, timer.pause, timer.resume]);

  // Run the combined final evaluation
  const runFinalEvaluation = useCallback(
    async (answer: string, inputMethod: "typed" | "voice" = "typed") => {
      if (state.step !== "feedback" && state.step !== "answer") return;

      // The live answer, maintained by applyModelAnswer (and seeded at mount when resuming a
      // question that already had one). Previously this re-read sessionStorage — the only consumer
      // wired to the copy that actually got updated, which is why grading kept working while the
      // debrief showed nothing.
      const modelAnswer = modelAnswerTextRef.current;

      const wineAppearances = state.question.wines
        .filter((w) => w.appearance)
        .map((w) => ({ slot: w.slot, appearance: w.appearance! }));

      const feedback = await evalStream.startStream("/api/evaluate-full", {
        // The stem as answered. Marks and sub-questions are byte-identical across levels (enforced
        // by variantPreservesStructure), so grading is unchanged — only the framing differs.
        questionText: displayedStem,
        // Sent so the server can read this question's STORED answer key. That key is the only place
        // each wine's keyed banker/curveball role lives, and the claim check needs it to enforce
        // (rather than merely flag) that the debrief doesn't call the flight's anchor a curveball.
        questionId: state.question.id,
        preGlassReasoning,
        userAnswer: answer,
        modelAnswer,
        paper: state.question.paper,
        // Dictated answers get their spelling reported but not deducted (marking-principles).
        inputMethod,
        // Revealed wines — constrain debrief imagery to these (regions/producers/varieties only).
        wines: state.question.wines.map((w) => ({ slot: w.slot, fullText: w.fullText })),
        ...(wineAppearances.length > 0 && { wineAppearances }),
        // Known-Wine Write-Up mode: identity was given up front, so grade the write-up only
        // (ID marks folded into the remaining sub-parts; no stem-analysis review).
        ...(studyMode === "known-wine" && { identityRevealed: true }),
      });

      if (attemptId) {
        const lower = feedback.toLowerCase();
        const passEstimate =
          lower.includes("unlikely to pass") ||
          lower.includes("not pass") ||
          lower.includes("would fail") ||
          lower.includes("**result: fail**")
            ? "fail"
            : lower.includes("borderline") || lower.includes("**result: borderline**")
              ? "borderline"
              : lower.includes("**result: pass**")
                ? "pass"
                : null;

        fetch("/api/save-attempt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            attemptId,
            answer_feedback: feedback,
            pass_estimate: passEstimate,
            elapsed_seconds: timer.getElapsed(),
            completed_at: new Date().toISOString(),
          }),
        }).catch(() => {});
      }

      dispatch({ type: "ANSWER_FEEDBACK_DONE", feedback });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, preGlassReasoning, attemptId, evalStream, timer.getElapsed]
  );

  const runFinalEvaluationRef = useRef(runFinalEvaluation);
  useEffect(() => { runFinalEvaluationRef.current = runFinalEvaluation; }, [runFinalEvaluation]);

  // Handle answer submission — get the full evaluation
  const handleAnswerSubmit = useCallback(
    async (answer: string, inputMethod: "typed" | "voice" = "typed") => {
      if (state.step !== "answer") return;
      timer.stop();
      dispatch({ type: "SUBMIT_ANSWER", answer });

      // Pace (Full Question + Dry Notes): bank the active wine, build the per-wine report, and
      // persist it. The clock never blocked — this only records the benchmark comparison.
      if (studyMode === "full" || studyMode === "known-wine") {
        const wineCount = state.question.wines.length;
        const now = timer.getElapsed();
        const times = [...bankedWineTimesRef.current];
        if (times.length < wineCount) times.push(Math.max(0, now - activeWineStartRef.current));
        while (times.length < wineCount) times.push(0);
        const pd = computePaceData({
          mode: sessionPaceModeRef.current,
          speedSeconds: sessionSpeedSecondsRef.current,
          wineTimes: times.slice(0, wineCount),
          wineCount,
        });
        setPaceResult(pd);
        if (attemptId) {
          fetch("/api/save-attempt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update", attemptId, pace: pd }),
          }).catch(() => {});
        }
      }

      if (attemptId) {
        fetch("/api/save-attempt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            attemptId,
            user_answer: answer,
            input_method: inputMethod,
          }),
        }).catch(() => {});
      }

      // Known-Wine Write-Up: the candidate wrote from the revealed identity without seeing any
      // tasting notes. Generate the reference notes now (in the background) so they can be revealed
      // alongside the grade on the Results/Review steps — "submit reveals the actual notes". Grading
      // (evaluate-full) does not depend on these, so we don't await them before evaluating.
      if (studyMode === "known-wine" && tastingNotes.length === 0) {
        setTastingLoading(true);
        // Streamed like the reveal path, so the notes panel shows the generator working rather
        // than a bare skeleton while the debrief grades alongside it. Deliberately not awaited.
        tastingTrace
          .run<{ tastingNotes: string[]; provenance?: WineProvenance[] }>("/api/generate-tasting/stream", {
            wines: state.question.wines,
            questionId: state.question.id,
          })
          .then((d) => {
            if (d?.tastingNotes) {
              setTastingNotes(d.tastingNotes);
              setTastingProvenance(d.provenance ?? []);
              if (attemptId) {
                fetch("/api/save-attempt", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "update", attemptId, tasting_notes: d.tastingNotes }),
                }).catch(() => {});
              }
            }
          })
          .catch(() => {})
          .finally(() => setTastingLoading(false));
      }

      if (!modelAnswerReady) {
        setWaitingForModel(true);
        const poll = setInterval(async () => {
          try {
            const res = await fetch("/api/check-model-answer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ questionId: state.question.id }),
            });
            const data = await res.json();
            if (data.ready) {
              clearInterval(poll);
              setWaitingForModel(false);
              // Install BEFORE grading. applyModelAnswer sets modelAnswerTextRef synchronously,
              // which is exactly why grading reads the ref and not `state.question` — the dispatch
              // on the line above has not been applied by the time this call reads it.
              applyModelAnswer({
                modelAnswer: data.modelAnswer,
                proposedAnnotation: data.proposedAnnotation,
                studyDiagramAssist: data.studyDiagramAssist,
              });
              runFinalEvaluationRef.current(answer, inputMethod);
            }
          } catch {}
        }, 3000);
        return;
      }

      runFinalEvaluationRef.current(answer, inputMethod);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, attemptId, modelAnswerReady, timer.stop]
  );

  // Handle generate fresh question (skip banked, get a new one)
  const handleGenerateFresh = useCallback(async () => {
    if (state.step !== "question") return;
    setIsGeneratingFresh(true);

    try {
      const res = await fetch("/api/get-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paper: state.question.paper,
          family: state.question.family,
          forceFresh: true,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const q = data.question;
      const question = {
        id: q.question_id,
        source: data.source,
        paper: q.paper,
        questionNumber: 1,
        text: q.question_text,
        wines: typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines,
        totalMarks: q.total_marks,
        family: q.family,
        familyLabel: q.family_label,
        subcategory: q.subcategory || "",
        hasModelAnswer: data.hasModelAnswer,
        hasDecisionMatrix: false,
        hasWineResearch: false,
        modelAnswer: q.model_answer || "",
        proposedAnnotation: q.proposed_annotation || "",
        studyDiagramAssist: q.study_diagram_assist || "",
        year: null,
      };

      sessionStorage.setItem("mw-current-question", JSON.stringify(question));
      // Seed the grading ref from the swapped-in question. A banked question arrives with its
      // answer already attached; a fresh one arrives empty and applyModelAnswer fills it in below.
      modelAnswerTextRef.current = question.modelAnswer;
      setModelAnswerReady(data.hasModelAnswer);
      dispatch({ type: "SELECT_QUESTION", question });

      // Create attempt (with user_id if logged in). Carry the Dry Notes (known-wine) tag.
      fetch("/api/save-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          questionId: question.id,
          userId: userIdRef.current || null,
          mode: studyMode === "known-wine" ? "known-wine" : null,
        }),
      })
        .then((r) => r.json())
        .then((d) => { if (d.attempt?.id) setAttemptId(d.attempt.id); })
        .catch(() => {});

      // Background model answer gen if needed
      if (!data.hasModelAnswer) {
        fetch("/api/generate-model-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: question.id,
            questionText: question.text,
            wines: question.wines,
            paper: question.paper,
            family: question.family,
          }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.success && d.question?.model_answer) {
              applyModelAnswer({
                modelAnswer: d.question.model_answer,
                proposedAnnotation: d.question.proposed_annotation,
                studyDiagramAssist: d.question.study_diagram_assist,
              });
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error("Generate fresh error:", err);
    } finally {
      setIsGeneratingFresh(false);
    }
  }, [state, applyModelAnswer]);

  // Handle next question
  const handleNextQuestion = useCallback(() => {
    evalStream.reset();
    timer.reset();
    setTastingNotes([]);
    setTastingProvenance([]);
    setTastingLoading(false);
    setModelAnswerReady(false);
    // Clear alongside the flag, or the next question would be graded against this one's answer.
    modelAnswerTextRef.current = "";
    modelAnswerReadyRef.current = false;
    setWaitingForModel(false);
    setAttemptId(null);
    setPreGlassReasoning("");
    setBankedWineTimes([]);
    setActiveWineStart(0);
    setPaceResult(null);
    if (modelAnswerPollRef.current) clearInterval(modelAnswerPollRef.current);
    dispatch({ type: "RESET" });
    router.push("/practical/dry-flights");
  }, [router, evalStream, timer]);

  // Flag Question (feature): after a candidate flags the question, auto-load the next one in the SAME
  // paper/family/mode. Reuses the ordinary serve path (/api/get-question, banked-first — NOT forceFresh)
  // so a fresh flag doesn't force a generation. Mirrors handleGenerateFresh's mapping but resets the
  // per-question transient state first (like handleNextQuestion, minus the RESET/redirect) and swaps the
  // question in place, so the debrief unmounts and the fresh question renders from the "question" step.
  const handleFlagLoadNext = useCallback(async () => {
    if (state.step === "select-paper") return;
    const paper = state.question.paper;
    const family = state.question.family;

    evalStream.reset();
    timer.reset();
    setTastingNotes([]);
    setTastingProvenance([]);
    setTastingLoading(false);
    setWaitingForModel(false);
    setPreGlassReasoning("");
    setBankedWineTimes([]);
    setActiveWineStart(0);
    setPaceResult(null);
    setModelAnswerReady(false);
    // Same reason as handleNextQuestion: the outgoing question's answer must not survive the swap.
    modelAnswerTextRef.current = "";
    modelAnswerReadyRef.current = false;
    setAttemptId(null);
    if (modelAnswerPollRef.current) clearInterval(modelAnswerPollRef.current);

    try {
      const res = await fetch("/api/get-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper, family }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const q = data.question;
      const question = {
        id: q.question_id,
        source: data.source,
        paper: q.paper,
        questionNumber: 1,
        text: q.question_text,
        wines: typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines,
        totalMarks: q.total_marks,
        family: q.family,
        familyLabel: q.family_label,
        subcategory: q.subcategory || "",
        hasModelAnswer: data.hasModelAnswer,
        hasDecisionMatrix: false,
        hasWineResearch: false,
        modelAnswer: q.model_answer || "",
        proposedAnnotation: q.proposed_annotation || "",
        studyDiagramAssist: q.study_diagram_assist || "",
        year: null,
      };

      sessionStorage.setItem("mw-current-question", JSON.stringify(question));
      // Seed the grading ref from the swapped-in question. A banked question arrives with its
      // answer already attached; a fresh one arrives empty and applyModelAnswer fills it in below.
      modelAnswerTextRef.current = question.modelAnswer;
      setModelAnswerReady(data.hasModelAnswer);
      dispatch({ type: "SELECT_QUESTION", question });

      fetch("/api/save-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          questionId: question.id,
          userId: userIdRef.current || null,
          mode: studyMode === "known-wine" ? "known-wine" : null,
        }),
      })
        .then((r) => r.json())
        .then((d) => { if (d.attempt?.id) setAttemptId(d.attempt.id); })
        .catch(() => {});

      if (!data.hasModelAnswer) {
        fetch("/api/generate-model-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: question.id,
            questionText: question.text,
            wines: question.wines,
            paper: question.paper,
            family: question.family,
          }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.success && d.question?.model_answer) {
              applyModelAnswer({
                modelAnswer: d.question.model_answer,
                proposedAnnotation: d.question.proposed_annotation,
                studyDiagramAssist: d.question.study_diagram_assist,
              });
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error("Flag load-next error:", err);
    }
  }, [state, evalStream, timer, studyMode, applyModelAnswer]);

  // "Back to paper" escape hatch after a flag — clear the current question and return to the picker.
  const handleBackToPaper = useCallback(() => {
    sessionStorage.removeItem("mw-current-question");
    sessionStorage.removeItem("mw-study-mode");
    dispatch({ type: "RESET" });
    router.push("/practical/dry-flights");
  }, [router]);

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={handleNextQuestion}
            className="text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            &larr; Back to questions
          </button>
          {currentQuestion && (
            <div className="flex items-center gap-3">
              <StudyTimerDisplay
                elapsed={timer.elapsed}
                paused={timer.paused}
                stopped={timer.stopped}
                wineCount={currentQuestion.wines.length}
              />
              <span className="text-xs font-mono px-2 py-1 rounded bg-accent/20 text-accent">
                {currentQuestion.paper === 1
                  ? "P1 Whites"
                  : currentQuestion.paper === 2
                    ? "P2 Reds"
                    : "P3 Special"}
              </span>
              <span className="text-xs font-mono px-2 py-1 rounded bg-card text-muted">
                {currentQuestion.familyLabel}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Progress bar */}
      {currentQuestion && (
        <div className="border-b border-border">
          <div className="max-w-4xl mx-auto px-6">
            <div className="flex">
              {(studyMode === "known-wine" ? [
                { key: "question", label: "Known Wines" },
                { key: "answer", label: "Write-Up" },
                { key: "feedback", label: "Results" },
                { key: "reveal-answer", label: "Review" },
              ] : studyMode === "stem-only" ? [
                { key: "question", label: "Question" },
                { key: "pre-glass", label: "Stem Analysis" },
                { key: "pre-glass-feedback", label: "Coaching" },
                { key: "reveal", label: "Wines" },
              ] : [
                { key: "question", label: "Question" },
                { key: "pre-glass", label: "Stem Analysis" },
                { key: "reveal", label: "Tasting" },
                { key: "answer", label: "Answer" },
                { key: "feedback", label: "Results" },
                { key: "reveal-answer", label: "Review" },
              ]).map((s) => {
                const steps = [
                  "question",
                  "pre-glass",
                  "pre-glass-feedback",
                  "reveal",
                  "answer",
                  "feedback",
                  "reveal-answer",
                ];
                const currentIdx = steps.indexOf(state.step);
                const stepIdx = steps.indexOf(s.key);
                const isActive =
                  s.key === state.step ||
                  (s.key === "reveal" && state.step === "pre-glass-feedback");
                const isDone = stepIdx < currentIdx && stepIdx !== -1;

                return (
                  <div
                    key={s.key}
                    className={`flex-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                      isActive
                        ? "border-accent text-accent"
                        : isDone
                          ? "border-accent/40 text-accent/60"
                          : "border-transparent text-muted/40"
                    }`}
                  >
                    {s.label}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Pace strip — Full Question & Dry Notes only; persists in the header region across the
          reveal/answer steps while the clock is running (hidden on the results/review screens). */}
      {currentQuestion && paceEnabled && state.step !== "feedback" && state.step !== "reveal-answer" && (
        <PaceStrip
          wineCount={currentQuestion.wines.length}
          totalElapsed={timer.elapsed}
          bankedWineTimes={bankedWineTimes}
          activeWineStart={activeWineStart}
          paceMode={sessionPaceMode}
          speedSeconds={sessionSpeedSeconds}
          locked={bankedWineTimes.length > 0}
          onSelectPace={handleSelectPace}
          onNextWine={handleNextWine}
        />
      )}

      {/* Main content */}
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Question view */}
          {state.step === "question" && (
            <QuestionDisplay
              question={state.question}
              mode={studyMode}
              stemText={displayedStem}
              stemDetailLevel={stemDetailLevel}
              stemDetailStartedAt={stemDetailEscalatedTo ? stemDetailStart : null}
              nextStemDetailLevel={studyMode === "known-wine" ? null : nextStemDetailLevel}
              onAddDetail={handleAddDetail}
              onStartReasoning={() =>
                dispatch({
                  type: studyMode === "known-wine" ? "START_KNOWN_WINE" : "START_PRE_GLASS",
                })
              }
              onGenerateFresh={handleGenerateFresh}
              isGenerating={isGeneratingFresh}
            />
          )}

          {/* Pre-glass reasoning */}
          {state.step === "pre-glass" && (
            <PreGlassReasoning
              question={state.question}
              stemText={displayedStem}
              onSubmit={handleReasoningSubmit}
            />
          )}

          {/* Stem-only mode: show streaming feedback then wine reveal */}
          {studyMode === "stem-only" && state.step === "pre-glass-feedback" && (
            <div className="space-y-6">
              {evalStream.isStreaming || evalStream.text ? (
                <StreamingFeedback
                  text={evalStream.text}
                  thinking={evalStream.thinking}
                  isStreaming={evalStream.isStreaming}
                  title="Stem Analysis Coaching"
                  error={null}
                />
              ) : (
                <div className="bg-card rounded-xl border border-accent/30 p-6 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted">
                    <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
                    <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
                    <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
                    <span className="ml-2 text-sm">Analyzing your stem reasoning...</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stem-only mode: after feedback done, show wine reveal + done */}
          {studyMode === "stem-only" && state.step === "reveal" && (
            <div className="space-y-6">
              {state.preGlassFeedback && state.preGlassFeedback !== "(Feedback will be shown at the end)" && (
                <StreamingFeedback
                  text={state.preGlassFeedback}
                  isStreaming={false}
                  title="Stem Analysis Coaching"
                  error={null}
                />
              )}

              <div className="bg-card rounded-xl border border-border p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">The Wines</h3>
                <div className="space-y-3">
                  {state.question.wines.map((w) => (
                    <div key={w.slot} className="flex gap-3 bg-background rounded-lg p-3 border border-border/50">
                      <span className="text-accent font-mono font-bold shrink-0">{w.slot}.</span>
                      <span className="text-foreground text-sm">{w.fullText}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Inline feedback prompt for stem-only */}
              <div className="bg-card/50 rounded-xl border border-border/50 p-5 text-center">
                <p className="text-sm text-muted mb-3">
                  Was the coaching accurate? Any issues with this question?
                </p>
                <p className="text-xs text-muted">
                  Use the <span className="text-accent font-medium">Feedback</span> button (bottom-left) to let us know.
                </p>
              </div>

              <div className="flex justify-center gap-4">
                <button
                  onClick={() => {
                    sessionStorage.removeItem("mw-current-question");
                    sessionStorage.removeItem("mw-study-mode");
                    router.push("/practical/dry-flights");
                  }}
                  className="px-8 py-3 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Practice Another Question
                </button>
              </div>

              {/* Flag Question (feature): debrief footer control for stem-only — the wines are now
                  revealed, so the candidate can flag a broken question and swap in a fresh one. */}
              <div className="flex justify-center">
                <FlagQuestionButton
                  questionId={state.question.id}
                  attemptId={attemptId}
                  wines={state.question.wines}
                  onLoadNext={handleFlagLoadNext}
                  onBackToPaper={handleBackToPaper}
                />
              </div>
            </div>
          )}

          {/* Full mode: skip pre-glass-feedback, go to tasting reveal. (Known-Wine Write-Up skips
              this step entirely — it goes straight from the question to the write-up, and reveals
              the reference tasting notes later, at Results.) */}
          {studyMode === "full" && (state.step === "pre-glass-feedback" || state.step === "reveal") && (
            <div className="space-y-6">
              <div className="bg-card rounded-xl border border-accent/30 p-6 text-center">
                <p className="text-sm text-muted mb-2">
                  Your stem analysis has been saved. Full feedback will be
                  provided at the end.
                </p>
                <p className="text-foreground font-semibold">
                  Now let&apos;s taste the wines.
                </p>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={handleRevealWines}
                  disabled={tastingLoading}
                  className="px-10 py-3 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50"
                >
                  {tastingLoading
                    ? "Generating tasting notes..."
                    : "Reveal Tasting Notes"}
                </button>
              </div>
              {tastingLoading && (
                <>
                  {/* Spoiler-gated: the notes themselves are sanitized, but the generator reasons
                      over the real wines and the candidate still has to identify them. */}
                  <ThinkingTrace
                    status={tastingTrace.status}
                    statuses={tastingTrace.statuses}
                    thinking={tastingTrace.thinking}
                    active={!tastingTrace.error}
                    error={tastingTrace.error}
                    spoiler
                    idleLabel="Generating tasting notes…"
                  />
                  <WineReveal
                    tastingNotes={[]}
                    wineCount={state.question.wines.length}
                    isLoading={true}
                  />
                </>
              )}
            </div>
          )}

          {/* Answer writing */}
          {state.step === "answer" && (
            <div className="space-y-6">
              {studyMode === "known-wine" ? (
                /* Known-Wine Write-Up: the identities stay revealed the whole time, so the
                   candidate writes to a known target without having to remember the wines. No
                   tasting notes here — they are revealed at Results, after submitting. */
                <div className="bg-card rounded-xl border border-accent/30 p-6">
                  <p className="text-xs font-semibold text-accent mb-3 uppercase tracking-wide">
                    The Wines (revealed)
                  </p>
                  <div className="space-y-2">
                    {state.question.wines.map((w) => (
                      <div key={w.slot} className="flex gap-3 bg-background rounded-lg p-3 border border-border/50">
                        <span className="text-accent font-mono font-bold shrink-0">{w.slot}.</span>
                        <span className="text-foreground text-sm">{w.fullText}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <WineReveal
                  tastingNotes={tastingNotes}
                  wineCount={state.question.wines.length}
                  isLoading={false}
                />
              )}
              <AnswerInput
                question={state.question}
                onSubmit={handleAnswerSubmit}
                tastingNotes={studyMode === "known-wine" ? undefined : tastingNotes}
                mode={studyMode}
              />
            </div>
          )}

          {/* Waiting for model answer / Evaluation streaming */}
          {state.step === "feedback" && (
            <div className="space-y-6">
              {paceEnabled && paceResult && (
                <PaceReport pace={paceResult} wines={state.question.wines} />
              )}
              {waitingForModel ? (
                <div className="bg-card rounded-xl border border-border p-8 text-center">
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
                    <div
                      className="w-2 h-2 rounded-full bg-accent/50 streaming-dot"
                      style={{ animationDelay: "0.3s" }}
                    />
                    <div
                      className="w-2 h-2 rounded-full bg-accent/50 streaming-dot"
                      style={{ animationDelay: "0.6s" }}
                    />
                  </div>
                  <p className="text-foreground font-semibold mb-2">
                    Preparing your results...
                  </p>
                  <p className="text-sm text-muted">
                    The model answer is still being generated. This usually
                    takes 1-2 minutes.
                  </p>
                </div>
              ) : (
                <>
                  {/* Split Sections: per-section marks awarded, above the debrief body. */}
                  <SectionMarksRow marks={parseSectionMarks(evalStream.text)} />
                  <StreamingFeedback
                    text={stripSectionMarksTag(evalStream.text)}
                    thinking={evalStream.thinking}
                    isStreaming={evalStream.isStreaming}
                    error={evalStream.error}
                    title="Full Debrief"
                  />
                </>
              )}

              {/* Known-Wine Write-Up: submitting reveals the actual reference tasting notes for the
                  wines (generated in the background at submit) alongside the grade. */}
              {studyMode === "known-wine" && !waitingForModel && (tastingLoading || tastingNotes.length > 0) && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-foreground">The actual tasting notes</h3>
                  {/* Ungated: in Known-Wine the identities were shown all along and the write-up is
                      already submitted, so there is nothing left to give away. */}
                  {tastingLoading && tastingNotes.length === 0 && (
                    <ThinkingTrace
                      status={tastingTrace.status}
                      statuses={tastingTrace.statuses}
                      thinking={tastingTrace.thinking}
                      active={!tastingTrace.error}
                      error={tastingTrace.error}
                      idleLabel="Generating the reference notes…"
                    />
                  )}
                  <WineReveal
                    tastingNotes={tastingNotes}
                    wineCount={state.question.wines.length}
                    isLoading={tastingLoading && tastingNotes.length === 0}
                    provenance={tastingProvenance}
                    showSources
                  />
                </div>
              )}
            </div>
          )}

          {/* Model answer reveal + decision tree walkthrough */}
          {state.step === "reveal-answer" && (
            <div className="space-y-6">
              {/* The question being debriefed, restated above everything else on the review screen. */}
              <QuestionRecap question={state.question} />
              {paceEnabled && paceResult && (
                <PaceReport
                  pace={paceResult}
                  wines={state.question.wines}
                  tastingNotes={tastingNotes}
                  provenance={tastingProvenance}
                />
              )}
              {timer.elapsed > 0 && (
                <TimingFeedback seconds={timer.elapsed} wineCount={state.question.wines.length} />
              )}
              <SectionMarksRow marks={parseSectionMarks(state.answerFeedback)} />
              <StreamingFeedback
                text={stripSectionMarksTag(state.answerFeedback)}
                isStreaming={false}
                error={null}
                title="Full Debrief"
              />
              {/* Known-Wine Write-Up: keep the reference tasting notes visible next to the model answer. */}
              {studyMode === "known-wine" && (tastingLoading || tastingNotes.length > 0) && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-foreground">The actual tasting notes</h3>
                  {/* Ungated: in Known-Wine the identities were shown all along and the write-up is
                      already submitted, so there is nothing left to give away. */}
                  {tastingLoading && tastingNotes.length === 0 && (
                    <ThinkingTrace
                      status={tastingTrace.status}
                      statuses={tastingTrace.statuses}
                      thinking={tastingTrace.thinking}
                      active={!tastingTrace.error}
                      error={tastingTrace.error}
                      idleLabel="Generating the reference notes…"
                    />
                  )}
                  <WineReveal
                    tastingNotes={tastingNotes}
                    wineCount={state.question.wines.length}
                    isLoading={tastingLoading && tastingNotes.length === 0}
                    provenance={tastingProvenance}
                    showSources
                  />
                </div>
              )}
              <DecisionTreeWalkthrough
                paper={state.question.paper}
                family={state.question.family}
                studyDiagramAssist={state.question.studyDiagramAssist}
              />
              <ModelAnswerReveal
                question={state.question}
                onNextQuestion={handleNextQuestion}
                tastingNotes={tastingNotes}
                provenance={tastingProvenance}
                pending={!modelAnswerReady}
              />
              {/* Flag Question (feature): debrief footer control — shown only now the wines are
                  revealed. Withdraws the question from rotation and swaps in a fresh one. */}
              <div className="flex justify-center">
                <FlagQuestionButton
                  questionId={state.question.id}
                  attemptId={attemptId}
                  wines={state.question.wines}
                  onLoadNext={handleFlagLoadNext}
                  onBackToPaper={handleBackToPaper}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Floating timer — visible during active steps, hidden on review */}
      {currentQuestion && !timer.stopped && state.step !== "reveal-answer" && state.step !== "feedback" && (
        <FloatingTimer
          elapsed={timer.elapsed}
          paused={timer.paused}
          stopped={timer.stopped}
          wineCount={currentQuestion.wines.length}
        />
      )}
    </div>
  );
}
