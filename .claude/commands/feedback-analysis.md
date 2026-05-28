---
description: Analyze user feedback on generated questions against the past 10 years of real MW exams. Recommends accept or reject.
argument-hint: <question_id> [question_id2] [question_id3] ...
---

You are running the `/feedback-analysis` workflow.

Arguments: $ARGUMENTS (one or more question IDs, e.g. `gen_p1_F2_1779913929557 gen_p2_F1_1779920510461`)

## Purpose

Users leave feedback on generated MW exam questions — often disagreeing with the AI evaluation, questioning the wine selection, or flagging issues with question design. This command determines whether each piece of feedback should be **accepted** (leading to a pipeline change) or **rejected** (the system is already correct), grounded in what the real MW exam has actually done over the past 10 years (2011–2025).

The key principle: the MW exam has done surprising things historically. A candidate saying "this would NEVER happen" may be wrong — if the past exams show it HAS happened, the feedback should be rejected and the system preserved. Conversely, if the feedback identifies a genuine gap or error not seen in any past exam, it should be accepted.

## Workflow

For each question ID provided:

### Step 1: Pull attempt data from Neon

Use the Neon MCP tools to query the database. The project ID is `wandering-feather-17026214`.

```sql
SELECT
  a.id, a.question_id, a.user_feedback, a.feedback_status, a.feedback_admin_note,
  a.pre_glass_reasoning, a.user_answer, a.answer_feedback, a.pass_estimate,
  a.elapsed_seconds,
  q.question_text, q.wines, q.paper, q.family, q.family_label, q.model_answer,
  q.metadata,
  u.name as user_name
FROM user_attempts a
JOIN generated_questions q ON a.question_id = q.question_id
JOIN users u ON a.user_id = u.id
WHERE a.question_id = '{QUESTION_ID}'
  AND a.user_feedback IS NOT NULL
ORDER BY a.completed_at DESC
LIMIT 1
```

If `feedback_status` is already set (accepted/rejected), note this but still analyze — the user may want a second opinion.

If no feedback found for this ID, skip it and note "No user feedback found for {ID}".

### Step 2: Understand the feedback

Parse the user's feedback to identify their specific claim(s):
- Are they saying the question design is flawed? (e.g., variety overlap, unrealistic wine selection)
- Are they disputing the AI evaluation? (e.g., "I was right about the variety")
- Are they saying the wines don't match what MW exams actually do?
- Are they suggesting a structural change to how questions are generated?

### Step 3: Cross-reference against the past 10 years of real MW exams

Read the structured exam data to check the claim:

1. **Read `data/exams.json`** — check if the pattern the user says "would never happen" has actually occurred in real MW exams (2011–2025). Look for:
   - Similar question structures (same family type, same number of wines)
   - Similar wine selections (same varieties, same regions, same blend patterns)
   - Similar stem phrasing patterns
   - Evidence that the MW DOES or DOES NOT do what the generated question did

2. **Read relevant files in `data/wine_research/`** if the feedback is about a specific wine's identity or characteristics.

3. **Read the relevant examiner report sections** from `docs/examiners reports/` if they exist — these often explain exactly what the examiners intended and what tripped candidates up.

4. **Read the question generation prompt** at `study-app/src/lib/prompts/question-generation-prompt.ts` to understand what constraints currently exist and whether the feedback points to a gap.

5. **Check `outputs/heuristics/`** for any pattern analysis that's relevant to the claim.

### Step 4: Analyze and recommend

For each question, produce a structured analysis:

```
## Feedback Analysis: {question_id}

**User:** {user_name}
**Question:** {paper} / {family_label} — {first 100 chars of question_text}...
**Feedback:** "{user_feedback}"

### Claim Analysis
{What exactly is the user claiming? Break it into specific testable assertions.}

### Evidence from Past MW Exams (2011–2025)
{What do the real MW exams from the past 10+ years show? Cite specific years/papers/questions.
If the pattern HAS occurred in a real exam, cite the exact instance.
If it HASN'T appeared in any past exam, note the absence but consider whether it's a deliberate gap or just hasn't come up yet.}

### Current Pipeline Check
{Does the current generation prompt or validation logic already handle this?
If so, how? If not, what's the gap?}

### Recommendation: **ACCEPT** / **REJECT**

**Reasoning:** {2-3 sentences explaining why}

**If ACCEPT — Proposed Change:**
{Specific, actionable change to make. Name the file, the section, the wording.
Could be: prompt change, validation rule change, or wine selection constraint.}

**If REJECT — Explanation for User:**
{What to tell the user — respectful, educational, citing corpus evidence.}
```

### Step 5: Summary

After all IDs are analyzed, produce a summary table:

```
| Question ID | User | Claim | Recommendation | Key Evidence |
|-------------|------|-------|---------------|--------------|
| ... | ... | ... | ACCEPT/REJECT | ... |
```

And if any are ACCEPT, list the specific pipeline changes needed in priority order.

## Important Rules

1. **The past exams are authoritative.** If the real MW exam has done something in any year from 2011–2025, the generated questions should be allowed to do it too. "This seems unusual" is not a valid reason to reject a pattern that appears in a real past exam.

2. **Don't over-correct.** A single feedback item about an edge case doesn't warrant a sweeping prompt change. Scope the fix tightly to the actual issue.

3. **Distinguish evaluation feedback from generation feedback.** If the user is saying "I was right and the AI scored me wrong," that's an evaluation quality issue, not a generation pipeline issue. Note this difference.

4. **Consider the candidate's level.** MW candidates are experts. Their feedback often contains genuine insight. Don't dismiss it reflexively — but do verify it against what the real exams have actually done.

5. **Be specific about changes.** Don't say "update the prompt." Say "In `question-generation-prompt.ts`, add to the SAME-ORIGIN DIVERSITY GUARDRAIL section: ..."

6. **Do NOT modify any files.** This command is analysis-only. Output recommendations. The admin decides whether to apply them.
