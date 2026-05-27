# 自走ループ機構 (loop REFERENCE・オンデマンド参照)

> このファイルは **CLAUDE.md から `@import` されない**（@なしポインタ参照）。詰み時・pending枯渇時・機構の内部挙動を知りたい時に Claude が必要に応じて Read する。毎セッションのコンテキストには載せない（薄く保つため）。
> 機構部分なので将来 `claude-loop` plugin 側へ移る。

## 詰み時の自動隔離 (stuck protocol)

- 同じエラーで連続 30 分以上進捗ゼロを観測した時、 自動的に以下を実行:
  1. 該当 `nights/pending/NNN-*.md` を `nights/stuck/NNN-*-stuck.md` に rename
  2. stuck md 末尾に「詰み report」 (再現手順 / 試したこと / 仮説) を追記
  3. PR を draft に戻す (`gh pr ready --undo`)
  4. 該当夜の連鎖は中断し、 次の夜には進まずセッション終了
- ターン消費目安: 「同一テスト failure / 同一エラーメッセージ」 が 5-7 ターン続いたら 30 分目安として隔離検討

## Claude が次の夜 md を起こす責務

`nights/pending/` が空になった時、 **Claude が次の夜 md を起こす**。 朝石井が起こす想定は廃止。 起こし方:

1. 直近 done になった夜の DoD と nestest.log / 設計の現状を踏まえ、 1 夜 1-1.5 時間スケールの次タスクを設計
2. `nights/template/NNN-template.md` をコピーして `nights/pending/NNN+1-<topic>.md` を作成 (NNN は直近 done の番号 + 1)
3. **同セッションの bootstrap PR で起こす**: 夜 N のブランチに含めず、 別の `chore/seed-NNN+1` ブランチを切って独立 PR にする。 もしくは次の夜ブランチの最初の commit で md を起こすパターンも可 (`chore(nights): seed NNN+1 from done NNN insights` に分離)
4. seed PR / 夜開始 commit のいずれであっても、 main merge を待ってから実装着手

## /clear 自走ループ駆動 (実装済み)

夜境界の context リセットは `/compact` ではなく **`/clear`** で行う。 handoff を PR + state ファイルに外出し済み (PR-as-SSOT) なので要約を残す意味がなく、 完全リセットの方が context 汚染ゼロ。 公式ガイダンスも「新タスク=/clear / 同一会話継続=/compact」 で 1 夜=新タスクに合致。

駆動機構は `.claude/hooks/` に実装済み。 **外部シェル常駐は不要** — フック自身が自己連鎖する:

- `stop-hook.sh` (Stop hook): worker が **pane スコープのフラグ** `.claude/state/loop-next.${TMUX_PANE#%}.txt` を書いたら進行役 `loop-helper.sh` を非同期 spawn して exit 0 (block しない)。 フラグ無しの発話終了は no-op
- `loop-helper.sh` (外部プロセス・/clear で生き残る): worker の idle を待ち → **前夜 PR の merge 完了を待ち** (`LOOP_WAIT_MERGE` 既定 ON。 30 分タイムアウトで安全停止。 テスト時のみ `=0`) → `/clear` (resume ラベルは `loop-clear-$(date +%Y%m%d-%H%M)` で夜ごと一意) → 次ゴールを send-keys
- `loop-session-restore.sh` (SessionStart `clear` matcher): /clear 後に `.claude/state/latest.md` を再注入して状態復元
- フラグ中身 = 次ゴール文 (単一行) なら次の夜へ連鎖 / `STOP` なら連鎖終了
- 暴走ブレーキ: `NIGHTOWL_LOOP_MAX` (既定 20) 回で自動停止。 worker フリーズ時も helper の idle タイムアウト (600s) で安全停止 (無限課金しない)
- カウンタが pane キーなのは `/clear` が session_id を変える (#20797) ため (session キーだと毎回リセットされ MAX が効かない)
- **helper はワンショット**: 1 連鎖 (idle 待ち→merge 待ち→/clear→次ゴール) を回して exit する常駐でない。 次の /clear は worker の Stop hook (turn 完了) が再トリガーする。 worker が turn 途中で死ぬ (例: API Error) と Stop hook が鳴らず連鎖は静かに止まる (無限 /clear ループは構造的に起きない)

既知の限界 (将来 hardening): idle 検出は画面マーカーのヒューリスティックで、 worker が長時間ツール実行中に誤判定すると /clear が作業中に走るリスクがある (Stop hook が turn 終了=idle を保証するため実運用では低リスクだが要 hardening)。

## PR description のテンプレ

夜 N PR の description は、 該当 `nights/pending/NNN-<topic>.md` の「ゴール / DoD」 セクションをベースに完了チェックを `[x]` で埋める形。 PR メモ欄に詰みパターン・設計判断を書いておくと朝レビューしやすい。
