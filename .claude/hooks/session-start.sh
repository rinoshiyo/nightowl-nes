#!/bin/bash
# SessionStart: matcher で分岐
#   compact: .claude/state/latest.md を additionalContext として注入
#   startup: 軽い初期化確認のみ
set -euo pipefail
input=$(cat)
SOURCE=$(echo "$input" | jq -r '.source // "unknown"')
CWD=$(echo "$input" | jq -r '.cwd // empty')

if [ "$SOURCE" = "compact" ] && [ -n "$CWD" ] && [ -f "$CWD/.claude/state/latest.md" ]; then
  CONTENT=$(cat "$CWD/.claude/state/latest.md")
  jq -n --arg content "$CONTENT" '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: ("コンパクト直前の state を以下に注入:\n\n" + $content)
    }
  }'
  exit 0
fi

if [ "$SOURCE" = "startup" ] && [ -n "$CWD" ]; then
  # 軽い初期化確認のみ（前回状態復元は /goal 主軸では不要）
  NEXT_NIGHT=$(ls "$CWD/nights/pending/" 2>/dev/null | sort | head -1)
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
