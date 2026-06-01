# 自走ループ機構 (loop CORE・毎セッション必読)

> このファイルは自走連鎖の**機構**部分。将来 `claude-loop` plugin に `.claude/loop/` + `.claude/hooks/` ごと切り出す単位。
> 現状は「夜 / nestest」等の NES 固有語彙が混ざるが、plugin 化時に「タスク」等へ抽象化する。NES 固有の**中身**（達成条件・レビュー観点・handoff項目）は `nes/CORE.md` 側にある。
> CLAUDE.md から `@import` され毎セッション必ずロードされる。

## 自走モデル

**GitHub Flow** (Issue → Branch → PR → Merge) で運用する。**Issue = scope SSOT** (何をやるか・DoD)、**PR = delivery SSOT** (何をやったか・diff + レビュー)。

- **1 夜 = 1 つの夜 md = 1 Issue = 1 本の PR = 1 つの /clear リセット境界** (所要目安 3-5 時間、 DoD 20-40 項目)
- **各夜は有限の /goal** (`or stop after N turns`、 N=80 目安)。 1 夜達成 → worker が次フラグ書込 → **Stop hook → helper が /clear して fresh session で次の夜へ交代** (`loop/REFERENCE.md` の「/clear 自走ループ駆動」 参照)
- 連鎖停止条件: 石井 stop 指示 / フラグに `STOP` / 暴走ブレーキ `NIGHTOWL_LOOP_MAX` 到達。 pending 枯渇では停止しない — `finish-night.sh` は常に `/goal` を書き、 fresh session が起動時の作法 (step 2) で pending 空を検知し seed する
- 各夜の達成 / 上限到達後は SessionEnd hook が retrospective 生成
- **連鎖の起動**: `loop-start` skill (手動起動用。 description マッチで起動) か、 最初の夜ゴールを手で投入する。 以降は各夜末のフラグ書込で /clear 連鎖が自走する
- **アンチパターン**: 「pending 全消化を 1 つの /goal で」 は使わない (夜ごとに /clear リセットするため)。 旧「1 セッションで N 夜をターン上限まで /goal 連鎖」 は context 肥大化で廃止済み

## 連鎖継続条件

以下を全て満たす間、 Claude は次の夜を自走する:

1. 石井から `stop` / `止めて` / `セッション終了` 等の明示停止指示が来ていない
2. 現セッションのターン残量が、 次の夜を完遂するのに十分 (目安: 残り 40 turns 以上)
3. 直近で `nights/stuck/` に隔離された夜が連続 2 つ以下 (連続詰みでセッション終了)

pending が空でも連鎖は止まらない (上記「連鎖停止条件」参照)。

## 夜 N PR の自動レビュー (メインが code-review skill を直呼び)

ノールック auto-merge を避けるため、 PR 作成後にレビュー往復を回す。 **`code-review` skill はメインが直接呼ぶ** — skill は内部で finder 7 angle + 各 finding の verifier を `Agent` tool で spawn する設計のため、 **sub-agent から呼ぶとネスト不可 (subagents cannot spawn subagents) で機能しない**。 メインには `Agent` tool があるので正規に動く。 GitHub Actions / 外部 API を使わず Anthropic 枠で完結 (追加課金ゼロ)。

### 責務と名義の分離 (PR = delivery SSOT・Why: これがレビュー観点の土台)

1 つのメイン Claude が **投稿時に名義を演じ分ける**。 朝石井が「誰が指摘し・誰が裁定したか」を PR (delivery SSOT) で追えるようにする:

| 立場 | 名義 | 投稿経路 | 投稿するもの |
|---|---|---|---|
| **レビュアー** | bot `rinoshiyo-bot-reviewer[bot]` | **`scripts/bot-review-post.sh`** (フォーマット強制。内部で `bot-comment.sh` を呼ぶ) | レビュー結果 (severity 付き)。 **指摘ゼロでも「✅ レビュー実施・指摘なし」を必ず1件投稿** (証跡) |
| **裁定者 (石井代理)** | **石井本人** (`GH_TOKEN` なし通常認証) | `gh pr comment` 直 | triage 裁定・対応の記録 |

