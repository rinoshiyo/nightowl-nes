# 自走ループ機構 (loop CORE・毎セッション必読)

> このファイルは自走連鎖の**機構**部分。将来 `claude-loop` plugin に `.claude/loop/` + `.claude/hooks/` ごと切り出す単位。
> 現状は「夜 / nestest」等の NES 固有語彙が混ざるが、plugin 化時に「タスク」等へ抽象化する。NES 固有の**中身**（達成条件・レビュー観点・handoff項目）は `nes/CORE.md` 側にある。
> CLAUDE.md から `@import` され毎セッション必ずロードされる。

## 自走モデル

- **1 夜 = 1 つの夜 md = 1 本の PR = 1 つの /clear リセット境界** (所要目安 1-1.5 時間、 DoD 8-12 項目)
- **各夜は有限の /goal** (`or stop after N turns`、 N=50 目安)。 1 夜達成 → worker が次フラグ書込 → **Stop hook → helper が /clear して fresh session で次の夜へ交代** (`loop/REFERENCE.md` の「/clear 自走ループ駆動」 参照)
- 連鎖停止条件: pending 枯渇 / 石井 stop 指示 / フラグに `STOP` / 暴走ブレーキ `NIGHTOWL_LOOP_MAX` 到達
- 各夜の達成 / 上限到達後は SessionEnd hook が retrospective 生成
- **連鎖の起動**: `loop-start` skill (description マッチで起動。 slash コマンドではない) か、 最初の夜ゴールを手で投入する。 以降は各夜末のフラグ書込で /clear 連鎖が自走する
- **アンチパターン**: 「pending 全消化を 1 つの /goal で」 は使わない (夜ごとに /clear リセットするため)。 旧「1 セッションで N 夜をターン上限まで /goal 連鎖」 は context 肥大化で廃止済み

## 連鎖継続条件

以下を全て満たす間、 Claude は次の夜を自走する:

1. `nights/pending/` に未処理の夜 md が 1 つ以上ある
2. 石井から `stop` / `止めて` / `セッション終了` 等の明示停止指示が来ていない
3. 現セッションのターン残量が、 次の夜を完遂するのに十分 (目安: 残り 40 turns 以上)
4. 直近で `nights/stuck/` に隔離された夜が連続 2 つ以下 (連続詰みでセッション終了)

## 夜 N PR の自動レビュー (sub-agent + code-review skill)

ノールック auto-merge を避けるため、 PR 作成直後に **sub-agent を立ててレビューさせる**。 GitHub Actions / 外部 API を使わず、 メインと同じ Anthropic 枠で完結する (追加課金ゼロ)。 メイン context を圧迫しないよう、 詳細レビューは sub-agent の独立 context で行い、 メインには致命度サマリだけ返す。

**重要 (レース回避)**: `gh pr merge --auto` は **レビュー完了 + STOP 判定ゼロを確認した後に初めて設定する**。 レビュー前に auto-merge を打つと CI 緑が sub-agent レビュー完了を追い抜き判定前に merge されうる。 auto-merge を打たなければ CI が緑でも勝手に merge されない。

**レビューコメントは bot 名義で投稿する**: sub-agent の `code-review` 起動時とメインの triage コメント投稿時は `GH_TOKEN="$(scripts/gh-app-token.sh)"` を付ける (例: `GH_TOKEN="$(scripts/gh-app-token.sh)" gh pr comment <PR> --body ...`)。 投稿者が `rinoshiyo-bot-reviewer[bot]` になり石井本人のコメントと区別できる。 **付けるのはコメント投稿コマンドだけ** — `gh pr create` / `gh pr merge` / `gh pr ready --undo` 等の write 操作には付けない (bot は Contents read のみで失敗する)。 `.env` + 鍵マウント (compose override) 未設定のマシンではトークン発行が空になり gh が通常認証 (石井名義) に fallback する。

**bot コメントの声 (フレンドリー・励まし)**: code-review の生出力をそのまま貼らず言い換える — ① まず良い点・労いに一言 (例「✨ 実装おつかれさまです！」) ② 各指摘は提案調 (「〜すると安心かも」) ③ 絵文字を程よく (✨🙏💪🤔) ④ **致命度は保ったまま角だけ取る** (STOP 級は柔らかくても「ここは直さないと merge できないかも」 と明確に)。

