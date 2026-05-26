# CLAUDE.md - nightowl-nes /goal 自走 orchestration

## このリポは何か

夜間に Claude Code が TypeScript で NES エミュレータを自作する vibe coding 実験リポ。
最優先は「夜間自走の実験」であり、 エミュレータ完成は副産物。
最終配布物はブラウザで動く Web アプリ (URL 1 個でアクセス可能)。

設計の正典は `docs/design.md` (HTML 版 `docs/design.html`)。 全 10 部 + Appendix。

## 技術スタック (ソース由来制約: 変更時は設計書 §2 と整合)

- TypeScript (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)
- ランタイム: Bun
- ブラウザビルド: Vite
- テスト: Vitest (or bun test)
- 描画: Canvas 2D API
- 音声: Web Audio API
- 配布: GitHub Pages (main 自動 deploy)

## 自走モデル

- /goal 主軸 (v2.1.139+)
- 1 セッション = 1 つの夜 md = 1 つの /goal
- ターン上限は条件文に `or stop after N turns` で必ず明記
- 達成 / ターン上限到達でセッション終了 → SessionEnd hook が retrospective 生成

## 起動時の作法

1. `.claude/state/latest.md` が存在すれば Read (SessionStart hook が inject していなければ)
2. `nights/pending/` の最若番号の md を Read
3. 「## ゴール」セクションの /goal 条件を確認
4. 「## 実装ステップ」に沿って実装
5. ステップごとに `bun test` + `bunx tsc --noEmit` + `bunx eslint` を実行 (結果は出力リダイレクト)
6. /goal 評価のため、 pass / fail を必ず transcript に出力 (後述)
7. DoD を全部満たしたら git commit & 夜 md を done/ に移動

## /goal 評価のための出力ルール

- テスト実行後は必ず `✅ PASS: <test_name>` または `❌ FAIL: <reason>` を出力
- 型チェック成功時は `✅ TYPECHECK: clean` を出力
- 目標達成時は `🎯 GOAL CONDITION MET: <条件名>` を出力
- エラーが解消されたら `RESOLVED: <エラー名>` を出力

## コンテキスト管理 (IMPORTANT)

- コマンドは `command > tmp/log.log 2>&1 && tail -20 tmp/log.log` 形式で実行
- 生 stdout を直接コンテキストに流さない (200k 上限対策、 evaluator API #62345 対策)
- 大きなファイルは `grep -n "pattern" file | head -30` で参照、 Read 全体禁止
- 同じファイルを複数回 Read しない
- ログファイルは `tmp/` 配下に出力 (.gitignore 済み)

## 重要ルール

- **git push --force / git push -f は禁止** (hook で deny)
- **tests/__snapshots__/ の書き換えは人間レビュー必須** (hook で ask)
- **30 分以上同じエラーで止まったら諦めて nights/stuck/ に移動**
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
