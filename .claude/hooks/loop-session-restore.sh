#!/bin/bash
# SessionStart hook (clear matcher) for the autonomous /clear loop.
#
# When the loop driver injects /clear at a task boundary, the conversation
# context is wiped. This hook re-injects the handoff state from
# .claude/state/latest.md so the fresh session resumes already informed of
# where the previous task left off.
#
# Note: there is no PreClear hook in Claude Code, so nothing dumps state
# automatically before /clear. The worker is responsible for refreshing
# .claude/state/latest.md as its final step before signaling task completion.
set -euo pipefail

input=$(cat)
SOURCE=$(echo "$input" | jq -r '.source // "unknown"')
CWD=$(echo "$input" | jq -r '.cwd // empty')

[ "$SOURCE" = "clear" ] || exit 0
[ -n "$CWD" ] || exit 0

# No handoff to restore: warn instead of resuming with a blank context, so the
# fresh session knows to reconstruct state from the PR / nights/pending/ rather
# than silently starting over.
if [ ! -f "$CWD/.claude/state/latest.md" ]; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: "WARNING: resumed after /clear but .claude/state/latest.md is missing. The previous task may have failed to write its handoff. Reconstruct current state from the open PR (gh pr view --comments) and nights/pending/ before continuing."
    }
  }'
  exit 0
fi

CONTENT=$(cat "$CWD/.claude/state/latest.md")
jq -n --arg content "$CONTENT" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: ("State restored after /clear (autonomous loop task boundary):\n\n" + $content)
  }
}'
exit 0
