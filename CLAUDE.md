# CLAUDE.md - nightowl-nes /goal 自走 orchestration

## このリポは何か

夜間に Claude Code が TypeScript で NES エミュレータを自作する vibe coding 実験リポ。
最優先は「夜間自走の実験」であり、 エミュレータ完成は副産物。
最終配布物はブラウザで動く Web アプリ (URL 1 個でアクセス可能)。

設計の正典は ローカルの `tmp/design.md` (リポ外、 個人保管)。 リポ内では README.md + 本ファイル + `nights/pending/*.md` + `.claude/` で自走に必要な情報を分散配置している。

## 技術スタック

- TypeScript (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)
- ランタイム: Bun
- ブラウザビルド: Vite
- テスト: Vitest (or bun test)
- 描画: Canvas 2D API
- 音声: Web Audio API
- 配布: GitHub Pages (main 自動 deploy)

## 自走モデル

- /goal 主軸 (v2.1.139+)
- 1 夜 = 1 つの夜 md = 1 本の PR (1 夜の所要時間目安: 1-1.5 時間、 DoD 8-12 項目)
- **1 セッション = 1〜N 夜** (pending が尽きる or 石井 stop 指示 or ターン上限到達まで連鎖)
- ターン上限は条件文に `or stop after N turns` で必ず明記 (multi-night は 100-300 turns 目安)
- 達成 / ターン上限到達でセッション終了 → SessionEnd hook が retrospective 生成

## 自走連鎖プロトコル (重要)

夜間自走の連鎖を切らさないために、 Claude は以下を主体的に行う:

### 連鎖継続条件

以下を全て満たす間、 Claude は次の夜を自走する:

1. `nights/pending/` に未処理の夜 md が 1 つ以上ある
2. 石井から `stop` / `止めて` / `セッション終了` 等の明示停止指示が来ていない
3. 現セッションのターン残量が、 次の夜を完遂するのに十分 (目安: 残り 40 turns 以上)
4. 直近で `nights/stuck/` に隔離された夜が連続 2 つ以下 (連続詰みでセッション終了)

### 夜 N PR の自動レビュー (sub-agent + code-review skill)

ノールック auto-merge を避けるため、 PR 作成直後に **sub-agent を立ててレビューさせる**。 GitHub Actions / 外部 API を使わず、 メインと同じ Anthropic 枠で完結する (追加課金ゼロ)。 メイン context を圧迫しないよう、 詳細レビューは sub-agent の独立 context で行い、 メインには致命度サマリだけ返す。

**重要 (レース回避)**: `gh pr merge --auto` は **レビュー完了 + critical=0 を確認した後に初めて設定する**。 レビュー前に auto-merge を打つと、 軽量 CI (10-15 秒) が sub-agent レビュー (数十秒〜数分) を追い抜いて critical 判定前に merge される。 auto-merge を打たなければ CI が緑でも勝手に merge されないので、 レビューが追い抜かれる事故が構造的に起きない。

1. `gh pr create` で PR が立った直後、 `Agent` tool で `general-purpose` sub-agent を **`run_in_background: true`** で起動 (フォアグラウンド起動は hook で deny される)。 **この時点では auto-merge を設定しない**
2. sub-agent への prompt に以下を渡す:
   - 対象 PR 番号 / ブランチ名 / `main...night/NNN-<topic>` の diff レンジ
   - レビュー観点: ① 6502 仕様 (nesdev wiki) との一致性 ② TypeScript 型安全性 (`noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`) ③ テストカバレッジの妥当性 ④ **既存 NES 実装の参照疑い** (CLAUDE.md ソース由来制約違反)
   - sub-agent は内部で `code-review` skill を `--comment` 付き・effort=medium で起動し、 PR にインラインコメントを post する
   - **致命度サマリは sub-agent が算出する**: `code-review` skill の生出力は `file` / `line` / `summary` / `failure_scenario` のフラット JSON で severity フィールドを持たないため、 sub-agent が各 finding を `critical` / `high` / `medium` / `low` に分類してメインへ件数を返す
3. sub-agent 完了通知を受領したら、 致命度サマリを transcript に出力する
4. **連鎖中の運用方針** (誤検知で連鎖が無駄に止まるのを避ける):
   - レビューコメントの post は常に行う (朝石井がレビュー濃度を上げられる)
   - `critical == 0` の時: メインから `gh pr merge --auto --squash --delete-branch` を設定 → CI 緑で merge → 次の夜へ。 `high` 以下の指摘は post のみで連鎖続行 (朝石井判断に委ねる)
   - `critical >= 1` の時: **auto-merge を設定しない**。 `gh pr ready --undo` で draft 戻し + tmp/handoff/ に「draft 戻し report」 を吐き + 連鎖中断 + セッション終了

### 各夜の終了処理

