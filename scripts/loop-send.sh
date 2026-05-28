#!/bin/bash
# Robust tmux text injection for the autonomous loop driver.
#
# Sourced by .claude/hooks/loop-helper.sh and exercised directly by
# tests/loop_send.test.ts. Defines a single entry point:
#
#   loop_send <pane_id> <body>
#
# Sends arbitrary text (long / multi-line / emoji / shell metacharacters) to the
# foreground program of the given tmux pane via load-buffer + paste-buffer, then
# submits with a SEPARATE Enter key event. A trailing newline inside a pasted
# buffer is an in-field line break, not a submit, so the submit must be its own
# key event. Buffer/tmpfile names are pane-scoped + unique to avoid cross-pane
# collisions and carry no project-specific words (kept generic for future plugin
# extraction into claude-loop).

loop_send() {
  local pane="$1" body="$2"
  local pane_key="${pane#%}"
  local tmpf
  tmpf=$(mktemp "${TMPDIR:-/tmp}/loop-send-${pane_key}.XXXXXX")
  # No trailing newline: a newline in the buffer renders as an in-field break, not
  # a submit. printf (not echo) so nothing is appended and "-" bodies stay literal.
  printf '%s' "$body" > "$tmpf"
  local buf="loop-send-${pane_key}"
  tmux load-buffer -b "$buf" "$tmpf"
  rm -f "$tmpf"
  # Cancel copy-mode first, or paste-buffer misbehaves on a scrolled-back pane.
  # Both commands error when the pane is not in a mode; that is expected -> ignore.
  tmux copy-mode -t "$pane" -q 2>/dev/null || true
  tmux send-keys -t "$pane" -X cancel 2>/dev/null || true
  # Paste, then delete the buffer (-d) so it cannot be re-pasted or accumulate.
  tmux paste-buffer -t "$pane" -b "$buf" -d
  # Guard the paste/Enter timing race. itodenwa ships this sleep despite a stale
  # unit test claiming it is unneeded; the shipping code proved the race real.
  sleep 0.2
  # Submit as a SEPARATE send-keys; never chain it with the paste using and-and.
  tmux send-keys -t "$pane" Enter
}
