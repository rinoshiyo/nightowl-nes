/**
 * APU トライアングルチャンネル。
 *
 * 32 ステップの三角波シーケンサ + リニアカウンタ + 長さカウンタ。
 * パルスと異なりエンベロープなし・音量固定・タイマーは毎 CPU cycle。
 * 仕様参照: https://www.nesdev.org/wiki/APU_Triangle
 */

import { LENGTH_TABLE } from "./apu-length.ts";

/** 三角波シーケンステーブル (32 ステップ: 15→0, 0→15) */
const TRIANGLE_SEQUENCE: readonly number[] = [
  15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
] as const;

export class TriangleChannel {
  /** リニアカウンタ */
  linearCounter = 0;
  /** リニアカウンタリロード値 ($4008 下位 7bit) */
  linearCounterReload = 0;
  /** リニアカウンタリロードフラグ */
  linearCounterReloadFlag = false;
  /** control フラグ ($4008 bit7) = 長さカウンタ halt と共用 */
  controlFlag = false;

  /** タイマー周期 (11bit) */
  timerPeriod = 0;
  /** タイマー現在値 */
  timerValue = 0;

  /** 三角波シーケンサ位置 (0-31) */
  sequencerPos = 0;

  /** 長さカウンタ */
  lengthCounter = 0;
  /** チャンネル有効フラグ ($4015 bit2) */
  enabled = false;

  /** タイマー tick (毎 CPU cycle) */
  tickTimer(): void {
    if (this.timerValue === 0) {
      this.timerValue = this.timerPeriod;
      // 長さカウンタとリニアカウンタが両方非ゼロの時だけシーケンサを進める
      if (this.lengthCounter > 0 && this.linearCounter > 0) {
        this.sequencerPos = (this.sequencerPos + 1) & 31;
      }
    } else {
      this.timerValue--;
    }
  }

  /** リニアカウンタ tick (Quarter Frame) */
  tickLinearCounter(): void {
    if (this.linearCounterReloadFlag) {
      this.linearCounter = this.linearCounterReload;
    } else if (this.linearCounter > 0) {
      this.linearCounter--;
    }

    if (!this.controlFlag) {
      this.linearCounterReloadFlag = false;
    }
  }

  /** 長さカウンタ tick (Half Frame) */
  tickLength(): void {
    if (!this.controlFlag && this.lengthCounter > 0) {
      this.lengthCounter--;
    }
  }

  /** チャンネル出力 (0-15) */
  output(): number {
    if (this.lengthCounter === 0) return 0;
    if (this.linearCounter === 0) return 0;
    return TRIANGLE_SEQUENCE[this.sequencerPos] ?? 0;
  }

  /** $4008: リニアカウンタ設定 */
  writeLinearCounter(value: number): void {
    this.controlFlag = (value & 0x80) !== 0;
    this.linearCounterReload = value & 0x7f;
  }

  /** $400A: タイマー下位 8bit */
  writeTimerLow(value: number): void {
    this.timerPeriod = (this.timerPeriod & 0x700) | value;
  }

  /** $400B: タイマー上位 3bit + 長さカウンタロード */
  writeTimerHigh(value: number): void {
    this.timerPeriod = (this.timerPeriod & 0xff) | ((value & 0x07) << 8);

    if (this.enabled) {
      this.lengthCounter = LENGTH_TABLE[(value >> 3) & 0x1f] ?? 0;
    }

    this.linearCounterReloadFlag = true;
  }
}
