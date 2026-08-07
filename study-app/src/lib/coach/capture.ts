"use client";

// Screenshot capture for the Coach.
//
// Ported from Cellarhand's FeedbackTicketModal, keeping the three details that were learned the hard
// way there and look like fussiness until they bite:
//
//   cacheBust: false   the resources are already painted on screen; re-fetching them is one more way
//                      for serialisation to stall
//   the 15s race       html-to-image can hang while inlining fonts. Without a timeout the button sits
//                      on "Capturing…" forever and the user has no way back
//   the filter         the capture dialog and the dock are removed, or the shot is a picture of the
//                      thing asking for the shot
//
// Added here: a downscale pass. A full-page capture on a high-DPI screen is several megapixels, and
// under BYOK the candidate pays for every one of those tokens. 1568px on the long edge is the point
// past which more pixels stop buying the model more detail.

const MAX_EDGE = 1568;
const CAPTURE_TIMEOUT_MS = 15_000;

export interface Capture {
  dataUrl: string;
  /** base64 without the data: prefix — what the Anthropic image block wants. */
  base64: string;
  mediaType: "image/png";
  bytes: number;
}

async function downscale(dataUrl: string): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const longest = Math.max(img.width, img.height);
  if (longest <= MAX_EDGE) return dataUrl;

  const scale = MAX_EDGE / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/**
 * Capture the page. Returns null on failure — a screenshot is an optional enrichment, and a failed
 * capture must never block the message the candidate was trying to send.
 *
 * @param includeCoach keep the dock in frame (for "the Coach itself looks wrong")
 */
export async function capturePage(includeCoach = false): Promise<Capture | null> {
  try {
    const { toPng } = await import("html-to-image");
    const dataUrl = await Promise.race([
      toPng(document.body, {
        cacheBust: false,
        pixelRatio: 1,
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          if (node.closest("[data-coach-capture-exclude]")) return false;
          if (!includeCoach && node.closest("[data-coach-surface]")) return false;
          return true;
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("capture timed out")), CAPTURE_TIMEOUT_MS)
      ),
    ]);

    const scaled = await downscale(dataUrl);
    const base64 = scaled.split(",")[1] || "";
    return {
      dataUrl: scaled,
      base64,
      mediaType: "image/png",
      // base64 is 4/3 of the byte length; good enough for a size gate.
      bytes: Math.round((base64.length * 3) / 4),
    };
  } catch (err) {
    console.error("[coach] screenshot capture failed:", err);
    return null;
  }
}
