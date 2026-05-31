# 夜 033: APU フレームワーク + パルス波チャンネル

## ゴール (/goal)

```
/goal night/033-apu-pulse ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/033-apu-pulse.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 033 merged`

## 前提

- 夜 032 done: Mapper 抽象化 (NROM + UxROM) 実装済み
- nestest trace 全 8991 行完走 (TRACE_LINES 変更なし)
- NesBus の $4000-$4017 は `apuIo` byte 配列で stub 中 — APU レジスタの read/write を本物に置き換える
- 技術スタック: Web Audio API (ブラウザ側)、 core 側は platform-agnostic
- 仕様参照: https://www.nesdev.org/wiki/APU / https://www.nesdev.org/wiki/APU_Pulse / https://www.nesdev.org/wiki/APU_Frame_Counter / https://www.nesdev.org/wiki/APU_Envelope

## ブランチ運用

`night/033-apu-pulse` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 設計概要

### APU アーキテクチャ

NES APU は CPU クロックに同期して動作する。フレームカウンタが 240Hz (4-step) / 192Hz (5-step) でエンベロープ・長さカウンタ・スイープを駆動する。

```
CPU tick → APU.tick()
         ├── フレームカウンタ step
         │   ├── エンベロープ clock (Quarter Frame)
         │   ├── 長さカウンタ clock (Half Frame)
         │   └── スイープ clock (Half Frame)
         └── パルスタイマー tick (毎 2 CPU cycle)
```

### Apu クラス (src/core/apu.ts)

```typescript
export class Apu {
  readonly pulse1: PulseChannel;
  readonly pulse2: PulseChannel;

  /** フレームカウンタモード (0 = 4-step, 1 = 5-step) */
  frameMode: number;
  /** フレームカウンタの CPU サイクルカウント */
  frameCycle: number;
  /** IRQ 禁止フラグ */
  frameIrqInhibit: boolean;
  /** フレーム IRQ フラグ */
  frameIrqFlag: boolean;
  /** $4015 ステータス (各チャンネルの有効/無効) */
  status: number;

  tick(cpuCycles: number): void;
  read(addr: number): number;   // $4015 のみ
  write(addr: number, value: number): void;  // $4000-$4017

  /** 出力サンプル取得 (0.0 ~ 1.0) — ブラウザ側が呼ぶ */
  output(): number;
}
```

### PulseChannel (src/core/apu-pulse.ts)

```typescript
export class PulseChannel {
  /** デューティ比 (0-3 → 12.5%, 25%, 50%, 75%) */
  duty: number;
  /** デューティサイクル位置 (0-7) */
  dutyPos: number;
  /** タイマー周期 (11bit) */
  timerPeriod: number;
  /** タイマー現在値 */
  timerValue: number;
  /** 長さカウンタ */
  lengthCounter: number;
  /** 長さカウンタ halt (= エンベロープループ) */
  lengthHalt: boolean;
  /** エンベロープ */
  envelope: Envelope;
  /** スイープユニット */
  sweep: SweepUnit;
  /** チャンネル有効フラグ ($4015) */
  enabled: boolean;

  tickTimer(): void;       // 毎 2 CPU cycle
  tickLength(): void;      // Half Frame
  tickSweep(): void;       // Half Frame
  output(): number;        // 0-15
}
```

### Envelope (エンベロープ)

```typescript
export class Envelope {
  start: boolean;        // start flag
  loop: boolean;         // loop flag (= lengthHalt)
  constantVolume: boolean;
  volume: number;        // constant volume / divider period (4bit)
  decayLevel: number;    // 現在の減衰レベル (0-15)
  divider: number;       // divider カウンタ

  tick(): void;          // Quarter Frame で clock
  output(): number;      // 0-15
}
```

### SweepUnit (スイープ)

```typescript
export class SweepUnit {
  enabled: boolean;
  period: number;        // divider period (3bit)
  negate: boolean;       // 周波数減算モード
  shift: number;         // シフト量 (3bit)
  reload: boolean;       // reload flag
  divider: number;       // divider カウンタ
  channelId: 1 | 2;     // pulse1 と pulse2 で negate の計算が異なる

  tick(channel: PulseChannel): void;  // Half Frame で clock
  targetPeriod(currentPeriod: number): number;
  isMuting(currentPeriod: number): boolean;
}
```

