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
#   ready        open Issue(s) exist, no PR -> start or resume implementation
#   seed         no open Issues -> design & seed new Issue(s) first
#   bootstrap    no closed Issues either -> brand-new repo, design with a human
#
# v2: Issue-only SSOT。nights/ ディレクトリには依存しない。
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

pane="${TMUX_PANE:-NONE}"
trace_lines=$(grep -oE 'TRACE_LINES *= *[0-9]+' tests/cpu_nestest_trace.test.ts 2>/dev/null | grep -oE '[0-9]+' | head -1)
open_pr=$(gh pr list --state open --json number,isDraft,title \
  -q '.[] | "  #\(.number) draft=\(.isDraft) — \(.title)"' 2>/dev/null)

# Issue-only: GitHub Issues が scope の SSOT
open_night_json=$(gh issue list -s open -l night --search '-label:stuck' --json number,title -L 20 2>/dev/null || echo '[]')
open_night_n=$(printf '%s' "$open_night_json" | jq 'length')
stuck_json=$(gh issue list -s open -l stuck --json number,title -L 10 2>/dev/null || echo '[]')
stuck_n=$(printf '%s' "$stuck_json" | jq 'length')
closed_night_n=$(gh issue list -s closed -l night --json number -q 'length' -L 200 2>/dev/null || echo "0")

echo "=== loop status ==="
echo "tmux pane     : $pane"
echo "open tasks    : ${open_night_n:-0}"
if [ "${open_night_n:-0}" -gt 0 ]; then
  printf '%s' "$open_night_json" | jq -r '.[] | "  #\(.number) — \(.title)"' 2>/dev/null
fi
echo "stuck tasks   : ${stuck_n:-0}"
if [ "${stuck_n:-0}" -gt 0 ]; then
  printf '%s' "$stuck_json" | jq -r '.[] | "  #\(.number) — \(.title)"' 2>/dev/null
fi
echo "closed tasks  : ${closed_night_n:-0}"
echo "nestest TRACE_LINES: ${trace_lines:-unknown}"
if [ -n "$open_pr" ]; then
  echo "open PRs:"
  printf '%s\n' "$open_pr"
else
  echo "open PRs      : none"
fi

# Warn (do not block) when not in a tmux pane: the driving hooks are pane-scoped,
# so the /clear chain cannot run, though seeding Issues still works.
[ "$pane" = "NONE" ] && echo "WARNING: not in a tmux pane — the /clear chain cannot run (seed-only)."

# Decide the suggested branch (GitHub Flow: Issue → Branch → PR → Merge).
# Open PRs win (delivery in progress), then open Issues (scope decided),
# then seed (no open Issues).
if [ -n "$open_pr" ]; then
  suggested="resume-pr"
elif [ "${open_night_n:-0}" -gt 0 ]; then
  suggested="ready"
elif [ "${closed_night_n:-0}" -gt 0 ]; then
  suggested="seed"
else
  suggested="bootstrap"
fi
echo "SUGGESTED: $suggested"
