#!/bin/bash
# 自走ループ異常停止時に bot 名義で gh issue を作成する通知スクリプト。
# bot token が取れなければ通常認証に fallback（石井名義）。
# 呼び出し元: auto-recover.sh / loop-helper.sh / stop-hook.sh / stuck 隔離手順
#
# Usage: loop-notify.sh --reason <REASON> [--error <MSG>] [--log <FILE>] [--branch <BRANCH>] [--pr <NUM>] [--night <MD>] [--session <ID>] [--cwd <DIR>]
#   REASON: auto-recover-max | clear-signal-timeout | merge-timeout | send-failed | runaway-brake | stuck
set -uo pipefail

# --- 引数パース ---
REASON="" ERROR_MSG="" LOG_FILE="" BRANCH="" PR="" NIGHT_MD="" SESSION_ID="" CWD=""
while [ $# -gt 0 ]; do
  case "$1" in
    --reason)   REASON="${2:-}";     shift 2 ;;
    --error)    ERROR_MSG="${2:-}";  shift 2 ;;
    --log)      LOG_FILE="${2:-}";   shift 2 ;;
    --branch)   BRANCH="${2:-}";    shift 2 ;;
    --pr)       PR="${2:-}";         shift 2 ;;
    --night)    NIGHT_MD="${2:-}";   shift 2 ;;
    --session)  SESSION_ID="${2:-}"; shift 2 ;;
    --cwd)      CWD="${2:-}";       shift 2 ;;
    *) shift ;;
  esac
done
[ -z "$REASON" ] && { echo "[loop-notify] --reason は必須" >&2; exit 1; }

CWD="${CWD:-$(pwd)}"
TS="$(date '+%F %T %Z')"

# --- ログ末尾取得 ---
LOG_TAIL=""
if [ -n "$LOG_FILE" ] && [ -f "$LOG_FILE" ]; then
  LOG_TAIL="$(tail -20 "$LOG_FILE" 2>/dev/null)"
fi

# --- git 情報の自動取得（未指定時） ---
if [ -z "$BRANCH" ]; then
  BRANCH="$(cd "$CWD" && git branch --show-current 2>/dev/null || echo "unknown")"
fi
if [ -z "$PR" ]; then
  PR="$(cd "$CWD" && gh pr view --json number -q .number 2>/dev/null || echo "")"
fi

