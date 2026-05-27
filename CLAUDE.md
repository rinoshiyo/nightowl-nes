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

**重要 (レース回避)**: `gh pr merge --auto` は **レビュー完了 + STOP 判定ゼロを確認した後に初めて設定する** (STOP/FIX/PASS の三分類は後述)。 レビュー前に auto-merge を打つと、 CI の所要時間次第で CI 緑が sub-agent レビュー完了を追い抜き、 判定前に merge されうる。 auto-merge を打たなければ CI が緑でも勝手に merge されないので、 CI が速かろうが遅かろうがレビューが追い抜かれる事故が構造的に起きない。

1. `gh pr create` で PR が立った直後、 `Agent` tool で `general-purpose` sub-agent を **`run_in_background: true`** で起動 (フォアグラウンド起動は hook で deny される)。 **この時点では auto-merge を設定しない**
2. sub-agent への prompt に以下を渡す:
   - 対象 PR 番号 / ブランチ名 / `main...night/NNN-<topic>` の diff レンジ
   - レビュー観点: ① 6502 仕様 (nesdev wiki) との一致性 ② TypeScript 型安全性 (`noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`) ③ テストカバレッジの妥当性 ④ **既存 NES 実装の参照疑い** (CLAUDE.md ソース由来制約違反)
   - sub-agent は内部で `code-review` skill を `--comment` 付き・effort=medium で起動し、 PR にインラインコメントを post する
   - **致命度サマリは sub-agent が算出する**: `code-review` skill の生出力は `file` / `line` / `summary` / `failure_scenario` のフラット JSON で severity フィールドを持たないため、 sub-agent が各 finding を `critical` / `high` / `medium` / `low` に分類してメインへ件数を返す
3. sub-agent 完了通知を受領したら、 致命度サマリを transcript に出力する
4. **レビュー指摘の triage** (自走中は石井に確認できないため、 Claude が自動裁定する):

   sub-agent が付ける `critical` / `high` 等の severity ラベルは主観でブレる (実測: "high" 表記でも実質プロトコルを骨抜きにする指摘があった)。 ラベルに頼らず **何が起きるか** で 3 区分に振り分ける。 レビューコメントの post はどの区分でも常に行う (朝石井がレビュー濃度を上げられる)。

   | 区分 | 条件 | アクション |
   |---|---|---|
   | 🛑 STOP | 仕様違反 (6502/iNES/NES 挙動が nesdev wiki と食い違う) / ソース由来制約違反の疑い / データ破壊・不可逆操作 / テスト・型・lint が赤 | **auto-merge を設定しない**。 `gh pr ready --undo` で draft 戻し + **その PR にコメントで「draft 戻し report」 (再開手順・残作業を SSOT として)** + 連鎖中断 + セッション終了 |
   | 🔧 FIX | 明らかなバグ・誤記で修正が一意に決まる / ドキュメント・コードの自己矛盾 | メインが修正 commit → push → 再レビュー。 **同一 PR の修正往復は最大 2 回**。 2 回で解消しなければ STOP に格上げ (隔離 + 朝判断) |
   | ✅ PASS | 設計の好み / 可読性 / リファクタ提案 / 将来夜への申し送り | post のみ・連鎖続行。 申し送りは次の夜 md に転記 |

   全指摘が PASS、 または FIX が再レビューで解消した時のみ `gh pr merge --auto --merge --delete-branch` を設定する。 STOP が 1 件でもあれば auto-merge せず隔離。

   **FIX 修正は grep で一網打尽にする**: 1 箇所直したら同じパターン (誤ったコマンド・矛盾する記述・同根の設計漏れ) を `grep` で全文スキャンし、 同種箇所を同じ commit でまとめて潰す。 1 箇所ずつ直すと「同根の取りこぼし」 が次の round で新たな FIX として再浮上し、 修正往復 2 回の上限を無駄に消費する (実例: auto-merge 順序の自己矛盾を 3 箇所に分散して取りこぼし、 round-3 で STOP 隔離に至った)。

5. **triage 判断ログ**: 自走中に下した triage 判断は **該当 PR のコメント**に「指摘 Y → STOP/FIX/PASS と判断 (理由 Z)」 形式で記録し (PR が SSOT)、 朝石井が `gh pr view --comments` で裁定を追えるようにする。

### 各夜の終了処理

夜 N の PR に auto-merge を arm し handoff を書いたら、 **その夜のセッションを終える前に**以下を行う (この後 Stop hook → helper が `/clear` して次の夜へ連鎖する。 「/clear 自走ループ駆動」 参照):

