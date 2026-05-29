#!/bin/bash
# SessionEnd: /goal 達成またはセッション終了時に retrospective を自動生成
# reason=resume はスキップ
set -euo pipefail
input=$(cat)
TRANSCRIPT=$(echo "$input" | jq -r '.transcript_path // empty')
CWD=$(echo "$input" | jq -r '.cwd // empty')
REASON=$(echo "$input" | jq -r '.reason // "other"')

[ "$REASON" = "resume" ] && exit 0
[ -z "$CWD" ] && exit 0

DATE=$(date +%F)
TIME=$(date +%H%M)
OUTPUT_DIR="$CWD/.claude/retrospective"
mkdir -p "$OUTPUT_DIR"

cat > "$OUTPUT_DIR/$DATE-$TIME.md" <<EOF
# Nightowl NES - 夜間作業レポート $DATE $TIME

## サマリー
- セッション終了理由: $REASON
- transcript: $TRANSCRIPT

## DONE / コミット履歴
\`\`\`
$(cd "$CWD" && git log --oneline --since="24 hours ago" 2>/dev/null)
\`\`\`

## STUCK / BLOCKED
\`\`\`
$(ls "$CWD/nights/stuck/" 2>/dev/null || echo "(なし)")
\`\`\`

## 最後のテスト結果
\`\`\`
$(tail -30 "$CWD/tmp/test.log" 2>/dev/null || echo "(なし)")
\`\`\`

## メトリクス
| 項目 | 値 |
|---|---|
| コミット数 | $(cd "$CWD" && git log --oneline --since="24 hours ago" 2>/dev/null | wc -l) |
| 変更ファイル数 | $(cd "$CWD" && git diff --stat HEAD~5..HEAD 2>/dev/null | tail -1 | awk '{print $1}' || echo "?") |

## NEXT
- 次の夜 md: $(ls "$CWD/nights/pending/" 2>/dev/null | sort -V | head -1 || echo "なし")
EOF

exit 0
