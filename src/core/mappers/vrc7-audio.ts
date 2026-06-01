/**
 * VRC7 FM 音源エンジン — OPLL (YM2413) サブセット。
 *
 * 6 チャンネル、各チャンネルに modulator + carrier の 2 オペレータ構成。
 * 15 プリセットパッチ + 1 カスタムパッチ。
 *
 * OPLL のフェーズジェネレータ (PG) + エンベロープジェネレータ (EG) を実装。
 * 完全な cycle accuracy は不要、フレーム単位で正しい音が出ればよい。
 *
 * 仕様参照: https://www.nesdev.org/wiki/VRC7_audio
 */

// --- 定数 ---

const NUM_CHANNELS = 6;

/**
 * OPLL 15 プリセットパッチデータ。
 * 各パッチ 8 バイト。nesdev wiki / YM2413 アプリケーションマニュアルより。
 *
 * バイト構成:
 *   [0] MULT(mod) | AM(mod) | VIB(mod) | EGType(mod) | KSR(mod)
 *   [1] MULT(car) | AM(car) | VIB(car) | EGType(car) | KSR(car)
 *   [2] KSL(mod) | TL(mod)
 *   [3] KSL(car) | DC(mod) | DM(car) | FB(mod)
 *   [4] AR(mod) | DR(mod)
 *   [5] AR(car) | DR(car)
 *   [6] SL(mod) | RR(mod)
 *   [7] SL(car) | RR(car)
 */
const PRESET_PATCHES: readonly number[][] = [
  // パッチ 0 はカスタム (ユーザー定義) — ここでは空
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  // 1: Buzzy Bell
  [0x03, 0x21, 0x05, 0x06, 0xb8, 0x82, 0x42, 0x27],
  // 2: Guitar
  [0x13, 0x41, 0x13, 0x0d, 0xd8, 0xd6, 0x23, 0x12],
  // 3: Wurly
  [0x31, 0x11, 0x08, 0x08, 0xfa, 0x9a, 0x22, 0x02],
  // 4: Flute
  [0x31, 0x61, 0x18, 0x07, 0x78, 0x64, 0x30, 0x27],
  // 5: Clarinet
  [0x22, 0x21, 0x1e, 0x06, 0xf0, 0x76, 0x08, 0x28],
  // 6: Synth
  [0x02, 0x01, 0x06, 0x00, 0xf0, 0xf2, 0x03, 0xf5],
  // 7: Trumpet
  [0x21, 0x61, 0x1d, 0x07, 0x82, 0x81, 0x16, 0x07],
  // 8: Organ
  [0x23, 0x21, 0x1a, 0x17, 0xcf, 0x72, 0x25, 0x17],
  // 9: Bells
  [0x15, 0x11, 0x25, 0x00, 0x4f, 0x71, 0x00, 0x11],
  // 10: Vibes
  [0x85, 0x01, 0x12, 0x0f, 0x99, 0xa2, 0x40, 0x02],
  // 11: Vibraphone
  [0x07, 0xc1, 0x69, 0x07, 0xf3, 0xf5, 0xa7, 0x12],
  // 12: Tutti
  [0x71, 0x23, 0x0d, 0x06, 0x66, 0x75, 0x23, 0x16],
  // 13: Fretless
  [0x01, 0x02, 0xd3, 0x05, 0xa3, 0x92, 0xf7, 0x52],
  // 14: Synth Bass
  [0x61, 0x63, 0x0c, 0x00, 0x94, 0xaf, 0x34, 0x06],
  // 15: Sweep
  [0x21, 0x72, 0x0d, 0x00, 0xc1, 0xa0, 0x54, 0x16],
];

/**
 * 正弦波テーブル (10bit, 1024 エントリ)。
 * OPLL は半波正弦波 (0-511) のみ使用。全波は折り返しで生成。
 * 値は対数スケール (0 = 最大振幅 0dB, 大きいほど減衰)。
 */
const LOG_SIN_TABLE = new Uint16Array(256);
const EXP_TABLE = new Uint16Array(256);

// 対数正弦波テーブルの初期化
function initLogSinTable(): void {
  for (let i = 0; i < 256; i++) {
    // sin(x) を対数スケールに変換。x = (i + 0.5) / 256 * π/2
    const sinVal = Math.sin(((i + 0.5) / 256) * (Math.PI / 2));
    // 対数変換: -log2(sin) × 256 (固定小数点 8.8)
    LOG_SIN_TABLE[i] = Math.round(-Math.log2(sinVal) * 256);
  }
}

