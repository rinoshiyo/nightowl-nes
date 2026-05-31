# 夜 034: APU トライアングルチャンネル

## ゴール (/goal)

```
/goal night/034-apu-triangle ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/034-apu-triangle.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 034 merged`

## 前提

- 夜 033 done: APU フレームワーク + パルス波チャンネル 2 本が実装済み
- nestest trace 全 8991 行完走 (TRACE_LINES 変更なし)
- Apu クラスに pulse1/pulse2 が存在し、フレームカウンタ (4-step/5-step) が動作する
- ミキサーはパルスのみ: `95.88 / (8128 / (pulse1 + pulse2) + 100)`
- $4008-$400B は現在未処理 (case なし)、$4015 の bit2 (triangle) も未使用
- 仕様参照:
  - https://www.nesdev.org/wiki/APU_Triangle
  - https://www.nesdev.org/wiki/APU_Length_Counter
  - https://www.nesdev.org/wiki/APU_Frame_Counter
  - https://www.nesdev.org/wiki/APU_Mixer

## ブランチ運用

`night/034-apu-triangle` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 設計概要

### トライアングルチャンネルの特徴

パルスチャンネルとの違い:
- **エンベロープなし** — 音量制御はリニアカウンタと長さカウンタのみ
- **リニアカウンタ** ($4008 の下位 7bit) — Quarter Frame で clock、0 でサイレンス
- **32 ステップ三角波シーケンサ** — 15→0→0→15 の三角波 (パルスの 8 ステップとは異なる)
- **タイマーは CPU cycle 速度** — パルスの 2 倍 (パルスは 2 CPU cycle ごと)
- **音量は固定** — 三角波の出力自体が 0-15 で、エンベロープで変調しない

### TriangleChannel (src/core/apu-triangle.ts)

```typescript
export class TriangleChannel {
  /** リニアカウンタ */
  linearCounter: number;
  /** リニアカウンタリロード値 ($4008 下位 7bit) */
  linearCounterReload: number;
  /** リニアカウンタリロードフラグ */
  linearCounterReloadFlag: boolean;
  /** control フラグ ($4008 bit7) = 長さカウンタ halt と共用 */
  controlFlag: boolean;

  /** タイマー周期 (11bit) */
  timerPeriod: number;
  /** タイマー現在値 */
  timerValue: number;

  /** 三角波シーケンサ位置 (0-31) */
  sequencerPos: number;

  /** 長さカウンタ */
  lengthCounter: number;
  /** チャンネル有効フラグ ($4015 bit2) */
  enabled: boolean;

  tickTimer(): void;         // 毎 CPU cycle
  tickLinearCounter(): void; // Quarter Frame
  tickLength(): void;        // Half Frame
  output(): number;          // 0-15

  writeLinearCounter(value: number): void; // $4008
  writeTimerLow(value: number): void;      // $400A
  writeTimerHigh(value: number): void;     // $400B
}
```

### 三角波シーケンステーブル

```
15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
 0,  1,  2,  3,  4,  5, 6, 7, 8, 9,10,11,12,13,14,15
```

### リニアカウンタ動作 (Quarter Frame)

1. reload フラグが立っていたら: linearCounter = linearCounterReload
2. そうでなければ: linearCounter > 0 なら linearCounter--
3. control フラグが OFF なら: reload フラグをクリア

### Apu への統合

- `Apu.triangle` を追加
- `tick()` 内で毎 CPU cycle `triangle.tickTimer()` を呼ぶ (パルスは 2 cycle ごと)
- `clockQuarterFrame()` で `triangle.tickLinearCounter()` を呼ぶ
- `clockHalfFrame()` で `triangle.tickLength()` を呼ぶ
- `write()` の $4008/$400A/$400B/$4015 を処理
- `read()` ($4015) で bit2 を triangle の長さカウンタ状態に反映

### ミキサーの拡張

nesdev wiki のミキサー分離出力:
```
tnd_out = 159.79 / (1 / (triangle/8227 + noise/12241 + dmc/22638) + 100)
```

現時点で noise/dmc は 0 なので:
```
tnd_out = 159.79 / (8227/triangle + 100)   (triangle > 0 の時)
```

最終出力 = pulse_out + tnd_out

## サブゴール

