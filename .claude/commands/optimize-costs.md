You are running `/optimize-costs` — the model cost-vs-accuracy analyzer for the study app.

## What this does

Reads the `model_usage` + `tavily_usage` tables (Phase 1 instrumentation) joined to accuracy signals
(question feedback outcomes + validity flags), then produces a report that answers the core question:
**where is Opus actually earning its 5× price, and where is Sonnet (or Haiku) good enough?** It
recommends a per-task model mix, projects the cost impact, and flags every cost↔accuracy tradeoff so a
human decides with eyes open. It does NOT silently change anything unless explicitly told to `apply`.

Background: the user's default assumption is "everything needs Opus" but they explicitly don't know
that's true — this command is how we find out from data. The A/B split that produces the data lives in
the admin `/admin/costs` "A/B model split" panel (writes the `model_ab_config` app setting); see the
`cost-tracking-system` memory.

Neon project ID for all queries: `wandering-feather-17026214`.

## Arguments (parse `$ARGUMENTS`)

- **(none)** → full analysis over ALL recorded usage; write the report; recommend a mix but change nothing.
- **`30d` / `7d` / `24h`** → restrict the window (add `AND created_at >= NOW() - INTERVAL 'N days'` to the
  usage queries; the accuracy join is by question, leave it whole but note questions are recent anyway).
- **`apply`** → after presenting the recommendation, ask the user to confirm, then write the recommended
  `model_ab_config` to `app_settings` (the apply SQL is at the end). Only with explicit confirmation.

## Interpretation rules (critical — read before reasoning)

1. **Feedback polarity is inverted.** In this app, user feedback is a *critique* of a question. When
   `user_attempts.feedback_status = 'accepted'` the critique was upheld → **the question had a real
   defect**. `'rejected'` → the critique was wrong → **the question was fine**. So for question quality:
   *lower* accepted-feedback rate and *higher* rejected-feedback rate = better. Never report "accepted
   feedback" as if it were a good thing.
2. **`invalid_reasons IS NOT NULL`** on `generated_questions` = the validity auditor flagged the question
   as broken. Higher invalid rate per arm = worse.
3. **Sample size honesty.** With < ~30 questions per arm or < ~10 feedback events per arm, do NOT declare
   a winner. Say "insufficient data — keep the experiment running" and project *potential* savings
   conditional on quality holding. The 10-year corpus mindset applies: small N, no false precision.
4. **Accuracy attribution is cleanest for `question_generation`** (the arm is stamped into
   `generated_questions.metadata.genAbGroup`/`genModel`). For sub-tasks (model_answer, wine_enrichment,
   tasting, grading) you have cost/latency per arm but only weak/no quality signal — present those as
   **cost-only** comparisons and say so. Don't fabricate a quality verdict you can't support.

## Steps

### 1. Pull the data (Neon MCP `run_sql`, project `wandering-feather-17026214`)

Run these one at a time (the driver rejects multi-statement strings).

**A. Cost / volume / latency by task and arm:**
```sql
SELECT task_type, model, ab_group,
  COUNT(*) AS calls,
  ROUND(SUM(cost_usd)::numeric, 4) AS total_cost,
  ROUND(AVG(cost_usd)::numeric, 6) AS avg_cost_per_call,
  ROUND(AVG(input_tokens))  AS avg_in,
  ROUND(AVG(output_tokens)) AS avg_out,
  ROUND(AVG(latency_ms))    AS avg_latency_ms,
  COUNT(*) FILTER (WHERE NOT success) AS errors
FROM model_usage
GROUP BY task_type, model, ab_group
ORDER BY task_type, total_cost DESC;
```

**B. Question-generation quality by arm (the key signal):**
```sql
SELECT
  gq.metadata->>'genModel'   AS gen_model,
  gq.metadata->>'genAbGroup' AS arm,
  COUNT(DISTINCT gq.question_id) AS questions,
  COUNT(DISTINCT gq.question_id) FILTER (WHERE gq.invalid_reasons IS NOT NULL) AS invalid_questions,
  COUNT(ua.id) FILTER (WHERE ua.user_feedback IS NOT NULL)        AS feedback_events,
  COUNT(ua.id) FILTER (WHERE ua.feedback_status = 'accepted')     AS feedback_upheld_defect,
  COUNT(ua.id) FILTER (WHERE ua.feedback_status = 'rejected')     AS feedback_overruled_was_fine
FROM generated_questions gq
LEFT JOIN user_attempts ua ON ua.question_id = gq.question_id
WHERE gq.metadata->>'genModel' IS NOT NULL
GROUP BY gen_model, arm
ORDER BY questions DESC;
```

