# 夜 037: CPU IRQ ハンドリング + APU IRQ 伝達

## ゴール (/goal)

```
/goal night/037-cpu-irq ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/037-cpu-irq.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 037 merged`

## 前提

- 夜 036 done: APU 全 5 チャンネル実装済み (Pulse1, Pulse2, Triangle, Noise, DMC)
- CPU に `nmiPending` フラグと NMI ハンドラ (`handleNmi` in `cpu/step.ts`) が存在する
- APU にフレーム IRQ フラグ (`frameIrqFlag`) と DMC IRQ フラグ (`dmc.irqFlag`) があるが CPU への伝達経路がない
- CPU の I フラグ (`CpuFlags.I`) は存在するが IRQ マスクとして使われていない
- nestest trace テスト全 8991 行完走済み (TRACE_LINES 変更なし)
- 仕様参照:
  - https://www.nesdev.org/wiki/CPU_interrupts
  - https://www.nesdev.org/wiki/APU_Frame_Counter
  - https://www.nesdev.org/wiki/APU_DMC

## ブランチ運用

`night/037-cpu-irq` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 設計概要

### IRQ ハンドリングの仕様 (6502)

- IRQ は **I フラグがクリアされている時のみ** 受け付ける (NMI は無条件)
- NMI と IRQ が同時に保留の場合、**NMI が優先**
- IRQ ハンドラの動作は NMI とほぼ同一:
  1. PC (hi, lo) をスタックに push
  2. P (B=0, U=1) をスタックに push
  3. I フラグをセット (以降の IRQ をマスク)
  4. IRQ ベクタ ($FFFE/$FFFF) から PC をロード
  5. 7 CPU cycle 消費
- IRQ は**レベルトリガ** — ソースがアサートし続ける限り、ハンドラ復帰後に再度発火する

### CPU への変更

1. `Cpu` interface に `irqPending: boolean` を追加
2. `createCpu` のデフォルト値に `irqPending: false` を追加
3. `cpu/step.ts` に `handleIrq` 関数を追加 (NMI と同構造、ベクタが $FFFE/$FFFF)
4. `cpuStep` の先頭で NMI チェック後に IRQ チェック (`!I フラグ && irqPending`)

### APU → CPU の IRQ 伝達

- `Apu` にコールバック `onIrq?: () => void` を追加
- `tickFrameCounter` で `frameIrqFlag` が true になった時にコールバック発火
- `DmcChannel.tickTimer` で `irqFlag` が true になった時にコールバック発火
- `NesConsole` のコンストラクタで `apu.onIrq = () => { this.cpu.irqPending = true; }` を接続

### IRQ のポーリングモデル (レベルトリガ)

IRQ はレベルトリガのため、`cpu.irqPending` を毎 step でソースの状態から再計算するのが正確。
ただし cycle-accurate でないため、簡易方式を採用:
- APU が IRQ フラグをセットした瞬間に `onIrq` コールバックで `cpu.irqPending = true` をセット
- IRQ ハンドラ実行時は `irqPending` をクリアしない (レベルトリガ模倣)
- 代わりに `NesConsole.step()` の末尾で IRQ ソースを再評価:
  `cpu.irqPending = apu.frameIrqFlag || apu.dmc.irqFlag`
  これにより IRQ ソースがクリアされれば `irqPending` も落ちる

### CLI/RTI との関連

- `CLI` (既存実装): I フラグクリア → 次の命令で IRQ がペンディングなら発火
- `RTI` (既存実装): P をスタックから復元 → I がクリアされれば IRQ 発火可能に
- `SEI` (既存実装): I フラグセット → IRQ マスク
- 既存命令は変更不要 (I フラグの操作のみで、IRQ チェックは `cpuStep` 先頭で行う)

## サブゴール

