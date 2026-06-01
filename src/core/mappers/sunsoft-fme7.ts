/**
 * Mapper 69 (Sunsoft FME-7 / Sunsoft 5B)。
 *
 * コマンド/パラメータレジスタ方式のバンク切替 + IRQ カウンタ +
 * Sunsoft 5B 拡張音源 (YM2149 互換 3ch PSG) を持つ。
 * Gimmick!、Batman: Return of the Joker 等で使用。
 *
 * - PRG ROM: 8KB × 4 バンク切替 ($6000 は ROM/RAM 切替可能)
 * - CHR ROM: 1KB × 8 バンク切替
 * - IRQ: CPU cycle ベースのカウントダウンカウンタ (16bit)
 * - 拡張音源: Sunsoft 5B (YM2149 互換 3ch PSG — tone + noise + envelope)
 *
 * レジスタマップ:
 *   $8000-$9FFF: コマンドレジスタ (下位 4bit で操作対象を選択)
 *   $A000-$BFFF: パラメータレジスタ (コマンドに応じたデータを書き込む)
 *   $C000-$DFFF: 拡張音源アドレスポート
 *   $E000-$FFFF: 拡張音源データポート
 *
 * 仕様参照: https://www.nesdev.org/wiki/Sunsoft_FME-7
 */

import type { Cart } from "../cart.ts";
import type { Mirroring } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const PRG_BANK_SIZE = 0x2000; // 8KB
const CHR_BANK_SIZE = 0x0400; // 1KB
const PRG_RAM_SIZE = 0x2000;  // 8KB

/**
 * Sunsoft 5B 音源定数。
 * YM2149 のマスタークロック = CPU クロック (1.789773 MHz)。
 * トーン周期レジスタの分周: 出力周波数 = master / (2 * 16 * period)。
 * ここでは CPU cycle 16 分周でトーンカウンタを更新する。
 */
const TONE_CLOCK_DIVIDER = 16;
const NOISE_CLOCK_DIVIDER = 16;

/** エンベロープ形状テーブル (YM2149 互換)。各形状は 64 ステップの音量値 (0-15)。 */
function buildEnvelopeShapes(): Uint8Array[] {
  const shapes: Uint8Array[] = [];
  for (let shape = 0; shape < 16; shape++) {
    const data = new Uint8Array(64);
    // YM2149 エンベロープ形状 (4bit: Continue, Attack, Alternate, Hold)
    const attack = (shape & 0x04) !== 0;
    const alternate = (shape & 0x02) !== 0;
    const hold = (shape & 0x01) !== 0;
    const cont = (shape & 0x08) !== 0;

    for (let step = 0; step < 64; step++) {
      const halfPeriod = Math.floor(step / 32);
      const pos = step & 31;

      if (!cont && halfPeriod >= 1) {
        // Continue=0: 最初の半周期後は 0
        data[step] = attack ? 0 : 0;
      } else if (cont) {
        if (hold) {
          if (halfPeriod === 0) {
            // 最初の半周期
            data[step] = attack ? pos : (31 - pos);
          } else {
            // Hold: 最終値を保持
            if (alternate) {
              data[step] = attack ? 31 : 0;
            } else {
              data[step] = attack ? 31 : 0;
            }
          }
        } else if (alternate) {
          // Alternate: 上下を繰り返す
          if (halfPeriod % 2 === 0) {
            data[step] = attack ? pos : (31 - pos);
          } else {
            data[step] = attack ? (31 - pos) : pos;
          }
        } else {
          // Continue, no alternate, no hold: 鋸歯波
          data[step] = attack ? pos : (31 - pos);
        }
      } else {
        // !cont, first half
        data[step] = attack ? pos : (31 - pos);
      }
    }

    // 5bit (0-31) → 4bit (0-15) に正規化
    for (let i = 0; i < 64; i++) {
      data[i] = data[i]! >> 1;
    }
    shapes.push(data);
  }
  return shapes;
}

const ENVELOPE_SHAPES = buildEnvelopeShapes();

export class MapperSunsoftFme7 implements Mapper {
  irqPending = false;
  onMirroringChange: ((m: Mirroring) => void) | null = null;

