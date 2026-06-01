/**
 * APU ミキサー: 非線形ミキシングテーブル + アナログフィルタチェイン。
 * 仕様参照: https://www.nesdev.org/wiki/APU_Mixer
 */

/** Pulse 非線形ミキシングテーブル (pulse1 + pulse2 の合計 0-30 で索引) */
function buildPulseTable(): Float64Array {
  const table = new Float64Array(31);
  for (let i = 1; i < 31; i++) {
    table[i] = 95.88 / (8128 / i + 100);
  }
  return table;
}

/**
 * TND 非線形ミキシングテーブル (線形近似)。
 * 索引 = 3 * triangle + 2 * noise + dmc (最大 3*15 + 2*15 + 127 = 202)。
 * nesdev wiki の近似: tnd_table[n] = 159.79 / (1 / (n / 24329) + 100)
 */
function buildTndTable(): Float64Array {
  const table = new Float64Array(203);
  for (let i = 1; i < 203; i++) {
    table[i] = 159.79 / (1 / (i / 24329) + 100);
  }
  return table;
}

const PULSE_TABLE = buildPulseTable();
const TND_TABLE = buildTndTable();

/** 読み取り専用エクスポート (テスト用) */
export { PULSE_TABLE, TND_TABLE };

/** 1 次 IIR ハイパスフィルタ: y[n] = α * (y[n-1] + x[n] - x[n-1]) */
class HighPassFilter {
  private prevIn = 0;
  private prevOut = 0;
  private readonly alpha: number;

  constructor(sampleRate: number, cutoffHz: number) {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / sampleRate;
    this.alpha = rc / (rc + dt);
  }

  process(x: number): number {
    const y = this.alpha * (this.prevOut + x - this.prevIn);
    this.prevIn = x;
    this.prevOut = y;
    return y;
  }
}

/** 1 次 IIR ローパスフィルタ: y[n] = α * x[n] + (1 - α) * y[n-1] */
class LowPassFilter {
  private prevOut = 0;
  private readonly alpha: number;

  constructor(sampleRate: number, cutoffHz: number) {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / sampleRate;
    this.alpha = dt / (rc + dt);
  }

  process(x: number): number {
    const y = this.alpha * x + (1 - this.alpha) * this.prevOut;
    this.prevOut = y;
    return y;
  }
}

/**
 * APU ミキサー。
 * 非線形テーブルでミキシング → 3 段 HPF + 1 段 LPF → クリッピング防止。
 */
export class ApuMixer {
  private hpf1!: HighPassFilter;
  private hpf2!: HighPassFilter;
  private hpf3!: HighPassFilter;
  private lpf!: LowPassFilter;

  constructor(sampleRate: number) {
    this.reset(sampleRate);
  }

  /** フィルタ状態をリセット (ROM ロード・リセット時に呼ぶ) */
  reset(sampleRate: number): void {
    this.hpf1 = new HighPassFilter(sampleRate, 37);
    this.hpf2 = new HighPassFilter(sampleRate, 90);
    this.hpf3 = new HighPassFilter(sampleRate, 440);
    this.lpf = new LowPassFilter(sampleRate, 14000);
  }

  /** 5 チャンネルの出力からフィルタ済みサンプルを返す */
  process(pulse1: number, pulse2: number, tri: number, noise: number, dmc: number): number {
    const pulseOut = PULSE_TABLE[pulse1 + pulse2]!;
    const tndIdx = 3 * tri + 2 * noise + dmc;
    const tndOut = TND_TABLE[tndIdx]!;

    let s = pulseOut + tndOut;

    s = this.hpf1.process(s);
    s = this.hpf2.process(s);
    s = this.hpf3.process(s);
    s = this.lpf.process(s);

    if (s > 1) return 1;
    if (s < -1) return -1;
    return s;
  }
}
