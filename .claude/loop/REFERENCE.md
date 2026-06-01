# 自走ループ機構 (loop REFERENCE・オンデマンド参照)

> このファイルは **CLAUDE.md から `@import` されない**（@なしポインタ参照）。詰み時・seed 時・機構の内部挙動を知りたい時に Claude が必要に応じて Read する。毎セッションのコンテキストには載せない（薄く保つため）。
> 機構部分なので将来 `claude-loop` plugin 側へ移る。

## 詰み時の自動隔離 (stuck protocol)

- 同じエラーで連続 30 分以上進捗ゼロを観測した時、 自動的に以下を実行:
  1. 該当 Issue に `stuck` label を追加 (`gh issue edit <#> --add-label stuck`)
  2. Issue にコメントで「詰み report」 (再現手順 / 試したこと / 仮説) を追記
  3. PR を draft に戻す (`gh pr ready --undo`)
  4. 通知: `bash scripts/loop-notify.sh --reason stuck --pr <NUM>` で石井に issue 通知
  5. 該当夜の連鎖は中断し、 次の夜には進まずセッション終了
- ターン消費目安: 「同一テスト failure / 同一エラーメッセージ」 が 5-7 ターン続いたら 30 分目安として隔離検討
- `stuck` label の Issue は `finish-night.sh` の next Issue 取得で自動除外される (`-label:stuck`)

## seed は `/loop-start seed` で対話的に実行

v2 より、タスクの seed (次の夜 Issue 作成) は **Claude の自動責務から分離**された。
`/loop-start seed` サブコマンドでユーザーと対話的に Issue を設計・作成する。

- finish-night.sh は次の open Issue がなければ STOP を書いて連鎖を安全停止
- seed は fresh session で `/loop-start seed` を実行
- `.github/ISSUE_TEMPLATE/night.yml` のフォーマットに沿って Issue を作成
- 複数 Issue をまとめて作成可能 (batch seed)

## /clear 自走ループ駆動 (実装済み)

夜境界の context リセットは `/compact` ではなく **`/clear`** で行う。 handoff を PR に外出し済み (GitHub Flow: Issue = scope SSOT / PR = delivery SSOT) なので要約を残す意味がなく、 完全リセットの方が context 汚染ゼロ。 公式ガイダンスも「新タスク=/clear / 同一会話継続=/compact」 で 1 夜=新タスクに合致。

駆動機構は `.claude/hooks/` に実装済み。 **外部シェル常駐は不要** — フック自身が自己連鎖する:

- `stop-hook.sh` (Stop hook): worker が **pane スコープのフラグ** `.claude/state/loop-next.${TMUX_PANE#%}.txt` を書いたら進行役 `loop-helper.sh` を非同期 spawn して exit 0 (block しない)。 フラグ無しの発話終了は no-op
- `loop-helper.sh` (外部プロセス・/clear で生き残る): **前夜 PR の merge 完了を待ち** (`LOOP_WAIT_MERGE` 既定 ON。 30 分タイムアウトで安全停止。 テスト時のみ `=0`) → `/clear` (resume ラベルは `loop-clear-$(date +%Y%m%d-%H%M)` で夜ごと一意) → **/clear 完了シグナルを待ち** → 次ゴールを send-keys。 spawn 前に Stop hook が turn 終了 (=idle) を保証するため /clear 前の明示的な idle 待ちは不要
- `loop-session-restore.sh` (SessionStart `clear` matcher): /clear 後に `scripts/pr-context.sh` で GitHub 上の open Issue/PR 情報を取得し再注入して状態復元 + **pane スコープの完了シグナル `.claude/state/loop-cleared.${TMUX_PANE#%}.txt` を置いて** helper に /clear 完了を知らせる (画面 scrape 非依存の idle 検出)
- フラグ中身 = `/goal <動的文言>` なら次の夜へ連鎖 / `STOP` なら連鎖終了。goal 文言は finish-night.sh が次の open Issue から動的に生成 (Issue なし → STOP)
- 暴走ブレーキ: `NIGHTOWL_LOOP_MAX` (既定 20) 回で自動停止。 clear hook が発火せず完了シグナルが来ない場合も helper のシグナル待ちタイムアウト (300s) で安全停止 + bot 名義 gh issue 通知 (無限課金しない)
- カウンタが pane キーなのは `/clear` が session_id を変える (#20797) ため (session キーだと毎回リセットされ MAX が効かない)
- **helper はワンショット**: 1 連鎖 (merge 待ち→/clear→完了シグナル待ち→次ゴール) を回して exit する常駐でない。 次の /clear は worker の Stop hook (turn 完了) が再トリガーする。 worker が turn 途中で死ぬ (例: API Error) と Stop hook が鳴らず連鎖は静かに止まる (無限 /clear ループは構造的に起きない)

idle 検出は **シグナル駆動** (clear hook が置く名札ファイルの出現を待つ)。 旧実装の画面マーカー scrape (`BUSY_RE` 等) は Claude Code の TUI フッター文言変更で壊れる脆さがあったため撤去済み。 シグナルが来なければ fail-stop + 通知し、 /clear 処理中に次ゴールを送る事故を構造的に避ける。

## PR description のテンプレ

夜 N PR の description は、 該当 Issue body の DoD セクションをベースに `Closes #NNN` を含める形。 PR メモ欄に詰みパターン・設計判断を書いておくと朝レビューしやすい。