// 指数テーブルの初期化
function initExpTable(): void {
  for (let i = 0; i < 256; i++) {
    // 2^(1 - i/256) を整数スケールに
    EXP_TABLE[i] = Math.round(Math.pow(2, 1 - i / 256) * 1024);
  }
}

initLogSinTable();
initExpTable();

/**
 * 対数正弦波の計算。フェーズ (10bit) から振幅値を返す。
 * 上位 1bit: 符号、次の 1bit + 8bit: テーブルインデックス
 */
function logsin(phase: number): number {
  const index = phase & 0xff;
  const quarter = (phase >> 8) & 1;
  // 1/4 波の折り返し
  const tableIndex = quarter !== 0 ? (255 - index) : index;
  return LOG_SIN_TABLE[tableIndex] ?? 0;
}

/** 指数変換: 対数値から線形振幅への変換 */
function expVal(logValue: number): number {
  const clampedLog = Math.min(logValue, 0x1fff);
  const index = clampedLog & 0xff;
  const shift = (clampedLog >> 8);
  return (EXP_TABLE[index] ?? 0) >> shift;
}

// --- OPLL 倍率テーブル ---
const MULTIPLIER_TABLE = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 20, 24, 24, 30, 30];

// --- KSL (キースケーリングレベル) テーブル (dB × 2) ---
const KSL_TABLE: readonly number[] = [
  0, 24, 32, 37, 40, 43, 45, 47,
  48, 50, 51, 52, 53, 54, 55, 56,
];

// --- エンベロープジェネレータのレートテーブル ---
const EG_RATE_SHIFT = new Uint8Array(64);
const EG_RATE_SELECT = new Uint8Array(64);

function initEgRates(): void {
  for (let i = 0; i < 64; i++) {
    if (i === 0) {
      EG_RATE_SHIFT[i] = 12;
      EG_RATE_SELECT[i] = 0;
    } else if (i < 48) {
      EG_RATE_SHIFT[i] = Math.max(0, 12 - (i >> 2));
      EG_RATE_SELECT[i] = i & 3;
    } else if (i < 60) {
      EG_RATE_SHIFT[i] = 0;
      EG_RATE_SELECT[i] = i - 44;
    } else {
      EG_RATE_SHIFT[i] = 0;
      EG_RATE_SELECT[i] = 15;
    }
  }
}

initEgRates();

/** EG インクリメントテーブル (4bit カウンタに基づく) */
const EG_INCREMENT = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 0, 0, 0, 0, 0, 0],
  [0, 1, 0, 1, 0, 0, 0, 0],
  [0, 1, 0, 1, 0, 1, 0, 0],
  [0, 1, 0, 1, 0, 1, 0, 1],
  [0, 1, 1, 1, 0, 1, 0, 1],
  [0, 1, 1, 1, 0, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 2, 1, 1, 1, 2],
  [1, 2, 1, 2, 1, 2, 1, 2],
  [1, 2, 1, 2, 2, 2, 1, 2],
  [2, 2, 1, 2, 2, 2, 1, 2],
  [2, 2, 2, 2, 2, 2, 1, 2],
  [2, 2, 2, 2, 2, 2, 2, 2],
  [2, 2, 2, 2, 2, 2, 2, 2],
];

/** AM (トレモロ) テーブル — 振幅変調 */
const AM_TABLE_SIZE = 210;

/** VIB (ビブラート) テーブル — 周波数変調 */
const VIB_TABLE_SIZE = 8192;

const enum EgState {
  Attack = 0,
  Decay = 1,
  Sustain = 2,
  Release = 3,
}

/** オペレータの状態 */
interface Operator {
  /** 倍率 (0-15) */
  mult: number;
  /** キースケーリングレート */
  ksr: boolean;
  /** エンベロープタイプ (true = sustain) */
  egType: boolean;
  /** ビブラート有効 */
  vibrato: boolean;
  /** AM (トレモロ) 有効 */
  am: boolean;
  /** トータルレベル (mod のみ、0-63) */
  totalLevel: number;
  /** キースケーリングレベル (0-3) */
  ksl: number;
  /** アタックレート (0-15) */
  attackRate: number;
  /** ディケイレート (0-15) */
  decayRate: number;
  /** サスティンレベル (0-15) */
  sustainLevel: number;
  /** リリースレート (0-15) */
  releaseRate: number;
  /** フィードバック (mod のみ、0-7) */
  feedback: number;
  /** 波形選択 (0 = 正弦波、1 = 半波整流正弦波) */
  waveform: number;