**C. Model-answer / sub-task quality by arm via question join** (cost+arm rows that carry a question_id):
```sql
SELECT mu.task_type, mu.model, mu.ab_group,
  COUNT(DISTINCT mu.question_id) AS questions_touched,
  COUNT(DISTINCT mu.question_id) FILTER (WHERE gq.invalid_reasons IS NOT NULL) AS invalid_questions,
  COUNT(ua.id) FILTER (WHERE ua.feedback_status = 'accepted') AS feedback_upheld_defect,
  COUNT(ua.id) FILTER (WHERE ua.feedback_status = 'rejected') AS feedback_overruled_was_fine
FROM model_usage mu
LEFT JOIN generated_questions gq ON gq.question_id = mu.question_id
LEFT JOIN user_attempts ua ON ua.question_id = mu.question_id
WHERE mu.question_id IS NOT NULL AND mu.ab_group IS NOT NULL
GROUP BY mu.task_type, mu.model, mu.ab_group
ORDER BY mu.task_type;
```

**D. Headline totals + window:**
```sql
SELECT ROUND(SUM(cost_usd)::numeric,4) AS claude_total, COUNT(*) AS claude_calls,
  MIN(created_at) AS first_call, MAX(created_at) AS last_call
FROM model_usage;
```
```sql
SELECT ROUND(SUM(cost_usd)::numeric,4) AS tavily_total, SUM(credits) AS credits, COUNT(*) AS searches
FROM tavily_usage;
```

**E. Current A/B config (so you know what experiment is running):**
```sql
SELECT value FROM app_settings WHERE key = 'model_ab_config';
```

### 2. If there's no data

If `model_usage` is empty (likely until Phase 1/2 is deployed and used), STOP and report:
"No usage recorded yet. Deploy the instrumentation, run some questions/answers, optionally turn on an
A/B split in the admin Cost panel, then re-run `/optimize-costs`." Don't invent numbers.

### 3. Analyze

For **each task type**:
- Lay out the arms side by side: avg cost/call, total cost, volume, avg latency.
- Compute the cost ratio between arms (e.g. "Opus costs 4.7× Sonnet per call here").
- For `question_generation` (and any sub-task with a real signal from query C), bring in the quality
  proxies: invalid-question rate and feedback polarity (per interpretation rules). State the sample size.
- Verdict per task, choosing exactly one:
  - **SWITCH** — cheaper arm is comparable on quality with adequate N → recommend shifting % toward it.
  - **KEEP OPUS** — quality gap is real and matters → stay.
  - **INSUFFICIENT DATA** — not enough N → keep experimenting; project conditional savings.

### 4. Project the savings

From the per-call costs and observed volume, estimate the cost impact of the recommended mix vs the
current/default mix. Express it as both per-call delta and an extrapolated monthly figure (use the
observed calls/day from the window). Be explicit it's an estimate.

### 5. Write the report

Create `outputs/cost_reports/` if needed and write `outputs/cost_reports/{YYYY-MM-DD}.md` (get the date
with `date +%F`). Structure:
- **TL;DR** — one-line recommendation per task + total projected monthly saving (with a confidence note).
- **Per-task analysis** — the tables, ratios, quality proxies, verdict, sample-size caveat.
- **Recommended `model_ab_config`** — the JSON to set in the admin panel (only include tasks you're
  changing; omit a task to leave it at default).
- **Tradeoffs & risks** — every place cheaper = worse, and by how much. Surface what we'd give up.
- **Open questions / what to measure next** — e.g. "need 20 more Sonnet question-gen samples to call it."

Print the TL;DR and the recommended JSON in the chat too.

### 6. Apply (only if `apply` was passed)

Show the recommended JSON, ask the user to confirm, and only then upsert it via Neon MCP `run_sql`
(this is a config write — never run it without explicit confirmation):
```sql
INSERT INTO app_settings (key, value, updated_at)
VALUES ('model_ab_config', '<RECOMMENDED_JSON>'::jsonb, NOW())
ON CONFLICT (key) DO UPDATE SET value = '<RECOMMENDED_JSON>'::jsonb, updated_at = NOW();
```
Tell the user it takes effect within ~30s (the selector cache TTL), and that they can also edit it in the
admin Cost panel.
