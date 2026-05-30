# Cost reports

Output of `/optimize-costs`. One dated markdown report per run
(`{YYYY-MM-DD}.md`), each a cost-vs-accuracy analysis of model usage with a
recommended per-task model mix and flagged tradeoffs.

Source data: the `model_usage` and `tavily_usage` tables (Phase 1 instrumentation)
joined to question feedback outcomes + validity flags. See the `cost-tracking-system`
memory for the full system.
