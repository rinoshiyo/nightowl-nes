#!/bin/bash
# Driver for the autonomous /clear loop. Spawned detached by the Stop hook.
#
# Resets the worker's context with /clear at a task boundary, then feeds the
# next goal. Being a separate OS process, it survives the /clear that wipes the
# worker's conversation context. Idle is detected via a signal file the
# SessionStart "clear" hook drops, not by scraping the worker's TUI.
#
# Args: $1 = next goal string to inject  /  $2 = worker tmux pane id (e.g. "%5")
set -uo pipefail

NEXT="${1:-}"
PANE="${2:-}"
[ -z "$NEXT" ] && { echo "[$(date +%T)] no next goal given, abort"; exit 1; }
[ -z "$PANE" ] && PANE=$(tmux list-panes -F '#{pane_id}' 2>/dev/null | head -1)
[ -z "$PANE" ] && { echo "[$(date +%T)] no pane, abort"; exit 1; }

log() { echo "[$(date +%T)] $*"; }

# Robust tmux text injection is factored into scripts/loop-send.sh so tests can
# exercise it directly (sourcing this whole driver would run the loop). The entry
# point is `loop_send <pane> <body>`.
source "$(dirname "${BASH_SOURCE[0]}")/../../scripts/loop-send.sh"

# Signal-based idle detection for the post-/clear wait (wait_cleared).
source "$(dirname "${BASH_SOURCE[0]}")/../../scripts/loop-wait-cleared.sh"

NOTIFY="$(dirname "${BASH_SOURCE[0]}")/../../scripts/loop-notify.sh"
notify() {
  [ -x "$NOTIFY" ] && bash "$NOTIFY" --cwd "$CWD" --log "$CWD/tmp/loop.log" "$@" 2>/dev/null &
}
CWD="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log "chain start pane=$PANE next='${NEXT:0:50}'"

# 1) No explicit "is the worker idle?" wait is needed here. The Stop hook only
#    spawns this driver after an assistant turn has fully ended (Stop == idle),
#    and the completion flag is written only once the goal is met, so the worker
#    is already done by the time we run. Screen-scraping idle detection was
#    removed in favor of this guarantee plus the signal-based post-/clear wait.

# 2) Wait for the armed auto-merge to land on green CI BEFORE resetting, so the
#    next task builds on a main that already includes this task (otherwise the
#    fresh session's `git pull` races CI and checks out a stale base).
#    On by default; set LOOP_WAIT_MERGE=0 only for tests with no real PR in flight.
if [ "${LOOP_WAIT_MERGE:-1}" = "1" ]; then
  log "waiting for open PRs to merge..."
  FORCE_AFTER=${LOOP_FORCE_AFTER:-10}  # 10 × 30s = 5min
  mw=0
  while :; do
    pr_json=$(gh pr list -s open --json number,mergeStateStatus,isDraft 2>/dev/null || echo '[]')
    open=$(printf '%s' "$pr_json" | jq '[.[]|select((.isDraft|not))]|length' 2>/dev/null)
    # jq 失敗時は「PR あり」として待機継続 (stale main で /clear に進むのを防ぐ)
    [ -z "$open" ] && open=1
    [ "$open" = "0" ] && break
    mw=$((mw + 1))
    if [ "$mw" -ge 60 ]; then   # 60 * 30s = 30 min cap; give up so the helper always exits
      log "timeout waiting for PR merge (30m), abort"
      notify --reason merge-timeout
      exit 1
    fi
    # CLEAN な PR を直接 merge する (arm の成否に依存しない)。
    # 2026-03-25 以降の GitHub 仕様変更で CI 未通過時の --auto arm が HTTP 422 で
    # 拒否されるようになり、auto-merge が事実上無効化されている (Discussion #190610)。
    # FORCE_AFTER の猶予は auto-merge が復活した場合の発火余地として残す。
    if [ "$mw" -ge "$FORCE_AFTER" ]; then
      while IFS= read -r pr; do
        [ -z "$pr" ] && continue
        log "merging CLEAN PR #$pr ($((mw * 30))s elapsed)"
        merge_out=$(gh pr merge "$pr" --merge --delete-branch 2>&1) \
          && log "merged PR #$pr" \
          || log "merge PR #$pr failed: $merge_out"
      done < <(printf '%s' "$pr_json" | jq -r '.[]|select((.isDraft|not) and .mergeStateStatus=="CLEAN")|.number')
    fi
    sleep 30
  done
  log "PRs merged"
fi

# 3) Reset context. The SessionStart "clear" hook re-injects the handoff state.
#    The /clear [name] arg labels the just-cleared conversation in the /resume
#    picker. Use a timestamp so successive nights are distinguishable; a fixed
#    label made every past night show up identically and useless to pick from.
#    Relies on the container TZ being JST (set in compose.yaml) for a local time.
#
#    Idle detection here is signal-based, not screen-based: the SessionStart
#    "clear" hook drops a pane-scoped signal file once /clear has reset the
#    worker. Remove any stale signal first so we only observe the fresh one,
#    then wait for it. If it never arrives (hook misfired, ran without a pane,
#    or a future Claude Code dropped the clear matcher), fail-stop and notify
#    rather than guess: sending the next goal mid-reset would corrupt the chain.
CLEARED_SIG="$CWD/.claude/state/loop-cleared.${PANE#%}.txt"
rm -f "$CLEARED_SIG"
log "sending /clear"
loop_send "$PANE" "/clear loop-clear-$(date +%Y%m%d-%H%M)" || { log "send /clear failed, abort"; notify --reason send-failed --error "/clear send failed"; exit 1; }
if ! wait_cleared "$CLEARED_SIG" 300; then
  log "no clear signal in 300s, abort"
  notify --reason clear-signal-timeout --error "no /clear signal from SessionStart clear hook (hook misfired or ran without a pane?)"
  exit 1
fi
log "clear signal received"

# 4) Feed the next goal -> hands the baton to the next task.
log "sending next goal"
loop_send "$PANE" "$NEXT" || { log "send next goal failed, abort"; notify --reason send-failed --error "next goal send failed"; exit 1; }
log "chain done"
exit 0