  // --- 動的状態 ---
  /** フェーズカウンタ (20bit) */
  phase: number;
  /** エンベロープ状態 */
  egState: EgState;
  /** エンベロープレベル (0-127: 0dB=0, 48dB=127) */
  egLevel: number;
  /** フィードバックバッファ */
  fbOut0: number;
  fbOut1: number;
}

/** チャンネルの状態 */
interface Channel {
  /** F-Number (9bit) */
  fNum: number;
  /** ブロック (3bit、オクターブ) */
  block: number;
  /** サスティン ON */
  sustain: boolean;
  /** Key ON */
  keyOn: boolean;
  /** パッチ番号 (0-15: 0=カスタム) */
  patch: number;
  /** ボリューム (4bit) */
  volume: number;

  mod: Operator;
  car: Operator;
}

function createOperator(): Operator {
  return {
    mult: 0, ksr: false, egType: false, vibrato: false, am: false,
    totalLevel: 0, ksl: 0, attackRate: 0, decayRate: 0,
    sustainLevel: 0, releaseRate: 0, feedback: 0, waveform: 0,
    phase: 0, egState: EgState.Release, egLevel: 127,
    fbOut0: 0, fbOut1: 0,
  };
}

function createChannel(): Channel {
  return {
    fNum: 0, block: 0, sustain: false, keyOn: false,
    patch: 0, volume: 0,
    mod: createOperator(),
    car: createOperator(),
  };
}

export class Vrc7Audio {
  /** カスタムパッチデータ (8 バイト) */
  private readonly customPatch = new Uint8Array(8);

  /** 6 チャンネル */
  private readonly channels: Channel[] = [];

  /** 現在選択されているレジスタアドレス */
  private regAddr = 0;

  /** グローバル EG カウンタ */
  private egCounter = 0;

  /** AM カウンタ */
  private amCounter = 0;
  /** VIB カウンタ */
  private vibCounter = 0;

  /** CPU サイクルカウンタ (OPLL クロック分周用) */
  private cpuCycleCounter = 0;
  /** OPLL は CPU の 1/36 クロック */
  private static readonly CPU_TO_OPLL_DIVIDER = 36;

  constructor() {
    for (let i = 0; i < NUM_CHANNELS; i++) {
      this.channels.push(createChannel());
    }
  }

  writeAddress(value: number): void {
    this.regAddr = value & 0x3f;
  }

  writeData(value: number): void {
    const addr = this.regAddr;

    if (addr < 0x08) {
      // $00-$07: カスタムパッチレジスタ
      this.customPatch[addr] = value;
      // カスタムパッチを使用中の全チャンネルを更新
      for (const ch of this.channels) {
        if (ch.patch === 0) {
          this.applyPatch(ch, 0);
        }
      }
    } else if (addr >= 0x10 && addr <= 0x15) {
      // $10-$15: F-Number 下位 8bit
      const ch = this.channels[addr - 0x10];
      if (ch) {
        ch.fNum = (ch.fNum & 0x100) | value;
      }
    } else if (addr >= 0x20 && addr <= 0x25) {
      // $20-$25: Sustain/Key ON/Block/F-Number 上位
      const chIdx = addr - 0x20;
      const ch = this.channels[chIdx];
      if (ch) {
        const prevKeyOn = ch.keyOn;
        ch.fNum = (ch.fNum & 0xff) | ((value & 0x01) << 8);
        ch.block = (value >> 1) & 0x07;
        ch.keyOn = (value & 0x10) !== 0;
        ch.sustain = (value & 0x20) !== 0;

        if (!prevKeyOn && ch.keyOn) {
          this.keyOn(ch);
        } else if (prevKeyOn && !ch.keyOn) {
          this.keyOff(ch);
        }
      }
    } else if (addr >= 0x30 && addr <= 0x35) {
      // $30-$35: パッチ + ボリューム
      const chIdx = addr - 0x30;
      const ch = this.channels[chIdx];
      if (ch) {
        const newPatch = (value >> 4) & 0x0f;
        ch.volume = value & 0x0f;
        if (ch.patch !== newPatch) {
          ch.patch = newPatch;
          this.applyPatch(ch, newPatch);
        }
      }
    }
  }