### フレームカウンタ

4-step モード (デフォルト):
- Step 1 (3728.5 cycles): Quarter Frame (エンベロープ)
- Step 2 (7456.5 cycles): Quarter + Half Frame
- Step 3 (11185.5 cycles): Quarter Frame
- Step 4 (14914.5 cycles): Quarter + Half Frame + IRQ

5-step モード:
- Step 1-3: 同上
- Step 4 (14914.5 cycles): 何もしない
- Step 5 (18640.5 cycles): Quarter + Half Frame (IRQ なし)

### NesBus の変更

- `apuIo` byte 配列を `Apu` インスタンスに置き換える
- $4000-$4013, $4015, $4017 の read/write を `apu.read()` / `apu.write()` に委譲
- $4014 (OAM DMA) と $4016 (コントローラ) は既存のまま

### NesConsole の変更

- `Apu` インスタンスを保持
- `step()` 内で CPU cycle 分 `apu.tick()` を呼ぶ

### ブラウザ側: Web Audio API 統合 (src/browser/audio.ts)

- `AudioWorklet` または `ScriptProcessorNode` で APU 出力を再生
- `NesAudio` クラスが APU からサンプルをバッファリング → AudioContext に流す
- サンプルレート変換: CPU クロック (1.789773 MHz) → 44100Hz or 48000Hz
- ダウンサンプリングは平均化方式 (CPU tick ごとに APU output を蓄積 → オーディオバッファ書き出し時に平均)

### パルスミキサー出力

nesdev wiki の近似式を使用:
```
pulse_out = 95.88 / (8128 / (pulse1 + pulse2) + 100)
```
pulse1, pulse2 は各 0-15 の出力値。両方 0 なら pulse_out = 0。

## サブゴール

