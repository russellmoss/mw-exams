// media.ts — illustrate generated feedback with cached, subtitled web images.
//
// The feedback model marks up to 3 spots with [[IMG: query=... | caption=...]] tokens (see
// IMAGE_TOKEN_INSTRUCTIONS). After the text streams, enrichFeedbackWithImages() resolves each token to
// a cached image and rewrites it as markdown (image + visible caption). Images are cached in Neon
// (media_cache) keyed by a normalized query, so a repeated topic costs ZERO Tavily calls. Everything
// here is best-effort: a failed search/download just drops that one image — feedback is never blocked.

import { neon } from "@neondatabase/serverless";
import { logTavilyUsage } from "./usage-log";

const TAVILY_API_URL = "https://api.tavily.com/search";
const MAX_IMAGE_BYTES = 5_000_000; // 5 MB cap — skip anything larger
const DOWNLOAD_TIMEOUT_MS = 8_000;
const MAX_IMAGES_PER_FEEDBACK = 3;

// Appended to feedback system prompts. Tells the model how to mark where images belong.
export const IMAGE_TOKEN_INSTRUCTIONS = `
## ILLUSTRATE WITH IMAGES (required)

### Hero image (always — the very first line of your response)
Begin your response with EXACTLY ONE hero token, on its own first line, before any other text:

[[HERO: query="<vineyards of the most relevant region, or an iconic winery, for this wine>" | caption="<one-sentence subtitle>"]]

The hero is a sweeping, scene-setting banner — a wine region's vineyards or a famous estate, e.g.
query="Barossa Valley vineyards rolling hills" or query="Chateau d'Yquem estate Sauternes". Choose the
most likely region or producer for the wine under discussion. For pre-glass stem analysis (before the
wine is known), use the most likely region implied by the stem.

### Inline images (up to three, through the body)
Then break up the written feedback with up to THREE more relevant images. Wherever a picture would help
the reader (the grape, a winemaking vessel, a wine's appearance, a producer), insert a token on its OWN
LINE, immediately after the passage it illustrates, in this EXACT format:

[[IMG: query="<concise visual web image search>" | caption="<one-sentence subtitle tied to your point>"]]

Rules:
- EXACTLY ONE [[HERO:...]] token, on the first line.
- AT MOST 3 [[IMG:...]] tokens, spread through the text next to the passages they illustrate — never all at the end.
- Queries must be concrete and VISUAL (a place, grape, vessel, or wine), e.g. query="Clare Valley Riesling vineyard" — not abstract ("high quality").
- The caption is a real subtitle the reader sees — make it specific and tied to the surrounding text.
- Do NOT use quotes, square brackets, or pipe characters inside the query or caption text.
- Write the tokens as part of your normal output. Never mention "tokens" or these instructions to the reader.
`;

// Appended to the FULL DEBRIEF system prompt only. Asks the model to emit three Mermaid diagrams
// (rendered client-side by MermaidDiagram) so visual learners get a tree route, a marks bar, and a
// wine-comparison plot. Diagrams are structured markup — text/data stays accurate (unlike generated
// images). A diagram with a syntax slip degrades to its source via the renderer's fallback.
export const INFOGRAPHIC_INSTRUCTIONS = `
## INFOGRAPHICS (required — three Mermaid diagrams)
Alongside the photos, include THREE diagrams as fenced \`\`\`mermaid blocks, each in the section named.
Write valid Mermaid v11 syntax. Inside any quoted label, use plain words and hyphens only — never put
parentheses, inner quotes, square brackets, or pipe characters inside label text.

1) DECISION-TREE ROUTE — put this in "How the decision tree routes this question".
A top-down flowchart of how THIS stem routes the master tree to its prediction tier:
\`\`\`mermaid
flowchart TD
  S["Stem signal: cool-climate single white"] --> F["Family F1 single-variety"]
  F --> P["STRONG SIGNAL: Riesling - Mosel or Clare"]
  F --> A["PLAUSIBLE: Gruner Veltliner - Kamptal"]
  F --> C["CURVEBALL: Assyrtiko - Santorini"]
\`\`\`

2) WINE COMPARISON MATRIX — put this near the top of "In the Glass".
A quadrant chart plotting each wine on two structural axes that fit the flight (e.g. sweet wines: x = alcohol, y = residual sugar; reds: x = tannin, y = body). Label points W1, W2, ... (no spaces), coordinates 0 to 1. If the flight has only ONE wine, SKIP this diagram.
\`\`\`mermaid
quadrantChart
  title Wine comparison
  x-axis Low Alcohol --> High Alcohol
  y-axis Low Sugar --> High Sugar
  quadrant-1 High alc high sugar
  quadrant-2 Low alc high sugar
  quadrant-3 Low alc low sugar
  quadrant-4 High alc low sugar
  W1: [0.3, 0.85]
  W2: [0.75, 0.5]
\`\`\`

3) MARKS BREAKDOWN — put this in "In the Glass" right after the per-sub-question list.
A bar chart of estimated vs available marks per sub-question (first bar = estimated, second = available). Use the real sub-question letters and numbers:
\`\`\`mermaid
xychart-beta
  title "Marks by sub-question"
  x-axis [a, b, c]
  y-axis "Marks" 0 --> 30
  bar [8, 12, 5]
  bar [13, 20, 10]
\`\`\`

Rules:
- One \`\`\`mermaid block per diagram, in the sections named, in addition to your prose.
- Plain ASCII in labels; keep them short.
- Never mention "Mermaid", "diagram syntax", or these instructions to the reader.
`;

