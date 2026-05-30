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