夜 N の PR が main に merge 反映された後、 次の夜に進む前に以下を行う:

1. `🎯 GOAL CONDITION MET: night N merged` を transcript に出力
2. **handoff md を書く**: `tmp/handoff/<yyyy-mm-dd>/<hhmm>-night-NNN-summary.md` に「達成内容 / 困った点 / 朝レビュー向けメモ / 次の夜の前提条件」 を 50-100 行で書く (context window 圧縮を兼ねる)
3. `git checkout main && git pull` で次の夜のベースを最新化
4. `nights/pending/` の最若番号を読み込み、 次の夜ブランチ `night/NNN-<topic>` を切って着手

### Claude が次の夜 md を起こす責務

`nights/pending/` が空になった時、 **Claude が次の夜 md を起こす**。 朝石井が起こす想定は廃止。 起こし方:

1. 直近 done になった夜の DoD と nestest.log / 設計の現状を踏まえ、 1 夜 1-1.5 時間スケールの次タスクを設計
2. `nights/template/NNN-template.md` をコピーして `nights/pending/NNN+1-<topic>.md` を作成 (NNN は直近 done の番号 + 1)
3. **同セッションの bootstrap PR で起こす**: 夜 N のブランチに含めず、 別の `chore/seed-NNN+1` ブランチを切って独立 PR にする (朝レビューを通すため)。 もしくは次の夜ブランチの最初の commit で md を起こすパターンも可 (この場合 `chore(nights): seed NNN+1 from done NNN insights` の commit に分離)
4. seed PR / 夜開始 commit のいずれであっても、 main merge を待ってから実装着手

### 詰み時の自動隔離 (stuck protocol)

- 同じエラーで連続 30 分以上進捗ゼロを観測した時、 自動的に以下を実行:
  1. 該当 `nights/pending/NNN-*.md` を `nights/stuck/NNN-*-stuck.md` に rename
  2. stuck md 末尾に「詰み report」 (再現手順 / 試したこと / 仮説) を追記
  3. PR を draft に戻す (`gh pr ready --undo`)
  4. 該当夜の連鎖は中断し、 次の夜には進まずセッション終了
- ターン消費目安: 「同一テスト failure / 同一エラーメッセージ」 が 5-7 ターン続いたら 30 分目安として隔離検討

### /goal 文面例 (multi-night)

```
/goal nights/pending を全消化、 各夜は night/NNN-* ブランチで PR auto-merge、
or 石井 stop 指示、 or stop after 200 turns
```

または個別指定:

```
/goal 夜 2-5 を順次 merge (各夜 PR auto-merge)、 or stop after 150 turns
```

## ブランチ運用 + PR フロー (重要)

**main への直 push は禁止** (hook で deny)。 毎晩 `night/NNN-<topic>` ブランチを切って PR ベースで進める。

### 1 夜の標準フロー

````bash
# 1. main 最新を取得
git checkout main && git pull

# 2. 夜N ブランチを切る (nights/pending/NNN-<topic>.md の番号と一致)
git checkout -b night/001-cpu-skeleton

# 3. 実装 → Conventional Commits で複数 commit
#    nights/pending/NNN.md → nights/done/NNN.md の git mv も同じブランチ内で済ませる

# 4. push
git push -u origin night/001-cpu-skeleton

# 5. PR 作成 + auto-merge 有効化 (CI 緑判定後に自動 squash merge)
gh pr create \
  --base main \
  --title "夜 1: CPU スケルトン + nestest ハーネス" \
  --body "<夜md ベースの description + DoD チェック + メモ>"
gh pr merge --auto --squash --delete-branch
````

### ブランチ命名規約

- `night/NNN-<topic>` (NNN は 3 桁ゼロパディング、 topic は kebab-case)
- 例: `night/001-cpu-skeleton`、 `night/007-nestest-full-pass`、 `night/011-ppu-background`
- 夜 md と一対一対応

### Claude が触れる git / gh 操作の許可マトリクス

| 操作 | 可否 |
|---|---|
| `git checkout -b night/...` | ○ |
| `git push -u origin night/...` | ○ |
| `git push origin main` (直 push) | ✗ hook で deny |
| `git push --force` 任意ブランチ | ✗ hook で deny |
| `gh pr create` | ○ |
| `gh pr merge --auto --squash --delete-branch` | ○ |
| `gh pr merge` (--auto 無し) | ⚠ ask (CI 確認を飛ばすため) |
| `gh pr close` | ⚠ ask |
| `gh pr ready` / `gh pr edit --title\|--body` | ○ |
| `gh pr edit --base` | ⚠ ask (base 変更は意図的でないと危険) |
| `gh pr delete` | ✗ hook で deny |
| `gh repo delete` / `gh release delete` / `gh issue delete` | ✗ hook で deny |

