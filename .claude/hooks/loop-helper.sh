#!/bin/bash
# Driver for the autonomous /clear loop. Spawned detached by the Stop hook.
#
# Waits for the worker to go idle, resets its context with /clear, then feeds
# the next goal. Being a separate OS process, it survives the /clear that wipes
# the worker's conversation context.
#
# Args: $1 = next goal string to inject  /  $2 = worker tmux pane id (e.g. "%5")
set -uo pipefail

NEXT="${1:-}"
PANE="${2:-}"
[ -z "$NEXT" ] && { echo "[$(date +%T)] no next goal given, abort"; exit 1; }
[ -z "$PANE" ] && PANE=$(tmux list-panes -F '#{pane_id}' 2>/dev/null | head -1)
[ -z "$PANE" ] && { echo "[$(date +%T)] no pane, abort"; exit 1; }

log() { echo "[$(date +%T)] $*"; }

# Footer markers shown while Claude is actively working. The footer does not
# scroll, so these are reliable. ASCII-safe; intentionally NOT matching loose
# "tokens" text, which can appear on an idle footer and wedge detection (#1).
BUSY_RE='esc to interrupt|ctrl\+o|Compacting|Summarizing'

# Static when two captures across a short gap are identical AND non-empty. An
# empty/failed capture (dead or wrong pane) must NOT count as "static idle",
# otherwise we could /clear a pane that is gone or actually busy (#2).
screen_static() {
  local a b
  a=$(tmux capture-pane -t "$PANE" -p 2>/dev/null)
  [ -n "$a" ] || return 1
  sleep 2
  b=$(tmux capture-pane -t "$PANE" -p 2>/dev/null)
  [ -n "$b" ] && [ "$a" = "$b" ]
}

# Confirm idle when activity markers have been continuously absent AND either
# the screen is static OR markers stayed absent for a sustained window (#4
# fallback, so an idle screen with a ticking element can't wedge us forever).
# An empty capture is treated as "cannot confirm" (resets the streak) so a dead
# or wrong pane never triggers /clear (#2). Wall-clock deadline keeps the timeout
# honest regardless of per-branch sleeps (#3). Biased toward false-busy (safe
# wait) over false-idle (which would /clear mid-task). $1 = max seconds.
wait_idle() {
  local max="$1" snap
  local deadline=$(( $(date +%s) + max ))
  local quiet_since=0   # epoch markers first went absent this streak (0 = busy/unknown)
  sleep 5   # let the just-sent action spin up first
  while [ "$(date +%s)" -lt "$deadline" ]; do
    snap=$(tmux capture-pane -t "$PANE" -p 2>/dev/null)
    if [ -z "$snap" ] || printf '%s' "$snap" | grep -qiE "$BUSY_RE"; then
      quiet_since=0   # busy, or capture failed -> cannot declare idle
    else
      [ "$quiet_since" -eq 0 ] && quiet_since=$(date +%s)
      if screen_static || [ $(( $(date +%s) - quiet_since )) -ge 20 ]; then
        return 0
      fi
    fi
    sleep 3
  done
  return 1
}

# Robust tmux text injection is factored into scripts/loop-send.sh so tests can
# exercise it directly (sourcing this whole driver would run the loop). The entry
# point is `loop_send <pane> <body>`.
source "$(dirname "${BASH_SOURCE[0]}")/../../scripts/loop-send.sh"

log "chain start pane=$PANE next='${NEXT:0:50}'"

# 1) Wait for the worker to finish the current task and go idle.
wait_idle 600 || { log "timeout waiting for worker idle, abort"; exit 1; }

# 2) Wait for the armed auto-merge to land on green CI BEFORE resetting, so the
#    next task builds on a main that already includes this task (otherwise the
#    fresh session's `git pull` races CI and checks out a stale base).
#    On by default; set LOOP_WAIT_MERGE=0 only for tests with no real PR in flight.
if [ "${LOOP_WAIT_MERGE:-1}" = "1" ]; then
  log "waiting for open PRs to merge..."
  mw=0
  while :; do
    open=$(gh pr list -s open --json isDraft -q '[.[]|select(.isDraft|not)]|length' 2>/dev/null || echo 0)
    [ "${open:-0}" = "0" ] && break
    mw=$((mw + 1))
    if [ "$mw" -ge 60 ]; then   # 60 * 30s = 30 min cap; give up so the helper always exits
      log "timeout waiting for PR merge (30m), abort"
      exit 1
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
log "sending /clear"
loop_send "$PANE" "/clear loop-clear-$(date +%Y%m%d-%H%M)" || { log "send /clear failed, abort"; exit 1; }
wait_idle 300 || { log "timeout waiting for idle after /clear, abort"; exit 1; }

# 4) Feed the next goal -> hands the baton to the next task.
log "sending next goal"
loop_send "$PANE" "$NEXT" || { log "send next goal failed, abort"; exit 1; }
log "chain done"
exit 0
