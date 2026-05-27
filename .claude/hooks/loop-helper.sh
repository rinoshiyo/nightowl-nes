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

# Activity markers shown while Claude works. The spinner's gerund word is
# unpredictable, so besides the interrupt/compaction hints we match the live
# token meter "<n> tokens" (ASCII-safe). Marker matching is the fast path; the
# real safety net is screen_static below.
BUSY_RE='esc to interrupt|ctrl\+o|Compacting|Summarizing|[0-9]+ tokens'
is_busy() {
  tmux capture-pane -t "$PANE" -p 2>/dev/null | grep -qiE "$BUSY_RE"
}

# Capture the pane twice across a short gap; identical content => static screen.
# This catches "busy" even when no known marker matches, because an active
# spinner/stream keeps the screen changing (elapsed seconds tick every second).
screen_static() {
  local a b
  a=$(tmux capture-pane -t "$PANE" -p 2>/dev/null)
  sleep 2
  b=$(tmux capture-pane -t "$PANE" -p 2>/dev/null)
  [ "$a" = "$b" ]
}

# Idle is confirmed only when BOTH hold for 3 consecutive checks: no activity
# marker AND the screen is static. Deliberately biased toward false-busy (wait
# longer) over false-idle (which would /clear mid-task and destroy work).
# $1 = max seconds to wait.
wait_idle() {
  local max="$1" w=0 stable=0
  sleep 5   # let the just-sent action spin up first
  while [ "$w" -lt "$max" ]; do
    if ! is_busy && screen_static; then
      stable=$((stable + 1))
      [ "$stable" -ge 3 ] && return 0   # ~15s of confirmed idle
    else
      stable=0
    fi
    sleep 3; w=$((w + 5))   # ~5s/iter (screen_static sleeps 2 + this sleep 3)
  done
  return 1
}

# Send a message: type the body, pause, then Enter separately. The separate
# Enter avoids the concatenation bug where two rapid send-keys merge into one line.
send() {
  # `--` terminates flag parsing so a goal starting with "-" is typed literally
  # instead of being misread by tmux as an option.
  tmux send-keys -t "$PANE" -l -- "$1"
  sleep 1
  tmux send-keys -t "$PANE" Enter
}

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
log "sending /clear"
send "/clear loop-night-done"
wait_idle 300 || { log "timeout waiting for idle after /clear, abort"; exit 1; }

# 4) Feed the next goal -> hands the baton to the next task.
log "sending next goal"
send "$NEXT"
log "chain done"
exit 0
