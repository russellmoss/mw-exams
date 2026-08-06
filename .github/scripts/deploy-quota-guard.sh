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
# Inputs (env):
#   VERCEL_TOKEN          required — repo Actions secret
#   DEPLOY_QUOTA_LIMIT    default 100 (the Hobby cap)
#   DEPLOY_QUOTA_RESERVE  default 20  (slots to keep free for humans)
#   VERCEL_PROJECT_ID / VERCEL_TEAM_ID  default to the study-app project (CLAUDE.md)
#
# Outputs (GITHUB_OUTPUT): defer=0|1, used=<n|unknown>, remaining=<n>
#
# Caveat: the count is per PROJECT while the Vercel limit is per ACCOUNT. This account runs
# a single project, so the count is exact today; if another project is ever added, its
# deployments would be invisible here and the reserve should be raised accordingly.

set -uo pipefail

LIMIT="${DEPLOY_QUOTA_LIMIT:-100}"
RESERVE="${DEPLOY_QUOTA_RESERVE:-20}"
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

SINCE=$(( ( $(date +%s) - 86400 ) * 1000 ))
UNTIL=""
USED=0
PAGES=0
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
  # The cap is 100/day, so >2 full pages already proves the point; 5 is a runaway stop.
  if [ -z "$NEXT" ] || [ "$COUNT" -eq 0 ] || [ "$PAGES" -ge 5 ]; then break; fi
  UNTIL="$NEXT"
done

THRESHOLD=$((LIMIT - RESERVE))
REMAINING=$((LIMIT - USED))
[ "$REMAINING" -lt 0 ] && REMAINING=0

echo "Vercel deployments created in the rolling 24h: ${USED}/${LIMIT} (bot cutoff ${THRESHOLD}, human reserve ${RESERVE})"
out "used=${USED}"
out "remaining=${REMAINING}"

if [ "$USED" -ge "$THRESHOLD" ]; then
  echo "::warning title=deploy quota reserve::${USED}/${LIMIT} daily deployments used — at/over the bot cutoff (${THRESHOLD}). Deferring the auto-merge; the change will be PR-gated to keep ${RESERVE} slots free for human deploys."
  out "defer=1"
else
  out "defer=0"
fi
