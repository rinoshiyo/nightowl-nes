#!/bin/bash
# Diagnose the autonomous loop's current state and suggest the next action.
#
# Called by the loop-start skill (via !`bash scripts/loop-status.sh`) so a single
# skill invocation can branch on the real repo state instead of the operator
# guessing. Also runnable by hand to see "where is the loop right now?".
#
# Emits a human/Claude-readable status block, then a final `SUGGESTED: <branch>`
# line the skill keys off:
#   resume-pr    open PR(s) exist -> inspect them first (delivery in progress)
#   resume-issue open Issue exists but no PR -> scope decided, resume implementation
#   autorun      pending night(s) exist -> create Issue and start the /clear chain
#   seed         no pending but done exists -> design & seed the next night first
#   bootstrap    no pending and no done -> brand-new repo, design with a human
#
# Domain-specific bits (nights/, nestest TRACE_LINES) live here rather than in
# the skill body so the skill stays thin and these can be externalized to config
# when the loop machinery is extracted into the claude-loop plugin.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

pane="${TMUX_PANE:-NONE}"
pending_list=$(ls nights/pending/*.md 2>/dev/null | sed 's#.*/##' | sort -V)
pending_n=$(ls nights/pending/*.md 2>/dev/null | wc -l | tr -d ' ')
done_latest=$(ls nights/done/*.md 2>/dev/null | sed 's#.*/##' | sort -V | tail -1)
done_n=$(ls nights/done/*.md 2>/dev/null | wc -l | tr -d ' ')
trace_lines=$(grep -oE 'TRACE_LINES *= *[0-9]+' tests/cpu_nestest_trace.test.ts 2>/dev/null | grep -oE '[0-9]+' | head -1)
open_pr=$(gh pr list --state open --json number,isDraft,title \
  -q '.[] | "  #\(.number) draft=\(.isDraft) — \(.title)"' 2>/dev/null)
open_issue_json=$(gh issue list --state open --label night --json number,title -L 10 2>/dev/null || echo '[]')
open_issue_n=$(printf '%s' "$open_issue_json" | jq 'length')
open_issue=$(printf '%s' "$open_issue_json" | jq -r '.[] | "  #\(.number) — \(.title)"' 2>/dev/null)

echo "=== loop status ==="
echo "tmux pane     : $pane"
echo "pending nights: ${pending_n:-0}"
[ -n "$pending_list" ] && printf '%s\n' "$pending_list" | sed 's/^/  - /'
echo "done nights   : ${done_n:-0} (latest: ${done_latest:-none})"
echo "nestest TRACE_LINES: ${trace_lines:-unknown}"
if [ -n "$open_issue" ]; then
  echo "open issues   : $open_issue_n"
  printf '%s\n' "$open_issue"
else
  echo "open issues   : 0"
fi
if [ -n "$open_pr" ]; then
  echo "open PRs:"
  printf '%s\n' "$open_pr"
else
  echo "open PRs      : none"
fi

# Warn (do not block) when not in a tmux pane: the driving hooks are pane-scoped,
# so the /clear chain cannot run, though seeding nights still works.
[ "$pane" = "NONE" ] && echo "WARNING: not in a tmux pane — the /clear chain cannot run (seed-only)."

# Decide the suggested branch (GitHub Flow: Issue → Branch → PR → Merge).
# Open PRs win (delivery in progress), then open Issues (scope decided, not yet
# started or interrupted mid-implementation), then pending nights, then seed.
if [ -n "$open_pr" ]; then
  suggested="resume-pr"
elif [ -n "$open_issue" ]; then
  suggested="resume-issue"
elif [ "${pending_n:-0}" -gt 0 ]; then
  suggested="autorun"
elif [ "${done_n:-0}" -gt 0 ]; then
  suggested="seed"
else
  suggested="bootstrap"
fi
echo "SUGGESTED: $suggested"
