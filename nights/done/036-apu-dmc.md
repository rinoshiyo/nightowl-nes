# 夜 036: APU DMC (Delta Modulation Channel)

## ゴール (/goal)

```
/goal night/036-apu-dmc ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/036-apu-dmc.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 036 merged`

## 前提

- 夜 035 done: APU パルス 2ch + トライアングル + ノイズが実装済み
- nestest trace 全 8991 行完走 (TRACE_LINES 変更なし)
- Apu クラスに pulse1/pulse2/triangle/noise が存在し、フレームカウンタ (4-step/5-step) が動作する
- ミキサーは pulse_out + tnd_out の分離方式。tnd_out は tri/8227 + noise/12241 で計算中。dmc/22638 は未実装
- $4010-$4013 は現在未処理、$4015 の bit4 (DMC) も未使用
- NesBus が Bus interface を実装し、NesBus.read() でメモリアクセス可能
- NesConsole.step() が CPU 命令実行 → PPU tick → APU tick の順で駆動
- APU は Bus への参照を持っていない (DMC メモリリーダーでコールバック方式を採用する)
- 仕様参照:
  - https://www.nesdev.org/wiki/APU_DMC
  - https://www.nesdev.org/wiki/APU_Mixer

## ブランチ運用

`night/036-apu-dmc` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 設計概要

### DMC チャンネルの特徴 (他チャンネルとの相違)

- **エンベロープなし、長さカウンタなし、スイープなし** — 独自のサンプル再生機構
- **メモリリーダー** — ROM 空間 ($C000-$FFFF) からサンプルバイトを DMA フェッチ
- **出力レベルカウンタ** — 7bit (0-127)、±2 の delta 変調で出力を変化
- **IRQ 生成機能** — サンプル読み取り完了時に IRQ を発火可能
- **タイマー周期はルックアップテーブル** — $4010 下位 4bit を NTSC 16 エントリテーブルのインデックスとして使用

### DmcChannel (src/core/apu-dmc.ts)

```typescript
export class DmcChannel {
  /** メモリ読み出しコールバック (Bus.read 相当) */
  readSample: (addr: number) => number;

  /** タイマー周期 (NTSC テーブルから取得) */
  timerPeriod: number;
  /** タイマー現在値 */
  timerValue: number;

  /** 出力レベル (0-127) */
  outputLevel: number;

  /** サンプルバッファ (1 byte) */
  sampleBuffer: number;
  /** サンプルバッファ空フラグ */
  sampleBufferEmpty: boolean;

  /** シフトレジスタ (8-bit) */
  shiftRegister: number;
  /** ビット残りカウンタ */
  bitsRemaining: number;
  /** サイレンスフラグ */
  silenceFlag: boolean;

  /** サンプルアドレス (計算済みの実アドレス) */
  sampleAddress: number;
  /** サンプル長 (計算済みの実バイト数) */
  sampleLength: number;
  /** 現在のアドレスカウンタ */
  currentAddress: number;
  /** 残りバイト数 */
  bytesRemaining: number;

  /** ループフラグ */
  loop: boolean;
  /** IRQ 有効フラグ */
  irqEnabled: boolean;
  /** IRQ フラグ */
  irqFlag: boolean;
  /** チャンネル有効フラグ ($4015 bit4) */
  enabled: boolean;

  tickTimer(): void;   // 毎 CPU cycle で tick (他チャンネルと異なりAPU cycleではない)
  output(): number;    // 0-127

  writeControl(value: number): void;   // $4010
  writeDirectLoad(value: number): void; // $4011
  writeAddress(value: number): void;   // $4012
  writeLength(value: number): void;    // $4013
}
```

### メモリリーダー動作

```
サンプルバッファが空 かつ 残りバイト数 > 0 のとき:
  sampleBuffer = readSample(currentAddress)
  sampleBufferEmpty = false
  currentAddress = (currentAddress + 1) | 0x8000  // $FFFF → $8000 ラップ
  bytesRemaining--
  if bytesRemaining == 0:
    if loop: リスタート (アドレス・長さリロード)
    else if irqEnabled: irqFlag = true
```

### 出力ユニット動作