  /** パッチデータをチャンネルのオペレータに適用 */
  private applyPatch(ch: Channel, patchNum: number): void {
    const patch = patchNum === 0 ? this.customPatch : PRESET_PATCHES[patchNum];
    if (!patch) return;

    const m = ch.mod;
    const c = ch.car;

    // byte 0: mod AM/VIB/EGType/KSR/MULT
    m.am = (patch[0]! & 0x80) !== 0;
    m.vibrato = (patch[0]! & 0x40) !== 0;
    m.egType = (patch[0]! & 0x20) !== 0;
    m.ksr = (patch[0]! & 0x10) !== 0;
    m.mult = patch[0]! & 0x0f;

    // byte 1: car AM/VIB/EGType/KSR/MULT
    c.am = (patch[1]! & 0x80) !== 0;
    c.vibrato = (patch[1]! & 0x40) !== 0;
    c.egType = (patch[1]! & 0x20) !== 0;
    c.ksr = (patch[1]! & 0x10) !== 0;
    c.mult = patch[1]! & 0x0f;

    // byte 2: mod KSL/TL
    m.ksl = (patch[2]! >> 6) & 0x03;
    m.totalLevel = patch[2]! & 0x3f;

    // byte 3: car KSL / mod DC(waveform) / car DM(waveform) / mod FB
    c.ksl = (patch[3]! >> 6) & 0x03;
    m.waveform = (patch[3]! >> 3) & 0x01;
    c.waveform = (patch[3]! >> 4) & 0x01;
    m.feedback = patch[3]! & 0x07;

    // byte 4: mod AR/DR
    m.attackRate = (patch[4]! >> 4) & 0x0f;
    m.decayRate = patch[4]! & 0x0f;

    // byte 5: car AR/DR
    c.attackRate = (patch[5]! >> 4) & 0x0f;
    c.decayRate = patch[5]! & 0x0f;

    // byte 6: mod SL/RR
    m.sustainLevel = (patch[6]! >> 4) & 0x0f;
    m.releaseRate = patch[6]! & 0x0f;

    // byte 7: car SL/RR
    c.sustainLevel = (patch[7]! >> 4) & 0x0f;
    c.releaseRate = patch[7]! & 0x0f;
  }

  private keyOn(ch: Channel): void {
    // フェーズリセット
    ch.mod.phase = 0;
    ch.car.phase = 0;
    // EG をアタック状態に
    ch.mod.egState = EgState.Attack;
    ch.mod.egLevel = 127;
    ch.car.egState = EgState.Attack;
    ch.car.egLevel = 127;
  }

  private keyOff(ch: Channel): void {
    // リリース状態へ遷移
    if (ch.mod.egState !== EgState.Release) {
      ch.mod.egState = EgState.Release;
    }
    if (ch.car.egState !== EgState.Release) {
      ch.car.egState = EgState.Release;
    }
  }

  /** CPU サイクルごとの tick */
  tick(): void {
    this.cpuCycleCounter++;
    if (this.cpuCycleCounter < Vrc7Audio.CPU_TO_OPLL_DIVIDER) return;
    this.cpuCycleCounter = 0;

    this.opllTick();
  }

  /** OPLL 内部クロックの tick */
  private opllTick(): void {
    this.amCounter = (this.amCounter + 1) % AM_TABLE_SIZE;
    this.vibCounter = (this.vibCounter + 1) % VIB_TABLE_SIZE;
    this.egCounter++;

    for (const ch of this.channels) {
      this.updatePhase(ch);
      this.updateEnvelope(ch.mod, ch);
      this.updateEnvelope(ch.car, ch);
    }
  }

