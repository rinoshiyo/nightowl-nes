---
name: loop-start
description: nightowl-nes 自走ループのエントリ。リポ状態を診断し、open PR があれば再開、pending の夜があれば /clear 連鎖で自走開始、pending が空なら次の夜 md を seed してから開始、done も空の新規リポなら設計を促す。tmux + bypassPermissions 前提。
when_to_use: 「次の夜」「夜を回す」「自走ループ開始」「ループ start」「loop-start」「次やる夜」「夜を seed」「pending 消化」等、nightowl-nes の夜間自走を開始・再開・seed したいとき。
shell: bash
allowed-tools: Read, Grep, Bash(git *), Bash(gh *), Bash(bash scripts/*)
---

# /clear 自走ループ起動（ライフサイクル交通整理）

このエントリ 1 つで「次に何をすべきか」を状態診断して分岐する。毎回 done 番号や
pending の有無を手で調べる必要はない。駆動機構（Stop hook + helper + clear restore）は
`.claude/hooks/` に実装済み。詳細は CLAUDE.md「自走連鎖プロトコル」を参照。

## 現在のリポ状態（自動診断）

!`bash scripts/loop-status.sh`

## 前提チェック（全分岐共通・満たさなければ理由を述べて中断）

1. tmux pane 内であること（上の `tmux pane` が `%` 付き ID）。`NONE` なら `/clear` 連鎖は
   機能しない（pane スコープのフラグ前提）。ただし seed までは可能
2. bypassPermissions で動いていること（各夜が無人で進むため）
3. `git checkout main && git pull` で main 最新化済み

## SUGGESTED 別の動作

上の診断の末尾 `SUGGESTED:` 行に従って分岐せよ。

### resume-pr — open PR がある（最優先）

CLAUDE.md「起動時の作法 0」に従い PR コメント（PR-as-SSOT）を読んで再開判定する:
draft = レビュー隔離中（再開対象） / auto-merge arm 済みで CI 緑なら正常 in-flight（触らない）
/ auto-merge 未設定のまま放置ならレビュー途中で切れた可能性で最優先再開。

### autorun — pending の夜がある

**ユーザーに入力を求めず即座に着手する。** 最若の pending 夜のゴールセクションを読み、
その条件で実装を開始する。`/goal` コマンドの入力やユーザーへの確認は不要（ゴール条件は
夜 md に書いてある）。以降は各夜末のフラグ書込で `/clear` 連鎖が無人継続する。

### seed — pending 空・done あり（継続 cold start）

次の夜 md が無いので作る。`nestest TRACE_LINES` の次行が次の実装起点:

1. 次起点を特定: nestest.log の `(TRACE_LINES + 1)` 行目の命令を確認（= 次の未実装命令）
2. nesdev wiki を正典に、その命令群を 1 夜（DoD 8-12 項目）にまとめ、
   `nights/template/NNN-template.md` に沿って `nights/pending/NNN-<topic>.md` を設計
3. 粒度の手本に直近 done の md（`nights/done/<最新>.md`）を参照
4. seed を commit（`chore(nights): seed NNN`）して pending に置く
5. seed 完了後、ユーザーに入力を求めず即座に上記「autorun」分岐の手順で着手する。
   seed で pending に夜 md が入ったので SUGGESTED は autorun に変わる。
   夜 md のゴールセクションを読み、その条件で実装を開始する。
   `/goal` コマンドの入力やユーザーへのコピペ依頼は不要（ゴール条件は夜 md に書いてある）

### bootstrap — pending も done も空（真の初回）

新規リポの立ち上げ。最初の夜 md 設計はプロジェクト全体のロードマップ設計そのもので
judgment が重いため機械化しない。リポ基盤（package.json / tsconfig / submodule 等）と
最初の夜 md を人間と一緒に設計する必要がある旨を述べて停止し、指示を仰ぐこと。

## autorun の 1 夜 = 1 サイクル（詳細）

1. fresh session が CLAUDE.md + 再注入された `.claude/state/latest.md` を読む
2. `nights/pending/` 最若の夜を `night/NNN-<topic>` ブランチで実装
3. PR 作成 → メインが `code-review --fix` を直呼びでレビュー → triage（STOP/FIX/PASS）→ 全 PASS なら auto-merge arm
4. **triage 全 PASS 後、ユーザーに確認を求めず即座に終了処理を実行する**（CLAUDE.md 参照）:
   - handoff を PR に書く
   - `bash scripts/finish-night.sh "<次ゴール文 or STOP>"` を呼ぶ
     （auto-merge arm / latest.md 更新 / フラグ書込 / GOAL 出力を一括実行）
   - 「次どうする？」「他にある？」等の質問は自走を止める違反行為
5. turn を終える → Stop hook が helper を spawn → `/clear` → latest.md 再注入 → 次ゴール投入

暴走ブレーキは `NIGHTOWL_LOOP_MAX`（既定 20）。`nights/pending/` が尽きたら、再びこのスキルの
`seed` 分岐に従って次の夜を起こすか、`STOP` を書いて連鎖を終える。