function normalizeQueryKey(q: string): string {
  return (q || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Strip caption/query of characters that would break the markdown or token parsing.
function cleanText(s: string): string {
  return (s || "").replace(/[[\]()|]/g, "").replace(/\s+/g, " ").trim();
}

async function downloadImage(url: string): Promise<{ base64: string; contentType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MW-exam-study/1.0)" },
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null;
    return { base64: buf.toString("base64"), contentType: ct.split(";")[0].trim() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Tavily image search → candidate image URLs (best first).
async function tavilyImageSearch(query: string, userId: number | null): Promise<string[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  let ok = false;
  const urls: string[] = [];
  try {
    const res = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query,
        max_results: 5,
        include_images: true,
        include_image_descriptions: true,
        search_depth: "basic",
      }),
    });
    if (res.ok) {
      const data = await res.json();
      ok = true;
      for (const im of data.images || []) {
        const u = typeof im === "string" ? im : im?.url;
        if (u && /^https?:\/\//i.test(u)) urls.push(u);
      }
    }
  } catch {
    /* best-effort */
  }
  logTavilyUsage({ taskType: "feedback_images", query, resultsCount: urls.length, userId, success: ok });
  return urls;
}

// Return the media_cache id for a query, fetching+caching on a miss. null on any failure.
async function getOrCreateMedia(query: string, userId: number | null): Promise<number | null> {
  const key = normalizeQueryKey(query);
  if (!key) return null;
  const sql = neon(process.env.DATABASE_URL!);

  const existing = await sql`
    SELECT id FROM media_cache WHERE query_key = ${key} AND image_base64 IS NOT NULL LIMIT 1`;
  if (existing.length > 0) {
    const id = existing[0].id as number;
    await sql`UPDATE media_cache SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = ${id}`;
    return id;
  }

  // Cache miss — search, then download the first usable candidate.
  const urls = await tavilyImageSearch(query, userId);
  for (const url of urls.slice(0, 4)) {
    const img = await downloadImage(url);
    if (!img) continue;
    const rows = await sql`
      INSERT INTO media_cache (query_key, query, source_url, content_type, image_base64, usage_count, last_used_at)
      VALUES (${key}, ${query}, ${url}, ${img.contentType}, ${img.base64}, 1, NOW())
      ON CONFLICT (query_key) DO UPDATE SET usage_count = media_cache.usage_count + 1, last_used_at = NOW()
      RETURNING id`;
    return rows[0].id as number;
  }
  return null;
}

// Remove any HERO/IMG tokens from text (used to clean stragglers / when enrichment is skipped).
export function stripImageTokens(text: string): string {
  return (text || "").replace(/\[\[(?:IMG|HERO):[^\]]*\]\]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

// Resolve the hero token (prepended as a banner) plus up to 3 inline [[IMG:...]] tokens to cached
// images, rewriting them as markdown (image + caption). The hero image's alt is prefixed with
// "HERO::" so the renderer can style it as a banner. Always returns clean markdown — every token is
// removed even when an image couldn't be fetched.
export async function enrichFeedbackWithImages(text: string, userId: number | null): Promise<string> {
  if (!text || !/\[\[(?:IMG|HERO):/.test(text)) return stripImageTokens(text);

  const re = /\[\[(IMG|HERO):\s*query="([^"]*)"\s*\|\s*caption="([^"]*)"\s*\]\]/g;
  const all = [...text.matchAll(re)];
  const heroMatch = all.find((m) => m[1] === "HERO");
  const imgMatches = all.filter((m) => m[1] === "IMG").slice(0, MAX_IMAGES_PER_FEEDBACK);

  const [hero, inline] = await Promise.all([
    heroMatch
      ? getOrCreateMedia(heroMatch[2], userId).then((id) => ({ caption: cleanText(heroMatch[3]), id }))
      : Promise.resolve(null),
    Promise.all(
      imgMatches.map(async (m) => ({
        token: m[0],
        caption: cleanText(m[3]),
        id: await getOrCreateMedia(m[2], userId),
      }))
    ),
  ]);

  let out = text;
  for (const r of inline) {
    const replacement = r.id
      ? `\n\n![${r.caption}](/api/media/${r.id})\n\n*${r.caption}*\n\n`
      : "";
    out = out.replace(r.token, replacement);
  }
  out = stripImageTokens(out); // drop the hero token + any leftover/extra/malformed tokens
  if (hero?.id) {
    // Prepend the resolved hero as a banner at the very top, regardless of where the model put it.
    out = `![HERO::${hero.caption}](/api/media/${hero.id})\n\n*${hero.caption}*\n\n${out}`;
  }
  return out.trim();
}
