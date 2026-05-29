#!/bin/bash
# レビュー結果を bot 名義で PR に投稿する。フォーマットを構造的に強制する:
#   - サマリ → issue comment (severity 件数テーブル + 一言)
#   - 各指摘 → inline comment (該当行に 1 点 1 コメント)
#
# メインはこのスクリプトに JSON を渡すだけ。投稿先の振り分け (issue vs inline) は
# このスクリプトが制御するため、「全部 issue comment にまとめる」事故が構造的に起きない。
#
# usage:
#   bot-review-post.sh <pr> <json>
#
# json 構造:
#   {
#     "summary": "サマリ本文 (severity 件数テーブル等)",
#     "findings": [
#       {"file": "path/to/file", "line": 123, "body": "bot テイストの指摘文",
#        "triage": "fix|pass|stop"}
#     ]
#   }
#
# findings が空配列の場合、サマリのみ投稿 (「✅ レビュー実施・指摘なし」用)。
# summary が空の場合はエラー (サマリは必須)。
#
# triage フィールド ("fix"/"pass"/"stop") が含まれる場合、.claude/state/review-status.json
# に round 状態を書き出す。fix/stop > 0 なら has_fix=true → pre-tool-use.sh が
# gh pr merge を deny する (R2 で収束確認するまで merge 不可)。
set -uo pipefail

PR="${1:?usage: bot-review-post.sh <pr> <json>}"
JSON="${2:?usage: bot-review-post.sh <pr> <json>}"
SCRIPTS="$(dirname "${BASH_SOURCE[0]}")"

summary=$(printf '%s' "$JSON" | jq -r '.summary // empty' 2>/dev/null)
if [ -z "$summary" ]; then
  echo "ERROR: summary が空。サマリは必須。" >&2
  exit 1
fi

finding_count=$(printf '%s' "$JSON" | jq '[.findings // [] | .[]] | length' 2>/dev/null)
if [ -z "$finding_count" ]; then
  echo "ERROR: findings の解析失敗。JSON 形式を確認してください。" >&2
  exit 1
fi

# 1. サマリを issue comment で投稿
echo "[bot-review-post] サマリ投稿中 (PR #$PR)..."
bash "$SCRIPTS/bot-comment.sh" "$PR" "$summary" \
  || { echo "ERROR: サマリ投稿失敗。" >&2; exit 1; }

# 2. 各 finding を inline で投稿
if [ "$finding_count" -gt 0 ]; then
  echo "[bot-review-post] inline $finding_count 件投稿中..."
  posted=0
  failed=0
  for i in $(seq 0 $((finding_count - 1))); do
    file=$(printf '%s' "$JSON" | jq -r ".findings[$i].file // empty" 2>/dev/null)
    line=$(printf '%s' "$JSON" | jq -r ".findings[$i].line // empty" 2>/dev/null)
    body=$(printf '%s' "$JSON" | jq -r ".findings[$i].body // empty" 2>/dev/null)

    if [ -z "$file" ] || [ -z "$line" ] || [ -z "$body" ]; then
      echo "WARNING: findings[$i] に file/line/body が不足。スキップ。" >&2
      failed=$((failed + 1))
      continue
    fi

    if bash "$SCRIPTS/bot-comment.sh" "$PR" --inline "$file" "$line" "$body"; then
      posted=$((posted + 1))
    else
      echo "WARNING: findings[$i] ($file:$line) の inline 投稿失敗。" >&2
      failed=$((failed + 1))
    fi
  done
  echo "[bot-review-post] 完了: posted=$posted failed=$failed"
  if [ "$failed" -gt 0 ]; then
    exit 1
  fi
else
  echo "[bot-review-post] findings 0 件 (サマリのみ投稿済み)"
fi

# 3. review round の状態を書き出す (pre-tool-use.sh が merge 可否を判定)
STATE_DIR="$(cd "$SCRIPTS/.." && pwd)/.claude/state"
mkdir -p "$STATE_DIR"
fix_count=$(printf '%s' "$JSON" | jq '[.findings // [] | .[] | select(.triage == "fix" or .triage == "stop")] | length' 2>/dev/null || echo 0)
has_fix=$( [ "${fix_count:-0}" -gt 0 ] && echo true || echo false )
printf '{"pr":%s,"has_fix":%s}\n' "$PR" "$has_fix" > "$STATE_DIR/review-status.json"

if [ "$has_fix" = "true" ]; then
  echo "[bot-review-post] ⚠ FIX/STOP $fix_count 件 — R2 で収束確認が必須 (merge blocked until next round)"
else
  echo "[bot-review-post] ✅ FIX/STOP なし — merge 可"
fi
