# CLAUDE.md - nightowl-nes /goal 自走 orchestration

夜間に Claude Code が TypeScript で NES エミュレータを自作する vibe coding 実験リポ。最優先は「夜間自走の実験」であり、エミュレータ完成は副産物。最終配布物はブラウザで動く Web アプリ (URL 1 個でアクセス可能)。

詳細は **機構 (loop)** と **domain (nes)** に分離している。必読分は下記 `@import` で毎セッション展開され、頻度の低い詳細はオンデマンド参照 (`@` なし) に逃がして本ファイルを薄く保つ。

## 最重要ルール (critical・絶対遵守)

- **main への直 push は禁止** (hook で deny)。必ず `night/NNN-<topic>` ブランチ + PR フロー経由
- **`git push --force` / `git push -f` は禁止** (hook で deny)
- **既存 NES エミュレータ実装は参照禁止** — どんな言語・ライセンスでも見ない。コードスニペット引用も禁止。困ったら nesdev wiki に戻る (参照 OK/NG・deny list の詳細は `nes/CORE.md`)
- **各夜末に pane フラグ `.claude/state/loop-next.${TMUX_PANE#%}.txt` を必ず書く** — `finish-night.sh` が自動で `/goal <次ゴール文>` 形式 (STOP 時はプレーン `STOP`) を書く。これが /clear 連鎖のトリガーで、怠ると自走が止まる (詳細は `loop/CORE.md` の「各夜の終了処理」)
- **`tests/__snapshots__/` の書き換えは人間レビュー必須** (hook で ask)
- **30 分以上同じエラーで止まったら `nights/stuck/` に隔離** → PR を draft に戻す → セッション終了 (手順は `loop/REFERENCE.md`)
- commit メッセージは Conventional Commits 形式

## ドキュメント構成

**毎セッション必読 (`@import` で展開):**

@.claude/loop/CORE.md
@.claude/nes/CORE.md

**オンデマンド参照 (必要時に Read・`@import` しない):**

- `.claude/loop/REFERENCE.md` — 詰み隔離 (stuck) / 次の夜 md を起こす責務 / /clear 自走ループ駆動の内部 / PR description テンプレ
- `.claude/nes/REFERENCE.md` — 夜 md の構造 / nestest 検証 / 設計の正典

## Compact Instructions

auto-compact (~95% で不可避・無効化不可) や手動 `/compact` で会話履歴が要約される際、**要約には以下を必ず保持すること**。失うと自走が空回りするため最優先で残す:

1. **アクティブな /goal 条件** (設定中なら全文)
2. **次にやる夜**: `nights/pending/` の最若番号の夜 md (番号 + topic)
3. **進行中の PR**: 番号・ブランチ名・code-review レビュー / triage の状態 (中断 PR があれば最優先で再開対象)
4. **nestest trace の現在の到達行数** (実装到達点)
5. **自走連鎖プロトコルの現在地**: どの夜まで done か、次に seed すべき夜番号
6. **直近の未解決の設計判断・論点**

compaction 後は SessionStart hook (matcher: compact) が `.claude/state/latest.md` も注入する。本セクション (要約への保持指示) と hook (外部ファイルからの復元) の二層で state を保全し、compaction を跨いでも自走が継続できるようにする。