1. `🎯 GOAL CONDITION MET: night N merged` を transcript に出力 (auto-merge arm まで完了の意)
2. **handoff を PR に書く (PR が SSOT)**: 「達成内容 / 困った点 / 朝レビュー向けメモ / 次の夜の前提条件」 を **該当夜の PR description かコメント**に書く。 `tmp/handoff/` のローカル md は gitignore で push されず二重管理になるため使わない
3. **`.claude/state/latest.md` を更新**: 次の夜番号+topic / nestest 到達行 / 進行中 PR / 連鎖プロトコル現在地。 `/clear` には PreCompact 相当の自動退避が無いので**手で書く** (SessionStart の clear matcher がこれを再注入する)
4. **次フラグを書く** (pane スコープ):
   - pending がまだ残る → 次ゴール文 (**単一行**) を `printf '...' > ".claude/state/loop-next.${TMUX_PANE#%}.txt"`
   - もう無い / 詰み → `printf 'STOP' > ".claude/state/loop-next.${TMUX_PANE#%}.txt"`
5. turn を終える → helper が idle を見て `/clear` → 次ゴール投入。 **fresh session 側**で `git checkout main && git pull` → `nights/pending/` 最若を読み next 夜ブランチ `night/NNN-<topic>` を切って着手 (「起動時の作法」 に従う)

次ゴール文の例 (単一行 必須): `次の pending 夜を CLAUDE.md 自走連鎖プロトコルに従い実装→PR→sub-agentレビュー→triage→全PASSなら auto-merge arm、完了後 latest.md 更新と次フラグ書込まで行え、or stop after 50 turns`

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

# 5. PR 作成 (この時点では auto-merge を打たない)
gh pr create \
  --base main \
  --title "夜 1: CPU スケルトン + nestest ハーネス" \
  --body "<夜md ベースの description + DoD チェック + メモ>"

# 6. sub-agent で PR をレビュー →  triage (「自走連鎖プロトコル > 夜 N PR の自動レビュー」 参照)
#    STOP 判定ゼロ (全 PASS、 または FIX が再レビューで解消) を確認してから auto-merge。
#    レビュー前に auto-merge を打つと CI がレビューを追い抜く (レース) ため厳禁。
gh pr merge --auto --merge --delete-branch
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
| `gh pr merge --auto --merge --delete-branch` | ○ |
| `gh pr merge` (--auto 無し) | ⚠ ask (CI 確認を飛ばすため) |
| `gh pr close` | ⚠ ask |
| `gh pr ready` / `gh pr edit --title\|--body` | ○ |
| `gh pr edit --base` | ⚠ ask (base 変更は意図的でないと危険) |
| `gh pr delete` | ✗ hook で deny |
| `gh repo delete` / `gh release delete` / `gh issue delete` | ✗ hook で deny |

### PR description のテンプレ

夜 N PR の description は、 該当 `nights/pending/NNN-<topic>.md` の「ゴール / DoD」 セクションをベースに完了チェックを `[x]` で埋める形。 PR メモ欄に詰みパターン・設計判断を書いておくと朝レビューしやすい。

### auto-merge の挙動

`gh pr merge --auto --merge --delete-branch` で立てた PR は、 必須 CI (nightly) が緑になった時点で自動的に **merge commit を作成して** main に合流 → night ブランチ自動削除される。 つまり Claude は `gh pr merge` を再実行しなくてよく、 CI が緑にならない限り merge は実行されない。

**マージ方式は merge commit (`--merge`) で固定**: squash でなく merge commit を使うのは、 `git log --graph` 上で「どの night ブランチがどこで main に合流したか」 が視覚的に追え、 各夜の作業コミット (feat/test 粒度) も履歴に残るため (朝レビュー・履歴追跡しやすさ優先)。 squash / rebase は使わない。

**auto-merge を打つタイミング**: sub-agent レビューの triage が完了し STOP 判定ゼロを確認した後に限る (「自走連鎖プロトコル > 夜 N PR の自動レビュー」 参照)。 レビュー前に打つと CI 緑がレビューを追い抜くレースが起きる。

詰まった場合は PR を draft に戻す (`gh pr ready --undo`) か、 ask 経由で close するか、 stuck/ 隔離フローに乗せる。

## 起動時の作法

