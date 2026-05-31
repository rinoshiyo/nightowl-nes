/**
 * APU DMC (Delta Modulation Channel)。
 *
 * ROM 空間からサンプルバイトを読み出し、1-bit delta 変調で 7-bit 出力レベルを駆動する。
 * 仕様参照: https://www.nesdev.org/wiki/APU_DMC
 */

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
  /** ビット残りカウンタ */
  private bitsRemaining = 0;
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
  /** チャンネル有効フラグ ($4015 bit4) */
  enabled = false;

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
    this.enabled = on;
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

  /** 出力ユニットの 1 クロック */
  private clockOutput(): void {
    // 新しい出力サイクル開始判定 (bits 消化完了時)
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
  }

  /** 出力 (0-127) */
  output(): number {
    return this.outputLevel;
  }
}
