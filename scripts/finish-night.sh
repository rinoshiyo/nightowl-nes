#!/bin/bash
# 夜末の終了処理を atomic に実行する。Claude は handoff を PR に書いた後、
# このスクリプトを 1 回呼ぶだけで残りの機械的手順を完遂する。
#
# Usage: finish-night.sh <next-goal-or-STOP> [--pr <NUM>] [--night <NNN>] [--nestest <LINE>]
#   next-goal: 次の夜のゴール文 (単一行) or "STOP"
#   --pr:      対象 PR 番号 (省略時は現ブランチの PR を自動取得)
#   --night:   完了した夜番号 (GOAL 出力用。省略時は PR title から推測)
#   --nestest: nestest 到達行数 (latest.md 用。省略可)
#
# 実行する処理:
#   1. auto-merge arm (まだなら)
#   2. .claude/state/latest.md 更新
#   3. 次フラグ書込 (pane スコープ)
#   4. 🎯 GOAL CONDITION MET を stdout 出力
set -euo pipefail

NEXT="${1:?引数1: next goal or STOP が必須}"
shift

PR_NUM="" NIGHT="" NESTEST=""
while [ $# -gt 0 ]; do
  case "$1" in
    --pr)      PR_NUM="${2:-}";  shift; [ $# -gt 0 ] && shift ;;
    --night)   NIGHT="${2:-}";   shift; [ $# -gt 0 ] && shift ;;
    --nestest) NESTEST="${2:-}"; shift; [ $# -gt 0 ] && shift ;;
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

# --- 2. latest.md 更新 ---
mkdir -p .claude/state
{
  echo "# Handoff $(date -Iseconds)"
  [ -n "$PR_NUM" ] && echo "Last PR: #$PR_NUM"
  [ -n "$NIGHT" ] && echo "Night: $NIGHT"
  echo "Next goal: $NEXT"
  [ -n "$NESTEST" ] && echo "nestest trace: $NESTEST lines"
  echo ""
  echo "## Git status"
  echo '```'
  git log --oneline -5 2>/dev/null || true
  echo '```'
} > .claude/state/latest.md

# --- 3. 次フラグ書込 (pane スコープ) ---
if [ -n "$PANE" ]; then
  printf '%s' "$NEXT" > ".claude/state/loop-next.${PANE#%}.txt"
fi

# --- 4. GOAL 出力 ---
if [ -n "$NIGHT" ]; then
  echo "🎯 GOAL CONDITION MET: night $NIGHT merged"
else
  echo "🎯 GOAL CONDITION MET (handoff written)"
fi
