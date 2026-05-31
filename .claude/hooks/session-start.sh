#!/bin/bash
# SessionStart: matcher で分岐
#   compact: open PR の情報を additionalContext として注入 (PR が SSOT)
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
        additionalContext: ("コンパクト後の state を PR (SSOT) から復元:\n\n" + $content)
      }
    }'
  else
    NEXT_NIGHT=$(ls "$CWD/nights/pending/" 2>/dev/null | sort -V | head -1)
    FALLBACK="コンパクト後: open PR なし。起動時の作法 step 0 から再開。"
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
