#!/bin/bash
# StopFailure 自動リカバリ: API エラー / parse 失敗で turn が落ちたら、
# 同一 transcript 内で連続 N 回まで自動 wake して続行させる。超過で諦める(無限ループ防止)。
#
# 配線: .claude/settings.json の StopFailure hook (asyncRewake: true) から呼ぶ。
# 無効化: CLAUDE_AUTORECOVER_MAX=0 (env) か settings から hook を外す。
set -uo pipefail
input=$(cat)

# transcript 単位のカウンタキー。session_id → transcript_path の順で識別。
# どちらも取れなければ全体カウンタ化(他セッション巻き込み)を避けるため安全側 = wake しない。
key=$(printf '%s' "$input" | jq -r '.session_id // .transcript_path // empty' 2>/dev/null)
[ -z "$key" ] && { echo "[auto-recover] 識別子なし。安全のため wake しない。" >&2; exit 0; }
key=$(printf '%s' "$key" | tr -c 'a-zA-Z0-9' '_')

MAX="${CLAUDE_AUTORECOVER_MAX:-3}"
[ "$MAX" -le 0 ] && { echo "[auto-recover] 無効化中 (MAX=$MAX)。" >&2; exit 0; }

et=$(printf '%s' "$input" | jq -r '.error // .error_type // "unknown"' 2>/dev/null)
cdir="${TMPDIR:-/tmp}/claude-autorecover"; mkdir -p "$cdir"
cf="$cdir/${key}.count"

# 連続失敗カウント。最後の失敗から 10 分超ならリセット(連続でない = 正常進行が挟まった)。
now=$(date +%s)
last=$(date -r "$cf" +%s 2>/dev/null || echo 0)
n=$(cat "$cf" 2>/dev/null || echo 0)
[ $((now - last)) -gt 600 ] && n=0
n=$((n + 1))
echo "$n" > "$cf"   # 常に更新(mtime も = 10 分窓の起点)。超過後も保持し再カウントさせない

if [ "$n" -gt "$MAX" ]; then
  # カウンタは消さない。超過状態を維持して以降 wake しない(10 分失敗が止めば自然リセット)。
  echo "[auto-recover] $key が ${MAX} 回連続失敗。自動再開を諦める(要人手)。" >&2
  cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
  sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
  lam=$(printf '%s' "$input" | jq -r '.last_assistant_message // empty' 2>/dev/null)
  notify="${cwd:+$cwd/}scripts/loop-notify.sh"
  if [ -n "$cwd" ] && [ -x "$notify" ]; then
    bash "$notify" \
      --reason auto-recover-max \
      --error "${et}: ${lam}" \
      --session "$sid" \
      --cwd "$cwd" \
      --log "$cwd/tmp/loop.log" 2>/dev/null &
  fi
  exit 0
fi

# 待機: rate_limit は回復に時間が要るので長め、parse 失敗等は短め。
case "$et" in
  rate_limit) sleep 60 ;;
  *) sleep 5 ;;
esac

# stderr が system-reminder として Claude に注入される(公式仕様)。
echo "[auto-recover ${n}/${MAX}] 直前の turn が ${et} で失敗した。少し待った。中断した作業をそのまま続けて。" >&2
exit 2
