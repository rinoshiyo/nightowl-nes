/**
 * Mapper 5 (MMC5 / ExROM)。
 *
 * NES 最複雑の Mapper。Castlevania III: Dracula's Curse が最重要動作対象。
 *
 * 機能:
 * - PRG バンク切替: 4 モード (32KB / 16KB+16KB / 16KB+8KB+8KB / 8KB×4)
 * - CHR バンク切替: 8×1KB or 4×2KB (スプライト/背景独立バンク)
 * - ExRAM (1KB): ネームテーブル拡張属性 / 追加ネームテーブル / 汎用 RAM
 * - ネームテーブルマッピング: 4 ソース (内部 CIRAM / ExRAM / fill mode)
 * - IRQ scanline カウンタ
 * - 8×8 → 16bit unsigned 乗算器
 * - 拡張音源: pulse ×2
 *
 * 仕様参照: https://www.nesdev.org/wiki/MMC5
 */

import type { Cart } from "../cart.ts";
import type { Mapper } from "./mapper.ts";
import { LENGTH_TABLE } from "../apu-length.ts";
import { DUTY_TABLE } from "../apu-pulse.ts";

const PRG_BANK_SIZE_8K = 0x2000;
const CHR_BANK_SIZE_1K = 0x0400;
const PRG_RAM_SIZE = 0x10000; // 64KB (最大)
const EXRAM_SIZE = 0x0400;    // 1KB

/** MMC5 pulse 音源の正規化定数 */
const PULSE_OUTPUT_SCALE = 0.12 / 30; // 2ch × max vol 15

/** エンベロープ分周期 (240Hz, CPU 1.789773MHz / 240 ≈ 7457) */
const ENVELOPE_PERIOD = 7457;

export class MapperMmc5 implements Mapper {
  irqPending = false;
  onMirroringChange: ((m: import("../cart.ts").Mirroring) => void) | null = null;

  private readonly prgRom: Uint8Array;
  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
  private readonly chrData: Uint8Array;
  private readonly useChrRam: boolean;
  private readonly exRam = new Uint8Array(EXRAM_SIZE);

  /** PPU CIRAM (VRAM) への参照 — NesConsole が設定 */
  ciram: Uint8Array | null = null;

  private readonly prgBankCount8k: number;
  private readonly chrBankCount1k: number;

  // --- PRG バンク切替 ---
  private prgMode = 3;              // $5100: PRG バンクモード (0-3)
  private readonly prgBanks = new Uint8Array(5); // $5113-$5117 のバンクレジスタ (5 本)
  private prgRamProtect1 = 0;       // $5102
  private prgRamProtect2 = 0;       // $5103

  // --- CHR バンク切替 ---
  private chrMode = 0;              // $5101: CHR バンクモード (0-3)
  private readonly chrBanksSprite = new Uint16Array(8); // $5120-$5127 (1KB 単位)
  private readonly chrBanksBg = new Uint16Array(4);     // $5128-$512B (1KB 単位)
  private chrBankHighBits = 0;      // $5130: 上位 2bit
  private lastChrWrite: "sprite" | "bg" = "sprite";

  // --- ExRAM ---
  private exRamMode = 0;            // $5104: ExRAM モード (0-3)

  // --- ネームテーブルマッピング ---
  private ntMapping = 0;            // $5105: ネームテーブルマッピング
  private fillTile = 0;             // $5106: fill モードタイル
  private fillAttr = 0;             // $5107: fill モード属性
  private fillAttrByte = 0;         // $5107 から計算済みの属性バイト

  // --- IRQ ---
  private irqTarget = 0;            // $5203: IRQ 比較値
  private irqEnabled = false;       // $5204 bit 7
  private irqScanlineCounter = 0;   // 現在のスキャンライン
  private inFrame = false;          // PPU が画面描画中か

  // --- 乗算器 ---
  private multiplicand = 0;         // $5205
  private multiplier = 0;           // $5206
  private productLo = 0;
  private productHi = 0;

