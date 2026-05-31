# 夜 035: APU ノイズチャンネル

## ゴール (/goal)

```
/goal night/035-apu-noise ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/035-apu-noise.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 035 merged`

## 前提

- 夜 034 done: APU フレームワーク + パルス波 2ch + トライアングルが実装済み
- nestest trace 全 8991 行完走 (TRACE_LINES 変更なし)
- Apu クラスに pulse1/pulse2/triangle が存在し、フレームカウンタ (4-step/5-step) が動作する
- Envelope クラス (`apu-envelope.ts`) と LENGTH_TABLE (`apu-length.ts`) が既に存在し、パルスとトライアングルで利用中
- ミキサーは pulse_out + tnd_out の分離方式。tnd_out は現在 triangle のみ: `159.79 / (1 / (tri/8227) + 100)`
- $400C-$400F は現在未処理、$4015 の bit3 (noise) も未使用
- 仕様参照:
  - https://www.nesdev.org/wiki/APU_Noise
  - https://www.nesdev.org/wiki/APU_Length_Counter
  - https://www.nesdev.org/wiki/APU_Frame_Counter
  - https://www.nesdev.org/wiki/APU_Mixer

## ブランチ運用

`night/035-apu-noise` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 設計概要

### ノイズチャンネルの特徴

パルスチャンネルとの類似・相違:
- **エンベロープあり** — パルスと同じ `Envelope` クラスを再利用。$400C の構造は $4000 と同一
- **長さカウンタあり** — パルスと同じパターン。$400F 上位 5bit でロード
- **スイープなし** — パルス固有の機能
- **LFSR (Linear Feedback Shift Register)** — 15-bit のシフトレジスタでノイズを生成。パルスのデューティシーケンサに代わる固有機構
- **タイマー周期はルックアップテーブル** — $400E 下位 4bit を NTSC 16 エントリテーブルのインデックスとして使用 (パルスのように直接 11-bit 値をセットするのではない)
- **タイマーは 2 CPU cycle ごと** — パルスと同じ APU cycle レート (トライアングルの毎 CPU cycle とは異なる)

### NoiseChannel (src/core/apu-noise.ts)

```typescript
export class NoiseChannel {
  /** LFSR (15-bit, 初期値 1) */
  shiftRegister: number;
  /** LFSR モード (false=mode0: bit1 XOR, true=mode1: bit6 XOR) */
  mode: boolean;

  /** タイマー周期 (NTSC テーブルから取得) */
  timerPeriod: number;
  /** タイマー現在値 */
  timerValue: number;

  /** 長さカウンタ */
  lengthCounter: number;
  /** 長さカウンタ halt (= エンベロープ loop と共用) */
  lengthHalt: boolean;
  /** エンベロープ (Envelope クラスを再利用) */
  readonly envelope: Envelope;
  /** チャンネル有効フラグ ($4015 bit3) */
  enabled: boolean;

  tickTimer(): void;   // 2 CPU cycle ごと (パルスと同タイミング)
  tickLength(): void;  // Half Frame
  output(): number;    // 0-15

  writeControl(value: number): void;    // $400C
  writePeriod(value: number): void;     // $400E
  writeLengthLoad(value: number): void; // $400F
}
```

### LFSR 動作

```
タイマーが 0 に達するたびに:
  feedback = bit0 XOR (mode==0 ? bit1 : bit6)
  shiftRegister >>= 1
  shiftRegister |= (feedback << 14)
```

- モード 0: bit0 XOR bit1 → 32,767 ステップの疑似ランダムノイズ
- モード 1: bit0 XOR bit6 → 93 ステップの周期的金属音

### NTSC タイマー周期テーブル (16 エントリ)

```
4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068
```

$400E の下位 4bit がインデックス。

### Apu への統合

- `Apu.noise` を追加
- `tick()` 内で cpuCycleOdd 時に `noise.tickTimer()` を呼ぶ (パルスと同タイミング)
- `clockQuarterFrame()` で `noise.envelope.tick()` を呼ぶ
- `clockHalfFrame()` で `noise.tickLength()` を呼ぶ
- `write()` の $400C/$400E/$400F を処理
- `writeStatus()` の bit3 で noise の enable/disable
- `read()` ($4015) で bit3 を noise の長さカウンタ状態に反映

### ミキサーの拡張

既存の tnd_out 計算に noise を追加:
```
tndSum = tri / 8227 + noise / 12241    // 将来: + dmc / 22638
tnd_out = 159.79 / (1 / tndSum + 100)  (tndSum > 0 の時)
```

## サブゴール

