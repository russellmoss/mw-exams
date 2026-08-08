"use client";

// A bare stage for recording one tour surface to video. Nothing here ships enabled.
//
// WHY A ROUTE AND NOT A SCREENSHOT SCRIPT. The slides animate — the intro's funnel rows arrive on
// staggered delays, the Coach demo types out a reply — so a still per slide would be a different
// artefact from the thing candidates actually see. Recording the real components in a real browser
// is the only way the video and the app cannot disagree.
//
// GATED BY `NEXT_PUBLIC_TOUR_EXPORT`, which is set only by `scripts/record-tour-videos.mjs` when it
// spawns its own dev server. The variable is inlined at build time, so a production build has the
// `notFound()` branch and no way to reach the stage — this is a 404 in production, not an obscure URL.
//
// THE INTRO NEEDS A MOCKED SESSION, the other four do not. The four walkthroughs are self-contained
// components taking only `onDone`, so they mount directly. The intro lives inside `ShellOnboarding`,
// which opens it only for a signed-in user who has not seen it; the recorder supplies that by
// intercepting `/api/auth/me`. Reaching into the auth context from here instead would mean exporting
// it purely for a recording harness.

import { notFound, useParams } from "next/navigation";
import { ShellOnboarding } from "../../components/ShellOnboarding";
import { DiagramWalkthrough } from "../../components/DiagramWalkthrough";
import { CoachWalkthrough } from "../../components/CoachWalkthrough";
import { PracticalWalkthrough } from "../../components/PracticalWalkthrough";
import { TheoryWalkthrough } from "../../components/TheoryWalkthrough";

const noop = () => {};

export default function TourExportPage() {
  const params = useParams<{ surface: string }>();
  const surface = params?.surface;

  if (process.env.NEXT_PUBLIC_TOUR_EXPORT !== "1") notFound();

  return (
    // The overlays are all `fixed inset-0`, but they are painted over whatever the layout put on the
    // page. An opaque backdrop means a slow-loading font or a stray nav pixel can never show through.
    <div className="fixed inset-0 z-[57] bg-background">
      {surface === "intro" && <ShellOnboarding />}
      {surface === "diagrams" && <DiagramWalkthrough onDone={noop} />}
      {surface === "coach" && <CoachWalkthrough onDone={noop} />}
      {surface === "practical" && <PracticalWalkthrough onDone={noop} />}
      {surface === "theory" && <TheoryWalkthrough onDone={noop} />}
    </div>
  );
}
