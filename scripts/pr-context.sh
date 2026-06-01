#!/bin/bash
# open な PR / Issue の情報をテキストで出力する (GitHub Flow)。
# SessionStart hook (clear / compact) から呼ばれ、additionalContext に inject される。
# Issue = scope SSOT / PR = delivery SSOT。どちらもなければ空文字を返す (exit 0)。
set -euo pipefail

CWD="${1:-.}"
cd "$CWD"

# --- Issue (scope SSOT) ---
ISSUE_JSON=$(gh issue list -s open -l night --json number,title,body -L 1 2>/dev/null || echo '[]')
ISSUE_COUNT=$(printf '%s' "$ISSUE_JSON" | jq 'length')
ISSUE_NUMBER=""
ISSUE_TITLE=""
if [ "$ISSUE_COUNT" != "0" ]; then
  ISSUE_NUMBER=$(printf '%s' "$ISSUE_JSON" | jq -r '.[0].number')
  ISSUE_TITLE=$(printf '%s' "$ISSUE_JSON" | jq -r '.[0].title')
fi

# --- PR (delivery SSOT) ---
PR_JSON=$(gh pr list -s open --json number,title,isDraft,mergeStateStatus,body,headRefName,comments -L 1 2>/dev/null || echo '[]')
COUNT=$(printf '%s' "$PR_JSON" | jq 'length')

if [ "$COUNT" = "0" ] && [ "$ISSUE_COUNT" = "0" ]; then
  exit 0
fi

# --- Issue セクション ---
if [ "$ISSUE_COUNT" != "0" ]; then
  ISSUE_BODY=$(printf '%s' "$ISSUE_JSON" | jq -r '.[0].body // ""' | head -60)
  cat <<ISSUE_EOF
# Open Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE} (scope SSOT)

## DoD (Issue body)
${ISSUE_BODY}

ISSUE_EOF
fi

# --- PR セクション ---
if [ "$COUNT" != "0" ]; then
  NUMBER=$(printf '%s' "$PR_JSON" | jq -r '.[0].number')
  TITLE=$(printf '%s' "$PR_JSON" | jq -r '.[0].title')
  DRAFT=$(printf '%s' "$PR_JSON" | jq -r '.[0].isDraft')
  STATUS=$(printf '%s' "$PR_JSON" | jq -r '.[0].mergeStateStatus')
  BRANCH=$(printf '%s' "$PR_JSON" | jq -r '.[0].headRefName')
  BODY=$(printf '%s' "$PR_JSON" | jq -r '.[0].body // ""' | head -80)
  LAST_REVIEW=$(printf '%s' "$PR_JSON" | jq -r '
    [.[0].comments[]? | select(.author.login | test("rinoshiyo-bot-reviewer"))] | last // empty | .body // ""
  ' 2>/dev/null | head -30 || echo "")
  cat <<PR_EOF
# Open PR #${NUMBER}: ${TITLE} (delivery SSOT)
Branch: ${BRANCH}
Draft: ${DRAFT}
Status: ${STATUS}

## PR Description (excerpt)
${BODY}

## Latest Review
${LAST_REVIEW:-なし}

PR_EOF
elif [ "$ISSUE_COUNT" != "0" ]; then
  echo "No open PR found — Issue #${ISSUE_NUMBER} exists. Resume from 起動時の作法 step 4 (/goal 設定 → ブランチ切り → 実装)."
  echo ""
fi

cat <<GIT_EOF
## Git status
$(git log --oneline -5 2>/dev/null || true)
GIT_EOF