  /** フェーズジェネレータ更新 */
  private updatePhase(ch: Channel): void {
    const fNum = ch.fNum;
    const block = ch.block;

    // フェーズ増分 = fNum × multiplier × 2^block / 2
    const modMult = MULTIPLIER_TABLE[ch.mod.mult] ?? 1;
    const carMult = MULTIPLIER_TABLE[ch.car.mult] ?? 1;

    let modInc = (fNum * modMult) << block;
    let carInc = (fNum * carMult) << block;

    // ビブラート適用
    if (ch.mod.vibrato) {
      modInc += this.getVibratoValue(fNum, block);
    }
    if (ch.car.vibrato) {
      carInc += this.getVibratoValue(fNum, block);
    }

    ch.mod.phase = (ch.mod.phase + modInc) & 0xfffff;
    ch.car.phase = (ch.car.phase + carInc) & 0xfffff;
  }

  /** ビブラート値の計算 */
  private getVibratoValue(fNum: number, block: number): number {
    const vibPhase = (this.vibCounter >> 10) & 7;
    // ±1/64 の周波数変調
    const shift = 7 - block;
    const vibAmt = (fNum >> Math.max(0, shift)) >> 1;
    switch (vibPhase) {
      case 0: case 4: return 0;
      case 1: case 3: return vibAmt >> 1;
      case 2: return vibAmt;
      case 5: case 7: return -(vibAmt >> 1);
      case 6: return -vibAmt;
      default: return 0;
    }
  }

  /** エンベロープジェネレータ更新 */
  private updateEnvelope(op: Operator, ch: Channel): void {
    const keyScaleRate = op.ksr
      ? (ch.block << 1) | (ch.fNum >> 8)
      : ch.block >> 1;

    switch (op.egState) {
      case EgState.Attack: {
        const rate = this.getEgRate(op.attackRate, keyScaleRate);
        if (rate >= 60) {
          op.egLevel = 0;
          op.egState = EgState.Decay;
        } else if (rate > 0) {
          const shift = EG_RATE_SHIFT[rate] ?? 0;
          if ((this.egCounter & ((1 << shift) - 1)) === 0) {
            const sel = EG_RATE_SELECT[rate] ?? 0;
            const step = (this.egCounter >> shift) & 7;
            const inc = EG_INCREMENT[sel]?.[step] ?? 0;
            if (inc > 0) {
              op.egLevel -= ((op.egLevel * inc) >> 3) + 1;
              if (op.egLevel <= 0) {
                op.egLevel = 0;
                op.egState = EgState.Decay;
              }
            }
          }
        }
        break;
      }

      case EgState.Decay: {
        const sl = op.sustainLevel === 15 ? 127 : op.sustainLevel << 3;
        const rate = this.getEgRate(op.decayRate, keyScaleRate);
        if (rate > 0) {
          const shift = EG_RATE_SHIFT[rate] ?? 0;
          if ((this.egCounter & ((1 << shift) - 1)) === 0) {
            const sel = EG_RATE_SELECT[rate] ?? 0;
            const step = (this.egCounter >> shift) & 7;
            const inc = EG_INCREMENT[sel]?.[step] ?? 0;
            op.egLevel = Math.min(127, op.egLevel + inc);
          }
        }
        if (op.egLevel >= sl) {
          op.egState = EgState.Sustain;
        }
        break;
      }

      case EgState.Sustain: {
        if (!op.egType) {
          // percussive (non-sustain type): サスティン中も減衰
          const rate = this.getEgRate(op.releaseRate, keyScaleRate);
          if (rate > 0) {
            const shift = EG_RATE_SHIFT[rate] ?? 0;
            if ((this.egCounter & ((1 << shift) - 1)) === 0) {
              const sel = EG_RATE_SELECT[rate] ?? 0;
              const step = (this.egCounter >> shift) & 7;
              const inc = EG_INCREMENT[sel]?.[step] ?? 0;
              op.egLevel = Math.min(127, op.egLevel + inc);
            }
          }
        }
        // sustain type: レベル維持 (何もしない)
        break;
      }

      case EgState.Release: {
        const rr = ch.sustain && op.egType ? 5 : op.releaseRate;
        const rate = this.getEgRate(rr, keyScaleRate);
        if (rate > 0) {
          const shift = EG_RATE_SHIFT[rate] ?? 0;
          if ((this.egCounter & ((1 << shift) - 1)) === 0) {
            const sel = EG_RATE_SELECT[rate] ?? 0;
            const step = (this.egCounter >> shift) & 7;
            const inc = EG_INCREMENT[sel]?.[step] ?? 0;
            op.egLevel = Math.min(127, op.egLevel + inc);
          }
        }
        break;
      }
    }
  }

