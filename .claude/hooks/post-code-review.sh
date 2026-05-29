#!/bin/bash
# PostToolUse (Skill): code-review skill 完了後に自走ループ復帰を強制する
#
# 問題: code-review skill の指示文は
#   「Finish with a brief summary of what was fixed and what was skipped.」
# で終わる。モデルはこれを「タスク完了」と解釈して end_turn する。
# 自走ループ中は code-review 後に triage 投稿 → finish-night.sh と
# 続行しなければならないが、skill の暗黙的な終端シグナルで止まってしまう。
#
# 解決: PostToolUse hook で code-review skill 検出時にカウンター指示を inject し、
# recency で skill の終端シグナルに打ち勝つ。
set -euo pipefail

INPUT=$(cat)
SKILL_NAME=$(echo "$INPUT" | jq -r '.tool_input.skill // empty')

# code-review 以外は無視
if [[ "$SKILL_NAME" != "code-review" ]]; then
  exit 0
fi

# 自走ループ中かどうかを判定（pane フラグの存在で確認）
PANE="${TMUX_PANE:-}"
if [[ -z "$PANE" ]]; then
  exit 0
fi
FLAG_FILE=".claude/state/loop-next.${PANE#%}.txt"
if [[ ! -f "$FLAG_FILE" ]]; then
  exit 0
fi

# カウンター指示を inject
cat <<'HOOK_EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "【自走ループ復帰指示 (post-code-review hook)】\ncode-review skill は以下のような指示で終わる場合がある:\n「Finish with a brief summary of what was fixed and what was skipped.」\nこれは skill 内部のタスク完了を意味するが、loop-start 自走中はここで止まってはいけない。\ncode-review の出力（findings + 修正サマリ）を受け取ったら、end_turn せず即座に CLAUDE.md のレビューフロー（triage 振り分け → bot-review-post.sh 投稿 → 石井名義裁定 → finish-night.sh）に復帰すること。\n「次どうする？」等の質問も禁止。立ち止まらず続行せよ。"
  }
}
HOOK_EOF