- **なぜ分けるか**: レビュアー (bot) の指摘を受けてオーナー (石井=メイン) が「merge してよいか」を裁定する現実のレビュー構図を再現するため。 名義が同じだと朝石井が「指摘か裁定か」を区別できず delivery SSOT が機能しない
- **bot 名義投稿は必ず `scripts/bot-comment.sh` 経由**。 生の `gh pr comment` / `gh api ... comments` を直接叩くと、 トークン適用漏れで石井名義に静かに fallback したり `gh pr comment` の `--jq` 非対応で投稿失敗する事故が起きる (ラッパーが構造的に防ぐ)。 `gh pr create` / `gh pr merge` / `gh pr ready` 等の write 操作には `GH_TOKEN` を付けない (bot は Contents read のみで失敗)。 鍵マウント未設定のマシンでは bot トークンが空になり、 ラッパーが fail-stop する (石井名義への fallback を許さない)。 **前提**: inline コメントの `head.sha` 取得は通常 gh 認証 (GH_TOKEN なし) で `pulls` を読めることに依存する (bot は Contents read のみで pulls 読取に権限不足)
- **bot (レビュアー) コメントの声 = フレンドリー・励まし**: code-review の生出力をそのまま貼らず言い換える — ① まず良い点・労いに一言 (例「✨ 実装おつかれさまです！」) ② 各指摘は提案調 (「〜すると安心かも」) ③ 絵文字を程よく (✨🙏💪🤔) ④ **致命度は保ったまま角だけ取る** (STOP 級は柔らかくても「ここは直さないと merge できないかも」 と明確に)。 **Why: 石井は無駄を削いだ簡潔な物言いをするので、 bot の柔らかいレビューが「他人からレビューされている体感」を生む** — この違和感を仕組みで担保するのが狙い (memory `review-bot-identity` で確定)

**重要 (レース回避)**: `gh pr merge --auto` は **全 PASS 確認後に初めて設定する**。 レビュー前に打つと CI 緑がレビューを追い抜き判定前に merge されうる。

### フロー (findings 0 / 全 PASS の round に達するまで・往復上限 2)

```
1. gh pr ready (draft → open。auto-merge まだ打たない)
   ↓
┌→ 2. レビュー round:
│  a. メイン: code-review --fix を直呼び (finder 7 angle + verifier を Agent spawn
│             → findings + working tree 自動修正。--fix は「intended behavior 変更/
│             スコープ外/false positive は skip」を内蔵)
│  b. メイン: 各 finding を critical/high/medium/low に分類 (severity 付与)
│  c. メイン: **`scripts/review-post.sh <PR#> <findings.json>`** を 1 回呼ぶ。
│             内部で以下を atomic に実行 (LLM が個別ステップを落とすのを構造的に防ぐ):
│             - `bot-review-post.sh` で bot 名義投稿 (サマリ→issue / 各指摘→inline)
│             - triage 裁定コメントを石井名義で自動生成・投稿
│             - `review-status.json` 書出 (FIX/STOP あり → `has_fix:true` → merge deny)
│             findings JSON の各 finding には `triage` + `severity` + `triage_note` が必須。
│             指摘ゼロでも「✅ レビュー実施・指摘なし」をサマリとして投稿
│  e. (修正あれば) 別 commit → push → ローカルで bun test + tsc + eslint
└──┘ ← FIX 必須が残る限り 2 を繰り返す (往復上限 2・超過は STOP 格上げ)
       2 回目以降の round も --fix (前 round の修正が新指摘を浮上させうるため)。
       findings 0 / 残りが全 PASS の round に達したら収束 → 3
   ↓
   STOP あり / 往復 2 回超過 → gh pr ready --undo で draft 戻し + 隔離 + 連鎖中断
   全 PASS → 3
   ↓
