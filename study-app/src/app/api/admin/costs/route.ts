import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

/**
 * Admin cost dashboard data. Aggregates model_usage (Claude) and tavily_usage into the
 * shapes the admin "Cost" tab renders: headline totals, by-model / by-task / by-source
 * breakdowns, a daily time series, a per-(task,model) comparison table (the seed for the
 * A/B analysis in later phases), and a filtered table of recent raw calls.
 *
 * Filters (all optional, applied to the Claude rows; date+task also applied to Tavily):
 *   from, to        ISO timestamps (inclusive from, exclusive to)
 *   model           exact model id
 *   task            exact task_type
 *   source          'server' | 'user'
 *   limit           raw-rows cap (default 200, max 1000)
 */
export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user || !user.isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const from = url.searchParams.get("from") || null;
    const to = url.searchParams.get("to") || null;
    const model = url.searchParams.get("model") || null;
    const task = url.searchParams.get("task") || null;
    const source = url.searchParams.get("source") || null;
    const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 1000);

    const sql = neon(process.env.DATABASE_URL!);

    // Each Claude query repeats the same null-guarded WHERE so any subset of filters works
    // with plain tagged templates (no dynamic SQL string building).
    const [
      totals,
      byModel,
      byTask,
      bySource,
      byModelTask,
      byDay,
      recent,
      tavilyTotals,
      tavilyByTask,
      tavilyByDay,
    ] = await Promise.all([
      sql`
        SELECT
          COUNT(*)::int AS calls,
          COALESCE(SUM(cost_usd), 0) AS cost_usd,
          COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
          COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
          COALESCE(SUM(cache_read_tokens), 0)::bigint AS cache_read_tokens,
          COALESCE(SUM(cache_creation_tokens), 0)::bigint AS cache_creation_tokens,
          COUNT(*) FILTER (WHERE NOT success)::int AS errors
        FROM model_usage
        WHERE (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at < ${to}::timestamptz)
          AND (${model}::text IS NULL OR model = ${model})
          AND (${task}::text IS NULL OR task_type = ${task})
          AND (${source}::text IS NULL OR source = ${source})
      `,
      sql`
        SELECT model,
          COUNT(*)::int AS calls,
          COALESCE(SUM(cost_usd), 0) AS cost_usd,
          COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
          COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
          COALESCE(AVG(latency_ms), 0)::int AS avg_latency_ms
        FROM model_usage
        WHERE (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at < ${to}::timestamptz)
          AND (${model}::text IS NULL OR model = ${model})
          AND (${task}::text IS NULL OR task_type = ${task})
          AND (${source}::text IS NULL OR source = ${source})
        GROUP BY model
        ORDER BY cost_usd DESC
      `,
      sql`
        SELECT task_type,
          COUNT(*)::int AS calls,
          COALESCE(SUM(cost_usd), 0) AS cost_usd,
          COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
          COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
          COALESCE(AVG(latency_ms), 0)::int AS avg_latency_ms
        FROM model_usage
        WHERE (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at < ${to}::timestamptz)
          AND (${model}::text IS NULL OR model = ${model})
          AND (${task}::text IS NULL OR task_type = ${task})
          AND (${source}::text IS NULL OR source = ${source})
        GROUP BY task_type
        ORDER BY cost_usd DESC
      `,
      sql`
        SELECT source,
          COUNT(*)::int AS calls,
          COALESCE(SUM(cost_usd), 0) AS cost_usd
        FROM model_usage
        WHERE (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at < ${to}::timestamptz)
          AND (${model}::text IS NULL OR model = ${model})
          AND (${task}::text IS NULL OR task_type = ${task})
          AND (${source}::text IS NULL OR source = ${source})
        GROUP BY source
        ORDER BY cost_usd DESC
      `,
      sql`
        SELECT task_type, model,
          COUNT(*)::int AS calls,
          COALESCE(SUM(cost_usd), 0) AS cost_usd,
          COALESCE(AVG(cost_usd), 0) AS avg_cost_usd,
          COALESCE(AVG(input_tokens), 0)::int AS avg_input_tokens,
          COALESCE(AVG(output_tokens), 0)::int AS avg_output_tokens,
          COALESCE(AVG(latency_ms), 0)::int AS avg_latency_ms,
          COUNT(*) FILTER (WHERE NOT success)::int AS errors
        FROM model_usage
        WHERE (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at < ${to}::timestamptz)
          AND (${model}::text IS NULL OR model = ${model})
          AND (${task}::text IS NULL OR task_type = ${task})
          AND (${source}::text IS NULL OR source = ${source})
        GROUP BY task_type, model
        ORDER BY task_type, cost_usd DESC
      `,
      sql`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
          COALESCE(SUM(cost_usd), 0) AS cost_usd,
          COUNT(*)::int AS calls
        FROM model_usage
        WHERE (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at < ${to}::timestamptz)
          AND (${model}::text IS NULL OR model = ${model})
          AND (${task}::text IS NULL OR task_type = ${task})
          AND (${source}::text IS NULL OR source = ${source})
        GROUP BY day
        ORDER BY day
      `,
      sql`
        SELECT id, created_at, task_type, model, source, user_id, question_id, ab_group,
          input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
          cost_usd, latency_ms, success
        FROM model_usage
        WHERE (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at < ${to}::timestamptz)
          AND (${model}::text IS NULL OR model = ${model})
          AND (${task}::text IS NULL OR task_type = ${task})
          AND (${source}::text IS NULL OR source = ${source})
        ORDER BY created_at DESC
        LIMIT ${limit}
      `,
      sql`
        SELECT COUNT(*)::int AS calls,
          COALESCE(SUM(credits), 0)::int AS credits,
          COALESCE(SUM(cost_usd), 0) AS cost_usd
        FROM tavily_usage
        WHERE (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at < ${to}::timestamptz)
          AND (${task}::text IS NULL OR task_type = ${task})
      `,
      sql`
        SELECT task_type,
          COUNT(*)::int AS calls,
          COALESCE(SUM(credits), 0)::int AS credits,
          COALESCE(SUM(cost_usd), 0) AS cost_usd
        FROM tavily_usage
        WHERE (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at < ${to}::timestamptz)
          AND (${task}::text IS NULL OR task_type = ${task})
        GROUP BY task_type
        ORDER BY cost_usd DESC
      `,
      sql`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
          COALESCE(SUM(cost_usd), 0) AS cost_usd,
          COUNT(*)::int AS calls
        FROM tavily_usage
        WHERE (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${to}::timestamptz IS NULL OR created_at < ${to}::timestamptz)
          AND (${task}::text IS NULL OR task_type = ${task})
        GROUP BY day
        ORDER BY day
      `,
    ]);

    const claudeCost = Number(totals[0]?.cost_usd || 0);
    const tavilyCost = Number(tavilyTotals[0]?.cost_usd || 0);

    // Distinct values for the filter dropdowns (unfiltered, so the UI can always widen).
    const [models, tasks] = await Promise.all([
      sql`SELECT DISTINCT model FROM model_usage ORDER BY model`,
      sql`SELECT DISTINCT task_type FROM model_usage ORDER BY task_type`,
    ]);

    return Response.json({
      summary: {
        claudeCost,
        tavilyCost,
        totalCost: claudeCost + tavilyCost,
        claudeCalls: Number(totals[0]?.calls || 0),
        tavilyCalls: Number(tavilyTotals[0]?.calls || 0),
        inputTokens: Number(totals[0]?.input_tokens || 0),
        outputTokens: Number(totals[0]?.output_tokens || 0),
        cacheReadTokens: Number(totals[0]?.cache_read_tokens || 0),
        cacheCreationTokens: Number(totals[0]?.cache_creation_tokens || 0),
        errors: Number(totals[0]?.errors || 0),
        tavilyCredits: Number(tavilyTotals[0]?.credits || 0),
      },
      byModel,
      byTask,
      bySource,
      byModelTask,
      byDay,
      tavily: { byTask: tavilyByTask, byDay: tavilyByDay },
      recent,
      filterOptions: {
        models: models.map((r) => r.model as string),
        tasks: tasks.map((r) => r.task_type as string),
      },
    });
  } catch (err) {
    console.error("GET admin/costs error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
