# NES プロジェクト domain (nes REFERENCE・オンデマンド参照)

> このファイルは **CLAUDE.md から `@import` されない**（@なしポインタ参照）。夜 md の構造や検証の詳細を知りたい時に Claude が必要に応じて Read する。毎セッションのコンテキストには載せない。

## 夜 md の構造 (v1 legacy — v2 で Issue-only に移行済み)

v2 で `nights/pending/` と `nights/stuck/` は廃止。**Issue body が DoD の唯一の SSOT**。

- `nights/done/NNN-<topic>.md` — 過去の完了夜の履歴アーカイブ (削除しない)
- `nights/pending/038-mapper-cnrom.md` — 最後の pending md (Issue #99 が SSOT。参考情報として残置)
- `nights/template/NNN-template.md` — 旧テンプレ。v2 では `.github/ISSUE_TEMPLATE/night.yml` を使用

v2 の stuck protocol: Issue に `stuck` label を追加 (`gh issue edit <#> --add-label stuck`)。`nights/stuck/` は使わない。

## nestest による CPU 検証

- `roms/test/other/nestest.log` が CPU 命令の golden trace (各命令実行後の PC/A/X/Y/P/SP/CYC)
- `tests/cpu_nestest_trace.test.ts` の `TRACE_LINES` までを自実装の trace と突き合わせて一致を検証
- 新しい命令ブロックを実装するたび `TRACE_LINES` を次の未実装命令の直前まで延伸する
- 未実装命令の初出行特定には `tmp/scan.ts` (OPCODES を import して nestest.log を走査) を再利用できる

## 設計の正典

設計の正典は ローカルの `tmp/design.md` (リポ外、 個人保管)。 リポ内では README.md + CLAUDE.md + GitHub Issues + `.claude/` で自走に必要な情報を分散配置している。