  /** EG レートの計算 */
  private getEgRate(rate: number, keyScaleRate: number): number {
    if (rate === 0) return 0;
    return Math.min(63, rate * 4 + keyScaleRate);
  }

  /** AM (トレモロ) 値の計算 */
  private getAmValue(): number {
    // 三角波の AM — 0 ～ 13 の範囲 (1.0dB ≈ 4.8dB peak-to-peak)
    const pos = this.amCounter % AM_TABLE_SIZE;
    if (pos < 105) {
      return pos >> 3;
    }
    return (AM_TABLE_SIZE - 1 - pos) >> 3;
  }

  /** チャンネルの出力を計算 */
  private calcChannelOutput(ch: Channel): number {
    const mod = ch.mod;
    const car = ch.car;

    // --- Modulator 出力 ---
    const modPhase = (mod.phase >> 10) & 0x3ff;

    // フィードバック
    let modInput = modPhase;
    if (mod.feedback > 0) {
      const fbShift = 9 - mod.feedback;
      modInput = (modPhase + ((mod.fbOut0 + mod.fbOut1) >> fbShift)) & 0x3ff;
    }

    // 正弦波計算 (符号 + 対数)
    const modSign = modInput & 0x200;
    let modLogSin = logsin(modInput & 0x1ff);

    // mod EG + TL + KSL
    const modEgOut = mod.egLevel;
    const modKslVal = this.calcKsl(mod.ksl, ch.block, ch.fNum);
    modLogSin += modEgOut << 4;
    modLogSin += mod.totalLevel << 5;
    modLogSin += modKslVal << 4;

    // AM
    if (mod.am) {
      modLogSin += this.getAmValue() << 4;
    }

    let modOut = expVal(modLogSin);
    if (modSign !== 0) modOut = -modOut;

    // 波形選択
    if (mod.waveform !== 0 && (modInput & 0x200) !== 0) {
      modOut = 0; // 半波整流
    }

    // フィードバックバッファ更新
    mod.fbOut1 = mod.fbOut0;
    mod.fbOut0 = modOut;

    // --- Carrier 出力 ---
    const carPhase = (car.phase >> 10) & 0x3ff;
    const carInput = (carPhase + modOut) & 0x3ff;

    const carSign = carInput & 0x200;
    let carLogSin = logsin(carInput & 0x1ff);

    // car EG + volume + KSL
    const carEgOut = car.egLevel;
    const carKslVal = this.calcKsl(car.ksl, ch.block, ch.fNum);
    carLogSin += carEgOut << 4;
    carLogSin += ch.volume << 5;
    carLogSin += carKslVal << 4;

    // AM
    if (car.am) {
      carLogSin += this.getAmValue() << 4;
    }

    let carOut = expVal(carLogSin);
    if (carSign !== 0) carOut = -carOut;

    // 波形選択
    if (car.waveform !== 0 && (carInput & 0x200) !== 0) {
      carOut = 0;
    }

    return carOut;
  }

  /** KSL (キースケーリングレベル) の計算 */
  private calcKsl(kslSetting: number, block: number, fNum: number): number {
    if (kslSetting === 0) return 0;

    const fHigh = (fNum >> 5) & 0x0f;
    const kslBase = (KSL_TABLE[fHigh] ?? 0) - ((7 - block) << 3);
    const kslVal = Math.max(0, kslBase);

    switch (kslSetting) {
      case 1: return kslVal;
      case 2: return kslVal >> 1;
      case 3: return kslVal >> 2;
      default: return 0;
    }
  }

  /** 最終出力 (全 6ch の合算を正規化) */
  output(): number {
    let sum = 0;
    for (const ch of this.channels) {
      sum += this.calcChannelOutput(ch);
    }
    // 最大振幅: 各 ch ≈ 2048、6ch = 12288
    // APU とのバランス調整 (0.15 程度)
    return (sum / 12288) * 0.15;
  }

