---
name: loop-start
description: nightowl-nes 自走ループのエントリ。GitHub Flow (Issue → Branch → PR → Merge) でリポ状態を診断し、セットアップ完了後にフラグ書込で /clear 連鎖を発火する。/goal はインフラ (loop-helper) が注入するためモデルは実行しない。tmux + bypassPermissions 前提。
when_to_use: 「次の夜」「夜を回す」「自走ループ開始」「ループ start」「loop-start」「次やる夜」「夜を seed」「pending 消化」等、nightowl-nes の夜間自走を開始・再開・seed したいとき。
shell: bash
allowed-tools: Read, Grep, Bash(git *), Bash(gh *), Bash(bash scripts/*)
---

# /clear 自走ループ起動（セットアップ専用フェーズ）

このエントリはセットアップ（診断 + issue/branch 作成）のみ行い、**実装には入らない**。
セットアップ完了後にフラグファイルを書いて turn を終了すると、既存の Stop hook →
loop-helper → /clear → /goal 注入の経路で fresh session が /goal active の状態で立ち上がる。
**全てのループ開始（手動/自動連鎖/resume）が同一経路に乗る。**

## 現在のリポ状態（自動診断）

!`bash scripts/loop-status.sh`

## 前提チェック（満たさなければ理由を述べて中断）

1. tmux pane 内であること（上の `tmux pane` が `%` 付き ID）。`NONE` なら連鎖機構が動かない
2. bypassPermissions で動いていること
3. `git checkout main && git pull` で main 最新化済み

## SUGGESTED 別のセットアップ動作

上の診断の末尾 `SUGGESTED:` 行に従って分岐。
**全分岐で共通の出口: flag 書込 → turn 終了。実装に入るな。**

### resume-pr — open PR がある（最優先）

PR の状態を確認:
- draft → レビュー隔離中（再開対象）。ブランチを checkout
- BLOCKED → 正常 in-flight。loop-helper の merge 待ちが動いているはずなので何もせず中断報告
- CLEAN open → 最優先再開。ブランチを checkout

### resume-issue — open Issue があるが PR はまだない

Issue body (DoD) を読み、ブランチが存在すれば checkout、なければ作成。

### autorun — pending の夜がある

pending md を Read → GitHub Issue 作成 → ブランチ作成 & checkout。
**ユーザーに確認を求めず進める。**

### seed — pending 空・done あり（継続 cold start）

次の夜 md を設計して pending に配置し、main に commit & push。
seed 完了後、そのまま autorun のセットアップ（Issue + ブランチ）も済ませる。

seed の手順:
1. 次の実装テーマを決定（nestest 全行完走済みの場合は機能拡張: mapper/IRQ/UI 等）
2. `nights/template/NNN-template.md` に沿って `nights/pending/NNN-<topic>.md` を設計
3. 粒度の手本に直近 done の md を参照
4. seed を commit し main に push（`PUSH_MAIN_OK=1 git push origin main`。hook bypass が必要）
5. Issue 作成 + ブランチ作成 & checkout

### bootstrap — pending も done も空（真の初回）

judgment が重いため機械化しない。停止して指示を仰ぐこと。

## 全分岐共通の出口処理（セットアップ完了後に必ず実行）

**以下を必ず実行してから turn を終えろ。実装には絶対に入るな。**

```bash
# 1. フラグ書込 — Issue の有無で goal 文言を出し分ける
PANE="${TMUX_PANE#%}"
[ -z "$PANE" ] && { echo "ERROR: TMUX_PANE が空。flag 書込不可"; exit 1; }
mkdir -p .claude/state
LOOP_TURNS="${LOOP_TURNS:-80}"

# open な night Issue があれば具体的 goal、なければ汎用 goal
# sort:created-asc で最若番号を取得 (gh のデフォルトは newest-first)
ISSUE_JSON=$(gh issue list -s open -l night --search 'sort:created-asc' --json number,title -q '.[0]' 2>/dev/null || echo "")
GOAL_SUFFIX="実装→レビュー→merge を完了せよ。達成判定: transcript に「🎯 GOAL CONDITION MET」が出現したこと。scope: この 1 Issue のみ。他の Issue・夜には着手しない。or stop after ${LOOP_TURNS} turns"
if [ -n "$ISSUE_JSON" ] && [ "$ISSUE_JSON" != "null" ]; then
  ISSUE_NUM=$(echo "$ISSUE_JSON" | jq -r .number)
  ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r .title)
  GOAL_TEXT="Issue #${ISSUE_NUM} (${ISSUE_TITLE}) のみを対象に${GOAL_SUFFIX}"
else
  GOAL_TEXT="次の夜の Issue を1つ作成し、その Issue のみを対象に${GOAL_SUFFIX}"
fi
printf '/goal %s' "$GOAL_TEXT" > ".claude/state/loop-next.${PANE}.txt"
```

フラグ書込が成功したら「セットアップ完了。Stop hook → /clear → /goal 注入で自走開始します」
と報告して **turn を終了する**。これ以降、Stop hook が flag を検出し loop-helper が
/clear + /goal 注入を自動で行う。

**禁止事項:**
- /goal を自分で実行しない（インフラが注入する）
- 実装コードを書き始めない（fresh session の仕事）
- 「次どうする？」等の質問をしない（即座に turn 終了）

## エラー時

- seed 失敗 / issue 作成失敗 / ブランチ作成失敗 → flag を書かずにエラー報告して停止
- TMUX_PANE が空 → flag 書込不可。エラー報告して停止
- BLOCKED な open PR がある → 「merge 待ち中。loop-helper が処理するので待機」と報告して停止（flag 書かない）
