#!/bin/bash
# SessionStart hook (clear matcher) for the autonomous /clear loop.
#
# When the loop driver injects /clear at a task boundary, the conversation
# context is wiped. This hook:
#   1. Signals "clear completed" to the loop driver (pane-scoped file)
#   2. Re-injects Issue/PR state from GitHub (GitHub Flow) so the fresh
#      session knows where the previous task left off.
#      Issue = scope SSOT / PR = delivery SSOT — no local state file.
set -euo pipefail

input=$(cat)
SOURCE=$(echo "$input" | jq -r '.source // "unknown"')
CWD=$(echo "$input" | jq -r '.cwd // empty')

[ "$SOURCE" = "clear" ] || exit 0
[ -n "$CWD" ] || exit 0

# Signal "/clear completed" to the loop driver.
PANE="${TMUX_PANE:-}"
if [ -n "$PANE" ]; then
  mkdir -p "$CWD/.claude/state"
  : > "$CWD/.claude/state/loop-cleared.${PANE#%}.txt"
fi

# Inject PR context from GitHub (SSOT).
CONTEXT=$("$CWD/scripts/pr-context.sh" "$CWD" 2>/dev/null || echo "")

if [ -z "$CONTEXT" ]; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: "Resumed after /clear. No open PR/Issue found — start from 起動時の作法 step 0."
    }
  }'
  exit 0
fi

jq -n --arg content "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: ("State restored after /clear (GitHub Flow: Issue=scope / PR=delivery):\n\n" + $content)
  }
}'
exit 0
