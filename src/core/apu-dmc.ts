/**
 * APU DMC (Delta Modulation Channel)。
 *
 * ROM 空間からサンプルバイトを読み出し、1-bit delta 変調で 7-bit 出力レベルを駆動する。
 * 仕様参照: https://www.nesdev.org/wiki/APU_DMC
 */

import type { DmcState } from "./state.ts";

/** NTSC タイマー周期テーブル (CPU サイクル単位、16 エントリ) */
const DMC_RATE_TABLE: readonly number[] = [
  428, 380, 340, 320, 286, 254, 226, 214,
  190, 160, 142, 128, 106, 84, 72, 54,
];

export class DmcChannel {
  /** メモリ読み出しコールバック (Bus.read 相当) */
  readSample: (addr: number) => number = () => 0;

  /** タイマー周期 */
  timerPeriod = DMC_RATE_TABLE[0]!;
  /** タイマー現在値 */
  timerValue = 0;

  /** 出力レベル (0-127) */
  outputLevel = 0;

  /** サンプルバッファ (1 byte) */
  private sampleBuffer = 0;
  /** サンプルバッファ空フラグ */
  private sampleBufferEmpty = true;

  /** シフトレジスタ (8-bit) */
  private shiftRegister = 0;
  /** ビット残りカウンタ (初期値 1: 最初の clockOutput で新サイクル開始を正しく発火させる) */
  private bitsRemaining = 1;
  /** サイレンスフラグ */
  private silenceFlag = true;

  /** サンプル開始アドレス ($4012 から算出) */
  private sampleAddress = 0xc000;
  /** サンプル長 ($4013 から算出) */
  private sampleLength = 1;
  /** 現在のアドレスカウンタ */
  private currentAddress = 0xc000;
  /** 残りバイト数 */
  bytesRemaining = 0;

  /** ループフラグ */
  private loop = false;
  /** IRQ 有効フラグ */
  private irqEnabled = false;
  /** IRQ フラグ */
  irqFlag = false;
  /** IRQ 発生時に呼ばれるコールバック */
  onIrq?: () => void;
  /** $4010: フラグ + レート */
  writeControl(value: number): void {
    this.irqEnabled = (value & 0x80) !== 0;
    this.loop = (value & 0x40) !== 0;
    this.timerPeriod = DMC_RATE_TABLE[value & 0x0f]!;
    if (!this.irqEnabled) {
      this.irqFlag = false;
    }
  }

  /** $4011: ダイレクトロード */
  writeDirectLoad(value: number): void {
    this.outputLevel = value & 0x7f;
  }

  /** $4012: サンプルアドレス */
  writeAddress(value: number): void {
    this.sampleAddress = 0xc000 + (value & 0xff) * 64;
  }

  /** $4013: サンプル長 */
  writeLength(value: number): void {
    this.sampleLength = (value & 0xff) * 16 + 1;
  }

  /** $4015 書込による enable/disable */
  setEnabled(on: boolean): void {
    if (!on) {
      this.bytesRemaining = 0;
    } else {
      if (this.bytesRemaining === 0) {
        this.restart();
      }
    }
  }

  /** サンプルを最初から再スタート */
  private restart(): void {
    this.currentAddress = this.sampleAddress;
    this.bytesRemaining = this.sampleLength;
  }

  /** メモリリーダー: サンプルバッファが空なら ROM からフェッチ */
  private fetchSample(): void {
    if (!this.sampleBufferEmpty || this.bytesRemaining === 0) return;

    this.sampleBuffer = this.readSample(this.currentAddress);
    this.sampleBufferEmpty = false;

    // アドレスインクリメント ($FFFF → $8000 ラップ)
    if (this.currentAddress === 0xffff) {
      this.currentAddress = 0x8000;
    } else {
      this.currentAddress++;
    }

    this.bytesRemaining--;

    if (this.bytesRemaining === 0) {
      if (this.loop) {
        this.restart();
      } else if (this.irqEnabled) {
        this.irqFlag = true;
        this.onIrq?.();
      }
    }
  }

  /** 毎 CPU cycle で呼ぶ */
  tickTimer(): void {
    this.fetchSample();

    if (this.timerValue > 0) {
      this.timerValue--;
      return;
    }

    this.timerValue = this.timerPeriod - 1;
    this.clockOutput();
  }

  /** 出力ユニットの 1 クロック (nesdev wiki 準拠の順序) */
  private clockOutput(): void {
    if (!this.silenceFlag) {
      if ((this.shiftRegister & 1) !== 0) {
        if (this.outputLevel <= 125) {
          this.outputLevel += 2;
        }
      } else {
        if (this.outputLevel >= 2) {
          this.outputLevel -= 2;
        }
      }
    }

    this.shiftRegister >>= 1;
    this.bitsRemaining--;

    if (this.bitsRemaining === 0) {
      this.bitsRemaining = 8;
      if (this.sampleBufferEmpty) {
        this.silenceFlag = true;
      } else {
        this.silenceFlag = false;
        this.shiftRegister = this.sampleBuffer;
        this.sampleBufferEmpty = true;
      }
    }
  }

  /** 出力 (0-127) */
  output(): number {
    return this.outputLevel;
  }

  serialize(): DmcState {
    return {
      timerPeriod: this.timerPeriod,
      timerValue: this.timerValue,
      outputLevel: this.outputLevel,
      sampleBuffer: this.sampleBuffer,
      sampleBufferEmpty: this.sampleBufferEmpty,
      shiftRegister: this.shiftRegister,
      bitsRemaining: this.bitsRemaining,
      silenceFlag: this.silenceFlag,
      sampleAddress: this.sampleAddress,
      sampleLength: this.sampleLength,
      currentAddress: this.currentAddress,
      bytesRemaining: this.bytesRemaining,
      loop: this.loop,
      irqEnabled: this.irqEnabled,
      irqFlag: this.irqFlag,
    };
  }

  deserialize(state: DmcState): void {
    this.timerPeriod = state.timerPeriod;
    this.timerValue = state.timerValue;
    this.outputLevel = state.outputLevel;
    this.sampleBuffer = state.sampleBuffer;
    this.sampleBufferEmpty = state.sampleBufferEmpty;
    this.shiftRegister = state.shiftRegister;
    this.bitsRemaining = state.bitsRemaining;
    this.silenceFlag = state.silenceFlag;
    this.sampleAddress = state.sampleAddress;
    this.sampleLength = state.sampleLength;
    this.currentAddress = state.currentAddress;
    this.bytesRemaining = state.bytesRemaining;
    this.loop = state.loop;
    this.irqEnabled = state.irqEnabled;
    this.irqFlag = state.irqFlag;
  }
}
