/**
 * APU パルス波チャンネル。
 *
 * デューティサイクルシーケンサ + タイマー + エンベロープ + 長さカウンタ + スイープ。
 * 仕様参照: https://www.nesdev.org/wiki/APU_Pulse
 */

import { Envelope } from "./apu-envelope.ts";
import { LENGTH_TABLE } from "./apu-length.ts";
import { SweepUnit } from "./apu-sweep.ts";

/** デューティサイクルテーブル (4パターン × 8ステップ) */
const DUTY_TABLE: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 1], // 12.5%
  [0, 0, 0, 0, 0, 0, 1, 1], // 25%
  [0, 0, 0, 0, 1, 1, 1, 1], // 50%
  [1, 1, 1, 1, 1, 1, 0, 0], // 75% (25% negated)
] as const;

export class PulseChannel {
  duty = 0;
  dutyPos = 0;
  timerPeriod = 0;
  timerValue = 0;
  lengthCounter = 0;
  lengthHalt = false;
  readonly envelope = new Envelope();
  readonly sweep: SweepUnit;
  enabled = false;

  constructor(channelId: 1 | 2) {
    this.sweep = new SweepUnit(channelId);
  }

  /** $4000/$4004: デューティ・長さカウンタhalt・エンベロープ設定 */
  writeControl(value: number): void {
    this.duty = (value >> 6) & 0x3;
    this.lengthHalt = (value & 0x20) !== 0;
    this.envelope.loop = this.lengthHalt;
    this.envelope.constantVolume = (value & 0x10) !== 0;
    this.envelope.volume = value & 0x0f;
  }

  /** $4001/$4005: スイープ設定 */
  writeSweep(value: number): void {
    this.sweep.enabled = (value & 0x80) !== 0;
    this.sweep.period = (value >> 4) & 0x7;
    this.sweep.negate = (value & 0x08) !== 0;
    this.sweep.shift = value & 0x7;
    this.sweep.reload = true;
  }

  /** $4002/$4006: タイマーlow 8bit */
  writeTimerLow(value: number): void {
    this.timerPeriod = (this.timerPeriod & 0x700) | (value & 0xff);
  }

  /** $4003/$4007: 長さカウンタロード + タイマーhigh 3bit */
  writeTimerHigh(value: number): void {
    if (this.enabled) {
      this.lengthCounter = LENGTH_TABLE[(value >> 3) & 0x1f]!;
    }
    this.timerPeriod = (this.timerPeriod & 0x0ff) | ((value & 0x7) << 8);
    this.dutyPos = 0;
    this.envelope.start = true;
  }

  /** 2 CPU cycle ごとに呼ばれる */
  tickTimer(): void {
    if (this.timerValue > 0) {
      this.timerValue--;
    } else {
      this.timerValue = this.timerPeriod;
      this.dutyPos = (this.dutyPos + 1) & 0x7;
    }
  }

  /** Half Frame で呼ばれる */
  tickLength(): void {
    if (!this.lengthHalt && this.lengthCounter > 0) {
      this.lengthCounter--;
    }
  }

  /** Half Frame で呼ばれる */
  tickSweep(): void {
    this.timerPeriod = this.sweep.tick(this.timerPeriod);
  }

  output(): number {
    if (!this.enabled) return 0;
    if (this.lengthCounter === 0) return 0;
    if (DUTY_TABLE[this.duty]![this.dutyPos] === 0) return 0;
    if (this.sweep.isMuting(this.timerPeriod)) return 0;
    return this.envelope.output();
  }
}
