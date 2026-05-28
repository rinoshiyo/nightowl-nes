#!/bin/bash
# L3 手動スモーク: loop_send を実 tmux に流して人間が目視確認するツール。
#
# CI では走らせない。bracketed paste mode 下の実 TUI(実 Claude)挙動はダミーでは
# 再現できないため、人間が画面で見るしかない補完レイヤー。
#   - L2 (tests/loop_send.test.ts) … 単一行の byte-perfect を CI で自動保証
#   - L3 (このスクリプト)          … 各サンプルが実際どんなバイトで届くかを目視
#
# 使い方:
#   scripts/loop-send-smoke.sh
#       内蔵モード。サンプルごとに raw-cat 受信して cat -A で生バイトを可視化表示
#       (\r→^M, tab→^I, 行末→$)。実 Claude 不要・安全。
#   scripts/loop-send-smoke.sh --pane '%5'
#       石井が開いている実 Claude 等の pane に流す(loop_send は Enter まで送る=submit される)。
#       対象 pane の画面を capture-pane で表示する。
#
# TTY 上で実行すると各サンプルごとに Enter 待ちで一時停止する(一緒に見ながら進める用)。

set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/loop-send.sh"

command -v tmux >/dev/null 2>&1 || { echo "tmux が無い。先に入れてくれ"; exit 1; }

TARGET_PANE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --pane) TARGET_PANE="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1"; exit 1 ;;
  esac
done

# 内蔵モード: 独立の raw-cat 受信セッションを毎回立て、生バイトを cat -A で可視化。
# 画面バッファに依存しないので確実に中身が見える(capture-pane は \r で flush されず空になる)。
run_builtin() {
  local label="$1" body="$2"
  local out recv sess pane
  out="$(mktemp)"
  recv="$(mktemp)"
  sess="loopsend_smoke_$$_${RANDOM}"
  printf '%s\n' '#!/bin/bash' 'stty raw -echo 2>/dev/null' "exec cat > '$out'" > "$recv"
  tmux new-session -d -s "$sess" -x 200 -y 40 "bash '$recv'"
  sleep 0.4
  pane="$(tmux list-panes -t "$sess" -F '#{pane_id}' | head -1)"

  echo "================ $label ================"
  printf 'send (%%q): %q\n' "$body"
  loop_send "$pane" "$body"
  sleep 0.5
  tmux kill-session -t "$sess" 2>/dev/null

  echo '受信バイト (cat -A: \r→^M, tab→^I, 行末→$):'
  cat -A "$out" | sed 's/^/  | /'
  echo "  受信 $(wc -c < "$out") bytes  /  body $(printf '%s' "$body" | wc -c) bytes + 末尾 \\r 1"
  echo
  rm -f "$out" "$recv"
  [ -t 0 ] && read -rp "[Enter で次のサンプルへ] " _
}

# 実 pane モード: 指定 pane に流し、その画面を capture-pane で表示。
run_pane() {
  local label="$1" body="$2"
  echo "================ $label ================"
  printf 'send (%%q): %q\n' "$body"
  loop_send "$TARGET_PANE" "$body"
  sleep 0.4
  echo "---- pane 受信 (capture-pane 末尾) ----"
  tmux capture-pane -t "$TARGET_PANE" -p 2>/dev/null | tail -10
  echo
  [ -t 0 ] && read -rp "[Enter で次のサンプルへ] " _
}

run_one() {
  if [ -n "$TARGET_PANE" ]; then run_pane "$@"; else run_builtin "$@"; fi
}

run_one "single-line-ascii"  "next goal simple"
run_one "realistic-goal"     "次の pending 夜を CLAUDE.md 自走連鎖プロトコルに従い実装→PR→sub-agentレビュー→triage→全PASSなら auto-merge arm、or stop after 50 turns"
run_one "ja-emoji-arrow"     "次の pending 夜を実装→PR→auto-merge ✨"
run_one "specialchars"       'a"b'"'"'c\d$e`f(g)h'
run_one "dash-start"         "-foo --bar"
run_one "cmd-subst-literal"  '$(echo PWNED)'
run_one "multiline"          "$(printf 'line1\nline2\nline3')"
run_one "longtext-200"       "$(printf 'x%.0s' {1..200})"

echo "=== smoke done ==="