1. `gh pr create` 直後、 `Agent` tool で `general-purpose` sub-agent を **`run_in_background: true`** で起動 (フォアグラウンド起動は hook で deny)。 **この時点では auto-merge を設定しない**
2. sub-agent への prompt に渡すもの:
   - 対象 PR 番号 / ブランチ名 / `main...night/NNN-<topic>` の diff レンジ
   - レビュー観点 (NES 固有のため `nes/CORE.md` 参照)
   - sub-agent は内部で `code-review` skill を `--comment` 付き・effort=medium で起動し PR にインラインコメントを post
   - **致命度サマリは sub-agent が算出**: `code-review` の生出力は severity 無しのフラット JSON のため、 sub-agent が各 finding を `critical`/`high`/`medium`/`low` に分類してメインへ件数を返す
   - **共有ワークツリー保護**: sub-agent に「`git checkout`/`switch` でブランチを切り替えるな、 diff は `git diff main...<branch>` / `git show <branch>:path` で見ろ」 と必ず指示 (checkout するとメインのブランチが動く事故が起きる)
3. sub-agent 完了通知を受領したら致命度サマリを transcript に出力
4. **レビュー指摘の triage** (自走中は石井に確認できないため Claude が自動裁定):

   severity ラベルは主観でブレるため、 ラベルでなく **何が起きるか** で 3 区分に振り分ける。 post はどの区分でも常に行う。

   | 区分 | 条件 | アクション |
   |---|---|---|
   | 🛑 STOP | 仕様違反 (6502/iNES/NES 挙動が nesdev wiki と食い違う) / ソース由来制約違反の疑い / データ破壊・不可逆操作 / テスト・型・lint が赤 | **auto-merge 設定しない**。 `gh pr ready --undo` で draft 戻し + その PR にコメントで「draft 戻し report」 + 連鎖中断 + セッション終了 |
   | 🔧 FIX | 明らかなバグ・誤記で修正が一意に決まる / ドキュメント・コードの自己矛盾 | メインが修正 commit → push → 再レビュー。 **同一 PR の修正往復は最大 2 回**。 2 回で解消しなければ STOP に格上げ |
   | ✅ PASS | 設計の好み / 可読性 / リファクタ提案 / 将来夜への申し送り | post のみ・連鎖続行。 申し送りは次の夜 md に転記 |

   全指摘が PASS、 または FIX が再レビューで解消した時のみ `gh pr merge --auto --merge --delete-branch` を設定する。 STOP が 1 件でもあれば auto-merge せず隔離。

   **FIX 修正は grep で一網打尽にする**: 1 箇所直したら同じパターンを `grep` で全文スキャンし同種箇所を同じ commit でまとめて潰す。 1 箇所ずつ直すと「同根の取りこぼし」 が次 round で再浮上し修正往復 2 回の上限を無駄に消費する。

5. **triage 判断ログ**: 下した triage 判断は **該当 PR のコメント**に「指摘 Y → STOP/FIX/PASS と判断 (理由 Z)」 形式で記録 (PR が SSOT)。

## 各夜の終了処理

夜 N の PR に auto-merge を arm し handoff を書いたら、 セッションを終える前に以下を行う (この後 Stop hook → helper が `/clear` して次の夜へ連鎖):

1. `🎯 GOAL CONDITION MET: night N merged` を transcript に出力 (auto-merge arm まで完了の意)
2. **handoff を PR に書く (PR が SSOT)**: 「達成内容 / 困った点 / 朝レビュー向けメモ / 次の夜の前提条件」 を該当夜の PR description かコメントに書く。 `tmp/handoff/` のローカル md は gitignore で push されず二重管理になるため使わない
3. **`.claude/state/latest.md` を更新**: 次の夜番号+topic / nestest 到達行 / 進行中 PR / 連鎖プロトコル現在地。 `/clear` には自動退避が無いので手で書く (SessionStart の clear matcher が再注入)
4. **次フラグを書く** (pane スコープ):
   - pending がまだ残る → 次ゴール文 (**単一行**) を `printf '...' > ".claude/state/loop-next.${TMUX_PANE#%}.txt"`
   - もう無い / 詰み → `printf 'STOP' > ".claude/state/loop-next.${TMUX_PANE#%}.txt"`
5. turn を終える → helper が idle を見て `/clear` → 次ゴール投入

次ゴール文の例 (単一行 必須): `次の pending 夜を CLAUDE.md 自走連鎖プロトコルに従い実装→PR→sub-agentレビュー→triage→全PASSなら auto-merge arm、完了後 latest.md 更新と次フラグ書込まで行え、or stop after 50 turns`

## 起動時の作法

