#!/bin/bash
# Stop hook for the autonomous /clear loop.
#
# Fires after every assistant turn. When the worker has signaled "task done" by
# writing a pane-scoped flag file, this launches the driver (loop-helper.sh)
# asynchronously to reset context (/clear) and feed the next goal. Otherwise it
# is a no-op (the common case: a turn finishing mid-task).
#
# Flag file: .claude/state/loop-next.<pane>.txt  (pane = this tmux pane, "%" stripped)
#   - contents = next goal string -> chain to the next task with that goal
#   - contents = "STOP"           -> no further tasks; end the chain
#
# Pane-scoping prevents a Stop hook in another session/pane (e.g. an operator
# window sharing this repo) from grabbing the flag and resetting the wrong
# session.
set -uo pipefail

input=$(cat)
CWD=$(echo "$input" | jq -r '.cwd // empty')
[ -z "$CWD" ] && exit 0

PANE="${TMUX_PANE:-}"
[ -z "$PANE" ] && exit 0          # not inside tmux -> the loop driver is not applicable
PANE_ID="${PANE#%}"               # strip leading "%" so it is safe inside a filename

STATE_DIR="$CWD/.claude/state"
FLAG="$STATE_DIR/loop-next.${PANE_ID}.txt"
# Counter is keyed by PANE, not session_id. /clear starts a NEW session_id
# (anthropics/claude-code issue #20797), so a session-scoped counter would reset
# every iteration and never trip the brake. The tmux pane is stable across /clear.
COUNT="$STATE_DIR/loop-${PANE_ID}.count"
MAX="${NIGHTOWL_LOOP_MAX:-20}"    # max chained tasks (runaway brake). 0 = unlimited

# No flag -> mid-task turn -> do nothing.
[ -f "$FLAG" ] || exit 0

NEXT=$(cat "$FLAG")
rm -f "$FLAG"   # delete immediately so the same flag cannot trigger twice

# "STOP" sentinel -> end the chain (and clear the counter).
if [ "$NEXT" = "STOP" ]; then
  rm -f "$COUNT"
  exit 0
fi

# Per-pane chain counter; stop safely once MAX is exceeded.
cnt=$(cat "$COUNT" 2>/dev/null || echo 0)
cnt=$((cnt + 1))
echo "$cnt" > "$COUNT"
if [ "$MAX" -gt 0 ] && [ "$cnt" -gt "$MAX" ]; then
  rm -f "$COUNT"
  NOTIFY="$CWD/scripts/loop-notify.sh"
  if [ -x "$NOTIFY" ]; then
    bash "$NOTIFY" --reason runaway-brake --cwd "$CWD" --log "$CWD/tmp/loop.log" 2>/dev/null &
  fi
  exit 0
fi

# Launch the driver fully detached. Running send-keys synchronously inside the
# Stop hook would block this turn from finishing and deadlock, so nohup + & it.
# The driver is a separate OS process and survives the /clear it triggers.
mkdir -p "$CWD/tmp"
nohup bash "$CWD/.claude/hooks/loop-helper.sh" "$NEXT" "$PANE" >>"$CWD/tmp/loop.log" 2>&1 &
disown 2>/dev/null || true

exit 0