```
タイマークロックごと:
  if !silenceFlag:
    if shiftRegister & 1:
      if outputLevel <= 125: outputLevel += 2
    else:
      if outputLevel >= 2: outputLevel -= 2
  shiftRegister >>= 1
  bitsRemaining--
  if bitsRemaining == 0:
    bitsRemaining = 8
    if sampleBufferEmpty: silenceFlag = true
    else:
      silenceFlag = false
      shiftRegister = sampleBuffer
      sampleBufferEmpty = true
      → メモリリーダーでフェッチ試行
```

### NTSC タイマー周期テーブル (16 エントリ、CPU サイクル単位)

```
428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54
```

$4010 の下位 4bit がインデックス。

### Apu への統合

- `Apu.dmc` を追加
- `tick()` 内で毎 CPU cycle `dmc.tickTimer()` を呼ぶ (パルス/ノイズの APU cycle とは異なる)
- `write()` の $4010/$4011/$4012/$4013 を処理
- `writeStatus()` の bit4 で DMC の enable/disable ($4015 書込で IRQ フラグクリア)
- `read()` ($4015) で bit4 を DMC の bytesRemaining > 0 に、bit7 を DMC IRQ フラグに反映
- `read()` ($4015) で DMC IRQ フラグは読み出しでクリアしない (フレーム IRQ のみクリア)

### NesConsole / NesBus への接続

- NesConsole のコンストラクタで `apu.dmc.readSample = (addr) => bus.read(addr)` を設定
- DMA の CPU ストール (1-4 cycle) は簡易化: 固定で dmaCycles に加算しない (cycle-accurate ではないため)

### ミキサーの拡張

既存の tnd_out 計算に dmc を追加:
```
tndSum = tri / 8227 + noise / 12241 + dmc / 22638
tnd_out = 159.79 / (1 / tndSum + 100)  (tndSum > 0 の時)
```

## サブゴール

