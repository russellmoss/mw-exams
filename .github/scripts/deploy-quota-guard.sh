#!/usr/bin/env bash
# Deploy-quota guard: keep Hobby-plan deployment headroom for HUMAN deploys.
#
# The Vercel Hobby plan allows 100 deployments per rolling 24h per account
# ("api-deployments-free-per-day"), and EVERY deployment creation counts against it:
# production builds, preview builds, AND deployments the ignoreCommand cancels ([skip ci]
# commits, root-only commits) — the deployment record is created before the ignore check
# runs. CLI/API deploys (manual-deploy.yml) draw from the same bucket. On 2026-08-05/06 the
# auto-feedback/feature-build merge cadence (~44 production builds/day, plus preview deploys
# of bot work branches) drained all 100 slots and an urgent human fix (PR #37) could not
# deploy at all.
#
# This script counts the deployments created in the rolling 24h window and tells the caller
# whether the bot should DEFER its auto-merge (defer=1) to preserve a reserve of slots for
# human pushes. Deferring means the bot's change is PR-gated instead of merged — nothing is
# lost; a human merges the PR when there is headroom.
#
# Fail-OPEN on any API problem: a transient Vercel API error must not convert every bot
# merge into a PR (same philosophy as the feature-build FIFO mutex — the guard degrades to
# today's behavior, it never blocks harder than the status quo).
#
# THE CAP IS READ FROM THE PLAN, NOT HARDCODED. This script was written against Hobby's 100/day.
# The account moved to Pro (6,000/day) on 2026-08-09, at which point a hardcoded 100 would have
# deferred every bot merge from the 81st deployment of the day onward — throttling for a limit that
# no longer existed. Hardcoding the NEW number just moves the rot: a downgrade, or a second project
# on the account, and the guard is wrong in the dangerous direction instead of the annoying one. So
# it asks the API which plan this team is on and maps that to the cap.
#
# If the plan lookup fails it falls back to DEPLOY_QUOTA_LIMIT, which is deliberately defaulted to
# the CURRENT plan rather than to Hobby: a wrong-but-current default degrades to today's behaviour,
# whereas defaulting to 100 would silently reinstate the throttle the lookup exists to remove.
# Override via the repo Actions variable if the plan changes and this default has not caught up.
#
# Inputs (env):
#   VERCEL_TOKEN          required — repo Actions secret
#   DEPLOY_QUOTA_LIMIT    fallback cap when the plan cannot be read (default 6000 = Pro)
#   DEPLOY_QUOTA_RESERVE  slots to keep free for humans (default: 20% of the cap, floor 20)
#   VERCEL_PROJECT_ID / VERCEL_TEAM_ID  default to the study-app project (CLAUDE.md)
#
# Outputs (GITHUB_OUTPUT): defer=0|1, used=<n|unknown>, remaining=<n>
#
# Caveat: the count is per PROJECT while the Vercel limit is per ACCOUNT. This account runs
# a single project, so the count is exact today; if another project is ever added, its
# deployments would be invisible here and the reserve should be raised accordingly.

set -uo pipefail

PROJECT_ID="${VERCEL_PROJECT_ID:-prj_1FOrN1z4uYqJZZoBx7JVmpaNVKQM}"
TEAM_ID="${VERCEL_TEAM_ID:-team_UMX0qBzZ61GaCUri4A9hydvQ}"

out() { echo "$1" >> "${GITHUB_OUTPUT:-/dev/stdout}"; }

fail_open() {
  echo "::warning title=deploy quota guard::$1 — failing OPEN (no defer)."
  out "defer=0"
  out "used=unknown"
  out "remaining=unknown"
  exit 0
}

[ -n "${VERCEL_TOKEN:-}" ] || fail_open "VERCEL_TOKEN is not set; cannot count deployments"

# ── Which plan, and therefore which cap ───────────────────────────────────────────────────────────
# Hobby 100/day, Pro 6,000/day. Anything unrecognised (enterprise, a renamed tier) is treated as
# Pro-or-better rather than as Hobby: an unknown tier is far more likely to be above Pro than below
# it, and guessing low here reinstates a throttle nobody asked for.
PLAN=""
PLAN_RESP=$(curl -sf --max-time 20 -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  "https://api.vercel.com/v2/teams/${TEAM_ID}" 2>/dev/null) && PLAN=$(printf '%s' "$PLAN_RESP" | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { const j = JSON.parse(s); console.log(j?.billing?.plan || j?.plan || ""); }
      catch { console.log(""); }
    });
  ' 2>/dev/null)