# --- パスごとの title / 状況説明 / 復旧手順 ---
case "$REASON" in
  auto-recover-max)
    TITLE="🚨 自走停止: auto-recover ${CLAUDE_AUTORECOVER_MAX:-3}回超過"
    SITUATION="StopFailure (API エラー / parse 失敗) が連続 ${CLAUDE_AUTORECOVER_MAX:-3} 回発生し、自動復帰を諦めた。"
    RECOVERY=$(cat <<'RECOVERY_EOF'
1. `tmux attach` で該当セッションの画面を確認
2. エラーが一過性（API Overloaded / parse 失敗）なら「続けて」と入力して再開
3. rate limit の場合は時間を置いて再開（リセット時刻を確認）
4. 再開しても即座に再失敗する場合、Claude Code の再起動を検討
5. 復旧完了後、この issue をクローズ
RECOVERY_EOF
    ) ;;
  clear-signal-timeout)
    TITLE="🚨 自走停止: /clear 完了シグナル待ちタイムアウト (5分)"
    SITUATION="loop-helper が /clear 後の完了シグナル (SessionStart clear hook が置く名札ファイル loop-cleared.<pane>.txt) を 5 分待っても受け取れず abort した。clear hook が発火しなかった (pane 不明・hook 仕様変更等) 可能性。"
    RECOVERY=$(cat <<'RECOVERY_EOF'
1. `tmux attach` で worker pane の画面を確認
2. worker が既に /clear 済みで idle なら、手動で次フラグを書く: `printf '/goal <next-goal>' > .claude/state/loop-next.${TMUX_PANE#%}.txt`
3. worker が固まっている場合は `/clear` して夜 md を再投入
4. シグナルが届かない疑いがある場合は SessionStart clear hook (`.claude/hooks/loop-session-restore.sh`) が `.claude/state/loop-cleared.<pane>.txt` を置けているか、settings.json の clear matcher 配線を確認
5. 復旧完了後、この issue をクローズ
RECOVERY_EOF
    ) ;;
  merge-timeout)
    TITLE="🚨 自走停止: PR merge 待ちタイムアウト (30分)"
    SITUATION="auto-merge を arm した PR が 30 分経っても merge されなかった。CI (nightly) が赤か、GitHub Actions が詰まっている可能性。"
    RECOVERY=$(cat <<'RECOVERY_EOF'
1. `gh pr view` で PR の状態と CI check を確認
2. CI が赤の場合: テストエラーを修正 → push → auto-merge が再発火するのを待つ
3. CI が pending のまま詰まっている場合: `gh run list` で Actions の状態を確認、re-run が必要なら `gh run rerun <id>`
4. PR 自体に問題がある場合: draft に戻して (`gh pr ready --undo`) 修正
5. merge 完了後、手動で `/clear` → 次ゴール投入で連鎖を再開
6. 復旧完了後、この issue をクローズ
RECOVERY_EOF
    ) ;;
  send-failed)
    TITLE="🚨 自走停止: tmux テキスト送信失敗"
    SITUATION="loop-helper が /clear または次ゴールの tmux 送信 (loop_send) に失敗した。pane が死んでいるか tmux の状態異常の可能性。"
    RECOVERY=$(cat <<'RECOVERY_EOF'
1. `tmux list-panes` で pane の状態を確認
2. pane が死んでいる場合: 新しい pane で Claude Code セッションを起動
3. open PR を `gh pr view --comments` で確認して中断地点を把握
4. 手動で次ゴール投入で連鎖を再開
5. 復旧完了後、この issue をクローズ
RECOVERY_EOF
    ) ;;
  runaway-brake)
    TITLE="🚨 自走停止: 暴走ブレーキ (MAX=${NIGHTOWL_LOOP_MAX:-20})"
    SITUATION="連鎖が ${NIGHTOWL_LOOP_MAX:-20} 夜を超えた。pending が大量に残っているか、異常に夜が量産されている可能性。"
    RECOVERY=$(cat <<'RECOVERY_EOF'
1. `gh issue list -s open -l night` で残りタスク数を確認
2. `gh issue list -s closed -l night` で完了タスク数を確認 — 期待通りの数なら正常消化（MAX を引き上げて再開）
3. 異常にタスクが増えている場合: open Issue を確認し、不要な Issue を close
4. 再開するなら `.claude/state/loop-<pane>.count` を削除してカウンタリセット
5. `NIGHTOWL_LOOP_MAX` を調整する場合は compose.yaml の env で設定
6. 復旧完了後、この issue をクローズ
RECOVERY_EOF
    ) ;;
  stuck)
    TITLE="🚨 自走停止: 実装詰み (stuck 隔離)"
    SITUATION="worker (Claude) が実装中に詰まり、自己判断で stuck 隔離した。"
    RECOVERY=$(cat <<'RECOVERY_EOF'
1. `gh issue list -s open -l stuck` で隔離された Issue を確認
2. Issue コメントの「詰み report」を読む（再現手順・試したこと・仮説）
3. `gh pr list --state open` で draft に戻された PR を確認し、PR コメントも読む
4. 別アプローチで解決できそうなら: Issue の `stuck` label を外し (`gh issue edit <#> --remove-label stuck`)、アプローチを Issue コメントに追記して再挑戦
5. 人間の判断が必要な場合: PR コメントに方針を書いて石井に委ねる
6. 復旧完了後、この issue をクローズ
RECOVERY_EOF
    ) ;;
  *)
    TITLE="🚨 自走停止: $REASON"
    SITUATION="不明な理由で停止した。"
    RECOVERY="1. ログを確認して原因を特定\n2. 復旧完了後、この issue をクローズ"
    ;;
esac

# --- body 組み立て ---
BODY="## ${TITLE}

### 状況

${SITUATION}

| 項目 | 値 |
|------|-----|
| 検出時刻 | ${TS} |
| 停止パス | \`${REASON}\` |"

[ -n "$ERROR_MSG" ] && BODY="${BODY}
| エラー | ${ERROR_MSG//|/\\|} |"
[ -n "$SESSION_ID" ] && BODY="${BODY}
| session_id | \`${SESSION_ID}\` |"
[ -n "$BRANCH" ] && [ "$BRANCH" != "unknown" ] && BODY="${BODY}
| ブランチ | \`${BRANCH}\` |"
[ -n "$PR" ] && BODY="${BODY}
| PR | #${PR} |"
[ -n "$NIGHT_MD" ] && BODY="${BODY}
| 夜 md | \`${NIGHT_MD}\` |"

if [ -n "$LOG_TAIL" ]; then
  BODY="${BODY}

### 直近ログ
\`\`\`
${LOG_TAIL}
\`\`\`"
fi

BODY="${BODY}

### エージェントへの復旧手順

この issue を読んだ Claude Code セッションは以下の手順で復旧せよ:

${RECOVERY}

### 完了条件
- [ ] 復旧作業完了
- [ ] この issue をクローズ"

# --- bot token 取得（失敗時は通常認証に fallback） ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN=""
if [ -f "$SCRIPT_DIR/gh-app-token.sh" ]; then
  TOKEN="$(bash "$SCRIPT_DIR/gh-app-token.sh" 2>/dev/null || true)"
fi

# --- issue 作成 ---
if [ -n "$TOKEN" ]; then
  GH_TOKEN="$TOKEN" gh issue create --title "$TITLE" --body "$BODY" --label "loop-alert" --assignee rinoshiyo 2>/dev/null
else
  gh issue create --title "$TITLE" --body "$BODY" --label "loop-alert" --assignee rinoshiyo 2>/dev/null
fi