1. **G1: DmcChannel クラス実装** — `src/core/apu-dmc.ts` に出力ユニット (シフトレジスタ + 出力レベル ±2) + メモリリーダー (アドレスカウンタ + バイト残り + ループ + IRQ) + タイマー周期テーブル。レジスタ write ($4010/$4011/$4012/$4013)
2. **G2: Apu 統合** — Apu に dmc を追加。tick() での毎 CPU cycle timer tick、$4015 read/write の bit4/bit7 対応、$4010-$4013 のルーティング
3. **G3: NesConsole 接続** — readSample コールバックを NesConsole で NesBus.read に接続
4. **G4: ミキサー拡張** — tnd_out に dmc/22638 を追加
5. **G5: テスト** — 出力ユニット (±2 delta / 範囲超え時の無視)、メモリリーダー (フェッチ→シフトレジスタ→出力)、ループ、IRQ フラグ、$4015 連携、ミュート条件のテスト

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/036-apu-dmc`
3. G1: `src/core/apu-dmc.ts` に DmcChannel 実装
4. G2: `src/core/apu.ts` に dmc を統合 (tick/レジスタ/$4015)
5. G3: `src/core/console.ts` で readSample コールバック接続
6. G2+G3: `bun test` で既存テスト全 pass 確認
7. G4: ミキサーの tnd_out に dmc 項を追加
8. G5: `tests/core/apu-dmc.test.ts` にテスト作成
9. G5: `bun test` + `bunx tsc --noEmit` + `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0`
10. `git mv nights/pending/036-apu-dmc.md nights/done/036-apu-dmc.md`
11. `git push -u origin night/036-apu-dmc`
12. `gh pr create`
13. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル

- テスト pass: `✅ PASS: <test_name>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 036 merged`

## コミット粒度 (Conventional Commits)

- `feat(core): APU DMC チャンネル実装`
- `refactor(core): APU に DMC を統合しミキサー tnd_out に dmc 項追加`
- `refactor(core): NesConsole で DMC メモリリーダーを Bus に接続`
- `test(core): APU DMC チャンネルテスト`
- `chore(nights): 036 を done に移動`

最低 5 commit。

## DoD (完了条件)

- [ ] `night/036-apu-dmc` ブランチで作業
- [ ] `src/core/apu-dmc.ts` に DmcChannel クラスが存在する
- [ ] NTSC タイマー周期テーブル (16 エントリ) が nesdev wiki と一致する
- [ ] $4010 下位 4bit がテーブルインデックスとして使われる
- [ ] $4010 bit7 が IRQ 有効フラグとして機能する
- [ ] $4010 bit6 がループフラグとして機能する
- [ ] $4010 bit7 をクリアすると IRQ フラグもクリアされる
- [ ] $4011 bit6-0 が出力レベルを直接設定する (0-127)
- [ ] $4012 からサンプルアドレスが $C000 + (A * 64) で計算される
- [ ] $4013 からサンプル長が (L * 16) + 1 で計算される
- [ ] タイマーが毎 CPU cycle で tick する (APU cycle ではない)
- [ ] 出力レベルがシフトレジスタ bit0=1 で +2 される
- [ ] 出力レベルがシフトレジスタ bit0=0 で -2 される
- [ ] 出力レベル +2 の結果が 127 を超える場合、変更しない (クランプではなく無視)
- [ ] 出力レベル -2 の結果が 0 未満になる場合、変更しない (クランプではなく無視)
- [ ] ビット残りカウンタが 0 でサンプルバッファからシフトレジスタにロードされる
- [ ] サンプルバッファ空の時にサイレンスフラグがセットされる
- [ ] サイレンスフラグ時に出力レベルが変化しない
- [ ] メモリリーダーがサンプルバッファ空 & 残りバイト > 0 でフェッチする
- [ ] アドレスカウンタが $FFFF → $8000 にラップする
- [ ] 残りバイト 0 到達 + ループフラグ ON でサンプルリスタートする
- [ ] 残りバイト 0 到達 + ループ OFF + IRQ 有効で IRQ フラグがセットされる
- [ ] ループ時に IRQ が発生しない
- [ ] readSample コールバックで Bus.read が呼ばれる
- [ ] NesConsole で readSample が NesBus.read に接続されている
- [ ] $4015 書込 bit4=0 で残りバイトが 0 になる
- [ ] $4015 書込 bit4=1 で残りバイト 0 の時のみリスタートする
- [ ] $4015 書込で DMC IRQ フラグがクリアされる
- [ ] $4015 読出 bit4 で残りバイト > 0 が返る
- [ ] $4015 読出 bit7 で DMC IRQ フラグが返る
- [ ] Apu.tick() で毎 CPU cycle dmc.tickTimer() が呼ばれる
- [ ] ミキサーの tnd_out に dmc/22638 が加算されている
- [ ] dmc 出力が 0 の時、tnd_out の dmc 項が 0 になる
- [ ] 既存の nestest trace テスト pass (TRACE_LINES = 8991)
- [ ] 既存のパルスチャンネルテストが全 pass
- [ ] 既存のトライアングルチャンネルテストが全 pass
- [ ] 既存のノイズチャンネルテストが全 pass
- [ ] 既存の PPU テスト (背景・スプライト・スクロール) が全 pass
- [ ] APU DMC テストが pass
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 5 commit
- [ ] `nights/pending/036-apu-dmc.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 実装上の注意

- 出力レベルの ±2 は **範囲外なら変更しない** (クランプではない)。outputLevel <= 125 で +2 可、outputLevel >= 2 で -2 可
- アドレスラップは $FFFF → $8000 (ビット演算: `(addr + 1) | 0x8000` で、$FFFF → $10000 → bit15 set で $8000。正確には `((addr + 1) & 0xFFFF) | 0x8000` とするか `addr === 0xFFFF ? 0x8000 : addr + 1` が確実)
- readSample コールバック方式で Bus への循環参照を回避
- DMA の CPU ストール (1-4 cycle) は cycle-accurate でないため今回は省略。将来精度を上げる時に対応
- $4015 読み出しで DMC IRQ フラグは**クリアしない** (フレーム IRQ フラグのみクリア)
- $4015 書き込みは DMC IRQ フラグをクリアする
- IRQ はサンプル読み取り完了時 (最後のバイトフェッチ時) に発火。再生完了時ではない
- output() の戻り値範囲は 0-127 (他チャンネルの 0-15 とは異なる)。ミキサーの係数 (22638) がそれを吸収する

## 詰まったら

- nesdev wiki APU DMC: https://www.nesdev.org/wiki/APU_DMC
- nesdev wiki APU Mixer: https://www.nesdev.org/wiki/APU_Mixer

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
