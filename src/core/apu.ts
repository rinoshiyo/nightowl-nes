/**
 * APU (Audio Processing Unit)。
 *
 * フレームカウンタでエンベロープ・長さカウンタ・スイープを駆動し、
 * パルス波チャンネル 2 つのミキシング出力を生成する。
 * 仕様参照: https://www.nesdev.org/wiki/APU
 */

import { NoiseChannel } from "./apu-noise.ts";
import { PulseChannel } from "./apu-pulse.ts";
import { TriangleChannel } from "./apu-triangle.ts";

const CPU_CLOCK = 1789773;

/**
 * フレームカウンタの step タイミング (CPU cycle 単位、+1 delay 込み)。
 * 仕様参照: https://www.nesdev.org/wiki/APU_Frame_Counter
 */
const FRAME_4STEP = [7457, 14913, 22371, 29829, 29830] as const;
const FRAME_5STEP = [7457, 14913, 22371, 29829, 37281, 37282] as const;

export class Apu {
  readonly pulse1 = new PulseChannel(1);
  readonly pulse2 = new PulseChannel(2);
  readonly triangle = new TriangleChannel();
  readonly noise = new NoiseChannel();

  /** フレームカウンタモード (0 = 4-step, 1 = 5-step) */
  private frameMode = 0;
  /** フレームカウンタの CPU cycle カウント */
  private frameCycle = 0;
  /** フレームカウンタの現在の step インデックス */
  private frameStep = 0;
  /** IRQ 禁止フラグ */
  private frameIrqInhibit = false;
  /** フレーム IRQ フラグ */
  frameIrqFlag = false;

  /** CPU cycle カウント (パルスタイマーの 2 分周用) */
  private cpuCycleOdd = false;

  /** ダウンサンプリング用 (integer Bresenham 方式: ドリフトフリー) */
  private sampleRateAccum = 0;
  private sampleRateThreshold = CPU_CLOCK;
  private sampleRateStep = 44100;

  /** サンプルバッファ (リングバッファ、最大 4095 エントリ使用) */
  private readonly sampleBuffer = new Float32Array(4096);
  private bufferWritePos = 0;
  private bufferReadPos = 0;

  read(addr: number): number {
    if (addr === 0x4015) {
      let status = 0;
      if (this.pulse1.lengthCounter > 0) status |= 0x01;
      if (this.pulse2.lengthCounter > 0) status |= 0x02;
      if (this.triangle.lengthCounter > 0) status |= 0x04;
      if (this.noise.lengthCounter > 0) status |= 0x08;
      // bit4: DMC (将来実装)
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

      // Triangle: $4008, $400A, $400B ($4009 は未使用)
      case 0x4008:
        this.triangle.writeLinearCounter(value);
        break;
      case 0x400A:
        this.triangle.writeTimerLow(value);
        break;
      case 0x400B:
        this.triangle.writeTimerHigh(value);
        break;

      // Noise: $400C, $400E, $400F ($400D は未使用)
      case 0x400C:
        this.noise.writeControl(value);
        break;
      case 0x400E:
        this.noise.writePeriod(value);
        break;
      case 0x400F:
        this.noise.writeLengthLoad(value);
        break;

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

    this.triangle.enabled = (value & 0x04) !== 0;
    if (!this.triangle.enabled) this.triangle.lengthCounter = 0;

    this.noise.enabled = (value & 0x08) !== 0;
    if (!this.noise.enabled) this.noise.lengthCounter = 0;

    // bit4: DMC (将来実装)
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
    // トライアングルタイマーは毎 CPU cycle で tick
    this.triangle.tickTimer();

    // パルスタイマーは 2 CPU cycle (= 1 APU cycle) ごとに tick
    this.cpuCycleOdd = !this.cpuCycleOdd;
    if (this.cpuCycleOdd) {
      this.pulse1.tickTimer();
      this.pulse2.tickTimer();
      this.noise.tickTimer();
    }

    this.tickFrameCounter();

    // ダウンサンプリング (integer Bresenham): sampleRateStep を蓄積し閾値超えで 1 サンプル出力
    this.sampleRateAccum += this.sampleRateStep;
    if (this.sampleRateAccum >= this.sampleRateThreshold) {
      this.sampleRateAccum -= this.sampleRateThreshold;
      const nextWrite = (this.bufferWritePos + 1) & 0xfff;
      if (nextWrite !== this.bufferReadPos) {
        this.sampleBuffer[this.bufferWritePos] = this.mixOutput();
        this.bufferWritePos = nextWrite;
      }
    }
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
    this.triangle.tickLinearCounter();
    this.noise.envelope.tick();
  }

  private clockHalfFrame(): void {
    this.pulse1.tickLength();
    this.pulse2.tickLength();
    this.triangle.tickLength();
    this.noise.tickLength();
    this.pulse1.tickSweep();
    this.pulse2.tickSweep();
  }

  /** ミキシング出力 (0.0 ~ 1.0) */
  private mixOutput(): number {
    const p1 = this.pulse1.output();
    const p2 = this.pulse2.output();
    const tri = this.triangle.output();
    const noi = this.noise.output();

    // nesdev wiki 近似式 (pulse と tnd を分離)
    let pulseOut = 0;
    if (p1 !== 0 || p2 !== 0) {
      pulseOut = 95.88 / (8128 / (p1 + p2) + 100);
    }

    // tnd_out = 159.79 / (1 / (tri/8227 + noise/12241 + dmc/22638) + 100)
    let tndOut = 0;
    const tndSum = tri / 8227 + noi / 12241; // 将来: + dmc / 22638
    if (tndSum !== 0) {
      tndOut = 159.79 / (1 / tndSum + 100);
    }

    return pulseOut + tndOut;
  }

  /** オーディオサンプルレートを設定 */
  setSampleRate(rate: number): void {
    this.sampleRateStep = rate;
  }

  /** バッファからサンプルを読み出して output 配列を埋める。読み出し分だけ進む */
  readSamples(output: Float32Array): number {
    let written = 0;
    for (let i = 0; i < output.length; i++) {
      if (this.bufferReadPos === this.bufferWritePos) break;
      output[i] = this.sampleBuffer[this.bufferReadPos]!;
      this.bufferReadPos = (this.bufferReadPos + 1) & 0xfff;
      written++;
    }
    return written;
  }
}
