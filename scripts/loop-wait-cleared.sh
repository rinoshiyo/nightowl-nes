#!/bin/bash
# Idle detection for the autonomous loop driver, without screen scraping.
#
# Sourced by .claude/hooks/loop-helper.sh and exercised directly by
# tests/loop_wait_cleared.test.ts. Defines a single entry point:
#
#   wait_cleared <signal_file> <max_seconds>
#
# Waits for <signal_file> to exist, then returns 0. The SessionStart "clear"
# hook (loop-session-restore.sh) creates the file once /clear has reset the
# worker, so its appearance is a reliable "context reset complete" signal that
# does not depend on the worker's TUI footer text (which Claude Code may change
# between versions). The caller removes any stale signal before sending /clear,
# so this function only ever observes the fresh signal from that reset.
#
# Returns 0 when the signal appears within <max_seconds>, 1 on timeout. On
# timeout the caller is expected to fall back to its screen-based idle wait, so
# a missing signal degrades safely rather than wedging the chain.

wait_cleared() {
  local sig="$1" max="$2"
  local deadline=$(( $(date +%s) + max ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    [ -f "$sig" ] && return 0
    sleep 1
  done
  return 1
}