  // --- 拡張音源 (pulse × 2) ---
  private readonly pulseEnabled = [false, false];
  private readonly pulseDuty = [0, 0];
  private readonly pulseVolume = [0, 0];
  private readonly pulseConstant = [false, false];
  private readonly pulsePeriod = [0, 0];
  private readonly pulseTimer = [0, 0];
  private readonly pulseSequencePos = [0, 0];
  private readonly pulseLengthCounter = [0, 0];
  private readonly pulseEnvelopeStart = [false, false];
  private readonly pulseEnvelopeCounter = [0, 0];
  private readonly pulseEnvelopeDecay = [0, 0];
  private readonly pulseEnvelopeDivider = [0, 0];
  private readonly pulseHalt = [false, false];
  private envelopeTickCounter = 0;
  private halfFrameToggle = false;

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    this.prgBankCount8k = Math.max(1, cart.prgRom.length / PRG_BANK_SIZE_8K);

    if (cart.header.chrRomSize === 0) {
      this.chrData = new Uint8Array(0x2000);
      this.useChrRam = true;
      this.chrBankCount1k = 8;
    } else {
      this.chrData = cart.chrRom;
      this.useChrRam = false;
      this.chrBankCount1k = Math.max(1, cart.chrRom.length / CHR_BANK_SIZE_1K);
    }