1. **G1: CPU IRQ ハンドラ** — `Cpu` に `irqPending` 追加、`cpu/step.ts` に `handleIrq` 実装、`cpuStep` で NMI 後 IRQ チェック追加
2. **G2: APU IRQ 伝達** — `Apu` に `onIrq` コールバック追加、フレーム IRQ / DMC IRQ 発火時に呼び出し。`NesConsole` で接続し `step()` 末尾で IRQ ソース再評価
3. **G3: reset() での IRQ 状態クリア** — `NesConsole.reset()` で `irqPending = false`、APU の IRQ フラグもクリア
4. **G4: テスト** — IRQ ハンドラの基本動作、I フラグマスク、NMI 優先、APU フレーム IRQ 伝達、DMC IRQ 伝達、RTI 後の IRQ 再発火、$4015 読み出しでフレーム IRQ クリア後の irqPending 再評価

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/037-cpu-irq`
3. G1: `src/core/cpu/index.ts` に `irqPending` 追加 + `src/core/cpu/step.ts` に IRQ ハンドラ
4. G2: `src/core/apu.ts` に `onIrq` コールバック + `src/core/console.ts` で接続 + step() 末尾の IRQ ソース再評価
5. G3: `src/core/console.ts` の `reset()` で IRQ 状態クリア
6. G1-G3: `bun test` で既存テスト全 pass 確認
7. G4: `tests/core/cpu-irq.test.ts` にテスト作成
8. G4: `bun test` + `bunx tsc --noEmit` + `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0`
9. `git mv nights/pending/037-cpu-irq.md nights/done/037-cpu-irq.md`
10. `git push -u origin night/037-cpu-irq`
11. `gh pr create`
12. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル

- テスト pass: `✅ PASS: <test_name>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 037 merged`

## コミット粒度 (Conventional Commits)

- `feat(core): CPU IRQ ハンドリング追加`
- `feat(core): APU IRQ を CPU に伝達`
- `refactor(core): reset() で IRQ 状態をクリア`
- `test(core): CPU IRQ テスト`
- `chore(nights): 037 を done に移動`

最低 5 commit。

## DoD (完了条件)

- [ ] `night/037-cpu-irq` ブランチで作業
- [ ] `Cpu` interface に `irqPending: boolean` が追加されている
- [ ] `createCpu` のデフォルト値に `irqPending: false` が含まれる
- [ ] `handleIrq` が IRQ ベクタ ($FFFE/$FFFF) から PC をロードする
- [ ] `handleIrq` が PC (hi/lo) と P (B=0, U=1) をスタックに push する
- [ ] `handleIrq` が I フラグをセットする
- [ ] `handleIrq` が 7 CPU cycle 消費する
- [ ] `cpuStep` で NMI が IRQ より優先される
- [ ] I フラグがセットされている時に IRQ がマスクされる
- [ ] I フラグがクリアの時に `irqPending` が true なら IRQ ハンドラが実行される
- [ ] `irqPending` は IRQ ハンドラ実行時にクリアされない (レベルトリガ)
- [ ] `Apu` に `onIrq` コールバックが存在する
- [ ] フレームカウンタ 4-step モードの step 3 で `frameIrqFlag` セット時に `onIrq` が呼ばれる
- [ ] DMC の `irqFlag` セット時に `onIrq` が呼ばれる
- [ ] `NesConsole` のコンストラクタで `apu.onIrq` が CPU の `irqPending` をセットするよう接続されている
- [ ] `NesConsole.step()` の末尾で `cpu.irqPending` が APU IRQ ソースから再評価される
- [ ] IRQ ソースがクリアされると `irqPending` が false になる
- [ ] `NesConsole.reset()` で `cpu.irqPending` が false にクリアされる
- [ ] `NesConsole.reset()` で APU の `frameIrqFlag` が false にクリアされる
- [ ] CLI 後に IRQ がペンディングなら次命令で IRQ が発火する (既存 CLI 実装で自然に動作)
- [ ] RTI で P が復元され I がクリアされていれば IRQ が発火可能になる (既存 RTI 実装で自然に動作)
- [ ] SEI で IRQ がマスクされる (既存 SEI 実装で自然に動作)
- [ ] $4015 読み出しでフレーム IRQ フラグがクリアされ、`step()` 末尾の再評価で `irqPending` も落ちる
- [ ] 既存の nestest trace テスト pass (TRACE_LINES = 8991)
- [ ] 既存の APU テスト (パルス・トライアングル・ノイズ・DMC) が全 pass
- [ ] 既存の PPU テスト (背景・スプライト・スクロール) が全 pass
- [ ] CPU IRQ テストが pass
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 5 commit
- [ ] `nights/pending/037-cpu-irq.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 実装上の注意

- IRQ ハンドラは NMI ハンドラとほぼ同一のロジック。ベクタアドレスのみ異なる ($FFFA→$FFFE)
- IRQ はレベルトリガなので、ハンドラ内で `irqPending` を false にしない。IRQ ソースがクリアされるまでアサートし続ける
- `step()` 末尾での再評価が重要: `$4015` 読み出しで `frameIrqFlag` がクリアされても、`irqPending` は `step()` が終わるまで残り、次の `step()` 先頭で再評価される
- NMI と IRQ が同時保留の場合は NMI 優先。IRQ は次の `cpuStep` 呼び出しまで保留される
- 既存の CLI/SEI/RTI は I フラグを操作するだけなので変更不要
- BRK 命令 (既存) は B フラグをセットして IRQ ベクタを読む。BRK と外部 IRQ はベクタが同じ ($FFFE/$FFFF) だが、スタック上の B フラグで区別可能。BRK は既存実装のまま変更不要

## 詰まったら

- nesdev wiki CPU interrupts: https://www.nesdev.org/wiki/CPU_interrupts
- nesdev wiki APU Frame Counter: https://www.nesdev.org/wiki/APU_Frame_Counter
- nesdev wiki APU DMC: https://www.nesdev.org/wiki/APU_DMC

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
