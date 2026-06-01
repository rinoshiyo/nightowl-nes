---
name: loop-start
description: nightowl-nes 自走ループのエントリ。GitHub Flow (Issue → Branch → PR → Merge) でリポ状態を診断し、セットアップ完了後にフラグ書込で /clear 連鎖を発火する。/goal はインフラ (loop-helper) が注入するためモデルは実行しない。tmux + bypassPermissions 前提。
when_to_use: 「次の夜」「夜を回す」「自走ループ開始」「ループ start」「loop-start」「次やる夜」「夜を seed」「seed して」等、nightowl-nes の夜間自走を開始・再開・seed したいとき。
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

## SUGGESTED 別のセットアップ動作 / seed サブコマンド

このスキルには2つの起動モード:
1. **通常モード** (引数なし): 上の診断の `SUGGESTED:` 行に従って分岐
2. **seed モード** (`/loop-start seed`): 対話的に Issue を複数作成。goal は設定しない

### seed モード (`/loop-start seed` で起動)

ユーザーと対話的に次の夜 Issue を設計・作成する:
1. 直近の closed night Issue と実装状況 (nestest 進捗等) を確認
2. 次の実装テーマを提案し、ユーザーと相談
3. `.github/ISSUE_TEMPLATE/night.yml` のフォーマットに沿って Issue を作成 (`gh issue create --label night`)
4. 複数 Issue を作成可能 (1つずつ確認しながら)
5. **goal は設定しない** (seed 完了後、別途 `/loop-start` で自走開始)
6. seed 完了を報告して turn 終了

### 通常モード (SUGGESTED 別分岐)

**全分岐で共通の出口: flag 書込 → turn 終了。実装に入るな。**

### resume-pr — open PR がある（最優先）

PR の状態を確認:
- draft → レビュー隔離中（再開対象）。ブランチを checkout
- BLOCKED → 正常 in-flight。loop-helper の merge 待ちが動いているはずなので何もせず中断報告
- CLEAN open → 最優先再開。ブランチを checkout

### ready — open Issue があるが PR はまだない

Issue body (DoD) を読み、ブランチが存在すれば checkout、なければ作成。
**ユーザーに確認を求めず進める。**

### seed — open Issue なし (継続 cold start)

open な night Issue が 0 件。seed モードに移行して Issue 作成を促す。
**自動で Issue を作成する処理は行わない** (seed は `/loop-start seed` で対話的に実行)。
open Issue がないため自走を開始できない旨を報告して停止。flag は書かない。

### bootstrap — closed Issue も空（真の初回）

judgment が重いため機械化しない。停止して指示を仰ぐこと。

## 全分岐共通の出口処理（セットアップ完了後に必ず実行）

**以下を必ず実行してから turn を終えろ。実装には絶対に入るな。**
**seed モード・seed SUGGESTED では出口処理を実行しない (goal を設定しない)。**

```bash
# 1. フラグ書込 — open Issue から goal を生成。Issue なし → STOP
PANE="${TMUX_PANE#%}"
[ -z "$PANE" ] && { echo "ERROR: TMUX_PANE が空。flag 書込不可"; exit 1; }
mkdir -p .claude/state
LOOP_TURNS="${LOOP_TURNS:-80}"

# これから着手する Issue (最若番号) を goal に設定
# sort:created-asc + -label:stuck で最若番号を取得
TARGET_JSON=$(gh issue list -s open -l night --search 'sort:created-asc -label:stuck' \
  --json number,title -q '.[0]' 2>/dev/null || echo "")
GOAL_SUFFIX="を対象に実装→レビュー→merge を完了せよ。達成判定: transcript に「🎯 GOAL CONDITION MET」が出現したこと。scope: この 1 Issue のみ。他の Issue・夜には着手しない。or stop after ${LOOP_TURNS} turns"

if [ -n "$TARGET_JSON" ] && [ "$TARGET_JSON" != "null" ]; then
  ISSUE_NUM=$(echo "$TARGET_JSON" | jq -r .number)
  ISSUE_TITLE=$(echo "$TARGET_JSON" | jq -r .title)
  GOAL_TEXT="Issue #${ISSUE_NUM} (${ISSUE_TITLE}) のみ${GOAL_SUFFIX}"
  printf '/goal %s' "$GOAL_TEXT" > ".claude/state/loop-next.${PANE}.txt"
else
  # open Issue なし → 自走不可
  printf '%s' "STOP" > ".claude/state/loop-next.${PANE}.txt"
  echo "WARNING: open な night Issue がありません。/loop-start seed で Issue を作成してください。"
fi
```

フラグ書込が成功したら「セットアップ完了。Stop hook → /clear → /goal 注入で自走開始します」
と報告して **turn を終了する**。これ以降、Stop hook が flag を検出し loop-helper が
/clear + /goal 注入を自動で行う。

**禁止事項:**
- /goal を自分で実行しない（インフラが注入する）
- 実装コードを書き始めない（fresh session の仕事）
- 「次どうする？」等の質問をしない（即座に turn 終了）

## エラー時

- Issue 作成失敗 / ブランチ作成失敗 → flag を書かずにエラー報告して停止
- TMUX_PANE が空 → flag 書込不可。エラー報告して停止
- BLOCKED な open PR がある → 「merge 待ち中。loop-helper が処理するので待機」と報告して停止（flag 書かない）