1. **G1: TriangleChannel クラス実装** — `src/core/apu-triangle.ts` に三角波シーケンサ + リニアカウンタ + タイマー + 長さカウンタ。レジスタ write ($4008/$400A/$400B)
2. **G2: Apu 統合** — Apu に triangle を追加。tick() での毎 CPU cycle timer tick、フレームカウンタ連動 (Quarter/Half)、$4015 read/write の bit2 対応
3. **G3: ミキサー拡張** — pulse_out + tnd_out の分離ミキサーに更新。nesdev wiki の近似式を実装
4. **G4: テスト** — リニアカウンタ動作、三角波シーケンサ出力、長さカウンタ、$4015 による enable/disable、ミュート条件のテスト

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/034-apu-triangle`
3. G1: `src/core/apu-triangle.ts` に TriangleChannel 実装
4. G2: `src/core/apu.ts` に triangle を統合 (tick/フレームカウンタ/レジスタ)
5. G2: `bun test` で既存テスト全 pass 確認
6. G3: ミキサーを pulse_out + tnd_out 分離方式に更新
7. G4: `tests/core/apu-triangle.test.ts` にテスト作成
8. G4: `bun test` + `bunx tsc --noEmit` + `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0`
9. `git mv nights/pending/034-apu-triangle.md nights/done/034-apu-triangle.md`
10. `git push -u origin night/034-apu-triangle`
11. `gh pr create`
12. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル

- テスト pass: `✅ PASS: <test_name>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 034 merged`

## コミット粒度 (Conventional Commits)

- `feat(core): APU トライアングルチャンネル実装`
- `refactor(core): APU ミキサーを pulse + tnd 分離方式に更新`
- `test(core): APU トライアングルチャンネルテスト`
- `chore(nights): 034 を done に移動`

最低 4 commit。

## DoD (完了条件)

- [ ] `night/034-apu-triangle` ブランチで作業
- [ ] `src/core/apu-triangle.ts` に TriangleChannel クラスが存在する
- [ ] 三角波シーケンステーブル (32 ステップ: 15→0→0→15) が正しく定義されている
- [ ] シーケンサがタイマー clock ごとに位置を進める
- [ ] タイマーが毎 CPU cycle で tick する (パルスの 2 倍速)
- [ ] リニアカウンタが $4008 下位 7bit をリロード値として保持する
- [ ] リニアカウンタが Quarter Frame で正しく clock される
- [ ] リニアカウンタの reload 動作 (reload フラグ → カウンタにリロード値セット) が正しい
- [ ] control フラグが OFF の時、reload フラグがクリアされる
- [ ] リニアカウンタが 0 でチャンネル出力が 0 になる
- [ ] 長さカウンタが Half Frame でデクリメントする
- [ ] control フラグ (= lengthHalt) が true の時、長さカウンタがデクリメントしない
- [ ] 長さカウンタが 0 でチャンネル出力が 0 になる
- [ ] $400B 書き込みで長さカウンタがロードされる (enabled 時のみ)
- [ ] $400B 書き込みでリニアカウンタ reload フラグがセットされる
- [ ] $4015 書き込みの bit2 で triangle の enable/disable が切り替わる
- [ ] disable 時に長さカウンタが 0 になる
- [ ] $4015 読み出しの bit2 で triangle の長さカウンタ > 0 が返る
- [ ] Apu.tick() で毎 CPU cycle triangle.tickTimer() が呼ばれる
- [ ] Apu.clockQuarterFrame() で triangle.tickLinearCounter() が呼ばれる
- [ ] Apu.clockHalfFrame() で triangle.tickLength() が呼ばれる
- [ ] ミキサーが pulse_out + tnd_out の分離方式になっている
- [ ] tnd_out の近似式が nesdev wiki と一致する
- [ ] triangle 出力が 0 の時、tnd_out が 0 になる
- [ ] 既存の nestest trace テスト pass (TRACE_LINES = 8991)
- [ ] 既存のパルスチャンネルテストが全 pass
- [ ] 既存の PPU テスト (背景・スプライト・スクロール) が全 pass
- [ ] APU トライアングルテストが pass
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 4 commit
- [ ] `nights/pending/034-apu-triangle.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 実装上の注意

- タイマー周期が非常に短い (< 2 程度) 場合、超高周波でノイズに聞こえるが、NES 実機の挙動通りなのでミュートしない (パルスは period < 8 でミュートだがトライアングルは異なる)
- リニアカウンタの reload 処理は Quarter Frame の**中で**行う (tick 前ではない)
- $4008 の bit7 (control flag) は長さカウンタの halt フラグと**共用** (1 つの bit が 2 つの意味を持つ)
- $400B 書き込み時にシーケンサ位置はリセット**しない** (パルスの $4003 とは異なる)
- 将来の noise/dmc 追加に備えて tnd_out の計算式は `noise/12241 + dmc/22638` を 0 として省略しつつ、コメントで完全な式を残す

## 詰まったら

- nesdev wiki APU Triangle: https://www.nesdev.org/wiki/APU_Triangle
- nesdev wiki APU Length Counter: https://www.nesdev.org/wiki/APU_Length_Counter
- nesdev wiki APU Frame Counter: https://www.nesdev.org/wiki/APU_Frame_Counter
- nesdev wiki APU Mixer: https://www.nesdev.org/wiki/APU_Mixer

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
