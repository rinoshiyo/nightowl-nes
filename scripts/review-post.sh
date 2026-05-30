#!/bin/bash
# レビュー結果の投稿を atomic に実行する。Claude は findings JSON を作って
# このスクリプトを 1 回呼ぶだけで、bot 投稿 + triage 裁定 + state 管理を完遂する。
#
# finish-night.sh が end-of-night を原子化したのと同じパターン。LLM が投稿ステップを
# 落とす構造的欠陥 (夜 023 で発覚) を解消する。
#
# usage:
#   review-post.sh <pr> <json-file>
#
# json 構造 (bot-review-post.sh の拡張):
#   {
#     "summary": "bot サマリ本文",
#     "findings": [
#       {
#         "file": "path/to/file",
#         "line": 123,
#         "body": "bot テイストの指摘文",
#         "severity": "critical|high|medium|low",
#         "triage": "fix|pass|stop",
#         "triage_note": "修正済み commit abc1234 / スコープ外 等"
#       }
#     ]
#   }
#
# 実行する処理:
#   1. bot-review-post.sh 呼び出し (bot 名義投稿 + review-status.json 書出)
#   2. triage 裁定コメントを石井名義で自動生成・投稿
set -uo pipefail

PR="${1:?usage: review-post.sh <pr> <json-file>}"
JSON_FILE="${2:?usage: review-post.sh <pr> <json-file>}"
SCRIPTS="$(dirname "${BASH_SOURCE[0]}")"

# --- 1. bot 名義投稿 + review-status.json ---
bash "$SCRIPTS/bot-review-post.sh" "$PR" "$JSON_FILE" \
  || { echo "[review-post] bot-review-post.sh 失敗" >&2; exit 1; }

# --- 2. triage 裁定コメント生成・投稿 (石井名義) ---
JSON=$(cat "$JSON_FILE")
finding_count=$(printf '%s' "$JSON" | jq '[.findings // [] | .[]] | length')
if [ -z "$finding_count" ]; then
  echo "[review-post] findings 解析失敗" >&2; exit 1
fi

SEVERITY_EMOJI='{"critical":"🛑critical","high":"🔴high","medium":"🟠medium","low":"🟢low"}'
TRIAGE_EMOJI='{"fix":"🔧 FIX","pass":"✅ PASS","stop":"🛑 STOP"}'

if [ "$finding_count" -eq 0 ]; then
  triage_body="## Triage 裁定

findings: 0 件。

✅ 全 PASS — merge 可。"
else
  table_header="| # | severity | finding | triage |
|---|----------|---------|--------|"

  table_rows=$(printf '%s' "$JSON" | jq -r \
    --argjson sev_map "$SEVERITY_EMOJI" \
    --argjson tri_map "$TRIAGE_EMOJI" \
    '.findings // [] | to_entries[] |
     "| \(.key + 1) | \($sev_map[.value.severity // "medium"] // .value.severity) | `\(.value.file):\(.value.line)` | \($tri_map[.value.triage // "pass"] // .value.triage)\(if (.value.triage_note // "") != "" then " — " + (.value.triage_note | gsub("\\|"; "\\\\|")) else "" end) |"')

  fix_count=$(printf '%s' "$JSON" | jq '[.findings // [] | .[] | select(.triage == "fix")] | length' || echo 0)
  stop_count=$(printf '%s' "$JSON" | jq '[.findings // [] | .[] | select(.triage == "stop")] | length' || echo 0)

  if [ "${stop_count:-0}" -gt 0 ]; then
    summary_line="🛑 STOP ${stop_count} 件 — merge 不可。draft 戻しまたは修正が必要。"
  elif [ "${fix_count:-0}" -gt 0 ]; then
    summary_line="🔧 FIX ${fix_count} 件 → R2 で収束確認。"
  else
    summary_line="✅ 全 PASS — merge 可。"
  fi

  triage_body="## Triage 裁定

$table_header
$table_rows

$summary_line"
fi

echo "[review-post] triage 裁定コメント投稿中 (石井名義)..."
gh pr comment "$PR" --body "$triage_body" \
  || { echo "[review-post] triage コメント投稿失敗" >&2; exit 1; }

echo "[review-post] 完了"