  private readonly prgRom: Uint8Array;
  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
  private readonly chrData: Uint8Array;
  private readonly useChrRam: boolean;

  private readonly prgBankCount: number;
  private readonly chrBankCount: number;

  /** コマンドレジスタ ($8000 への書き込みで設定) */
  private command = 0;

  /** CHR バンクレジスタ 0-7 (1KB 単位) */
  private readonly chrBanks = new Uint8Array(8);

  /** PRG バンクレジスタ (8KB 単位、4 ウィンドウ: $6000, $8000, $A000, $C000) */
  private readonly prgBanks = new Uint8Array(4);

  /** $6000-$7FFF の PRG ROM/RAM 切替フラグ */
  private prgRamEnabled = false;
  /** $6000-$7FFF が ROM バンクを使うか RAM を使うか */
  private prgRamSelect = false;

  /** ミラーリングモード */
  private mirrorMode = 0;

  /** IRQ カウンタ (16bit) */
  private irqCounter = 0;
  /** IRQ カウンタ有効フラグ */
  private irqCounterEnabled = false;
  /** IRQ 有効フラグ */
  private irqEnabled = false;

  // === Sunsoft 5B 拡張音源 ===

  /** 音源アドレスレジスタ ($C000 への書き込みで設定) */
  private audioRegAddr = 0;

  /** トーン周期レジスタ (ch A/B/C × 12bit) */
  private readonly tonePeriod = new Uint16Array(3);
  /** トーンカウンタ */
  private readonly toneCounter = [0, 0, 0];
  /** トーン出力フリップフロップ (0 or 1) */
  private readonly toneOutput = [0, 0, 0];

  /** ノイズ周期レジスタ (5bit) */
  private noisePeriod = 0;
  /** ノイズカウンタ */
  private noiseCounter = 0;
  /** ノイズ LFSR (17bit、初期値 1) */
  private noiseLfsr = 1;

  /** ミキサー: トーン無効 / ノイズ無効 (各 ch 1bit) */
  private toneDisable = 0;
  private noiseDisable = 0;

  /** チャンネル音量 (4bit) + エンベロープモード (bit4) */
  private readonly channelVolume = new Uint8Array(3);
  /** エンベロープ使用フラグ (channelVolume bit4) */
  private readonly envelopeMode = new Uint8Array(3);

  /** エンベロープ周期 (16bit) */
  private envelopePeriod = 0;
  /** エンベロープカウンタ */
  private envelopeCounter = 0;
  /** エンベロープ位置 (0-63) */
  private envelopePosition = 0;
  /** エンベロープ形状 (0-15) */
  private envelopeShape = 0;

  /** 拡張音源の分周カウンタ */
  private toneClockCounter = 0;
  private noiseClockCounter = 0;

  /** 最終音声出力値 */
  private soundOutput = 0;

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    this.prgBankCount = Math.max(1, cart.prgRom.length / PRG_BANK_SIZE);

    if (cart.header.chrRomSize === 0) {
      this.chrData = new Uint8Array(0x2000);
      this.useChrRam = true;
      this.chrBankCount = this.chrData.length / CHR_BANK_SIZE;
    } else {
      this.chrData = cart.chrRom;
      this.useChrRam = false;
      this.chrBankCount = Math.max(1, cart.chrRom.length / CHR_BANK_SIZE);
    }