  reset(): void {
    this.regAddr = 0;
    this.customPatch.fill(0);
    this.egCounter = 0;
    this.amCounter = 0;
    this.vibCounter = 0;
    this.cpuCycleCounter = 0;

    for (const ch of this.channels) {
      ch.fNum = 0;
      ch.block = 0;
      ch.sustain = false;
      ch.keyOn = false;
      ch.patch = 0;
      ch.volume = 0;
      this.resetOperator(ch.mod);
      this.resetOperator(ch.car);
    }
  }

  private resetOperator(op: Operator): void {
    op.mult = 0;
    op.ksr = false;
    op.egType = false;
    op.vibrato = false;
    op.am = false;
    op.totalLevel = 0;
    op.ksl = 0;
    op.attackRate = 0;
    op.decayRate = 0;
    op.sustainLevel = 0;
    op.releaseRate = 0;
    op.feedback = 0;
    op.waveform = 0;
    op.phase = 0;
    op.egState = EgState.Release;
    op.egLevel = 127;
    op.fbOut0 = 0;
    op.fbOut1 = 0;
  }

  serialize(): Record<string, unknown> {
    return {
      regAddr: this.regAddr,
      customPatch: Array.from(this.customPatch),
      egCounter: this.egCounter,
      amCounter: this.amCounter,
      vibCounter: this.vibCounter,
      cpuCycleCounter: this.cpuCycleCounter,
      channels: this.channels.map(ch => ({
        fNum: ch.fNum, block: ch.block, sustain: ch.sustain,
        keyOn: ch.keyOn, patch: ch.patch, volume: ch.volume,
        mod: this.serializeOp(ch.mod),
        car: this.serializeOp(ch.car),
      })),
    };
  }

  private serializeOp(op: Operator): Record<string, unknown> {
    return {
      mult: op.mult, ksr: op.ksr, egType: op.egType,
      vibrato: op.vibrato, am: op.am, totalLevel: op.totalLevel,
      ksl: op.ksl, attackRate: op.attackRate, decayRate: op.decayRate,
      sustainLevel: op.sustainLevel, releaseRate: op.releaseRate,
      feedback: op.feedback, waveform: op.waveform,
      phase: op.phase, egState: op.egState, egLevel: op.egLevel,
      fbOut0: op.fbOut0, fbOut1: op.fbOut1,
    };
  }

  deserialize(data: Record<string, unknown>): void {
    this.regAddr = data["regAddr"] as number;
    if (Array.isArray(data["customPatch"])) {
      this.customPatch.set(data["customPatch"] as number[]);
    }
    this.egCounter = data["egCounter"] as number;
    this.amCounter = data["amCounter"] as number;
    this.vibCounter = data["vibCounter"] as number;
    this.cpuCycleCounter = data["cpuCycleCounter"] as number;

    const channelData = data["channels"] as Record<string, unknown>[];
    if (Array.isArray(channelData)) {
      for (let i = 0; i < NUM_CHANNELS && i < channelData.length; i++) {
        const cd = channelData[i]!;
        const ch = this.channels[i]!;
        ch.fNum = cd["fNum"] as number;
        ch.block = cd["block"] as number;
        ch.sustain = cd["sustain"] as boolean;
        ch.keyOn = cd["keyOn"] as boolean;
        ch.patch = cd["patch"] as number;
        ch.volume = cd["volume"] as number;
        this.deserializeOp(ch.mod, cd["mod"] as Record<string, unknown>);
        this.deserializeOp(ch.car, cd["car"] as Record<string, unknown>);
      }
    }
  }

  private deserializeOp(op: Operator, data: Record<string, unknown>): void {
    op.mult = data["mult"] as number;
    op.ksr = data["ksr"] as boolean;
    op.egType = data["egType"] as boolean;
    op.vibrato = data["vibrato"] as boolean;
    op.am = data["am"] as boolean;
    op.totalLevel = data["totalLevel"] as number;
    op.ksl = data["ksl"] as number;
    op.attackRate = data["attackRate"] as number;
    op.decayRate = data["decayRate"] as number;
    op.sustainLevel = data["sustainLevel"] as number;
    op.releaseRate = data["releaseRate"] as number;
    op.feedback = data["feedback"] as number;
    op.waveform = data["waveform"] as number;
    op.phase = data["phase"] as number;
    op.egState = data["egState"] as EgState;
    op.egLevel = data["egLevel"] as number;
    op.fbOut0 = data["fbOut0"] as number;
    op.fbOut1 = data["fbOut1"] as number;
  }
}
