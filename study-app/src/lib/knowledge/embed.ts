// Query embedding. Ported from the Wine-inventory knowledge stack, trimmed to the one thing this app
// needs.
//
// WHAT WAS REMOVED AND WHY. The source module also embeds DOCUMENTS in batches of 96, with patient
// per-minute rate-limit handling, because it runs a crawler that indexes new pages continuously. This
// app never embeds a document: the corpus is frozen and its vectors were copied verbatim from the
// source system (see migration 016). Only queries get embedded here — one short call per retrieval.
//
// THE MODEL NAME IS A CONTRACT, NOT A SETTING. The stored vectors are voyage-4 / 1024-dim. A query
// embedded with any other model produces cosine distances against them that are meaningless but not
// obviously wrong — retrieval would silently return plausible nonsense. So the model is pinned here,
// stored per row in kb_chunk, and asserted in the retrieval SQL. Changing it means re-exporting the
// corpus, not editing this constant.

export const KB_EMBEDDING_MODEL = "voyage-4";
export const KB_EMBEDDING_DIM = 1024;

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Embed a single search query.
 *
 * input_type="query" is deliberate and asymmetric with the stored chunks, which were embedded with
 * input_type="document". Voyage uses the hint to place queries and documents in compatible but
 * differently-optimised positions; using "document" here measurably degrades retrieval.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set — knowledge retrieval is unavailable.");

  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(VOYAGE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: [text], model: KB_EMBEDDING_MODEL, input_type: "query" }),
      });
    } catch (e) {
      if (++attempt > MAX_RETRIES) throw e;
      await sleep(300 * 2 ** attempt);
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      if (++attempt > MAX_RETRIES) {
        throw new Error(`Voyage embeddings failed after ${attempt} attempts (HTTP ${res.status}).`);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 300 * 2 ** attempt);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Voyage embeddings HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    const vec = json.data?.[0]?.embedding;
    // Validate before it reaches pgvector: a wrong-dimension vector is a confusing runtime error deep
    // in a SQL cast, and a NaN silently poisons every cosine distance it touches.
    if (!vec || vec.length !== KB_EMBEDDING_DIM || vec.some((x) => !Number.isFinite(x))) {
      throw new Error(`Voyage returned an invalid vector (dim ${vec?.length ?? 0}, expected ${KB_EMBEDDING_DIM}).`);
    }
    return vec;
  }
}
