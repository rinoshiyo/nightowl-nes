/**
 * APU ノイズチャンネル。
 *
 * 15-bit LFSR (Linear Feedback Shift Register) でノイズ波形を生成。
 * エンベロープと長さカウンタはパルスチャンネルと同じユニットを再利用。
 * タイマー周期はルックアップテーブル (NTSC 16 エントリ) から取得。
 * 仕様参照: https://www.nesdev.org/wiki/APU_Noise
 */

import { Envelope } from "./apu-envelope.ts";
import { LENGTH_TABLE } from "./apu-length.ts";

/** NTSC タイマー周期テーブル ($400E 下位 4bit → CPU cycle 数) */
const NOISE_PERIOD_TABLE: readonly number[] = [
  4, 8, 16, 32, 64, 96, 128, 160,
  202, 254, 380, 508, 762, 1016, 2034, 4068,
] as const;

export class NoiseChannel {
  /** LFSR (15-bit、初期値 1) */
  shiftRegister = 1;
  /** LFSR モード (false=モード0: bit1 XOR、true=モード1: bit6 XOR) */
  mode = false;

  /** タイマー周期 (NTSC テーブルから取得) */
  timerPeriod = 0;
  /** タイマー現在値 */
  timerValue = 0;

  /** 長さカウンタ */
  lengthCounter = 0;
  /** 長さカウンタ halt (= エンベロープ loop と共用) */
  lengthHalt = false;
  /** エンベロープ (パルスと同じクラスを再利用) */
  readonly envelope = new Envelope();
  /** チャンネル有効フラグ ($4015 bit3) */
  enabled = false;

  /** タイマー tick (APU cycle = 2 CPU cycle ごと、パルスと同タイミング) */
  tickTimer(): void {
    if (this.timerValue > 0) {
      this.timerValue--;
    } else {
      this.timerValue = this.timerPeriod;
      this.clockLfsr();
    }
  }

  /** LFSR を 1 ステップ進める */
  private clockLfsr(): void {
    const bit0 = this.shiftRegister & 1;
    const otherBit = this.mode
      ? (this.shiftRegister >> 6) & 1
      : (this.shiftRegister >> 1) & 1;
    const feedback = bit0 ^ otherBit;
    this.shiftRegister >>= 1;
    this.shiftRegister |= feedback << 14;
  }

  /** 長さカウンタ tick (Half Frame) */
  tickLength(): void {
    if (!this.lengthHalt && this.lengthCounter > 0) {
      this.lengthCounter--;
    }
  }

  /** チャンネル出力 (0-15) */
  output(): number {
    if (this.shiftRegister & 1) return 0;
    if (this.lengthCounter === 0) return 0;
    return this.envelope.output();
  }

  /** $400C: エンベロープ・長さカウンタ設定 */
  writeControl(value: number): void {
    this.lengthHalt = (value & 0x20) !== 0;
    this.envelope.loop = this.lengthHalt;
    this.envelope.constantVolume = (value & 0x10) !== 0;
    this.envelope.volume = value & 0x0f;
  }

  /** $400E: モード・タイマー周期設定 */
  writePeriod(value: number): void {
    this.mode = (value & 0x80) !== 0;
    this.timerPeriod = NOISE_PERIOD_TABLE[value & 0x0f]!;
  }

  /** $400F: 長さカウンタロード・エンベロープリスタート */
  writeLengthLoad(value: number): void {
    if (this.enabled) {
      this.lengthCounter = LENGTH_TABLE[(value >> 3) & 0x1f]!;
    }
    this.envelope.start = true;
  }
}