    // 初期状態: PRG 最終バンクに固定
    this.prgBanks[3] = this.prgBankCount - 1;
  }

  readPrg(addr: number): number {
    if (addr < 0xa000) {
      // $8000-$9FFF: PRG bank 1 (コマンド 9)
      const bank = (this.prgBanks[1] ?? 0) & 0x3f;
      return this.prgRom[(bank % this.prgBankCount) * PRG_BANK_SIZE + (addr & 0x1fff)] ?? 0;
    }
    if (addr < 0xc000) {
      // $A000-$BFFF: PRG bank 2 (コマンド 10)
      const bank = (this.prgBanks[2] ?? 0) & 0x3f;
      return this.prgRom[(bank % this.prgBankCount) * PRG_BANK_SIZE + (addr & 0x1fff)] ?? 0;
    }
    if (addr < 0xe000) {
      // $C000-$DFFF: PRG bank 3 (コマンド 11)
      const bank = (this.prgBanks[3] ?? 0) & 0x3f;
      return this.prgRom[(bank % this.prgBankCount) * PRG_BANK_SIZE + (addr & 0x1fff)] ?? 0;
    }
    // $E000-$FFFF: 最終バンク固定
    const lastBank = this.prgBankCount - 1;
    return this.prgRom[lastBank * PRG_BANK_SIZE + (addr & 0x1fff)] ?? 0;
  }

  writePrg(addr: number, value: number): void {
    if (addr < 0xa000) {
      // $8000-$9FFF: コマンドレジスタ
      this.command = value & 0x0f;
      return;
    }
    if (addr < 0xc000) {
      // $A000-$BFFF: パラメータレジスタ
      this.writeParameter(value);
      return;
    }
    if (addr < 0xe000) {
      // $C000-$DFFF: 拡張音源アドレスポート
      this.audioRegAddr = value & 0x0f;
      return;
    }
    // $E000-$FFFF: 拡張音源データポート
    this.writeAudioRegister(value);
  }

  /** パラメータレジスタ ($A000) への書き込み */
  private writeParameter(value: number): void {
    switch (this.command) {
      case 0: case 1: case 2: case 3:
      case 4: case 5: case 6: case 7:
        // CHR バンク切替 (1KB 単位)
        this.chrBanks[this.command] = value;
        break;
      case 8:
        // PRG bank 0 ($6000-$7FFF) + ROM/RAM 制御
        this.prgBanks[0] = value & 0x3f;
        this.prgRamEnabled = (value & 0x80) !== 0;
        this.prgRamSelect = (value & 0x40) !== 0;
        break;
      case 9:
        // PRG bank 1 ($8000-$9FFF)
        this.prgBanks[1] = value & 0x3f;
        break;
      case 10:
        // PRG bank 2 ($A000-$BFFF)
        this.prgBanks[2] = value & 0x3f;
        break;
      case 11:
        // PRG bank 3 ($C000-$DFFF)
        this.prgBanks[3] = value & 0x3f;
        break;
      case 12:
        // ミラーリング制御
        this.mirrorMode = value & 0x03;
        this.updateMirroring();
        break;
      case 13:
        // IRQ 制御
        this.irqCounterEnabled = (value & 0x80) !== 0;
        this.irqEnabled = (value & 0x01) !== 0;
        if (!this.irqEnabled) {
          this.irqPending = false;
        }
        break;
      case 14:
        // IRQ カウンタ下位 8bit
        this.irqCounter = (this.irqCounter & 0xff00) | value;
        break;
      case 15:
        // IRQ カウンタ上位 8bit
        this.irqCounter = (this.irqCounter & 0x00ff) | (value << 8);
        break;
    }
  }

  readChr(addr: number): number {
    if (addr >= 0x2000) return 0;

    if (this.useChrRam) {
      return this.chrData[addr & 0x1fff] ?? 0;
    }

    const slot = (addr >> 10) & 7;
    const bank = (this.chrBanks[slot] ?? 0) % this.chrBankCount;
    return this.chrData[bank * CHR_BANK_SIZE + (addr & 0x03ff)] ?? 0;
  }

  writeChr(addr: number, value: number): void {
    if (addr >= 0x2000) return;
    if (this.useChrRam) {
      this.chrData[addr & 0x1fff] = value;
    }
  }

  readPrgRam(addr: number): number {
    if (!this.prgRamEnabled) return 0;
    if (this.prgRamSelect) {
      // RAM モード
      return this.prgRam[addr & 0x1fff] ?? 0;
    }
    // ROM モード: PRG bank 0 を ROM として読む
    const bank = (this.prgBanks[0] ?? 0) & 0x3f;
    return this.prgRom[(bank % this.prgBankCount) * PRG_BANK_SIZE + (addr & 0x1fff)] ?? 0;
  }

  writePrgRam(addr: number, value: number): void {
    if (!this.prgRamEnabled || !this.prgRamSelect) return;
    this.prgRam[addr & 0x1fff] = value;
  }

  getPrgRam(): Uint8Array | null {
    return this.prgRam;
  }

  setPrgRam(data: Uint8Array): void {
    this.prgRam.set(data.subarray(0, PRG_RAM_SIZE));
  }

  reset(): void {
    this.command = 0;
    this.chrBanks.fill(0);
    this.prgBanks.fill(0);
    this.prgBanks[3] = this.prgBankCount - 1;
    this.prgRamEnabled = false;
    this.prgRamSelect = false;
    this.mirrorMode = 0;
    this.irqCounter = 0;
    this.irqCounterEnabled = false;
    this.irqEnabled = false;
    this.irqPending = false;
    // 拡張音源リセット
    this.audioRegAddr = 0;
    this.tonePeriod.fill(0);
    this.toneCounter[0] = this.toneCounter[1] = this.toneCounter[2] = 0;
    this.toneOutput[0] = this.toneOutput[1] = this.toneOutput[2] = 0;
    this.noisePeriod = 0;
    this.noiseCounter = 0;
    this.noiseLfsr = 1;
    this.toneDisable = 0;
    this.noiseDisable = 0;
    this.channelVolume.fill(0);
    this.envelopeMode.fill(0);
    this.envelopePeriod = 0;
    this.envelopeCounter = 0;
    this.envelopePosition = 0;
    this.envelopeShape = 0;
    this.toneClockCounter = 0;
    this.noiseClockCounter = 0;
    this.soundOutput = 0;
  }

  clockIrqCounter(): void {
    // FME-7 の IRQ は CPU cycle ベース。scanline ベースではない。
  }

  /** CPU サイクルごとの IRQ + 音源 clocking */
  cpuCycleTick(): void {
    // IRQ カウンタ
    if (this.irqCounterEnabled) {
      this.irqCounter = (this.irqCounter - 1) & 0xffff;
      if (this.irqCounter === 0xffff && this.irqEnabled) {
        this.irqPending = true;
      }
    }

    // 拡張音源: トーンジェネレータ更新
    this.toneClockCounter++;
    if (this.toneClockCounter >= TONE_CLOCK_DIVIDER) {
      this.toneClockCounter = 0;
      this.tickToneGenerators();
      this.tickEnvelope();
    }

    // ノイズジェネレータ更新
    this.noiseClockCounter++;
    if (this.noiseClockCounter >= NOISE_CLOCK_DIVIDER) {
      this.noiseClockCounter = 0;
      this.tickNoiseGenerator();
    }

    this.updateSoundOutput();
  }

  /** 拡張音源レジスタ ($E000) への書き込み */
  private writeAudioRegister(value: number): void {
    switch (this.audioRegAddr) {
      case 0x00: // ch A トーン周期下位
        this.tonePeriod[0] = (this.tonePeriod[0]! & 0xf00) | value;
        break;
      case 0x01: // ch A トーン周期上位
        this.tonePeriod[0] = (this.tonePeriod[0]! & 0x0ff) | ((value & 0x0f) << 8);
        break;
      case 0x02: // ch B トーン周期下位
        this.tonePeriod[1] = (this.tonePeriod[1]! & 0xf00) | value;
        break;
      case 0x03: // ch B トーン周期上位
        this.tonePeriod[1] = (this.tonePeriod[1]! & 0x0ff) | ((value & 0x0f) << 8);
        break;
      case 0x04: // ch C トーン周期下位
        this.tonePeriod[2] = (this.tonePeriod[2]! & 0xf00) | value;
        break;
      case 0x05: // ch C トーン周期上位
        this.tonePeriod[2] = (this.tonePeriod[2]! & 0x0ff) | ((value & 0x0f) << 8);
        break;
      case 0x06: // ノイズ周期
        this.noisePeriod = value & 0x1f;
        break;
      case 0x07: // ミキサー制御
        this.toneDisable = value & 0x07;
        this.noiseDisable = (value >> 3) & 0x07;
        break;
      case 0x08: // ch A 音量
        this.channelVolume[0] = value & 0x0f;
        this.envelopeMode[0] = (value & 0x10) !== 0 ? 1 : 0;
        break;
      case 0x09: // ch B 音量
        this.channelVolume[1] = value & 0x0f;
        this.envelopeMode[1] = (value & 0x10) !== 0 ? 1 : 0;
        break;
      case 0x0a: // ch C 音量
        this.channelVolume[2] = value & 0x0f;
        this.envelopeMode[2] = (value & 0x10) !== 0 ? 1 : 0;
        break;
      case 0x0b: // エンベロープ周期下位
        this.envelopePeriod = (this.envelopePeriod & 0xff00) | value;
        break;
      case 0x0c: // エンベロープ周期上位
        this.envelopePeriod = (this.envelopePeriod & 0x00ff) | (value << 8);
        break;
      case 0x0d: // エンベロープ形状
        this.envelopeShape = value & 0x0f;
        this.envelopePosition = 0;
        this.envelopeCounter = 0;
        break;
    }
  }

  /** トーンジェネレータ更新 (分周後に呼ばれる) */
  private tickToneGenerators(): void {
    for (let ch = 0; ch < 3; ch++) {
      const period = this.tonePeriod[ch]!;
      if (period === 0) {
        this.toneOutput[ch] = 1;
        continue;
      }
      this.toneCounter[ch]!--;
      if (this.toneCounter[ch]! <= 0) {
        this.toneCounter[ch] = period;
        this.toneOutput[ch] = this.toneOutput[ch]! ^ 1;
      }
    }
  }

  /** ノイズジェネレータ更新 (分周後に呼ばれる) */
  private tickNoiseGenerator(): void {
    const period = this.noisePeriod || 1;
    this.noiseCounter--;
    if (this.noiseCounter <= 0) {
      this.noiseCounter = period;
      // 17bit LFSR: bit0 XOR bit3
      const bit = ((this.noiseLfsr ^ (this.noiseLfsr >> 3)) & 1);
      this.noiseLfsr = (this.noiseLfsr >> 1) | (bit << 16);
    }
  }

  /** エンベロープ更新 */
  private tickEnvelope(): void {
    const period = this.envelopePeriod || 1;
    this.envelopeCounter++;
    if (this.envelopeCounter >= period) {
      this.envelopeCounter = 0;
      if (this.envelopePosition < 63) {
        this.envelopePosition++;
      }
    }
  }

  /** 音声出力の更新 */
  private updateSoundOutput(): void {
    let output = 0;
    const noiseOut = this.noiseLfsr & 1;

    for (let ch = 0; ch < 3; ch++) {
      const toneEn = ((this.toneDisable >> ch) & 1) === 0;
      const noiseEn = ((this.noiseDisable >> ch) & 1) === 0;

      // トーンとノイズの AND (無効時は常に 1 = パススルー)
      const tone = toneEn ? (this.toneOutput[ch] ?? 0) : 1;
      const noise = noiseEn ? noiseOut : 1;

      if ((tone & noise) === 0) continue;

      // 音量: エンベロープモードなら形状テーブル参照
      let vol: number;
      if (this.envelopeMode[ch]) {
        const shape = ENVELOPE_SHAPES[this.envelopeShape];
        vol = shape?.[this.envelopePosition] ?? 0;
      } else {
        vol = this.channelVolume[ch] ?? 0;
      }

      output += vol;
    }

    this.soundOutput = output;
  }

  /** 拡張音源出力 (APU ミキサー統合用) */
  audioOutput(): number {
    // 3ch × 最大音量 15 = 45。正規化して APU とバランスを取る。
    return (this.soundOutput / 45) * 0.15;
  }

  /** ミラーリング更新 */
  private updateMirroring(): void {
    const mirrorings: Mirroring[] = ["vertical", "horizontal", "single-lower", "single-upper"];
    const m = mirrorings[this.mirrorMode & 3];
    if (m !== undefined) {
      this.onMirroringChange?.(m);
    }
  }

  mapperId(): number { return 69; }

  serializeMapper(): Record<string, unknown> {
    return {
      command: this.command,
      chrBanks: Array.from(this.chrBanks),
      prgBanks: Array.from(this.prgBanks),
      prgRamEnabled: this.prgRamEnabled,
      prgRamSelect: this.prgRamSelect,
      mirrorMode: this.mirrorMode,
      irqCounter: this.irqCounter,
      irqCounterEnabled: this.irqCounterEnabled,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      audioRegAddr: this.audioRegAddr,
      tonePeriod: Array.from(this.tonePeriod),
      toneCounter: [...this.toneCounter],
      toneOutput: [...this.toneOutput],
      noisePeriod: this.noisePeriod,
      noiseCounter: this.noiseCounter,
      noiseLfsr: this.noiseLfsr,
      toneDisable: this.toneDisable,
      noiseDisable: this.noiseDisable,
      channelVolume: Array.from(this.channelVolume),
      envelopeMode: Array.from(this.envelopeMode),
      envelopePeriod: this.envelopePeriod,
      envelopeCounter: this.envelopeCounter,
      envelopePosition: this.envelopePosition,
      envelopeShape: this.envelopeShape,
      toneClockCounter: this.toneClockCounter,
      noiseClockCounter: this.noiseClockCounter,
      soundOutput: this.soundOutput,
      prgRam: Array.from(this.prgRam),
      chrRam: this.useChrRam ? Array.from(this.chrData) : undefined,
    };
  }

  deserializeMapper(data: Record<string, unknown>): void {
    this.command = data["command"] as number;
    if (Array.isArray(data["chrBanks"])) this.chrBanks.set(data["chrBanks"] as number[]);
    if (Array.isArray(data["prgBanks"])) this.prgBanks.set(data["prgBanks"] as number[]);
    this.prgRamEnabled = data["prgRamEnabled"] as boolean;
    this.prgRamSelect = data["prgRamSelect"] as boolean;
    this.mirrorMode = data["mirrorMode"] as number;
    this.irqCounter = data["irqCounter"] as number;
    this.irqCounterEnabled = data["irqCounterEnabled"] as boolean;
    this.irqEnabled = data["irqEnabled"] as boolean;
    this.irqPending = data["irqPending"] as boolean;
    this.audioRegAddr = data["audioRegAddr"] as number;
    if (Array.isArray(data["tonePeriod"])) this.tonePeriod.set(data["tonePeriod"] as number[]);
    if (Array.isArray(data["toneCounter"])) {
      const tc = data["toneCounter"] as number[];
      this.toneCounter[0] = tc[0] ?? 0; this.toneCounter[1] = tc[1] ?? 0; this.toneCounter[2] = tc[2] ?? 0;
    }
    if (Array.isArray(data["toneOutput"])) {
      const to = data["toneOutput"] as number[];
      this.toneOutput[0] = to[0] ?? 0; this.toneOutput[1] = to[1] ?? 0; this.toneOutput[2] = to[2] ?? 0;
    }
    this.noisePeriod = data["noisePeriod"] as number;
    this.noiseCounter = data["noiseCounter"] as number;
    this.noiseLfsr = data["noiseLfsr"] as number;
    this.toneDisable = data["toneDisable"] as number;
    this.noiseDisable = data["noiseDisable"] as number;
    if (Array.isArray(data["channelVolume"])) this.channelVolume.set(data["channelVolume"] as number[]);
    if (Array.isArray(data["envelopeMode"])) this.envelopeMode.set(data["envelopeMode"] as number[]);
    this.envelopePeriod = data["envelopePeriod"] as number;
    this.envelopeCounter = data["envelopeCounter"] as number;
    this.envelopePosition = data["envelopePosition"] as number;
    this.envelopeShape = data["envelopeShape"] as number;
    this.toneClockCounter = data["toneClockCounter"] as number;
    this.noiseClockCounter = data["noiseClockCounter"] as number;
    this.soundOutput = data["soundOutput"] as number;
    if (Array.isArray(data["prgRam"])) this.prgRam.set(data["prgRam"] as number[]);
    if (this.useChrRam && Array.isArray(data["chrRam"])) {
      this.chrData.set((data["chrRam"] as number[]).slice(0, this.chrData.length));
    }
    this.onMirroringChange && this.updateMirroring();
  }
}
