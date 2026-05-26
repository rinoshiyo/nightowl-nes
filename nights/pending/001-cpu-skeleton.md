# 夜 1: CPU スケルトン + nestest ハーネス雛形

## ゴール (/goal)

```
/goal bun test exits 0 with cpu_nestest test passing first instruction LDX 0xA2, and bunx tsc --noEmit exits 0, or stop after 25 turns
```

## 前提

- package.json / tsconfig.json が初期化済み (夜 0 = 石井の手動準備で完了)
- roms/test/ に nes-test-roms submodule が clone 済み
- roms/test/other/nestest.nes が存在 (パスは `roms/test/` 配下にある nestest.nes を find で確認)

## 実装ステップ

1. `src/core/cpu/index.ts` に `Cpu` interface (型) と `createCpu()` factory
   - register: A / X / Y / SP / PC / status (P)
   - cycles 累積カウンタ
2. `src/core/cpu/flags.ts` に `CpuFlags` 定数 (C / Z / I / D / B / U / V / N) と set/clear/has util
3. `src/core/bus.ts` に `Bus` interface (read(addr: number): number / write(addr: number, value: number): void)
4. `src/core/cart.ts` に iNES ヘッダパーサ (16 byte ヘッダのみ、 prg/chr バンクサイズと mapper 番号抽出)
5. `tests/cpu_nestest.test.ts` で nestest.nes 読み込み + 簡易 Bus で PRG を 0xC000 にマップ + PC=0xC000 で 1 命令 fetch + 0xA2 (LDX immediate) を expect
6. `bun test` で pass 確認

## 検証チャンネル (transcript 出力ルール)

- 成功時: `✅ PASS: cpu_nestest first instruction is LDX 0xA2`
- TypeScript 型チェック成功時: `✅ TYPECHECK: clean`
- 失敗時: `❌ FAIL: <reason>` を 1 行で出力

## 詰まったら (nesdev wiki のみ参照)

- iNES ヘッダ仕様: https://www.nesdev.org/wiki/INES
- 6502 命令一覧: https://www.nesdev.org/wiki/CPU
- PC=0xC000 が automated entry point (通常起動なら 0xC004)。 nestest は automated モードで自走するため 0xC000 から開始する

## コミット粒度 (Conventional Commits)

- `chore: align tsconfig with design v2 strict requirements`
- `feat(core/cpu): add Cpu type and createCpu factory`
- `feat(core/cpu): add CpuFlags constants and util`
- `feat(core/bus): add Bus interface`
- `feat(core/cart): add iNES header parser`
- `test(core/cpu): add nestest harness loading first instruction`

最低 3 commit、 構造的に分けることが目的。

## DoD (完了条件、 /goal 条件と同期)

- [ ] `src/core/cpu/index.ts` に `Cpu` 型と `createCpu` factory が存在
- [ ] `src/core/cpu/flags.ts` に `CpuFlags` 定数と util が存在
- [ ] `src/core/bus.ts` に `Bus` interface が存在
- [ ] `src/core/cart.ts` に iNES ヘッダパーサが存在
- [ ] `tests/cpu_nestest.test.ts` が pass する
- [ ] `bun test` exit 0
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint src tests` 警告ゼロ
- [ ] git log に最低 3 コミット
- [ ] このファイルを `nights/done/001-cpu-skeleton.md` に `git mv`

## 詰みパターン参考 (設計書 §9.4)

1. `nestest.nes` の `PC=0xC000 vs 0xC004` の罠 — automated 用は 0xC000 開始
2. iNES ヘッダの mapper 番号は flags6 上位 4bit + flags7 上位 4bit。 NROM (0) を想定して進める
3. 命令 fetch だけなら Bus は読みのみ対応で OK。 書き込みは後の夜