    // デフォルト: 最終バンクを全域にマッピング ($5117 = index 4)
    this.prgBanks[4] = ((this.prgBankCount8k - 1) | 0x80) & 0xff;
  }

  readPrg(addr: number): number {
    const bank8k = this.resolvePrgBank(addr);
    if (bank8k < 0) {
      // PRG RAM
      const ramBank = (-bank8k - 1) & 7;
      const offset = addr & 0x1fff;
      return this.prgRam[ramBank * PRG_BANK_SIZE_8K + offset] ?? 0;
    }
    const offset = addr & 0x1fff;
    return this.prgRom[(bank8k % this.prgBankCount8k) * PRG_BANK_SIZE_8K + offset] ?? 0;
  }

  writePrg(addr: number, value: number): void {
    // PRG ROM 領域への書き込み → MMC5 は PRG ROM を書き込み不可
    // ただし PRG RAM モード時はここで RAM に書く
    const bank8k = this.resolvePrgBank(addr);
    if (bank8k < 0 && this.isPrgRamWriteEnabled()) {
      const ramBank = (-bank8k - 1) & 7;
      const offset = addr & 0x1fff;
      this.prgRam[ramBank * PRG_BANK_SIZE_8K + offset] = value;
    }
  }

  readPrgRam(addr: number): number {
    // $6000-$7FFF: PRG RAM (バンク 0 を使用 — $5113 で切替可能)
    const ramBank = this.prgBanks[0]! & 0x07;
    const offset = addr & 0x1fff;
    return this.prgRam[ramBank * PRG_BANK_SIZE_8K + offset] ?? 0;
  }

  writePrgRam(addr: number, value: number): void {
    if (!this.isPrgRamWriteEnabled()) return;
    const ramBank = this.prgBanks[0]! & 0x07;
    const offset = addr & 0x1fff;
    this.prgRam[ramBank * PRG_BANK_SIZE_8K + offset] = value;
  }

  getPrgRam(): Uint8Array | null {
    return this.prgRam;
  }

  setPrgRam(data: Uint8Array): void {
    this.prgRam.set(data.subarray(0, this.prgRam.length));
  }

  readChr(addr: number): number {
    if (this.useChrRam) {
      return this.chrData[addr & 0x1fff] ?? 0;
    }
    const bank1k = this.resolveChrBank(addr);
    const offset = addr & 0x03ff;
    const index = (bank1k % this.chrBankCount1k) * CHR_BANK_SIZE_1K + offset;
    return this.chrData[index] ?? 0;
  }

  writeChr(addr: number, value: number): void {
    if (!this.useChrRam) return;
    this.chrData[addr & 0x1fff] = value;
  }

  reset(): void {
    this.prgMode = 3;
    this.prgBanks.fill(0);
    this.prgBanks[4] = ((this.prgBankCount8k - 1) | 0x80) & 0xff;
    this.prgRamProtect1 = 0;
    this.prgRamProtect2 = 0;
    this.chrMode = 0;
    this.chrBanksSprite.fill(0);
    this.chrBanksBg.fill(0);
    this.chrBankHighBits = 0;
    this.lastChrWrite = "sprite";
    this.exRamMode = 0;
    this.ntMapping = 0;
    this.fillTile = 0;
    this.fillAttr = 0;
    this.fillAttrByte = 0;
    this.irqTarget = 0;
    this.irqEnabled = false;
    this.irqScanlineCounter = 0;
    this.inFrame = false;
    this.irqPending = false;
    this.multiplicand = 0;
    this.multiplier = 0;
    this.productLo = 0;
    this.productHi = 0;
    this.exRam.fill(0);
    for (let i = 0; i < 2; i++) {
      this.pulseEnabled[i] = false;
      this.pulseDuty[i] = 0;
      this.pulseVolume[i] = 0;
      this.pulseConstant[i] = false;
      this.pulsePeriod[i] = 0;
      this.pulseTimer[i] = 0;
      this.pulseSequencePos[i] = 0;
      this.pulseLengthCounter[i] = 0;
      this.pulseEnvelopeStart[i] = false;
      this.pulseEnvelopeCounter[i] = 0;
      this.pulseEnvelopeDecay[i] = 0;
      this.pulseEnvelopeDivider[i] = 0;
      this.pulseHalt[i] = false;
    }
    this.envelopeTickCounter = 0;
    this.halfFrameToggle = false;
  }

  mapperId(): number { return 5; }

  clockIrqCounter(): void {
    // PPU が scanline ごとに呼ぶ (dot 260: 可視 240 + pre-render 1 = 241 回/フレーム)
    this.irqScanlineCounter++;

    if (this.irqScanlineCounter <= 240) {
      this.inFrame = true;
    }

    if (this.irqScanlineCounter === this.irqTarget) {
      if (this.irqEnabled) {
        this.irqPending = true;
      }
    }

    // pre-render scanline (241 回目) でリセット
    if (this.irqScanlineCounter > 240) {
      this.irqScanlineCounter = 0;
      this.inFrame = false;
    }
  }

  cpuCycleTick(): void {
    // pulse タイマー更新
    for (let ch = 0; ch < 2; ch++) {
      if (this.pulseTimer[ch]! > 0) {
        this.pulseTimer[ch]!--;
      } else {
        this.pulseTimer[ch] = this.pulsePeriod[ch]!;
        this.pulseSequencePos[ch] = (this.pulseSequencePos[ch]! + 1) & 7;
      }
    }

    // エンベロープ & 長さカウンタ tick (240Hz 相当)
    this.envelopeTickCounter++;
    if (this.envelopeTickCounter >= ENVELOPE_PERIOD) {
      this.envelopeTickCounter = 0;
      this.tickEnvelopes();
      // 長さカウンタは 120Hz (half-frame rate = エンベロープの半分)
      this.halfFrameToggle = !this.halfFrameToggle;
      if (this.halfFrameToggle) {
        this.tickLengthCounters();
      }
    }
  }

  audioOutput(): number {
    let output = 0;
    for (let ch = 0; ch < 2; ch++) {
      if (!this.pulseEnabled[ch] || this.pulseLengthCounter[ch]! <= 0) continue;
      if (this.pulsePeriod[ch]! < 8) continue; // 超高周波はミュート

      const duty = DUTY_TABLE[this.pulseDuty[ch]!];
      if (!duty) continue;
      const wave = duty[this.pulseSequencePos[ch]!];
      if (!wave) continue;

      const vol = this.pulseConstant[ch]
        ? this.pulseVolume[ch]!
        : this.pulseEnvelopeDecay[ch]!;
      output += vol;
    }
    return output * PULSE_OUTPUT_SCALE;
  }

  /** $5000-$5FFF レジスタ読み出し */
  readRegister(addr: number): number {
    if (addr >= 0x5c00 && addr < 0x6000) {
      // ExRAM 読み出し (モード 2,3 のみ読み出し可能)
      if (this.exRamMode >= 2) {
        return this.exRam[addr & 0x03ff] ?? 0;
      }
      return 0;
    }

    switch (addr) {
      case 0x5015:
        return (this.pulseLengthCounter[0]! > 0 ? 1 : 0)
             | (this.pulseLengthCounter[1]! > 0 ? 2 : 0);
      case 0x5204: {
        // IRQ ステータス読み出し + pending クリア
        const result = (this.irqPending ? 0x80 : 0) | (this.inFrame ? 0x40 : 0);
        this.irqPending = false;
        return result;
      }
      case 0x5205:
        return this.productLo;
      case 0x5206:
        return this.productHi;
      default:
        return 0;
    }
  }

  /** $5000-$5FFF レジスタ書き込み */
  writeRegister(addr: number, value: number): void {
    // ExRAM 書き込み ($5C00-$5FFF)
    if (addr >= 0x5c00 && addr < 0x6000) {
      if (this.exRamMode < 2) {
        // モード 0,1: NT データまたは拡張属性として書き込み可能
        this.exRam[addr & 0x03ff] = value;
      } else if (this.exRamMode === 2) {
        // モード 2: 汎用 RAM として書き込み可能
        this.exRam[addr & 0x03ff] = value;
      }
      // モード 3: 読み取り専用
      return;
    }

    // 音源レジスタ ($5000-$5015)
    if (addr >= 0x5000 && addr < 0x5008) {
      this.writePulseRegister(addr, value);
      return;
    }
    if (addr === 0x5015) {
      // 音源有効化
      this.pulseEnabled[0] = (value & 1) !== 0;
      this.pulseEnabled[1] = (value & 2) !== 0;
      if (!this.pulseEnabled[0]) this.pulseLengthCounter[0] = 0;
      if (!this.pulseEnabled[1]) this.pulseLengthCounter[1] = 0;
      return;
    }

    switch (addr) {
      case 0x5100:
        this.prgMode = value & 3;
        break;
      case 0x5101:
        this.chrMode = value & 3;
        break;
      case 0x5102:
        this.prgRamProtect1 = value & 3;
        break;
      case 0x5103:
        this.prgRamProtect2 = value & 3;
        break;
      case 0x5104:
        this.exRamMode = value & 3;
        break;
      case 0x5105:
        this.ntMapping = value;
        break;
      case 0x5106:
        this.fillTile = value;
        break;
      case 0x5107: {
        this.fillAttr = value & 3;
        const a = this.fillAttr;
        this.fillAttrByte = (a << 6) | (a << 4) | (a << 2) | a;
        break;
      }

      // PRG バンク ($5113-$5117)
      case 0x5113:
        this.prgBanks[0] = value;
        break;
      case 0x5114:
        this.prgBanks[1] = value;
        break;
      case 0x5115:
        this.prgBanks[2] = value;
        break;
      case 0x5116:
        this.prgBanks[3] = value;
        break;
      case 0x5117:
        // $E000-$FFFF: ROM のみ (bit 7 は常に 1 として扱う)
        this.prgBanks[4] = value | 0x80;
        break;

      // CHR バンク — スプライト用 ($5120-$5127)
      case 0x5120: case 0x5121: case 0x5122: case 0x5123:
      case 0x5124: case 0x5125: case 0x5126: case 0x5127:
        this.chrBanksSprite[addr - 0x5120] = value | (this.chrBankHighBits << 8);
        this.lastChrWrite = "sprite";
        break;

      // CHR バンク — 背景用 ($5128-$512B)
      case 0x5128: case 0x5129: case 0x512a: case 0x512b:
        this.chrBanksBg[addr - 0x5128] = value | (this.chrBankHighBits << 8);
        this.lastChrWrite = "bg";
        break;

      case 0x5130:
        this.chrBankHighBits = value & 3;
        break;

      // IRQ
      case 0x5203:
        this.irqTarget = value;
        break;
      case 0x5204:
        this.irqEnabled = (value & 0x80) !== 0;
        break;

      // 乗算器
      case 0x5205:
        this.multiplicand = value;
        this.updateMultiplier();
        break;
      case 0x5206:
        this.multiplier = value;
        this.updateMultiplier();
        break;
    }
  }

  /** ネームテーブル読み出し — PPU が NT アドレスを読む時に呼ばれる */
  readNametable(addr: number): number | undefined {
    const ntIndex = (addr >> 10) & 3;
    const source = (this.ntMapping >> (ntIndex * 2)) & 3;
    const offset = addr & 0x03ff;

    switch (source) {
      case 0: // CIRAM ページ 0
        if (this.ciram) return this.ciram[offset] ?? 0;
        return undefined;
      case 1: // CIRAM ページ 1
        if (this.ciram) return this.ciram[0x400 + offset] ?? 0;
        return undefined;
      case 2: // ExRAM
        if (this.exRamMode <= 1) {
          return this.exRam[offset] ?? 0;
        }
        return 0;
      case 3: // Fill mode
        if (offset < 0x03c0) {
          return this.fillTile;
        }
        return this.fillAttrByte;
      default:
        return undefined;
    }
  }

  /** ネームテーブル書き込み */
  writeNametable(addr: number, value: number): boolean {
    const ntIndex = (addr >> 10) & 3;
    const source = (this.ntMapping >> (ntIndex * 2)) & 3;

    if (source === 2) {
      // ExRAM への書き込み
      if (this.exRamMode <= 1) {
        this.exRam[addr & 0x03ff] = value;
      }
      return true;
    }
    if (source === 3) {
      // Fill mode — 書き込みは無視
      return true;
    }
    // CIRAM ページ 0 または 1
    if (this.ciram) {
      const ciramOffset = (source === 1 ? 0x400 : 0) + (addr & 0x03ff);
      this.ciram[ciramOffset] = value;
      return true;
    }
    return false;
  }

  // onChrRead は不要 — IRQ は clockIrqCounter のみで駆動

  serializeMapper(): Record<string, unknown> {
    return {
      prgMode: this.prgMode,
      prgBanks: Array.from(this.prgBanks),
      prgRamProtect1: this.prgRamProtect1,
      prgRamProtect2: this.prgRamProtect2,
      chrMode: this.chrMode,
      chrBanksSprite: Array.from(this.chrBanksSprite),
      chrBanksBg: Array.from(this.chrBanksBg),
      chrBankHighBits: this.chrBankHighBits,
      lastChrWrite: this.lastChrWrite,
      exRamMode: this.exRamMode,
      ntMapping: this.ntMapping,
      fillTile: this.fillTile,
      fillAttr: this.fillAttr,
      fillAttrByte: this.fillAttrByte,
      irqTarget: this.irqTarget,
      irqEnabled: this.irqEnabled,
      irqScanlineCounter: this.irqScanlineCounter,
      inFrame: this.inFrame,
      multiplicand: this.multiplicand,
      multiplier: this.multiplier,
      productLo: this.productLo,
      productHi: this.productHi,
      exRam: Array.from(this.exRam),
      prgRam: Array.from(this.prgRam),
      pulseEnabled: [...this.pulseEnabled],
      pulseDuty: [...this.pulseDuty],
      pulseVolume: [...this.pulseVolume],
      pulseConstant: [...this.pulseConstant],
      pulsePeriod: [...this.pulsePeriod],
      pulseTimer: [...this.pulseTimer],
      pulseSequencePos: [...this.pulseSequencePos],
      pulseLengthCounter: [...this.pulseLengthCounter],
      pulseEnvelopeStart: [...this.pulseEnvelopeStart],
      pulseEnvelopeCounter: [...this.pulseEnvelopeCounter],
      pulseEnvelopeDecay: [...this.pulseEnvelopeDecay],
      pulseEnvelopeDivider: [...this.pulseEnvelopeDivider],
      pulseHalt: [...this.pulseHalt],
      envelopeTickCounter: this.envelopeTickCounter,
    };
  }

  deserializeMapper(data: Record<string, unknown>): void {
    this.prgMode = data["prgMode"] as number;
    if (Array.isArray(data["prgBanks"])) {
      this.prgBanks.set(data["prgBanks"] as number[]);
    }
    this.prgRamProtect1 = data["prgRamProtect1"] as number;
    this.prgRamProtect2 = data["prgRamProtect2"] as number;
    this.chrMode = data["chrMode"] as number;
    if (Array.isArray(data["chrBanksSprite"])) {
      this.chrBanksSprite.set(data["chrBanksSprite"] as number[]);
    }
    if (Array.isArray(data["chrBanksBg"])) {
      this.chrBanksBg.set(data["chrBanksBg"] as number[]);
    }
    this.chrBankHighBits = data["chrBankHighBits"] as number;
    this.lastChrWrite = data["lastChrWrite"] as "sprite" | "bg";
    this.exRamMode = data["exRamMode"] as number;
    this.ntMapping = data["ntMapping"] as number;
    this.fillTile = data["fillTile"] as number;
    this.fillAttr = data["fillAttr"] as number;
    this.fillAttrByte = (data["fillAttrByte"] as number | undefined) ?? 0;
    this.irqTarget = data["irqTarget"] as number;
    this.irqEnabled = data["irqEnabled"] as boolean;
    this.irqScanlineCounter = data["irqScanlineCounter"] as number;
    this.inFrame = data["inFrame"] as boolean;
    this.multiplicand = data["multiplicand"] as number;
    this.multiplier = data["multiplier"] as number;
    this.productLo = data["productLo"] as number;
    this.productHi = data["productHi"] as number;
    if (Array.isArray(data["exRam"])) {
      this.exRam.set(data["exRam"] as number[]);
    }
    if (Array.isArray(data["prgRam"])) {
      this.prgRam.set(data["prgRam"] as number[]);
    }
    for (let i = 0; i < 2; i++) {
      this.pulseEnabled[i] = (data["pulseEnabled"] as boolean[])?.[i] ?? false;
      this.pulseDuty[i] = (data["pulseDuty"] as number[])?.[i] ?? 0;
      this.pulseVolume[i] = (data["pulseVolume"] as number[])?.[i] ?? 0;
      this.pulseConstant[i] = (data["pulseConstant"] as boolean[])?.[i] ?? false;
      this.pulsePeriod[i] = (data["pulsePeriod"] as number[])?.[i] ?? 0;
      this.pulseTimer[i] = (data["pulseTimer"] as number[])?.[i] ?? 0;
      this.pulseSequencePos[i] = (data["pulseSequencePos"] as number[])?.[i] ?? 0;
      this.pulseLengthCounter[i] = (data["pulseLengthCounter"] as number[])?.[i] ?? 0;
      this.pulseEnvelopeStart[i] = (data["pulseEnvelopeStart"] as boolean[])?.[i] ?? false;
      this.pulseEnvelopeCounter[i] = (data["pulseEnvelopeCounter"] as number[])?.[i] ?? 0;
      this.pulseEnvelopeDecay[i] = (data["pulseEnvelopeDecay"] as number[])?.[i] ?? 0;
      this.pulseEnvelopeDivider[i] = (data["pulseEnvelopeDivider"] as number[])?.[i] ?? 0;
      this.pulseHalt[i] = (data["pulseHalt"] as boolean[])?.[i] ?? false;
    }
    this.envelopeTickCounter = (data["envelopeTickCounter"] as number | undefined) ?? 0;
  }

  // --- PRG バンク解決 ---

  /**
   * PRG ROM/RAM バンクを解決。
   * 正の値 = PRG ROM バンク番号 (8KB 単位)、
   * 負の値 = -(PRG RAM バンク番号 + 1)
   */
  private resolvePrgBank(addr: number): number {
    switch (this.prgMode) {
      case 0: return this.resolvePrgMode0(addr);
      case 1: return this.resolvePrgMode1(addr);
      case 2: return this.resolvePrgMode2(addr);
      case 3: return this.resolvePrgMode3(addr);
      default: return this.resolvePrgMode3(addr);
    }
  }

  /**
   * モード 0: 32KB 切替 ($5117 の値、下位2bit無視)。
   * bit 7=1 で ROM、bit 7=0 で RAM。
   */
  private resolvePrgMode0(addr: number): number {
    const reg = this.prgBanks[4]!;
    // $5117 は常に ROM (bit 7 = 1) だがモード 0 の形式上
    const base = ((reg & 0x7c) >> 2) << 2;
    const slot = (addr - 0x8000) >> 13;
    return base + slot;
  }

  /** モード 1: 16KB+16KB ($5115=$8000-$BFFF, $5117=$C000-$FFFF) */
  private resolvePrgMode1(addr: number): number {
    if (addr < 0xc000) {
      // $8000-$BFFF → $5115 (prgBanks[2]), 16KB 単位
      const reg = this.prgBanks[2]!;
      if ((reg & 0x80) === 0) {
        const base = ((reg & 0x7e) >> 1) << 1;
        const offset = (addr & 0x2000) ? 1 : 0;
        return -(base + offset + 1);
      }
      const base = ((reg & 0x7f) >> 1) << 1;
      const offset = (addr & 0x2000) ? 1 : 0;
      return base + offset;
    }
    // $C000-$FFFF → $5117 (prgBanks[4]), 16KB 単位, 常に ROM
    const reg = this.prgBanks[4]!;
    const base = ((reg & 0x7f) >> 1) << 1;
    const offset = (addr & 0x2000) ? 1 : 0;
    return base + offset;
  }

  /** モード 2: 16KB+8KB+8KB ($5115=$8000, $5116=$C000, $5117=$E000) */
  private resolvePrgMode2(addr: number): number {
    if (addr < 0xc000) {
      // $8000-$BFFF → $5115 (prgBanks[2]), 16KB 単位
      const reg = this.prgBanks[2]!;
      if ((reg & 0x80) === 0) {
        const base = ((reg & 0x7e) >> 1) << 1;
        const offset = (addr & 0x2000) ? 1 : 0;
        return -(base + offset + 1);
      }
      const base = ((reg & 0x7f) >> 1) << 1;
      const offset = (addr & 0x2000) ? 1 : 0;
      return base + offset;
    }
    if (addr < 0xe000) {
      // $C000-$DFFF → $5116 (prgBanks[3]), 8KB 単位
      const reg = this.prgBanks[3]!;
      if ((reg & 0x80) === 0) {
        return -((reg & 0x7f) + 1);
      }
      return reg & 0x7f;
    }
    // $E000-$FFFF → $5117 (prgBanks[4]), 常に ROM
    return this.prgBanks[4]! & 0x7f;
  }

  /** モード 3: 8KB×4 ($5114=$8000, $5115=$A000, $5116=$C000, $5117=$E000) */
  private resolvePrgMode3(addr: number): number {
    const slot = (addr - 0x8000) >> 13;
    // prgBanks[1]=$5114, [2]=$5115, [3]=$5116, [4]=$5117
    const regIndex = slot + 1;

    if (regIndex === 4) {
      // $5117 ($E000-$FFFF) は常に ROM
      return this.prgBanks[4]! & 0x7f;
    }

    const reg = this.prgBanks[regIndex]!;
    if ((reg & 0x80) === 0) {
      return -((reg & 0x7f) + 1);
    }
    return reg & 0x7f;
  }

  // --- CHR バンク解決 ---

  private resolveChrBank(addr: number): number {
    const slot1k = (addr >> 10) & 7;
    switch (this.chrMode) {
      case 0: return this.resolveChrMode0(slot1k);
      case 1: return this.resolveChrMode1(slot1k);
      case 2: return this.resolveChrMode2(slot1k);
      case 3: return this.resolveChrMode3(slot1k);
      default: return this.resolveChrMode3(slot1k);
    }
  }

  /** モード 0: 8KB 切替 ($5127 の値 × 8) */
  private resolveChrMode0(slot1k: number): number {
    if (this.lastChrWrite === "bg") {
      return (this.chrBanksBg[3]! << 3) + slot1k;
    }
    return (this.chrBanksSprite[7]! << 3) + slot1k;
  }

  /** モード 1: 4KB+4KB ($5123=$0000, $5127=$1000) */
  private resolveChrMode1(slot1k: number): number {
    if (slot1k < 4) {
      if (this.lastChrWrite === "bg") {
        return (this.chrBanksBg[3]! << 2) + slot1k;
      }
      return (this.chrBanksSprite[3]! << 2) + slot1k;
    }
    if (this.lastChrWrite === "bg") {
      return (this.chrBanksBg[3]! << 2) + (slot1k - 4);
    }
    return (this.chrBanksSprite[7]! << 2) + (slot1k - 4);
  }

  /** モード 2: 2KB×4 ($5121=$0000, $5123=$0800, $5125=$1000, $5127=$1800) */
  private resolveChrMode2(slot1k: number): number {
    const pair = slot1k >> 1;
    const sub = slot1k & 1;
    if (this.lastChrWrite === "bg") {
      return (this.chrBanksBg[pair & 3]! << 1) + sub;
    }
    return (this.chrBanksSprite[pair * 2 + 1]! << 1) + sub;
  }

  /** モード 3: 1KB×8 ($5120-$5127) */
  private resolveChrMode3(slot1k: number): number {
    if (this.lastChrWrite === "bg") {
      return this.chrBanksBg[slot1k & 3]!;
    }
    return this.chrBanksSprite[slot1k]!;
  }

  // --- 乗算器 ---

  private updateMultiplier(): void {
    const product = this.multiplicand * this.multiplier;
    this.productLo = product & 0xff;
    this.productHi = (product >> 8) & 0xff;
  }

  // --- PRG RAM 書き込み保護 ---

  private isPrgRamWriteEnabled(): boolean {
    return this.prgRamProtect1 === 0x02 && this.prgRamProtect2 === 0x01;
  }



  // --- pulse 音源レジスタ ---

  private writePulseRegister(addr: number, value: number): void {
    const ch = (addr >= 0x5004) ? 1 : 0;
    const reg = (addr - 0x5000) & 3;

    switch (reg) {
      case 0:
        this.pulseDuty[ch] = (value >> 6) & 3;
        this.pulseHalt[ch] = (value & 0x20) !== 0;
        this.pulseConstant[ch] = (value & 0x10) !== 0;
        this.pulseVolume[ch] = value & 0x0f;
        this.pulseEnvelopeDivider[ch] = value & 0x0f;
        break;
      case 1:
        // MMC5 の pulse はスイープなし
        break;
      case 2:
        this.pulsePeriod[ch] = (this.pulsePeriod[ch]! & 0x700) | value;
        break;
      case 3:
        this.pulsePeriod[ch] = (this.pulsePeriod[ch]! & 0xff) | ((value & 7) << 8);
        this.pulseSequencePos[ch] = 0;
        this.pulseEnvelopeStart[ch] = true;
        if (this.pulseEnabled[ch]) {
          this.pulseLengthCounter[ch] = LENGTH_TABLE[(value >> 3) & 0x1f]!;
        }
        break;
    }
  }

  // --- エンベロープ tick ---

  private tickEnvelopes(): void {
    for (let ch = 0; ch < 2; ch++) {
      if (this.pulseEnvelopeStart[ch]) {
        this.pulseEnvelopeStart[ch] = false;
        this.pulseEnvelopeDecay[ch] = 15;
        this.pulseEnvelopeCounter[ch] = this.pulseEnvelopeDivider[ch]!;
      } else {
        if (this.pulseEnvelopeCounter[ch]! > 0) {
          this.pulseEnvelopeCounter[ch]!--;
        } else {
          this.pulseEnvelopeCounter[ch] = this.pulseEnvelopeDivider[ch]!;
          if (this.pulseEnvelopeDecay[ch]! > 0) {
            this.pulseEnvelopeDecay[ch]!--;
          } else if (this.pulseHalt[ch]) {
            this.pulseEnvelopeDecay[ch] = 15;
          }
        }
      }
    }
  }

  // --- 長さカウンタ tick ---

  private tickLengthCounters(): void {
    for (let ch = 0; ch < 2; ch++) {
      if (!this.pulseHalt[ch] && this.pulseLengthCounter[ch]! > 0) {
        this.pulseLengthCounter[ch]!--;
      }
    }
  }
}
