#!/bin/bash
# PreToolUse: devcontainer 前提の安全弁
#   リモート影響系 deny / credentials deny / 自己改竄 ask / 既存 NES 実装ソース閲覧 deny
#   PR フロー (main 直 push 禁止、 gh pr 系の ask/deny)
set -euo pipefail
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
PATH_TGT=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
URL=$(echo "$INPUT" | jq -r '.tool_input.url // empty')

# ==== リモート影響系（devcontainer でも危険、 不可逆）====
for pat in \
  'git\s+push\s+(--force|-f)\b' \
  'git\s+push\s+\S+\s+:\S+' \
  'git\s+push\s+--mirror' \
  'gh\s+repo\s+delete' \
  'gh\s+release\s+delete' \
  'gh\s+issue\s+delete' \
  'gh\s+pr\s+delete' \
  'npm\s+publish' \
  'bun\s+publish' \
  'cargo\s+publish' \
; do
  if echo "$CMD" | grep -qE "$pat"; then
    jq -n --arg pat "$pat" '{decision:"deny", reason:("remote-impact op blocked: " + $pat)}' >&2
    exit 2
  fi
done

# ==== main 直 push 禁止 (PR フロー強制) ====
# git push origin main / git push -u origin main / git push origin HEAD:main 等
# ただし PUSH_MAIN_OK=1 環境変数があれば bypass (メンテ作業用エスケープハッチ)
if echo "$CMD" | grep -qE '^[[:space:]]*git[[:space:]]+push([[:space:]]+-[uU])?([[:space:]]+\S+)?[[:space:]]+(origin[[:space:]]+)?(HEAD:)?main\b' \
   && [ -z "${PUSH_MAIN_OK:-}" ] \
   && ! echo "$CMD" | grep -qE '\bPUSH_MAIN_OK=1\b'; then
  jq -n '{decision:"deny", reason:"main 直 push は禁止 (PR フロー経由のこと: night/NNN-* ブランチ + gh pr create + gh pr merge --auto --merge)。 緊急時のみ PUSH_MAIN_OK=1 git push ... で bypass"}' >&2
  exit 2
fi

# ==== レビュー FIX 未消化時の merge block ====
# bot-review-post.sh が FIX/STOP ありの round で .claude/state/review-status.json に
# has_fix=true を書く。R2 で収束するまで merge を deny する。
# stale state (別 PR) は gate 不適用。corrupt state は fail-closed (deny)。
if echo "$CMD" | grep -qE 'gh[[:space:]]+pr[[:space:]]+merge\b'; then
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
  REVIEW_STATE="${REPO_ROOT:-.}/.claude/state/review-status.json"
  if [ -f "$REVIEW_STATE" ]; then
    review_has_fix=$(jq -r 'if .has_fix then "true" else "false" end' "$REVIEW_STATE" 2>/dev/null)
    review_pr=$(jq -r '.pr | tostring' "$REVIEW_STATE" 2>/dev/null)
    merge_pr=$(echo "$CMD" | grep -oE 'merge[[:space:]]+([0-9]+)' | grep -oE '[0-9]+' || true)
    # PR 番号なしの merge コマンド (gh pr merge --merge 等) は stale 判定不能 → gate 適用
    if [ -n "$merge_pr" ] && [ -n "$review_pr" ] && [ "$merge_pr" != "$review_pr" ]; then
      : # 別 PR の stale state → gate 不適用
    elif [ "$review_has_fix" = "true" ]; then
      jq -n --arg pr "${review_pr:-?}" \
        '{decision:"deny", reason:("PR #" + $pr + " のレビューに FIX/STOP 未消化あり。R2 (code-review --fix) を実行してから merge してください")}' >&2
      exit 2
    elif [ "$review_has_fix" != "false" ]; then
      jq -n '{decision:"deny", reason:"review-status.json が破損。bot-review-post.sh を再実行してください"}' >&2
      exit 2
    fi
  fi
fi

# ==== auto-merge 無しの gh pr merge を ask (CI 確認を飛ばすため) ====
if echo "$CMD" | grep -qE 'gh[[:space:]]+pr[[:space:]]+merge\b' && ! echo "$CMD" | grep -qE '\-\-auto\b'; then
  jq -n '{decision:"ask", reason:"gh pr merge without --auto bypasses CI gate"}' >&2
  exit 0
fi

# ==== gh pr close / gh issue close を ask ====
if echo "$CMD" | grep -qE 'gh[[:space:]]+pr[[:space:]]+close\b'; then
  jq -n '{decision:"ask", reason:"PR close は意図的か確認"}' >&2
  exit 0
fi
if echo "$CMD" | grep -qE 'gh[[:space:]]+issue[[:space:]]+close\b'; then
  jq -n '{decision:"ask", reason:"Issue close は scope SSOT の削除。意図的か確認"}' >&2
  exit 0
fi

# ==== gh pr edit --base を ask ====
if echo "$CMD" | grep -qE 'gh[[:space:]]+pr[[:space:]]+edit\b' && echo "$CMD" | grep -qE '\-\-base\b'; then
  jq -n '{decision:"ask", reason:"PR base 変更は意図的か確認"}' >&2
  exit 0
fi

# ==== credentials 流出防止 ====
case "$PATH_TGT" in
  *.env|*.env.*|*/credentials*|*/secrets*|*/.aws/*|*/.ssh/id_*)
    jq -n '{decision:"deny", reason:"credentials file write blocked"}' >&2
    exit 2
    ;;
esac

# ==== 自己改竄を ask（deny ではない）====
case "$PATH_TGT" in
  */.claude/settings.json|*/.claude/hooks/*|*/.claude/state/*)
    jq -n '{decision:"ask", reason:"self-modification requires human review"}' >&2
    exit 0
    ;;
esac

# ==== テスト snapshot 改竄を ask ====
case "$PATH_TGT" in
  */tests/__snapshots__/*|*/tests/golden/*)
    jq -n '{decision:"ask", reason:"snapshot edit requires human review"}' >&2
    exit 0
    ;;
esac

# ==== 既存 NES 実装リポへの WebFetch を deny (ソース由来制約) ====
for blocked_repo in \
  "bfirsh/jsnes" \
  "fogleman/nes" \
  "amhndu/SimpleNES" \
  "SourMesen/Mesen" \
  "SourMesen/Mesen2" \
  "AndreaOrru/LaiNES" \
  "koute/pinky" \
  "spieglt/nestur" \
  "daniel5151/ANESE" \
  "nwidger/nintengo" \
  "scottferg/Fergulator" \
  "Amjad50/plastic" \
  "bugzmanov/nes_ebook" \
  "OneLoneCoder/olcNES" \
  "TASEmulators/fceux" \
; do
  if echo "$URL" | grep -qE "github.com/${blocked_repo}|raw.githubusercontent.com/${blocked_repo}|gitlab.com/${blocked_repo}"; then
    jq -n --arg repo "$blocked_repo" '{decision:"deny", reason:("reference impl source blocked: " + $repo)}' >&2
    exit 2
  fi
done

exit 0