1. **G1: APU フレームワーク + フレームカウンタ** — `src/core/apu.ts` に Apu クラス骨格。フレームカウンタ (4-step/5-step)、レジスタ read/write ($4015, $4017)。NesBus・NesConsole の wiring
2. **G2: エンベロープ + 長さカウンタ** — Envelope クラス実装。長さカウンタテーブル + 長さカウンタロジック。$4015 による enable/disable
3. **G3: パルスチャンネル (タイマー + デューティ)** — PulseChannel 実装。タイマー tick、デューティサイクルシーケンサ、ミュート条件
4. **G4: スイープユニット** — SweepUnit 実装 (pulse1 と pulse2 の negate 差異含む)。スイープによるミュート
5. **G5: Web Audio 統合 + ミキサー** — `src/browser/audio.ts` でパルス波を AudioContext に出力。ダウンサンプリング + パルスミキサー

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/033-apu-pulse`
3. G1: `src/core/apu.ts` に Apu クラス骨格 + フレームカウンタ
4. G1: NesBus の apuIo を Apu に置き換え、NesConsole に wiring
5. G1: `bun test` で既存テスト全 pass 確認
6. G2: Envelope クラス + 長さカウンタテーブル・ロジック実装
7. G2: テスト作成 + pass 確認
8. G3: PulseChannel 実装 (タイマー + デューティシーケンサ)
9. G3: テスト作成 + pass 確認
10. G4: SweepUnit 実装 + テスト
11. G5: `src/browser/audio.ts` に NesAudio 実装
12. G5: `src/browser/main.ts` で NesAudio を接続
13. `bun test` + `bunx tsc --noEmit` + `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0`
14. `git mv nights/pending/033-apu-pulse.md nights/done/033-apu-pulse.md`
15. `git push -u origin night/033-apu-pulse`
16. `gh pr create`
17. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル

- テスト pass: `✅ PASS: <test_name>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 033 merged`

## コミット粒度 (Conventional Commits)

- `feat(core): APU フレームワーク + フレームカウンタ実装`
- `refactor(core): NesBus APU レジスタを Apu クラスに委譲`
- `feat(core): APU エンベロープ + 長さカウンタ実装`
- `feat(core): APU パルスチャンネル (タイマー + デューティ) 実装`
- `feat(core): APU スイープユニット実装`
- `feat(browser): Web Audio API パルス波出力`
- `test(core): APU パルスチャンネルテスト`
- `chore(nights): 033 を done に移動`

最低 6 commit。

## DoD (完了条件)

- [ ] `night/033-apu-pulse` ブランチで作業
- [ ] `src/core/apu.ts` に Apu クラスが存在する
- [ ] Apu がフレームカウンタ (4-step/5-step) を実装している
- [ ] フレームカウンタが Quarter Frame / Half Frame を正しいタイミングで clock する
- [ ] $4017 書き込みでフレームカウンタモード (bit7) と IRQ inhibit (bit6) が設定される
- [ ] $4015 読み出しでフレーム IRQ フラグとチャンネル長さカウンタ状態が返る
- [ ] $4015 書き込みでチャンネルの enable/disable が切り替わる
- [ ] Envelope クラスが Quarter Frame で正しく clock される
- [ ] Envelope の constant volume モードが動作する
- [ ] Envelope の decay (減衰) モードが 15→0 で正しくカウントダウンする
- [ ] Envelope の loop モードが 0 で 15 に戻る
- [ ] 長さカウンタテーブル (32 エントリ) が nesdev wiki と一致する
- [ ] 長さカウンタが Half Frame で正しくデクリメントする
- [ ] 長さカウンタが 0 でチャンネルをサイレンスする
- [ ] lengthHalt フラグが true の時、長さカウンタがデクリメントしない
- [ ] PulseChannel のタイマーが 2 CPU cycle ごとに tick する
- [ ] デューティサイクルシーケンサ (4 パターン: 12.5%, 25%, 50%, 75%) が正しく動作する
- [ ] タイマー周期 < 8 でチャンネルがミュートされる
- [ ] SweepUnit が Half Frame で正しく clock される
- [ ] SweepUnit の target period 計算が正しい
- [ ] pulse1 と pulse2 で negate 計算が異なる (1の補数 vs 2の補数)
- [ ] スイープによるミュート条件 (target > $7FF) が動作する
- [ ] NesBus が $4000-$4003 (pulse1), $4004-$4007 (pulse2) の write を Apu に委譲する
- [ ] NesBus が $4015 の read/write を Apu に委譲する
- [ ] NesBus が $4017 の write を Apu に委譲する
- [ ] NesConsole.step() で CPU cycle 分 apu.tick() が呼ばれる
- [ ] `src/browser/audio.ts` に NesAudio クラスが存在する
- [ ] Web Audio API で AudioContext を使用してパルス波を出力する
- [ ] CPU クロック → オーディオサンプルレートのダウンサンプリングが動作する
- [ ] パルスミキサーの近似式が正しく実装されている
- [ ] ブラウザで ROM ロード後にパルス波の音声が再生される
- [ ] 既存の nestest trace テスト pass (TRACE_LINES = 8991)
- [ ] 既存の PPU テスト (背景・スプライト・スクロール) が全 pass
- [ ] 既存のコントローラテストが pass
- [ ] 既存の mapper テストが全 pass
- [ ] APU テストが pass
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 6 commit
- [ ] `nights/pending/033-apu-pulse.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 実装上の注意

- APU のコアロジック (`src/core/`) は DOM API / Web Audio API に依存しない (platform-agnostic)
- Web Audio 統合は `src/browser/audio.ts` にのみ書く
- フレームカウンタの cycle 閾値は半端 (例: 3728.5) — CPU cycle × 2 でカウントして整数化する手法がある
- パルスタイマーは CPU cycle の 2 分周 (APU cycle) で tick する
- $4003/$4007 書き込みでデューティ位置リセット + 長さカウンタロード + エンベロープ start が同時に起きる
- $4015 書き込みでチャンネル disable → 長さカウンタを 0 に強制
- 既存テストは `apuIo` を直接操作していない (stub だったため) ので、APU 置き換えで壊れるリスクは低い

## 詰まったら

- nesdev wiki APU: https://www.nesdev.org/wiki/APU
- nesdev wiki APU Pulse: https://www.nesdev.org/wiki/APU_Pulse
- nesdev wiki APU Envelope: https://www.nesdev.org/wiki/APU_Envelope
- nesdev wiki APU Length Counter: https://www.nesdev.org/wiki/APU_Length_Counter
- nesdev wiki APU Sweep: https://www.nesdev.org/wiki/APU_Sweep
- nesdev wiki APU Frame Counter: https://www.nesdev.org/wiki/APU_Frame_Counter
- nesdev wiki APU Mixer: https://www.nesdev.org/wiki/APU_Mixer

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