1. **G1: NoiseChannel クラス実装** — `src/core/apu-noise.ts` に LFSR (15-bit) + タイマー周期テーブル + エンベロープ (Envelope 再利用) + 長さカウンタ。レジスタ write ($400C/$400E/$400F)
2. **G2: Apu 統合** — Apu に noise を追加。tick() での APU cycle timer tick、フレームカウンタ連動 (Quarter/Half)、$4015 read/write の bit3 対応
3. **G3: ミキサー拡張** — tnd_out に noise/12241 を追加
4. **G4: テスト** — LFSR 動作 (モード 0/1)、タイマー周期テーブル、エンベロープ連携、長さカウンタ、$4015 による enable/disable、ミュート条件のテスト

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/035-apu-noise`
3. G1: `src/core/apu-noise.ts` に NoiseChannel 実装
4. G2: `src/core/apu.ts` に noise を統合 (tick/フレームカウンタ/レジスタ)
5. G2: `bun test` で既存テスト全 pass 確認
6. G3: ミキサーの tnd_out に noise 項を追加
7. G4: `tests/core/apu-noise.test.ts` にテスト作成
8. G4: `bun test` + `bunx tsc --noEmit` + `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0`
9. `git mv nights/pending/035-apu-noise.md nights/done/035-apu-noise.md`
10. `git push -u origin night/035-apu-noise`
11. `gh pr create`
12. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル

- テスト pass: `✅ PASS: <test_name>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 035 merged`

## コミット粒度 (Conventional Commits)

- `feat(core): APU ノイズチャンネル実装`
- `refactor(core): APU ミキサーに noise 項を追加`
- `test(core): APU ノイズチャンネルテスト`
- `chore(nights): 035 を done に移動`

最低 4 commit。

## DoD (完了条件)

- [ ] `night/035-apu-noise` ブランチで作業
- [ ] `src/core/apu-noise.ts` に NoiseChannel クラスが存在する
- [ ] LFSR が 15-bit で初期値 1 に設定されている
- [ ] LFSR のモード 0: bit0 XOR bit1 のフィードバックが正しい
- [ ] LFSR のモード 1: bit0 XOR bit6 のフィードバックが正しい
- [ ] LFSR がタイマー clock ごとに右シフトし bit14 にフィードバックをセットする
- [ ] NTSC タイマー周期テーブル (16 エントリ) が nesdev wiki と一致する
- [ ] $400E 下位 4bit がテーブルインデックスとして使われる
- [ ] $400E bit7 が LFSR モードフラグとして使われる
- [ ] タイマーが APU cycle (2 CPU cycle) ごとに tick する
- [ ] Envelope クラスを再利用している (新規エンベロープ実装をしていない)
- [ ] $400C の構造が正しい: bit5=lengthHalt/envelopeLoop, bit4=constantVolume, bit3-0=volume
- [ ] $400F 書き込みで長さカウンタがロードされる (enabled 時のみ)
- [ ] $400F 書き込みでエンベロープの start フラグがセットされる
- [ ] 長さカウンタが Half Frame でデクリメントする
- [ ] lengthHalt が true の時、長さカウンタがデクリメントしない
- [ ] 長さカウンタが 0 でチャンネル出力が 0 になる
- [ ] LFSR の bit0 が 1 でチャンネル出力が 0 になる
- [ ] LFSR bit0=0 かつ lengthCounter>0 の時、エンベロープ出力 (0-15) が返る
- [ ] $4015 書き込みの bit3 で noise の enable/disable が切り替わる
- [ ] disable 時に長さカウンタが 0 になる
- [ ] $4015 読み出しの bit3 で noise の長さカウンタ > 0 が返る
- [ ] Apu.tick() で cpuCycleOdd 時に noise.tickTimer() が呼ばれる
- [ ] Apu.clockQuarterFrame() で noise.envelope.tick() が呼ばれる
- [ ] Apu.clockHalfFrame() で noise.tickLength() が呼ばれる
- [ ] ミキサーの tnd_out に noise/12241 が加算されている
- [ ] noise 出力が 0 の時、tnd_out の noise 項が 0 になる
- [ ] 既存の nestest trace テスト pass (TRACE_LINES = 8991)
- [ ] 既存のパルスチャンネルテストが全 pass
- [ ] 既存のトライアングルチャンネルテストが全 pass
- [ ] 既存の PPU テスト (背景・スプライト・スクロール) が全 pass
- [ ] APU ノイズテストが pass
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 4 commit
- [ ] `nights/pending/035-apu-noise.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 実装上の注意

- LFSR の初期値は 1 (0 だと XOR が常に 0 で動かなくなる)
- LFSR の bit0 が 1 = 出力 0 (ミュート)。bit0 が 0 の時だけエンベロープ出力を返す
- $400C の bit5 は lengthHalt と envelope.loop の**両方**を制御する (パルスの $4000 と同じ)
- タイマー周期はレジスタ値から直接計算するのではなく、必ずルックアップテーブルを経由する
- noise のタイマーは APU cycle (2 CPU cycle ごと) でパルスと同じ。トライアングルの毎 CPU cycle とは異なる
- $400D は未使用 (ノイズには 2 番目のレジスタがない)
- 将来の DMC 追加に備えて tnd_out の計算式は `dmc/22638` を 0 として省略しつつ、コメントで完全な式を残す

## 詰まったら

- nesdev wiki APU Noise: https://www.nesdev.org/wiki/APU_Noise
- nesdev wiki APU Length Counter: https://www.nesdev.org/wiki/APU_Length_Counter
- nesdev wiki APU Frame Counter: https://www.nesdev.org/wiki/APU_Frame_Counter
- nesdev wiki APU Mixer: https://www.nesdev.org/wiki/APU_Mixer
- nesdev wiki APU Envelope: https://www.nesdev.org/wiki/APU_Envelope

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
