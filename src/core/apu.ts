/**
 * APU (Audio Processing Unit)。
 *
 * フレームカウンタでエンベロープ・長さカウンタ・スイープを駆動し、
 * パルス波チャンネル 2 つのミキシング出力を生成する。
 * 仕様参照: https://www.nesdev.org/wiki/APU
 */

import { PulseChannel } from "./apu-pulse.ts";

/**
 * フレームカウンタの step タイミング (CPU cycle × 2 で管理、半 cycle 対応)。
 * 仕様参照: https://www.nesdev.org/wiki/APU_Frame_Counter
 */
const FRAME_4STEP = [7457, 14913, 22371, 29829, 29830] as const;
const FRAME_5STEP = [7457, 14913, 22371, 29829, 37281, 37282] as const;

export class Apu {
  readonly pulse1 = new PulseChannel(1);
  readonly pulse2 = new PulseChannel(2);

  /** フレームカウンタモード (0 = 4-step, 1 = 5-step) */
  private frameMode = 0;
  /** フレームカウンタの CPU cycle × 2 カウント */
  private frameCycle = 0;
  /** フレームカウンタの現在の step インデックス */
  private frameStep = 0;
  /** IRQ 禁止フラグ */
  private frameIrqInhibit = false;
  /** フレーム IRQ フラグ */
  frameIrqFlag = false;

  /** CPU cycle カウント (パルスタイマーの 2 分周用) */
  private cpuCycleOdd = false;

  /** APU 出力サンプル蓄積 (ダウンサンプリング用) */
  private sampleAccum = 0;
  private sampleCount = 0;

  read(addr: number): number {
    if (addr === 0x4015) {
      let status = 0;
      if (this.pulse1.lengthCounter > 0) status |= 0x01;
      if (this.pulse2.lengthCounter > 0) status |= 0x02;
      // bit4-6: triangle / noise / DMC (将来実装)
      if (this.frameIrqFlag) status |= 0x40;
      this.frameIrqFlag = false;
      return status;
    }
    return 0;
  }

  write(addr: number, value: number): void {
    switch (addr) {
      // Pulse 1: $4000-$4003
      case 0x4000:
        this.pulse1.writeControl(value);
        break;
      case 0x4001:
        this.pulse1.writeSweep(value);
        break;
      case 0x4002:
        this.pulse1.writeTimerLow(value);
        break;
      case 0x4003:
        this.pulse1.writeTimerHigh(value);
        break;

      // Pulse 2: $4004-$4007
      case 0x4004:
        this.pulse2.writeControl(value);
        break;
      case 0x4005:
        this.pulse2.writeSweep(value);
        break;
      case 0x4006:
        this.pulse2.writeTimerLow(value);
        break;
      case 0x4007:
        this.pulse2.writeTimerHigh(value);
        break;

      // $4008-$400B: Triangle (将来実装)
      // $400C-$400F: Noise (将来実装)
      // $4010-$4013: DMC (将来実装)

      case 0x4015:
        this.writeStatus(value);
        break;

      case 0x4017:
        this.writeFrameCounter(value);
        break;
    }
  }

  private writeStatus(value: number): void {
    this.pulse1.enabled = (value & 0x01) !== 0;
    if (!this.pulse1.enabled) this.pulse1.lengthCounter = 0;

    this.pulse2.enabled = (value & 0x02) !== 0;
    if (!this.pulse2.enabled) this.pulse2.lengthCounter = 0;

    // bit2-4: triangle / noise / DMC (将来実装)
  }

  private writeFrameCounter(value: number): void {
    this.frameMode = (value >> 7) & 1;
    this.frameIrqInhibit = (value & 0x40) !== 0;

    if (this.frameIrqInhibit) {
      this.frameIrqFlag = false;
    }

    this.frameCycle = 0;
    this.frameStep = 0;

    // 5-step モードに切り替え時は即座に half + quarter frame を clock
    if (this.frameMode === 1) {
      this.clockQuarterFrame();
      this.clockHalfFrame();
    }
  }

  /** CPU 1 cycle 分を進める */
  tick(): void {
    // パルスタイマーは 2 CPU cycle (= 1 APU cycle) ごとに tick
    this.cpuCycleOdd = !this.cpuCycleOdd;
    if (this.cpuCycleOdd) {
      this.pulse1.tickTimer();
      this.pulse2.tickTimer();
    }

    this.tickFrameCounter();

    // ダウンサンプリング用にサンプル蓄積
    this.sampleAccum += this.mixOutput();
    this.sampleCount++;
  }

  private tickFrameCounter(): void {
    this.frameCycle++;
    const steps = this.frameMode === 0 ? FRAME_4STEP : FRAME_5STEP;
    const threshold = steps[this.frameStep];
    if (threshold === undefined || this.frameCycle < threshold) return;

    if (this.frameMode === 0) {
      // 4-step: 0=Q, 1=Q+H, 2=Q, 3=Q+H+IRQ
      switch (this.frameStep) {
        case 0:
          this.clockQuarterFrame();
          break;
        case 1:
          this.clockQuarterFrame();
          this.clockHalfFrame();
          break;
        case 2:
          this.clockQuarterFrame();
          break;
        case 3:
          this.clockQuarterFrame();
          this.clockHalfFrame();
          if (!this.frameIrqInhibit) {
            this.frameIrqFlag = true;
          }
          break;
        case 4:
          this.frameCycle = 0;
          this.frameStep = 0;
          return;
      }
    } else {
      // 5-step: 0=Q, 1=Q+H, 2=Q, 3=nothing, 4=Q+H
      switch (this.frameStep) {
        case 0:
          this.clockQuarterFrame();
          break;
        case 1:
          this.clockQuarterFrame();
          this.clockHalfFrame();
          break;
        case 2:
          this.clockQuarterFrame();
          break;
        case 3:
          break;
        case 4:
          this.clockQuarterFrame();
          this.clockHalfFrame();
          break;
        case 5:
          this.frameCycle = 0;
          this.frameStep = 0;
          return;
      }
    }
    this.frameStep++;
  }

  private clockQuarterFrame(): void {
    this.pulse1.envelope.tick();
    this.pulse2.envelope.tick();
  }

  private clockHalfFrame(): void {
    this.pulse1.tickLength();
    this.pulse2.tickLength();
    this.pulse1.tickSweep();
    this.pulse2.tickSweep();
  }

  /** ミキシング出力 (0.0 ~ 1.0) */
  private mixOutput(): number {
    const p1 = this.pulse1.output();
    const p2 = this.pulse2.output();

    if (p1 === 0 && p2 === 0) return 0;

    // nesdev wiki 近似式
    return 95.88 / (8128 / (p1 + p2) + 100);
  }

  /** ダウンサンプリングされた出力を取得しバッファをリセット */
  takeSample(): number {
    if (this.sampleCount === 0) return 0;
    const avg = this.sampleAccum / this.sampleCount;
    this.sampleAccum = 0;
    this.sampleCount = 0;
    return avg;
  }
}
