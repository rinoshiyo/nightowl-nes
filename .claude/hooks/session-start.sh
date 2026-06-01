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
    NEXT_NIGHT=$(ls "$CWD/nights/pending/" 2>/dev/null | sort -V | head -1)
    FALLBACK="コンパクト後: open PR/Issue なし。/goal active なら夜 md Read → 実装続行。active でなければ loop-start skill で setup から。"
    [ -n "$NEXT_NIGHT" ] && FALLBACK="$FALLBACK 次の夜 md: nights/pending/$NEXT_NIGHT"
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
  NEXT_NIGHT=$(ls "$CWD/nights/pending/" 2>/dev/null | sort -V | head -1)
  if [ -n "$NEXT_NIGHT" ]; then
    jq -n --arg next "$NEXT_NIGHT" '{
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: ("次に着手すべき夜 md: nights/pending/" + $next)
      }
    }'
  fi
  exit 0
fi

exit 0
