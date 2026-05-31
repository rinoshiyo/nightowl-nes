# 夜 NNN: <タイトル (1 行)>

> このファイルはテンプレ。 新しい夜を起こすときは `nights/pending/NNN-<topic>.md` にコピーして全項目を埋める。 `NNN` は 3 桁ゼロパディング (例: `002`、 `012`)。 `<topic>` は kebab-case (例: `cpu-decode-and-instructions`)。

## ゴール (/goal)

```
/goal night/NNN-<topic> ブランチで実装し、 nightly CI 緑、 PR が auto-merge 設定済みで main に merge commit 完了、 nights/pending/NNN-<topic>.md が nights/done/ に移動済み、 or stop after <N> turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night NNN merged`

## 前提

- 直近 done 夜の DoD 達成済み (依存があれば具体的に列挙)
- 必要な仕様書リンク (nesdev wiki のみ、 既存実装は参照禁止)

## ブランチ運用

`night/NNN-<topic>` ブランチを切って実装、 完了時に PR を auto-merge で立てる。 main 直 push は hook で deny される。 連鎖中の他夜と分離。

## サブゴール (1 夜を 3-5 段階に分解)

1. **G1: <サブゴール 1 名>** — <2-3 行の内容説明>
2. **G2: <サブゴール 2 名>** — <2-3 行>
3. **G3: <サブゴール 3 名>** — <2-3 行>
4. (任意) **G4 / G5**

各サブゴールは独立 commit 単位を想定 (Conventional Commits)。

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/NNN-<topic>`
3. 最初の commit 後に `git push -u origin night/NNN-<topic>` → `gh pr create --draft --base main --title "夜 NNN: <題目>"` (PR が SSOT)
4. G1 に対応する src/* / tests/* を作成 → `bun test` + `bunx tsc --noEmit` + `bunx eslint` で都度確認
5. G1 を commit (`feat(<scope>): <題目>`)
6. G2 / G3 / ... を同様に
7. `bun test` 全 pass / `bunx tsc --noEmit` 警告ゼロ / `bunx eslint src tests` 警告ゼロ
8. `git mv nights/pending/NNN-<topic>.md nights/done/NNN-<topic>.md` を同じブランチで commit
9. `gh pr ready` で draft 解除 (auto-merge はまだ打たない)
10. `gh pr merge --auto --merge --delete-branch`
11. CI 緑 → main 自動反映を `gh pr view <PR#> --json state,mergedAt` で確認

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: <test_name>`
- テスト fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- auto-merge 設定: `⏳ AUTO-MERGE ARMED: CI 緑判定待ち`
- main merge 確認: `🎯 GOAL CONDITION MET: night NNN merged`

## PR body テンプレ

```markdown
## ゴール
nights/pending/NNN-<topic>.md の DoD 全項目達成

## DoD チェック
- [x] <DoD 項目を全部チェック付きで列挙>

## サブゴール達成状況
- [x] G1: <内容>
- [x] G2: <内容>
- [x] G3: <内容>

## 困った点・設計判断
(あれば箇条書きで)

## 次の夜の前提条件 (連鎖時の引き継ぎメモ)
- <次の夜 md で前提にできる事実>
```

## 詰まったら (nesdev wiki のみ参照)

- <仕様書 URL を 2-3 個列挙>

30 分以上同じエラーで詰んだら:
1. このファイルを `nights/stuck/NNN-<topic>-stuck.md` に rename (md 内に詰み report 追記)
2. PR を draft に戻す (`gh pr ready --undo`) か、 ask 経由で close
3. 朝石井判断待ち
4. 連鎖中の場合、 stuck 隔離後はセッション終了 (次の夜には進まない)

## コミット粒度 (Conventional Commits)

- 各サブゴール 1 commit が原則。 加えて test commit と nights/done 移動 commit。
- 例: `feat(core/cpu): <内容>` / `test(core/cpu): <内容>` / `chore(nights): move NNN to done`
- 最低 3 commit、 構造的に分けることが目的

## DoD (完了条件、 /goal 条件と同期)

20-40 項目程度に膨らませる。 例:

- [ ] `night/NNN-<topic>` ブランチで作業
- [ ] G1: <観測可能な完了条件>
- [ ] G2: <観測可能な完了条件>
- [ ] G3: <観測可能な完了条件>
- [ ] `npx vitest run` exit 0
- [ ] `npx tsc --noEmit` 警告ゼロ
- [ ] `npx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 5 コミット
- [ ] `nights/pending/NNN-<topic>.md` を `nights/done/NNN-<topic>.md` に `git mv`
- [ ] PR が立っており、 `gh pr merge --auto --merge --delete-branch` で auto-merge 設定済み
- [ ] nightly CI 緑判定後 main に merge commit 反映済み

## 詰みパターン参考

- <既知の罠を箇条書き>