case "$PLAN" in
  hobby)  LIMIT=100 ;;
  pro)    LIMIT=6000 ;;
  "")     LIMIT="${DEPLOY_QUOTA_LIMIT:-6000}"
          echo "::warning title=deploy quota guard::could not read the team's plan; using DEPLOY_QUOTA_LIMIT=${LIMIT}." ;;
  *)      LIMIT="${DEPLOY_QUOTA_LIMIT:-6000}"
          echo "::notice title=deploy quota guard::unrecognised plan '${PLAN}'; treating as Pro-or-better (${LIMIT})." ;;
esac
# An explicit repo variable always wins — the escape hatch for a cap this mapping does not know.
[ -n "${DEPLOY_QUOTA_LIMIT:-}" ] && LIMIT="$DEPLOY_QUOTA_LIMIT"

# Reserve scales with the cap. A flat 20 was 20% of Hobby and is 0.3% of Pro — meaningless as a
# safety margin at the larger number. 20% keeps the guard firing only on a genuine runaway, and the
# floor of 20 preserves the exact Hobby behaviour it was tuned for (cutoff 80 of 100).
DEFAULT_RESERVE=$(( LIMIT / 5 ))
[ "$DEFAULT_RESERVE" -lt 20 ] && DEFAULT_RESERVE=20
RESERVE="${DEPLOY_QUOTA_RESERVE:-$DEFAULT_RESERVE}"

SINCE=$(( ( $(date +%s) - 86400 ) * 1000 ))
UNTIL=""
USED=0
PAGES=0
THRESHOLD=$((LIMIT - RESERVE))
# Enough pages to actually REACH the threshold, +1 to confirm there is nothing beyond it. The old
# flat cap of 5 counted at most 500 deployments, which was ample against Hobby's 80-deployment cutoff
# and makes the guard decorative against Pro's 4,800 — it could never count high enough to fire.
# The common case still costs ONE call: a normal day's deployments fit in a single page with no
# `next`, and the loop exits. Paging only gets expensive when there is genuinely a runaway to catch,
# which is exactly when it is worth paying for.
MAX_PAGES=$(( THRESHOLD / 100 + 2 ))
[ "$MAX_PAGES" -gt 60 ] && MAX_PAGES=60
while :; do
  PAGES=$((PAGES + 1))
  URL="https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&limit=100&since=${SINCE}"
  [ -n "$UNTIL" ] && URL="${URL}&until=${UNTIL}"
  RESP=$(curl -sf --max-time 30 -H "Authorization: Bearer ${VERCEL_TOKEN}" "$URL") \
    || fail_open "Vercel API unreachable (page ${PAGES})"
  # node, not jq: both caller workflows run setup-node before this step, so node is guaranteed.
  PARSED=$(printf '%s' "$RESP" | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const j = JSON.parse(s);
      console.log((j.deployments || []).length, (j.pagination && j.pagination.next) || "");
    });
  ' 2>/dev/null) || fail_open "unparseable Vercel API response (page ${PAGES})"
  COUNT=${PARSED%% *}
  NEXT=$(printf '%s' "$PARSED" | awk '{print $2}')
  USED=$((USED + COUNT))
  # Short-circuit: the only question is whether USED has reached the cutoff, so once it has there is
  # nothing further to learn and every additional page is a wasted call.
  if [ "$USED" -ge "$THRESHOLD" ]; then break; fi
  if [ -z "$NEXT" ] || [ "$COUNT" -eq 0 ] || [ "$PAGES" -ge "$MAX_PAGES" ]; then break; fi
  UNTIL="$NEXT"
done

REMAINING=$((LIMIT - USED))
[ "$REMAINING" -lt 0 ] && REMAINING=0

echo "Vercel deployments created in the rolling 24h: ${USED}/${LIMIT} on plan '${PLAN:-unknown}' (bot cutoff ${THRESHOLD}, human reserve ${RESERVE}, ${PAGES} page(s) read)"
out "used=${USED}"
out "remaining=${REMAINING}"

if [ "$USED" -ge "$THRESHOLD" ]; then
  echo "::warning title=deploy quota reserve::${USED}/${LIMIT} daily deployments used — at/over the bot cutoff (${THRESHOLD}). Deferring the auto-merge; the change will be PR-gated to keep ${RESERVE} slots free for human deploys."
  out "defer=1"
else
  out "defer=0"
fi
