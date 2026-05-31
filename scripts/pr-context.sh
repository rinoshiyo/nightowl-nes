#!/bin/bash
# open な PR の情報をテキストで出力する。
# SessionStart hook (clear / compact) から呼ばれ、additionalContext に inject される。
# open PR がなければ空文字を返す (exit 0)。
set -euo pipefail

CWD="${1:-.}"
cd "$CWD"

# 1 回の API コールで PR メタデータ + コメントを取得
PR_JSON=$(gh pr list -s open --json number,title,isDraft,mergeStateStatus,body,headRefName,comments -L 1 2>/dev/null || echo '[]')
COUNT=$(printf '%s' "$PR_JSON" | jq 'length')

if [ "$COUNT" = "0" ]; then
  exit 0
fi

# 最初の open PR を使う (通常 1 本)
NUMBER=$(printf '%s' "$PR_JSON" | jq -r '.[0].number')
TITLE=$(printf '%s' "$PR_JSON" | jq -r '.[0].title')
DRAFT=$(printf '%s' "$PR_JSON" | jq -r '.[0].isDraft')
STATUS=$(printf '%s' "$PR_JSON" | jq -r '.[0].mergeStateStatus')
BRANCH=$(printf '%s' "$PR_JSON" | jq -r '.[0].headRefName')
BODY=$(printf '%s' "$PR_JSON" | jq -r '.[0].body // ""' | head -80)

# bot 名義の最新レビューコメントを抽出
LAST_REVIEW=$(printf '%s' "$PR_JSON" | jq -r '
  [.[0].comments[]? | select(.author.login | test("rinoshiyo-bot-reviewer"))] | last // empty | .body // ""
' 2>/dev/null | head -30 || echo "")

cat <<EOF
# Open PR #${NUMBER}: ${TITLE}
Branch: ${BRANCH}
Draft: ${DRAFT}
Status: ${STATUS}

## PR Description (excerpt)
${BODY}

## Latest Review
${LAST_REVIEW:-なし}

## Git status
$(git log --oneline -5 2>/dev/null || true)
EOF