0. **`gh pr list --state open --json number,title,isDraft` で未完了 PR を確認**。 open PR があれば **draft / 非 draft を問わず** その PR コメント (SSOT) を読み、 中断作業か判定する。 「レビュー未完」 or 「auto-merge 未設定で放置」 の PR は最優先で再開する (draft はレビュー隔離中、 非 draft の open はレビュー途中でセッションが切れた可能性)。 handoff は PR に集約しているため (後述)、 ここを飛ばすと中断が拾われない
1. `.claude/state/latest.md` が存在すれば Read (SessionStart hook が inject していなければ)
2. `nights/pending/` の最若番号の md を Read
3. 「## ゴール」セクションの /goal 条件を確認
4. 上記 PR フローに沿って `night/NNN-<topic>` ブランチを切ってから実装着手
5. ステップごとに `bun test` + `bunx tsc --noEmit` + `bunx eslint` を実行 (結果は出力リダイレクト)
6. /goal 評価のため、 pass / fail を必ず transcript に出力 (後述)
7. DoD を全部満たしたら `nights/pending/NNN.md → nights/done/NNN.md` の `git mv` も同じブランチで commit
8. `gh pr create` で PR を立てる (この時点では auto-merge を打たない)
9. sub-agent でレビュー → triage が STOP ゼロを確認してから `gh pr merge --auto --merge --delete-branch`
10. CI 緑 → auto-merge 反映を見届けてセッション完了報告

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

## Compact Instructions

auto-compact (~95% で不可避・無効化不可) や手動 `/compact` で会話履歴が要約される際、 **要約には以下を必ず保持すること**。 これらを失うと自走が空回りするため最優先で残す:

1. **アクティブな /goal 条件** (設定中なら全文)。 compaction でゴールを見失うと連鎖が停止・空回りする
2. **次にやる夜**: `nights/pending/` の最若番号の夜 md (番号 + topic)
3. **進行中の PR**: 番号・ブランチ名・sub-agent レビュー / triage の状態 (中断 PR があれば最優先で再開対象)
4. **nestest trace の現在の到達行数** (実装到達点。 例: 933 行)
5. **自走連鎖プロトコルの現在地**: どの夜まで done か、 次に seed すべき夜番号
6. **直近の未解決の設計判断・論点** (進行中のアーキ議論があれば)

compaction 後は SessionStart hook (matcher: compact) が `.claude/state/latest.md` も注入する。 本セクション (要約への保持指示) と hook (外部ファイルからの復元) の二層で state を保全し、 compaction を跨いでも自走が継続できるようにする。

### /clear 自走ループ駆動 (実装済み)

夜境界の context リセットは `/compact` ではなく **`/clear`** で行う。 handoff を PR + state ファイルに外出し済み (PR-as-SSOT) なので要約を残す意味がなく、 完全リセットの方が context 汚染ゼロ (Ralph の fresh-context 哲学に一致)。 公式ガイダンスも「新タスク=/clear / 同一会話継続=/compact」 で、 1 夜=新タスクに合致。

駆動機構は `.claude/hooks/` に実装済み。 **外部シェル常駐は不要** — フック自身が自己連鎖する:

- `stop-hook.sh` (Stop hook): worker が **pane スコープのフラグ** `.claude/state/loop-next.${TMUX_PANE#%}.txt` を書いたら、 進行役 `loop-helper.sh` を非同期 spawn して exit 0 (block しない)。 フラグ無しの発話終了は no-op
- `loop-helper.sh` (外部プロセス・/clear で生き残る): worker の idle を待ち → (任意で PR merge 待ち) → `/clear` → 次ゴールを send-keys
- `loop-session-restore.sh` (SessionStart `clear` matcher): /clear 後に `.claude/state/latest.md` を再注入して状態復元
- フラグ中身 = 次ゴール文 (単一行) なら次の夜へ連鎖 / `STOP` なら連鎖終了
- 暴走ブレーキ: `NIGHTOWL_LOOP_MAX` (既定 20) 回で自動停止。 worker がフリーズしても helper の idle タイムアウト (600s) で安全停止 (無限課金しない)
- カウンタが pane キーなのは `/clear` が session_id を変える (#20797) ため (session キーだと毎回リセットされ MAX が効かない)

**worker (= この Claude) が各夜末に必ず守る作法** (怠ると連鎖が止まる) は「各夜の終了処理」 参照。 起動は `/loop-start` スキル、 または最初の夜ゴールを手で投入。 以降は自己連鎖する。

既知の限界 (将来 hardening): idle 検出は画面マーカーのヒューリスティックで、 worker が長時間ツール実行中に誤判定すると /clear が作業中に走るリスクがある (Stop hook が turn 終了=idle を保証するため実運用では低リスクだが要 hardening)。

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
