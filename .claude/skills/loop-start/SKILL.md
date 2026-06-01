---
name: loop-start
description: nightowl-nes 自走ループのエントリ。GitHub Flow (Issue → Branch → PR → Merge) でリポ状態を診断し、open Issue/PR があれば再開、pending の夜があれば Issue 作成→自走開始、pending が空なら seed してから開始。tmux + bypassPermissions 前提。
when_to_use: 「次の夜」「夜を回す」「自走ループ開始」「ループ start」「loop-start」「次やる夜」「夜を seed」「pending 消化」等、nightowl-nes の夜間自走を開始・再開・seed したいとき。
shell: bash
allowed-tools: Read, Grep, Bash(git *), Bash(gh *), Bash(bash scripts/*)
---

# /clear 自走ループ起動（ライフサイクル交通整理）

このエントリ 1 つで「次に何をすべきか」を状態診断して分岐する。
**GitHub Flow** (Issue → Branch → PR → Merge) で運用。Issue = scope SSOT / PR = delivery SSOT。
駆動機構（Stop hook + helper + clear restore）は `.claude/hooks/` に実装済み。
詳細は CLAUDE.md「自走連鎖プロトコル」を参照。

**出口条件: /goal が active であること。** どの分岐でも必ず /goal 設定で終わる。
/goal なしで実装に入ることは許されない。

## 現在のリポ状態（自動診断）

!`bash scripts/loop-status.sh`

## 前提チェック（全分岐共通・満たさなければ理由を述べて中断）

1. tmux pane 内であること（上の `tmux pane` が `%` 付き ID）。`NONE` なら `/clear` 連鎖は
   機能しない（pane スコープのフラグ前提）。ただし seed までは可能
2. bypassPermissions で動いていること（各夜が無人で進むため）
3. `git checkout main && git pull` で main 最新化済み

## SUGGESTED 別の動作

上の診断の末尾 `SUGGESTED:` 行に従って分岐せよ。
全分岐で起動時の作法 (CORE.md) に従う。

### resume-pr — open PR がある（最優先）

起動時の作法 step 0 に従い PR description / コメントを読んで再開判定する:
draft = レビュー隔離中（再開対象） / BLOCKED = 正常 in-flight（触らない）
/ CLEAN open = 最優先再開。/goal を設定してから再開。

### resume-issue — open Issue があるが PR はまだない

起動時の作法 step 0 で Issue body (DoD) を読んで scope を復元する。
step 4 で /goal を設定し、step 5 からブランチを切って実装を再開する。

### autorun — pending の夜がある

**ユーザーに入力を求めず即座に着手する。** 起動時の作法に従い:
pending md を Read → **Issue 作成** → /goal 設定 → ブランチ切り → 実装開始。
以降は各夜末のフラグ書込で `/clear` 連鎖が無人継続する。

### seed — pending 空・done あり（継続 cold start）

次の夜 md が無いので作る。`nestest TRACE_LINES` の次行が次の実装起点:

1. 次起点を特定: nestest.log の `(TRACE_LINES + 1)` 行目の命令を確認（= 次の未実装命令）
2. nesdev wiki を正典に、その命令群を 1 夜にまとめ、
   `nights/template/NNN-template.md` に沿って `nights/pending/NNN-<topic>.md` を設計
3. 粒度の手本に直近 done の md（`nights/done/<最新>.md`）を参照
4. seed を commit（`chore(nights): seed NNN`）して pending に置く
5. seed 完了後、即座に上記「autorun」分岐の手順で着手する。

### bootstrap — pending も done も空（真の初回）

新規リポの立ち上げ。最初の夜 md 設計はプロジェクト全体のロードマップ設計そのもので
judgment が重いため機械化しない。リポ基盤（package.json / tsconfig / submodule 等）と
最初の夜 md を人間と一緒に設計する必要がある旨を述べて停止し、指示を仰ぐこと。

## autorun の 1 夜 = 1 サイクル（詳細）

1. fresh session が CLAUDE.md + Issue/PR 情報 (SessionStart hook が GitHub から inject) を読む
2. 起動時の作法 (CORE.md) に従い、open PR があれば resume / open Issue があれば resume-issue / なければ pending を読み Issue 作成 → /goal 設定 → 実装開始
3. メインが `code-review --fix` を直呼びでレビュー → triage（STOP/FIX/PASS）→ 全 PASS なら auto-merge arm
4. **triage 全 PASS 後、ユーザーに確認を求めず即座に終了処理を実行する**（CLAUDE.md 参照）:
   - handoff を PR に書く
   - `bash scripts/finish-night.sh [--night NNN]` を呼ぶ（auto-merge arm / フラグ書込 / GOAL 出力）
   - 「次どうする？」「他にある？」等の質問は自走を止める違反行為
5. turn を終える → Stop hook が helper を spawn → `/clear` → Issue/PR 情報再注入 → 次ゴール投入

暴走ブレーキは `NIGHTOWL_LOOP_MAX`（既定 20）。`nights/pending/` が尽きても `finish-night.sh` は
`/goal` (固定文言) を書く。fresh session の起動時の作法 (CORE.md) で pending 空を検知し seed してから実装する。
