You are running the `/resolve-feedback` workflow — a lightweight triage loop for open user feedback.

## What this does

Pulls all unresolved feedback from Neon, shows each one with context and auto-analysis (if available), and asks the admin to accept, reject, or iterate on each item. This is NOT the heavy `/feedback-analysis` command — the token-expensive corpus cross-referencing is already done by the in-app auto-analysis system. This command just surfaces results and executes decisions.

## Workflow

### Step 1: Pull open feedback from Neon

Project ID: `wandering-feather-17026214`

```sql
SELECT
  a.id as attempt_id,
  a.question_id,
  a.user_feedback,
  a.feedback_status,
  a.feedback_admin_note,
  a.pass_estimate,
  q.paper, q.family, q.family_label,
  LEFT(q.question_text, 200) as question_preview,
  q.wines,
  u.name as user_name,
  fa.recommendation as auto_recommendation,
  fa.status as analysis_status,
  LEFT(fa.thread::text, 500) as analysis_preview
FROM user_attempts a
JOIN generated_questions q ON a.question_id = q.question_id
JOIN users u ON a.user_id = u.id
LEFT JOIN feedback_analyses fa ON fa.attempt_id = a.id
WHERE a.user_feedback IS NOT NULL
  AND a.feedback_status IS NULL
ORDER BY a.started_at DESC
```

If no open feedback exists, say "No open feedback — all caught up." and stop.

### Step 2: For each open item, present a summary card

For each row, show:

```
---
### Feedback #{attempt_id} — {user_name}
**Question:** P{paper} / {family_label} — {question_preview}
**Wines:** {list wines briefly}
**Result:** {pass_estimate or "incomplete"}
**Feedback:** "{user_feedback}"
**Auto-analysis:** {auto_recommendation or "none"} — {brief summary of analysis_preview if available}
---
```

If there's an auto-analysis with a recommendation, summarize its key finding in 1-2 sentences. If no auto-analysis exists, note "No auto-analysis — will need manual review or `/feedback-analysis {question_id}`"

### Step 3: Ask the admin what to do

After showing all open items, ask the user for each one:
- **Accept** — Apply the recommended change. If auto-analysis has a specific proposed change, implement it (edit the file, update the prompt/validator). Then mark in DB:
  ```sql
  UPDATE user_attempts SET feedback_status = 'accepted', feedback_admin_note = '{note}', feedback_reviewed_at = now() WHERE id = {attempt_id}
  ```
- **Reject** — Write an admin note explaining why, mark in DB:
  ```sql
  UPDATE user_attempts SET feedback_status = 'rejected', feedback_admin_note = '{note}', feedback_reviewed_at = now() WHERE id = {attempt_id}
  ```
- **Iterate** — The admin wants to discuss or add context before deciding. Ask follow-up questions.
- **Deep dive** — Run `/feedback-analysis {question_id}` for full corpus cross-referencing on this specific item.
- **Skip** — Leave it open for now.

### Step 4: Execute decisions

For each accepted item:
1. If the auto-analysis has a specific proposed change (file + section + wording), implement it
2. If not, ask the admin what change to make
3. Deploy if any code changes were made

For each rejected item:
1. Write the admin note
2. Update the DB

After all items are processed, show a summary:
```
Resolved: X accepted, Y rejected, Z skipped
Changes made: [list files modified]
Deploy needed: yes/no
```

## Rules

- Do NOT run expensive LLM analysis or corpus cross-referencing. That's `/feedback-analysis`.
- Do NOT auto-accept or auto-reject. Always ask the admin.
- If an item has no auto-analysis and the feedback is complex, suggest running `/feedback-analysis {question_id}` instead of guessing.
- Keep each summary card tight — the admin should be able to scan 10 items in under a minute.
- Deploy once at the end if any code changes were made, not after each item.
