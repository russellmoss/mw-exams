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
const MIN_IMAGE_BYTES = 10_000; // ~10 KB floor — skip icons/spacers/thumbnails (not real photos)
const DOWNLOAD_TIMEOUT_MS = 8_000;
const MAX_IMAGES_PER_FEEDBACK = 3;

// Appended to feedback system prompts. Tells the model how to mark where images belong.
export const IMAGE_TOKEN_INSTRUCTIONS = `
## ILLUSTRATE WITH IMAGES (required)

### Hero image (always — the very first line of your response)
Begin your response with EXACTLY ONE hero token, on its own first line, before any other text:

[[HERO: query="<ONE specific, named wine place — a region's vineyards or an iconic estate>" | caption="<one-sentence subtitle>"]]

The hero is a sweeping, scene-setting banner of a SINGLE real place, e.g.
query="Barossa Valley vineyards rolling hills" or query="Chateau d'Yquem estate Sauternes".

CRITICAL hero rules (a bad hero query returns an irrelevant stock collage):
- Name ONE concrete, recognisable place or estate. The query MUST contain a proper place/producer name
  plus the word "vineyard", "vineyards", "estate", or "winery" (e.g. "Mosel Riesling vineyards steep slate").
- For a MULTI-WINE / multi-region flight, do NOT try to represent every wine. Pick the SINGLE most
  important region for the flight (your STRONG SIGNAL or the flight's headline region) and show only that.
- NEVER write an abstract or thematic query (e.g. "five countries five varieties", "wine comparison",
  "structural tasting") — those return nonsensical montages. Always a real geographic place.
- For pre-glass stem analysis (wine not yet known), use the single most likely region implied by the stem.

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

// Generic words that match almost any wine image — excluded from scoring so the discriminating tokens
// (place/producer names) drive relevance instead of "vineyard"/"wine" matching everything.
const SCORE_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "wine", "wines", "vineyard", "vineyards",
  "estate", "winery", "wineries", "region", "grape", "grapes", "bottle", "glass", "rolling", "hills",
]);

function scoreTokens(s: string): string[] {
  return normalizeQueryKey(s)
    .split(" ")
    .filter((t) => t.length >= 3 && !SCORE_STOPWORDS.has(t));
}

// Relevance of a Tavily image (by its description) to the search query: weighted token overlap, with
// longer tokens (place/producer names like "barossa", "sauternes") counting double. 0 when the image
// has no description or shares no meaningful tokens — those fall back to Tavily's own ranking order.
function scoreImageRelevance(query: string, description: string): number {
  const q = scoreTokens(query);
  const d = new Set(scoreTokens(description));
  if (q.length === 0 || d.size === 0) return 0;
  let matched = 0;
  let weight = 0;
  for (const t of q) {
    const w = t.length >= 5 ? 2 : 1;
    weight += w;
    if (d.has(t)) matched += w;
  }
  return weight === 0 ? 0 : matched / weight;
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
    if (buf.length < MIN_IMAGE_BYTES || buf.length > MAX_IMAGE_BYTES) return null;
    return { base64: buf.toString("base64"), contentType: ct.split(";")[0].trim() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Tavily image search → candidate {url, description} pairs in Tavily's own order.
async function tavilyImageSearch(
  query: string,
  userId: number | null
): Promise<{ url: string; description: string }[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  let ok = false;
  const candidates: { url: string; description: string }[] = [];
  try {
    const res = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query,
        max_results: 8,
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
        const desc = typeof im === "string" ? "" : String(im?.description || "");
        if (u && /^https?:\/\//i.test(u)) candidates.push({ url: u, description: desc });
      }
    }
  } catch {
    /* best-effort */
  }
  logTavilyUsage({ taskType: "feedback_images", query, resultsCount: candidates.length, userId, success: ok });
  return candidates;
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

  // Cache miss — search, rank candidates by how well their description matches the query, then
  // download the first usable one in that order. Ties keep Tavily's own ranking (stable by index).
  const candidates = await tavilyImageSearch(query, userId);
  const ranked = candidates
    .map((c, i) => ({ ...c, i, score: scoreImageRelevance(query, c.description) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  for (const c of ranked.slice(0, 5)) {
    const img = await downloadImage(c.url);
    if (!img) continue;
    const rows = await sql`
      INSERT INTO media_cache (query_key, query, source_url, content_type, image_base64, usage_count, last_used_at)
      VALUES (${key}, ${query}, ${c.url}, ${img.contentType}, ${img.base64}, 1, NOW())
      ON CONFLICT (query_key) DO UPDATE SET usage_count = media_cache.usage_count + 1, last_used_at = NOW()
      RETURNING id`;
    return rows[0].id as number;
  }
  return null;
}

// The markdown an image token resolves to. Hero alt is prefixed "HERO::" so the renderer styles it as
// a banner. Kept here so the post-stream enrichment and the incremental streamer produce IDENTICAL
// markup — the live view and the persisted/history text must match exactly.
function imageMarkdown(id: number | null, caption: string, hero: boolean): string {
  if (!id) return "";
  return hero
    ? `![HERO::${caption}](/api/media/${id})\n\n*${caption}*\n\n`
    : `\n\n![${caption}](/api/media/${id})\n\n*${caption}*\n\n`;
}

// A FRESH global token regex per call — never share one instance, since `.exec`/`matchAll` carry
// mutable lastIndex state that would race across concurrent requests.
function imageTokenRe(): RegExp {
  return /\[\[(IMG|HERO):\s*query="([^"]*)"\s*\|\s*caption="([^"]*)"\s*\]\]/g;
}

// Incrementally resolve [[HERO/IMG:...]] tokens AS THEY STREAM, so each image can surface the moment
// it's ready instead of waiting for the whole response. Feed the growing fullText after every delta;
// each newly-completed token (one with its closing "]]") kicks off a getOrCreateMedia fetch, and `emit`
// is called with the exact token string + its replacement markdown the instant that fetch resolves.
// Caps mirror enrichFeedbackWithImages (one hero, up to MAX_IMAGES_PER_FEEDBACK inline) so the live and
// final texts agree. Best-effort: a failed fetch emits an empty replacement (token simply disappears).
export function createImageStreamer(
  userId: number | null,
  emit: (token: string, markdown: string) => void
): { feed: (fullText: string) => void; flush: () => Promise<void> } {
  const seen = new Set<number>(); // start indices already dispatched (fullText is append-only)
  const pending: Promise<void>[] = [];
  let heroDone = false;
  let inlineCount = 0;

  function feed(fullText: string) {
    const re = imageTokenRe();
    let m: RegExpExecArray | null;
    while ((m = re.exec(fullText)) !== null) {
      if (seen.has(m.index)) continue;
      seen.add(m.index);
      const isHero = m[1] === "HERO";
      if (isHero) {
        if (heroDone) continue;
        heroDone = true;
      } else {
        if (inlineCount >= MAX_IMAGES_PER_FEEDBACK) continue;
        inlineCount++;
      }
      const token = m[0];
      const query = m[2];
      const caption = cleanText(m[3]);
      pending.push(
        getOrCreateMedia(query, userId)
          .then((id) => emit(token, imageMarkdown(id, caption, isHero)))
          .catch(() => emit(token, ""))
      );
    }
  }

  async function flush() {
    await Promise.allSettled(pending);
  }

  return { feed, flush };
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

  const all = [...text.matchAll(imageTokenRe())];
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
    out = out.replace(r.token, imageMarkdown(r.id, r.caption, false));
  }
  out = stripImageTokens(out); // drop the hero token + any leftover/extra/malformed tokens
  if (hero?.id) {
    // Prepend the resolved hero as a banner at the very top, regardless of where the model put it.
    out = imageMarkdown(hero.id, hero.caption, true) + out;
  }
  return out.trim();
}
