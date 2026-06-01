/**
 * APU (Audio Processing Unit)。
 *
 * フレームカウンタでエンベロープ・長さカウンタ・スイープを駆動し、
 * パルス波チャンネル 2 つのミキシング出力を生成する。
 * 仕様参照: https://www.nesdev.org/wiki/APU
 */

import { DmcChannel } from "./apu-dmc.ts";
import { ApuMixer } from "./apu-mixer.ts";
import { NoiseChannel } from "./apu-noise.ts";
import { PulseChannel } from "./apu-pulse.ts";
import { TriangleChannel } from "./apu-triangle.ts";

const CPU_CLOCK = 1789773;

/** フレームカウンタのステップアクション (ビットフラグ) */
const ACT_Q = 1;  // quarter frame (エンベロープ・linear カウンタ)
const ACT_H = 2;  // half frame (長さカウンタ・スウィープ)
const ACT_I = 4;  // IRQ (4-step モードのみ)
const ACT_R = 8;  // カウンタリセット

/**
 * フレームカウンタのステップ定義。
 * cycle: 発火する CPU cycle 数、action: ビットフラグ。
 * 最終エントリは ACT_R でカウンタリセット。action=0 は「何もしない」ステップ。
 * 仕様参照: https://www.nesdev.org/wiki/APU_Frame_Counter
 */
const FRAME_4STEP: readonly { cycle: number; action: number }[] = [
  { cycle: 7457,  action: ACT_Q },
  { cycle: 14913, action: ACT_Q | ACT_H },
  { cycle: 22371, action: ACT_Q },
  { cycle: 29829, action: ACT_Q | ACT_H | ACT_I },
  { cycle: 29830, action: ACT_R },
];

const FRAME_5STEP: readonly { cycle: number; action: number }[] = [
  { cycle: 7457,  action: ACT_Q },
  { cycle: 14913, action: ACT_Q | ACT_H },
  { cycle: 22371, action: ACT_Q },
  { cycle: 29829, action: 0 },
  { cycle: 37281, action: ACT_Q | ACT_H },
  { cycle: 37282, action: ACT_R },
];

export class Apu {
  readonly pulse1 = new PulseChannel(1);
  readonly pulse2 = new PulseChannel(2);
  readonly triangle = new TriangleChannel();
  readonly noise = new NoiseChannel();
  readonly dmc = new DmcChannel();

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

  /** IRQ 発生時に呼ばれるコールバック (NesConsole が CPU の irqPending をセットする) */
  onIrq?: () => void;

  constructor() {
    this.dmc.onIrq = () => this.onIrq?.();
  }

  /** CPU cycle カウント (パルスタイマーの 2 分周用) */
  private cpuCycleOdd = false;

  /** ダウンサンプリング用 (integer Bresenham 方式: ドリフトフリー) */
  private sampleRateAccum = 0;
  private sampleRateThreshold = CPU_CLOCK;
  private sampleRateStep = 44100;

  /** 非線形ミキサー + アナログフィルタチェイン */
  private mixer = new ApuMixer(44100);

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
      if (this.dmc.bytesRemaining > 0) status |= 0x10;
      if (this.frameIrqFlag) status |= 0x40;
      if (this.dmc.irqFlag) status |= 0x80;
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

      // DMC: $4010-$4013
      case 0x4010:
        this.dmc.writeControl(value);
        break;
      case 0x4011:
        this.dmc.writeDirectLoad(value);
        break;
      case 0x4012:
        this.dmc.writeAddress(value);
        break;
      case 0x4013:
        this.dmc.writeLength(value);
        break;

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

    this.dmc.setEnabled((value & 0x10) !== 0);
    this.dmc.irqFlag = false;
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
    // トライアングルタイマーと DMC タイマーは毎 CPU cycle で tick
    this.triangle.tickTimer();
    this.dmc.tickTimer();

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
        this.sampleBuffer[this.bufferWritePos] = this.mixer.process(
          this.pulse1.output(),
          this.pulse2.output(),
          this.triangle.output(),
          this.noise.output(),
          this.dmc.output(),
        );
        this.bufferWritePos = nextWrite;
      }
    }
  }

  private tickFrameCounter(): void {
    this.frameCycle++;
    const steps = this.frameMode === 0 ? FRAME_4STEP : FRAME_5STEP;
    const step = steps[this.frameStep];
    if (step === undefined || this.frameCycle < step.cycle) return;

    const act = step.action;

    if (act & ACT_Q) this.clockQuarterFrame();
    if (act & ACT_H) this.clockHalfFrame();
    if ((act & ACT_I) && !this.frameIrqInhibit) {
      this.frameIrqFlag = true;
      this.onIrq?.();
    }

    if (act & ACT_R) {
      this.frameCycle = 0;
      this.frameStep = 0;
      return;
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

  /** オーディオサンプルレートを設定 (フィルタ係数も再計算) */
  setSampleRate(rate: number): void {
    this.sampleRateStep = rate;
    this.mixer.reset(rate);
  }

  /** フィルタ内部状態をリセット (コンソールリセット時に呼ぶ) */
  resetFilters(): void {
    this.mixer.reset(this.sampleRateStep);
  }

  /** パワーオン初期化: 全チャンネル無効化 + フレームカウンタ初期化 */
  powerOn(): void {
    this.write(0x4015, 0x00);
    this.write(0x4017, 0x00);
    this.frameIrqFlag = false;
    this.dmc.irqFlag = false;
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
