#!/bin/bash
# SessionStart: matcher で分岐
#   compact: open Issue/PR の情報を additionalContext として注入 (GitHub Flow)
#   startup: 軽い初期化確認のみ
set -euo pipefail
input=$(cat)
SOURCE=$(echo "$input" | jq -r '.source // "unknown"')
CWD=$(echo "$input" | jq -r '.cwd // empty')

if [ "$SOURCE" = "compact" ] && [ -n "$CWD" ]; then
  CONTEXT=$("$CWD/scripts/pr-context.sh" "$CWD" 2>/dev/null || echo "")
  if [ -n "$CONTEXT" ]; then
    jq -n --arg content "$CONTEXT" '{
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: ("コンパクト後の state を GitHub (Issue=scope / PR=delivery) から復元:\n\n" + $content)
      }
    }'
  else
    NEXT_ISSUE=$(cd "$CWD" && gh issue list -s open -l night --search 'sort:created-asc -label:stuck' \
      --json number,title -q '.[0] | select(. != null) | "#\(.number) \(.title)"' 2>/dev/null || echo "")
    FALLBACK="コンパクト後: open PR/Issue なし。/goal active なら Issue body Read → 実装続行。active でなければ loop-start skill で setup から。"
    [ -n "$NEXT_ISSUE" ] && FALLBACK="$FALLBACK 次の夜 Issue: $NEXT_ISSUE"
    jq -n --arg content "$FALLBACK" '{
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: $content
      }
    }'
  fi
  exit 0
fi

if [ "$SOURCE" = "startup" ] && [ -n "$CWD" ]; then
  NEXT_ISSUE=$(cd "$CWD" && gh issue list -s open -l night --search 'sort:created-asc -label:stuck' \
    --json number,title -q '.[0] | select(. != null) | "#\(.number) \(.title)"' 2>/dev/null || echo "")
  if [ -n "$NEXT_ISSUE" ]; then
    jq -n --arg next "$NEXT_ISSUE" '{
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: ("次に着手すべき夜 Issue: " + $next)
      }
    }'
  fi
  exit 0
fi

exit 0
