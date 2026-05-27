#!/bin/bash
# PreCompact: コンパクト直前に state を dump する
# 入力 JSON から transcript_path / cwd を取得し、 .claude/state/latest.md を更新
set -euo pipefail
input=$(cat)
TRANSCRIPT=$(echo "$input" | jq -r '.transcript_path // empty')
CWD=$(echo "$input" | jq -r '.cwd // empty')
TRIGGER=$(echo "$input" | jq -r '.trigger // "unknown"')

[ -z "$CWD" ] && exit 0
mkdir -p "$CWD/.claude/state"

cat > "$CWD/.claude/state/latest.md" <<EOF
# State Dump (PreCompact: $TRIGGER)
Generated: $(date '+%F %T %Z')
Session: $(echo "$input" | jq -r '.session_id // "unknown"')
Transcript: $TRANSCRIPT

## Git status
\`\`\`
$(cd "$CWD" && git log --oneline -10 2>/dev/null || echo "no git log")
\`\`\`

\`\`\`
$(cd "$CWD" && git status --short 2>/dev/null || echo "no git status")
\`\`\`

## 最後のテスト結果（あれば）
\`\`\`
$(tail -20 "$CWD/tmp/test.log" 2>/dev/null || echo "no test log")
\`\`\`

## 現在の作業対象
$(ls "$CWD/nights/pending/" 2>/dev/null | sort | head -1 || echo "no pending night")
EOF

exit 0