3. メイン: gh pr merge --auto --merge --delete-branch で arm
```

詳細:
- **`code-review` は `--comment` を付けない**。 メインが findings を受け取り `bot-review-post.sh` で投稿する (skill 自身に投稿させると名義制御できない)。 **`--fix` は付ける** (指摘を working tree に自動反映 = 無人 triage の前進力)。 `bot-review-post.sh` は内部で `bot-comment.sh` を呼ぶ (名義制御・fail-stop は bot-comment.sh が担保)
- **メインは night ブランチに居る前提**: `code-review --fix` は **メインの working tree** を直接書き換えるため、 起動時の作法どおり `night/NNN` を checkout した状態で実行すること (`--fix` の修正先・inline の対象が PR ブランチになる)。 finder には「`git checkout`/`switch` 禁止」を指示するが、 メイン自身は night ブランチに居る (両者は矛盾しない)
- **finder spawn は `run_in_background: true` 必須**: code-review skill が内部で Agent 起動する finder/verifier も、 メインが Agent を起動する全てと同様に background 必須 (foreground 起動は hook `check-agent-background.sh` で deny される)
- **finder への指示** (skill が Agent spawn する各 finder に渡る観点): NES 固有のレビュー観点は `nes/CORE.md` 参照。 **共有ワークツリー保護** = 「`git checkout`/`switch` 禁止、 diff は `git diff main...<branch>` / `git show <branch>:path` で見ろ」 を必ず指示 (checkout するとメインのブランチが動く事故)
- **severity はメインが triage 時に付与** (code-review の生 finding は severity 無しのフラット出力)。 そのうえで **何が起きるか** で 3 区分に振り分け、 **裁定を石井名義で PR 投稿** (どの区分でも必ず・全 PASS でも):

   | 区分 | 条件 | アクション |
   |---|---|---|
   | 🛑 STOP | 仕様違反 (6502/iNES/NES 挙動が nesdev wiki と食い違う) / ソース由来制約違反の疑い / データ破壊・不可逆操作 / テスト・型・lint が赤 | **auto-merge 設定しない**。 `gh pr ready --undo` で draft 戻し + 「draft 戻し report」コメント + 連鎖中断 + セッション終了 |
   | 🔧 FIX | 明らかなバグ・誤記で修正が一意 / 自己矛盾 (主に --fix が自動修正) | 修正を別 commit で push → 再 round。 **修正往復は最大 2 回**。 2 回で解消しなければ STOP に格上げ |
   | ✅ PASS | 設計の好み / 可読性 / リファクタ提案 / 将来夜への申し送り | 連鎖続行。 申し送りは次の夜 md に転記 |

- **FIX 修正は grep で一網打尽**: 1 箇所直したら同じパターンを `grep` で全文スキャンし同種を同じ commit で潰す (同根の取りこぼしが次 round で再浮上し往復上限を無駄にするのを防ぐ)
- **投稿フォーマットは再 round でも不変**: 指摘の投稿フォーマットは上記フロー 2c の通り (各指摘を inline で1点1コメント + issue comment はサマリ専用)。 **再 round (往復) でも degrade させず維持** — 往復で「issue サマリに指摘を箇条書きするだけ・inline 省略」は禁止 (delivery SSOT で指摘が該当行から辿れなくなる)。 inline の severity ラベルは finding 4段階に対応する `🛑critical / 🔴high / 🟠medium / 🟢low`。 ただし **severity と triage 区分 (STOP/FIX/PASS) は別軸** — 区分は severity でなく「何が起きるか」で振る (`critical` は 🛑STOP に振られやすい最重要度だが、 critical でも純粋な可読性指摘なら STOP にはならない)
- **bot サマリ件数 = triage 件数 = その round の posted finding 総数 (単一の不変式)**: 各 round で dedup し、 `--fix` が skip した分 (intended behavior 変更 / スコープ外 / false positive) を除いた **posted finding 総数**が、 bot サマリの severity 別件数の合計とも、 triage の区分別件数の合計とも一致する。 bot が挙げていない項目を triage で勝手に増やさない (doc 整合・自己矛盾も cross-file 整合性を見る finder が拾うので、 finder 指摘として bot サマリに含まれる)。 数がズレると朝石井が「bot は N 件と言ったのに triage は M 件?」と PR を追えなくなる。 ※「指摘ゼロでも証跡1件」と「triage 裁定コメント」は finding 件数とは別軸の投稿で、 件数一致の対象外 (finding 0 でも証跡・裁定は各1件投稿する)
- **使用量**: code-review 1 回 = finder 7 個 + verifier を spawn する重い処理。 通常は「初回 --fix (修正) + 2 回目 --fix (findings 0/PASS で収束確認)」の **2 回**で済む。 新指摘が出れば往復追加 (上限内)

## 各夜の終了処理

**ユーザーに確認を求めず即座に実行する。** レビュー triage が全 PASS に収束した時点で、
立ち止まらずそのまま以下を行う。「次どうする？」「他にある？」等の質問は自走を止める違反行為。
この後 Stop hook → helper が `/clear` して次の夜へ連鎖する:

1. **handoff を PR に書く (PR = delivery SSOT)**: 「達成内容 / 困った点 / 朝レビュー向けメモ / 次の夜の前提条件」 を該当夜の PR description かコメントに書く。 `tmp/handoff/` のローカル md は gitignore で push されず二重管理になるため使わない
2. **`scripts/finish-night.sh` を呼ぶ** (残りの機械的手順を atomic に実行):
   ```bash
   bash scripts/finish-night.sh [--night NNN]
   ```
   スクリプトが以下を一括実行: auto-merge arm / 次フラグ書込 (pane スコープ、/goal 固定文言) / `🎯 GOAL CONDITION MET` 出力。連鎖停止時は `bash scripts/finish-night.sh STOP`
3. turn を終える → helper が idle を見て `/clear` → 次ゴール投入

## 起動時の作法

0. **open Issue / PR を確認**。`gh issue list -s open -l night` で open Issue、`gh pr list --state open` で open PR を確認。**判定基準**:
   - **open PR あり** → `isDraft` / `mergeStateStatus` を確認。draft = レビュー隔離中 (再開対象) / 非 draft かつ BLOCKED = 正常 in-flight (loop-helper が merge 待ち中、中断不要) / 非 draft かつ CLEAN = loop-helper 停止の可能性で最優先再開。再開時は `git checkout <headRefName>` してから **中断箇所に応じた step で再開** (実装途中 → step 7 / レビュー中断・draft 戻し → step 10)。/goal は step 4 で設定してから再開
   - **open Issue あり + PR なし** → scope は決まっている。**step 4 (/goal 設定) から再開** (step 5 でブランチを切って実装)
   - **どちらもなし** → step 1 から通常開始
1. `git checkout main && git pull` で main を最新化
2. `nights/pending/` の最若番号の md を Read (open Issue がなく pending もなければ `loop-start` skill の seed 手順で夜 md を作成)
3. **Issue 作成** (`gh issue create --title "夜 NNN: <topic>" --label night --body "<DoD チェックリスト>"`)。open Issue が既にあればスキップ。Issue が scope の SSOT
4. **/goal 設定**。夜 md「## ゴール」セクションの条件で /goal を設定する。**loop-start の出口条件 = /goal が active であること。/goal なしで実装に入ることは許されない**
5. `night/NNN-<topic>` ブランチを切る → 実装開始
6. 最初の commit → push → **draft PR** (`gh pr create --draft --body "Closes #<Issue番号>"`)。以降の delivery 状態は PR が SSOT
7. 実装続行。ステップごとに `bun test` + `bunx tsc --noEmit` + `bunx eslint` を実行 (結果は出力リダイレクト)
8. /goal 評価のため pass / fail を必ず transcript に出力
9. DoD を全部満たしたら `nights/pending/NNN.md → nights/done/NNN.md` の `git mv` も同じブランチで commit
10. `gh pr ready` で draft を解除 (この時点では auto-merge を打たない)
11. メインが `code-review --fix` を直呼びでレビュー → triage が STOP ゼロを確認してから `gh pr merge --auto --merge --delete-branch`
12. CI 緑 → auto-merge 反映 → Issue 自動 close を見届けてセッション完了報告

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
| `gh issue create` | ○ |
| `gh issue edit --title\|--body\|--add-label` | ○ |
| `gh issue close` | ⚠ ask |
| `gh issue delete` | ✗ hook で deny |
| `gh repo delete` / `gh release delete` | ✗ hook で deny |

### auto-merge の挙動

`gh pr merge --auto --merge --delete-branch` で立てた PR は、 必須 CI (nightly) が緑になった時点で自動的に **merge commit を作成して** main に合流 → ブランチ自動削除。 Claude は `gh pr merge` を再実行しなくてよい。

**マージ方式は merge commit (`--merge`) で固定**: squash でなく merge commit を使うのは `git log --graph` 上で各 night ブランチの合流が視覚的に追え、 各夜の作業コミットも履歴に残るため。 squash / rebase は使わない。

**auto-merge を打つタイミング**: code-review レビューの triage が完了し STOP 判定ゼロを確認した後に限る。 レビュー前に打つと CI 緑がレビューを追い抜くレースが起きる。

**CLEAN PR の直接 merge (loop-helper.sh)**: 2026-03-25 以降の GitHub 仕様変更 ([Discussion #190610](https://github.com/orgs/community/discussions/190610)) で、 CI 未通過時の `--auto` arm が HTTP 422 で拒否されるようになり、 `finish-night.sh` の auto-merge arm が silent fail する。 `loop-helper.sh` の merge 待ちループは **arm の成否に依存せず、 5 分 (`LOOP_FORCE_AFTER` × 30s) 経過後に `mergeStateStatus: CLEAN` な non-draft PR を `gh pr merge --merge --delete-branch` で直接 merge** する。 CLEAN = CI 通過済みなので安全。 auto-merge が復活した場合は先に発火して「already merged」で空振りするだけ。 これがないと merge 待ちが 30 分 timeout → 連鎖停止で朝まで止まる。

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
