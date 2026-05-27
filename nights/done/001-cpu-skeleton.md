# 夜 1: CPU スケルトン + nestest ハーネス雛形

## ゴール (/goal)

```
/goal night/001-cpu-skeleton ブランチで実装し、 nightly CI 緑、 PR が auto-merge 設定済みで main に merge commit 完了、 nights/pending/001-cpu-skeleton.md が nights/done/ に移動済み、 or stop after 25 turns
```

evaluator が「PR merge 状態」 を判定しやすいよう、 完了時には transcript に `🎯 GOAL CONDITION MET: night 001 merged` を必ず出力する。

## 前提

- package.json / tsconfig.json が初期化済み (dev0 で完了)
- roms/test/ に nes-test-roms submodule が clone 済み
- roms/test/other/nestest.nes が存在 (パスは `find roms/test -name "nestest.nes"` で確認)
- 現在のブランチは main (`git checkout main && git pull` で同期)

## ブランチ運用 (CLAUDE.md 参照)

`night/001-cpu-skeleton` ブランチを切って実装、 完了時に PR を auto-merge で立てる。 main 直 push は hook で deny される。

## 実装ステップ

1. `git checkout -b night/001-cpu-skeleton`
2. `src/core/cpu/index.ts` に `Cpu` interface (型) と `createCpu()` factory
   - register: A / X / Y / SP / PC / status (P)
   - cycles 累積カウンタ
3. `src/core/cpu/flags.ts` に `CpuFlags` 定数 (C / Z / I / D / B / U / V / N) と set/clear/has util
4. `src/core/bus.ts` に `Bus` interface (read(addr: number): number / write(addr: number, value: number): void)
5. `src/core/cart.ts` に iNES ヘッダパーサ (16 byte ヘッダのみ、 prg/chr バンクサイズと mapper 番号抽出)
6. `tests/cpu_nestest.test.ts` で nestest.nes 読み込み + 簡易 Bus で PRG を 0xC000 にマップ + PC=0xC000 で 1 命令 fetch + 0xA2 (LDX immediate) を expect
7. `bun test` で pass 確認、 `bunx tsc --noEmit` 警告ゼロ、 `bunx eslint src tests` 警告ゼロ
8. `git mv nights/pending/001-cpu-skeleton.md nights/done/001-cpu-skeleton.md` も同じブランチで commit
9. `git push -u origin night/001-cpu-skeleton`
10. `gh pr create --base main --title "夜 1: CPU スケルトン + nestest ハーネス" --body "<PR body テンプレ参照>"`
11. `gh pr merge --auto --merge --delete-branch` で auto-merge 設定
12. CI 緑判定 → main 自動反映を待つ (`gh pr checks` / `gh pr view` で確認)

## 検証チャンネル (transcript 出力ルール)

- 成功時: `✅ PASS: cpu_nestest first instruction is LDX 0xA2`
- TypeScript 型チェック成功時: `✅ TYPECHECK: clean`
- PR 作成時: `🔀 PR OPENED: <URL>`
- auto-merge 設定時: `⏳ AUTO-MERGE ARMED: CI 緑判定待ち`
- main merge 確認時: `🎯 GOAL CONDITION MET: night 001 merged`
- 失敗時: `❌ FAIL: <reason>` を 1 行で出力

## PR body テンプレ

```markdown
## ゴール
nights/pending/001-cpu-skeleton.md の DoD 全項目達成

## DoD チェック
- [x] src/core/cpu/index.ts に Cpu 型 + createCpu factory
- [x] src/core/cpu/flags.ts に CpuFlags 定数 + util
- [x] src/core/bus.ts に Bus interface
- [x] src/core/cart.ts に iNES ヘッダパーサ
- [x] tests/cpu_nestest.test.ts が pass
- [x] bun test exit 0
- [x] bunx tsc --noEmit 警告ゼロ
- [x] bunx eslint 警告ゼロ
- [x] git log に最低 3 commit
- [x] nights/pending/001-cpu-skeleton.md → nights/done/ に git mv

## 困った点・設計判断
(あれば箇条書きで)
```

## 詰まったら (nesdev wiki のみ参照)

- iNES ヘッダ仕様: https://www.nesdev.org/wiki/INES
- 6502 命令一覧: https://www.nesdev.org/wiki/CPU
- PC=0xC000 が automated entry point (通常起動なら 0xC004)。 nestest は automated モードで自走するため 0xC000 から開始する

30 分以上同じエラーで詰んだら:
1. このファイルを `nights/stuck/001-cpu-skeleton-stuck.md` に rename (md 内に詰み report 追記)
2. PR を draft に戻す (`gh pr ready --undo`) か、 ask 経由で close
3. 朝石井判断待ち

## コミット粒度 (Conventional Commits)

- `feat(core/cpu): add Cpu type and createCpu factory`
- `feat(core/cpu): add CpuFlags constants and util`
- `feat(core/bus): add Bus interface`
- `feat(core/cart): add iNES header parser`
- `test(core/cpu): add nestest harness loading first instruction`
- `chore(nights): move 001 to done`

最低 3 commit、 構造的に分けることが目的。

## DoD (完了条件、 /goal 条件と同期)

- [ ] `night/001-cpu-skeleton` ブランチで作業
- [ ] `src/core/cpu/index.ts` に `Cpu` 型と `createCpu` factory が存在
- [ ] `src/core/cpu/flags.ts` に `CpuFlags` 定数と util が存在
- [ ] `src/core/bus.ts` に `Bus` interface が存在
- [ ] `src/core/cart.ts` に iNES ヘッダパーサが存在
- [ ] `tests/cpu_nestest.test.ts` が pass する
- [ ] `bun test` exit 0
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint src tests` 警告ゼロ
- [ ] git log に最低 3 コミット
- [ ] `nights/pending/001-cpu-skeleton.md` を `nights/done/001-cpu-skeleton.md` に `git mv`
- [ ] PR が立っており、 `gh pr merge --auto --merge --delete-branch` で auto-merge 設定済み
- [ ] nightly CI 緑判定後 main に merge commit 反映済み

## 詰みパターン参考

1. `nestest.nes` の `PC=0xC000 vs 0xC004` の罠 — automated 用は 0xC000 開始
2. iNES ヘッダの mapper 番号は flags6 上位 4bit + flags7 上位 4bit。 NROM (0) を想定して進める
3. 命令 fetch だけなら Bus は読みのみ対応で OK。 書き込みは後の夜
4. nightly CI が paths filter のため、 src/ tests/ にコードが入る最初の push で初発火する。 ローカルで bun test 通してから push する
