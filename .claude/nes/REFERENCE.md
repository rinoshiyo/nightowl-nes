# NES プロジェクト domain (nes REFERENCE・オンデマンド参照)

> このファイルは **CLAUDE.md から `@import` されない**（@なしポインタ参照）。夜 md の構造や検証の詳細を知りたい時に Claude が必要に応じて Read する。毎セッションのコンテキストには載せない。

## 夜 md の構造

- `nights/pending/NNN-<topic>.md` — 未処理の夜。最若番号から着手する
- `nights/done/NNN-<topic>.md` — 完了した夜 (DoD 達成・PR merged)。実装完了時に `git mv` で pending から移動
- `nights/stuck/NNN-<topic>-stuck.md` — 30 分以上詰んで隔離された夜 (詰み report 付き)
- `nights/template/NNN-template.md` — 新しい夜を起こす時のテンプレ。コピーして全項目を埋める

各夜 md は「## ゴール (/goal)」「## 前提」「## サブゴール」「## 実装ステップ」「## 対象 opcode と nestest 出現行」「## DoD」等のセクションを持つ。

## nestest による CPU 検証

- `roms/test/other/nestest.log` が CPU 命令の golden trace (各命令実行後の PC/A/X/Y/P/SP/CYC)
- `tests/cpu_nestest_trace.test.ts` の `TRACE_LINES` までを自実装の trace と突き合わせて一致を検証
- 新しい命令ブロックを実装するたび `TRACE_LINES` を次の未実装命令の直前まで延伸する
- 未実装命令の初出行特定には `tmp/scan.ts` (OPCODES を import して nestest.log を走査) を再利用できる

## 設計の正典

設計の正典は ローカルの `tmp/design.md` (リポ外、 個人保管)。 リポ内では README.md + CLAUDE.md + `nights/pending/*.md` + `.claude/` で自走に必要な情報を分散配置している。
