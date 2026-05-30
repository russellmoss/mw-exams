let cachedLatestOpus: { model: string; fetchedAt: number } | null = null;

export async function getLatestOpus(apiKey: string): Promise<string> {
  const CACHE_TTL = 1000 * 60 * 60;
  if (cachedLatestOpus && Date.now() - cachedLatestOpus.fetchedAt < CACHE_TTL) {
    return cachedLatestOpus.model;
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=20", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      // Bound this lookup — it runs on the question-generation hot path. On timeout the
      // catch below falls back to a known-good model id rather than hanging.
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data = await res.json();
      const opusModels = (data.data || [])
        .filter((m: { id: string }) => m.id.includes("opus"))
        .sort((a: { created_at: string }, b: { created_at: string }) =>
          b.created_at.localeCompare(a.created_at)
        );
      if (opusModels.length > 0) {
        const latest = opusModels[0].id;
        cachedLatestOpus = { model: latest, fetchedAt: Date.now() };
        return latest;
      }
    }
  } catch {}
  return "claude-sonnet-4-6";
}