### PR description のテンプレ

夜 N PR の description は、 該当 `nights/pending/NNN-<topic>.md` の「ゴール / DoD」 セクションをベースに完了チェックを `[x]` で埋める形。 PR メモ欄に詰みパターン・設計判断を書いておくと朝レビューしやすい。

### auto-merge の挙動

`gh pr merge --auto --squash --delete-branch` で立てた PR は、 必須 CI (nightly) が緑になった時点で自動的に squash merge → night ブランチ自動削除される。 つまり Claude は `gh pr merge` を再実行しなくてよく、 CI が緑にならない限り merge は実行されない。

詰まった場合は PR を draft に戻す (`gh pr ready --undo` or `gh pr edit --draft`) か、 ask 経由で close するか、 stuck/ 隔離フローに乗せる。

## 起動時の作法

1. `.claude/state/latest.md` が存在すれば Read (SessionStart hook が inject していなければ)
2. `nights/pending/` の最若番号の md を Read
3. 「## ゴール」セクションの /goal 条件を確認
4. 上記 PR フローに沿って `night/NNN-<topic>` ブランチを切ってから実装着手
5. ステップごとに `bun test` + `bunx tsc --noEmit` + `bunx eslint` を実行 (結果は出力リダイレクト)
6. /goal 評価のため、 pass / fail を必ず transcript に出力 (後述)
7. DoD を全部満たしたら `nights/pending/NNN.md → nights/done/NNN.md` の `git mv` も同じブランチで commit
8. `gh pr create` + `gh pr merge --auto --squash --delete-branch` で PR を立てる
9. CI 緑 → auto-merge 反映を見届けてセッション完了報告

## /goal 評価のための出力ルール

- テスト実行後は必ず `✅ PASS: <test_name>` または `❌ FAIL: <reason>` を出力
- 型チェック成功時は `✅ TYPECHECK: clean` を出力
- PR 作成成功時は `🔀 PR OPENED: <URL>` を出力
- auto-merge 設定成功時は `⏳ AUTO-MERGE ARMED: CI 緑判定待ち` を出力
- CI 緑判定 + main merge 確認時は `🎯 GOAL CONDITION MET: night NNN merged` を出力

## コンテキスト管理 (IMPORTANT)

- コマンドは `command > tmp/log.log 2>&1 && tail -20 tmp/log.log` 形式で実行
- 生 stdout を直接コンテキストに流さない (200k 上限対策、 evaluator API #62345 対策)
- 大きなファイルは `grep -n "pattern" file | head -30` で参照、 Read 全体禁止
- 同じファイルを複数回 Read しない
- ログファイルは `tmp/` 配下に出力 (.gitignore 済み)

## 重要ルール

- **main への直 push は禁止** (hook で deny。 必ず PR フロー経由)
- **git push --force / git push -f は禁止** (hook で deny)
- **tests/__snapshots__/ の書き換えは人間レビュー必須** (hook で ask)
- **30 分以上同じエラーで止まったら諦めて nights/stuck/ に移動 → PR は draft に戻す or ask 経由 close**
- **commit メッセージは Conventional Commits 形式**
- **cycle-accurate に拘らない**、 まずは動かす
- **コアロジックは src/core/ に書き、 DOM API は src/browser/ にのみ書く**

## ソース由来制約 (重要)

本リポは vibe coding のスクラッチ実装が目的。 既存 NES エミュレータ実装のソースコードは参照禁止。

### 参照 OK

- nesdev.org/wiki/* (NES 仕様の公開ドキュメント、 CC ライセンス)
- 6502 命令仕様書 (パブリックドメイン)
- iNES / NES2.0 ヘッダ仕様
- 自分のリポ内コード (submodule の christopherpow/nes-test-roms 含む)

### 参照 NG

既存 NES エミュレータの実装ソースコードはどんな言語でも、 どんなライセンスでも見ない。 コードスニペット引用も禁止。 該当リポ (deny list は `.claude/hooks/pre-tool-use.sh` 参照):

- bfirsh/jsnes
- fogleman/nes
- amhndu/SimpleNES
- SourMesen/Mesen / SourMesen/Mesen2
- AndreaOrru/LaiNES
- koute/pinky
- spieglt/nestur
- daniel5151/ANESE
- nwidger/nintengo
- scottferg/Fergulator
- Amjad50/plastic
- bugzmanov/nes_ebook (Rust コード部分)
- OneLoneCoder/olcNES
- TASEmulators/fceux

### 参考にしてよい抽象レベル

- アーキ思想 (Console.Step() の協調構造、 Mapper を interface で切り替える等)
- 仕様書から導出できる一般概念
- 上記は仕様書からも導出可能、 既存実装に答えを探さない

困った時は **nesdev wiki に戻る**。 既存実装を覗かない。