0. **`gh pr list --state open --json number,title,isDraft` で未完了 PR を確認**。 open PR があれば PR コメント (SSOT) を読み中断作業か判定。 **判定基準**: draft = レビュー隔離中 (再開対象) / 非 draft の open は中身を見る — **auto-merge arm 済みで CI 実行中/緑なら「正常な in-flight」** (中断扱いして再開しない) / **auto-merge 未設定のまま放置**なら レビュー途中で切れた可能性で最優先再開
1. `.claude/state/latest.md` が存在すれば Read (SessionStart hook が inject していなければ)
2. `nights/pending/` の最若番号の md を Read
3. 「## ゴール」セクションの /goal 条件を確認
4. `git checkout main && git pull` で main を最新化 → PR フローに沿って `night/NNN-<topic>` ブランチを切ってから実装着手
5. ステップごとに `bun test` + `bunx tsc --noEmit` + `bunx eslint` を実行 (結果は出力リダイレクト)
6. /goal 評価のため pass / fail を必ず transcript に出力
7. DoD を全部満たしたら `nights/pending/NNN.md → nights/done/NNN.md` の `git mv` も同じブランチで commit
8. `gh pr create` で PR を立てる (この時点では auto-merge を打たない)
9. sub-agent でレビュー → triage が STOP ゼロを確認してから `gh pr merge --auto --merge --delete-branch`
10. CI 緑 → auto-merge 反映を見届けてセッション完了報告

## ブランチ運用 + PR フロー

**main への直 push は禁止** (hook で deny)。 毎晩 `night/NNN-<topic>` ブランチを切って PR ベースで進める。

### ブランチ命名規約

- `night/NNN-<topic>` (NNN は 3 桁ゼロパディング、 topic は kebab-case)。 夜 md と一対一対応
- 例: `night/001-cpu-skeleton`、 `night/012-absolute-logic-arith-compare`

### git / gh 操作の許可マトリクス

| 操作 | 可否 |
|---|---|
| `git checkout -b night/...` | ○ |
| `git push -u origin night/...` | ○ |
| `git push origin main` (直 push) | ✗ hook で deny |
| `git push --force` 任意ブランチ | ✗ hook で deny |
| `gh pr create` | ○ |
| `gh pr merge --auto --merge --delete-branch` | ○ |
| `gh pr merge` (--auto 無し) | ⚠ ask (CI 確認を飛ばすため) |
| `gh pr close` | ⚠ ask |
| `gh pr ready` / `gh pr edit --title\|--body` | ○ |
| `gh pr edit --base` | ⚠ ask |
| `gh pr delete` | ✗ hook で deny |
| `gh repo delete` / `gh release delete` / `gh issue delete` | ✗ hook で deny |

### auto-merge の挙動

`gh pr merge --auto --merge --delete-branch` で立てた PR は、 必須 CI (nightly) が緑になった時点で自動的に **merge commit を作成して** main に合流 → ブランチ自動削除。 Claude は `gh pr merge` を再実行しなくてよい。

**マージ方式は merge commit (`--merge`) で固定**: squash でなく merge commit を使うのは `git log --graph` 上で各 night ブランチの合流が視覚的に追え、 各夜の作業コミットも履歴に残るため。 squash / rebase は使わない。

**auto-merge を打つタイミング**: sub-agent レビューの triage が完了し STOP 判定ゼロを確認した後に限る。 レビュー前に打つと CI 緑がレビューを追い抜くレースが起きる。

詰まった場合は PR を draft に戻す (`gh pr ready --undo`) か、 ask 経由で close するか、 stuck/ 隔離フロー (`loop/REFERENCE.md`) に乗せる。

## /goal 評価のための出力ルール

- テスト実行後は必ず `✅ PASS: <test_name>` または `❌ FAIL: <reason>` を出力
- 型チェック成功時は `✅ TYPECHECK: clean`
- PR 作成成功時は `🔀 PR OPENED: <URL>`
- auto-merge 設定成功時は `⏳ AUTO-MERGE ARMED: CI 緑判定待ち`
- CI 緑判定 + main merge 確認時は `🎯 GOAL CONDITION MET: night NNN merged`

## コンテキスト管理

- コマンドは `command > tmp/log.log 2>&1 && tail -20 tmp/log.log` 形式で実行 — 生 stdout を直接コンテキストに流さない (200k 上限対策・evaluator API #62345 対策)
- 大きなファイルは `grep -n "pattern" file | head -30` で参照、 Read 全体は禁止
- 同じファイルを複数回 Read しない
- ログファイルは `tmp/` 配下に出力 (.gitignore 済み)
