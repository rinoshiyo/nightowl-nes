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
- 1 セッション = 1 つの夜 md = 1 本の PR = 1 つの /goal
- ターン上限は条件文に `or stop after N turns` で必ず明記
- 達成 / ターン上限到達でセッション終了 → SessionEnd hook が retrospective 生成

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
