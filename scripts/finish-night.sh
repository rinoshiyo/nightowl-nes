#!/bin/bash
# 夜末の終了処理を atomic に実行する。Claude は handoff を PR に書いた後、
# このスクリプトを 1 回呼ぶだけで残りの機械的手順を完遂する。
#
# Usage: finish-night.sh [STOP] [--pr <NUM>] [--night <NNN>]
#   STOP:    連鎖を停止する場合に指定
#   --pr:    対象 PR 番号 (省略時は現ブランチの PR を自動取得)
#   --night: 完了した夜番号 (GOAL 出力用。省略時は PR title から推測)
#
# 実行する処理:
#   1. auto-merge arm (まだなら)
#   2. 次フラグ書込 (pane スコープ)
#   3. 🎯 GOAL CONDITION MET を stdout 出力
#
# PR が状態の SSOT。latest.md は生成しない。
set -euo pipefail

# /goal テキスト (turns 数は環境変数で上書き可)
# finish-night.sh 時点では次の夜の Issue はまだ存在しないため汎用文言を使う。
# Issue が既に存在する場合の具体的 goal は loop-start skill 側で生成する。
LOOP_TURNS="${LOOP_TURNS:-80}"
GOAL_TEXT="次の夜の Issue を1つ作成し、その Issue のみを対象に実装→レビュー→merge を完了せよ。達成判定: transcript に「🎯 GOAL CONDITION MET」が出現したこと。scope: この 1 Issue のみ。他の Issue・夜には着手しない。or stop after ${LOOP_TURNS} turns"

# 引数パース
STOP=false
PR_NUM="" NIGHT=""
while [ $# -gt 0 ]; do
  case "$1" in
    STOP|stop) STOP=true; shift ;;
    --pr)      PR_NUM="${2:-}";  shift; [ $# -gt 0 ] && shift ;;
    --night)   NIGHT="${2:-}";   shift; [ $# -gt 0 ] && shift ;;
    *) shift ;;
  esac
done

# --- PR 番号の自動取得 ---
if [ -z "$PR_NUM" ]; then
  PR_NUM="$(gh pr view --json number -q .number 2>/dev/null || echo "")"
fi
if [ -z "$PR_NUM" ]; then
  echo "[finish-night] ⚠ PR 番号を取得できなかった。auto-merge arm をスキップ" >&2
fi

# --- 夜番号の自動推測 ---
if [ -z "$NIGHT" ] && [ -n "$PR_NUM" ]; then
  NIGHT="$(gh pr view "$PR_NUM" --json title -q .title 2>/dev/null | sed -n 's/.*night \([0-9]\{1,\}\).*/\1/p' || echo "")"
fi

# --- TMUX_PANE チェック ---
PANE="${TMUX_PANE:-}"
if [ -z "$PANE" ]; then
  echo "[finish-night] ⚠ TMUX_PANE が未設定。フラグ書込をスキップ（tmux 外で実行されている）" >&2
fi

# --- 1. auto-merge arm ---
if [ -n "$PR_NUM" ]; then
  if ! gh pr merge "$PR_NUM" --auto --merge --delete-branch 2>/dev/null; then
    echo "[finish-night] ⚠ auto-merge arm 失敗 (PR #$PR_NUM)。手動確認が必要" >&2
  fi
fi

# review gate の state file を cleanup (次の夜に stale state を持ち越さない)
rm -f .claude/state/review-status.json

# --- 2. 次フラグ書込 (pane スコープ) ---
# STOP はプレーンテキスト (stop-hook.sh が完全一致で判定し連鎖終了)。
# それ以外は /goal + 固定文言。ターン上限・連鎖駆動を保証する。
if [ -n "$PANE" ]; then
  if [ "$STOP" = "true" ]; then
    printf '%s' "STOP" > ".claude/state/loop-next.${PANE#%}.txt"
  else
    printf '/goal %s' "$GOAL_TEXT" > ".claude/state/loop-next.${PANE#%}.txt"
  fi
fi

# --- 3. GOAL 出力 ---
if [ -n "$NIGHT" ]; then
  echo "🎯 GOAL CONDITION MET: night $NIGHT merged"
else
  echo "🎯 GOAL CONDITION MET (handoff written)"
fi
