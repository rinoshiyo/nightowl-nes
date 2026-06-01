/**
 * Mapper 16 (Bandai FCG)。
 *
 * Bandai FCG-1 / FCG-2 / LZ93D50 系。ドラゴンボール Z 等で使用。
 * - PRG ROM: 16KB バンク切替 ($8000-$BFFF 可変、$C000-$FFFF 最終バンク固定)
 * - CHR ROM: 1KB × 8 バンク切替
 * - IRQ カウンタ: 16bit ダウンカウンタ (CPU cycle ベース)
 * - ミラーリング制御: 4種類 (vertical/horizontal/single-lower/single-upper)
 * - EEPROM: 非対応 (基本バンク切替 + IRQ があれば主要タイトルは動作)
 * 仕様参照: https://www.nesdev.org/wiki/INES_Mapper_016
 */

import type { Cart } from "../cart.ts";
import type { Mirroring } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const PRG_BANK_SIZE = 0x4000; // 16KB
const CHR_BANK_SIZE = 0x0400; // 1KB
const CHR_RAM_SIZE = 0x2000;  // 8KB
const PRG_RAM_SIZE = 0x2000;  // 8KB

export class MapperBandaiFcg implements Mapper {
  irqPending = false;
  onMirroringChange: ((m: Mirroring) => void) | null = null;

  private readonly prgRom: Uint8Array;
  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
  private readonly chrData: Uint8Array;
  private readonly useChrRam: boolean;

  private readonly prgBankCount: number;
  private readonly chrBankCount: number;

  /** CHR バンクレジスタ 0-7 (1KB 単位) */
  private readonly chrBanks = new Uint8Array(8);

  /** PRG バンクレジスタ ($8000-$BFFF の 16KB バンク番号) */
  private prgBank = 0;

  /** 現在のミラーリングモード */
  private currentMirroring: Mirroring = "vertical";

  /** IRQ カウンタ (16bit) */
  private irqCounter = 0;
  /** IRQ ラッチ値 (16bit) */
  private irqLatch = 0;
  /** IRQ 有効フラグ */
  private irqEnabled = false;

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    this.prgBankCount = Math.max(1, cart.prgRom.length / PRG_BANK_SIZE);

    if (cart.header.chrRomSize === 0) {
      this.chrData = new Uint8Array(CHR_RAM_SIZE);
      this.useChrRam = true;
      this.chrBankCount = CHR_RAM_SIZE / CHR_BANK_SIZE;
    } else {
      this.chrData = cart.chrRom;
      this.useChrRam = false;
      this.chrBankCount = Math.max(1, cart.chrRom.length / CHR_BANK_SIZE);
    }
  }

  readPrg(addr: number): number {
    if (addr < 0xc000) {
      // $8000-$BFFF: 可変バンク
      const bank = this.prgBank % this.prgBankCount;
      const offset = addr & 0x3fff;
      return this.prgRom[bank * PRG_BANK_SIZE + offset] ?? 0;
    }
    // $C000-$FFFF: 最終バンク固定
    const lastBank = this.prgBankCount - 1;
    const offset = addr & 0x3fff;
    return this.prgRom[lastBank * PRG_BANK_SIZE + offset] ?? 0;
  }

  writePrg(addr: number, value: number): void {
    // レジスタは $8000-$FFFF の下位 4bit (addr & 0x000F) でデコード
    const reg = addr & 0x000f;

    if (reg <= 7) {
      // $0-$7: CHR バンクレジスタ
      this.chrBanks[reg] = value;
    } else if (reg === 8) {
      // $8: PRG バンクレジスタ
      this.prgBank = value & 0x0f;
    } else if (reg === 9) {
      // $9: ミラーリング制御
      switch (value & 0x03) {
        case 0:
          this.currentMirroring = "vertical";
          break;
        case 1:
          this.currentMirroring = "horizontal";
          break;
        case 2:
          this.currentMirroring = "single-lower";
          break;
        case 3:
          this.currentMirroring = "single-upper";
          break;
      }
      this.onMirroringChange?.(this.currentMirroring);
    } else if (reg === 0x0a) {
      // $A: IRQ 制御
      this.irqEnabled = (value & 0x01) !== 0;
      this.irqCounter = this.irqLatch;
      this.irqPending = false;
    } else if (reg === 0x0b) {
      // $B: IRQ カウンタ下位 8bit
      this.irqLatch = (this.irqLatch & 0xff00) | value;
    } else if (reg === 0x0c) {
      // $C: IRQ カウンタ上位 8bit
      this.irqLatch = (this.irqLatch & 0x00ff) | (value << 8);
    }
    // $D: EEPROM 制御 (非対応)
  }

  readChr(addr: number): number {
    if (this.useChrRam) {
      return this.chrData[addr & 0x1fff] ?? 0;
    }
    const slot = (addr >> 10) & 7;
    const bank = (this.chrBanks[slot] ?? 0) % this.chrBankCount;
    const offset = addr & 0x03ff;
    return this.chrData[bank * CHR_BANK_SIZE + offset] ?? 0;
  }

  writeChr(addr: number, value: number): void {
    if (!this.useChrRam) return;
    this.chrData[addr & 0x1fff] = value;
  }

  readPrgRam(addr: number): number {
    return this.prgRam[addr & 0x1fff] ?? 0;
  }

  writePrgRam(addr: number, value: number): void {
    this.prgRam[addr & 0x1fff] = value;
  }

  getPrgRam(): Uint8Array | null {
    return this.prgRam;
  }

  setPrgRam(data: Uint8Array): void {
    this.prgRam.set(data.subarray(0, PRG_RAM_SIZE));
  }

  reset(): void {
    this.chrBanks.fill(0);
    this.prgBank = 0;
    this.currentMirroring = "vertical";
    this.irqCounter = 0;
    this.irqLatch = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.onMirroringChange?.(this.currentMirroring);
  }

  /**
   * CPU サイクルごとに呼び出される IRQ カウンタ。
   * Mapper 16 の IRQ は CPU cycle ベースで、PPU scanline ベースではない。
   * ただし clockIrqCounter() は PPU scanline タイミングで呼ばれるインターフェースなので、
   * 実際の CPU cycle ベース clocking は cpuCycleTick() で行う。
   * このメソッドは互換性のため空実装。
   */
  clockIrqCounter(): void {
    // Mapper 16 の IRQ は CPU cycle ベース。
    // PPU scanline タイミングの clockIrqCounter は使用しない。
  }

  /** CPU サイクルごとの IRQ カウンタ clocking */
  cpuCycleTick(): void {
    if (!this.irqEnabled) return;
    if (this.irqCounter > 0) {
      this.irqCounter--;
      if (this.irqCounter === 0) {
        this.irqPending = true;
      }
    }
  }

  mapperId(): number { return 16; }

  serializeMapper(): Record<string, unknown> {
    return {
      chrBanks: Array.from(this.chrBanks),
      prgBank: this.prgBank,
      currentMirroring: this.currentMirroring,
      irqCounter: this.irqCounter,
      irqLatch: this.irqLatch,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      prgRam: Array.from(this.prgRam),
      chrRam: this.useChrRam ? Array.from(this.chrData) : undefined,
    };
  }

  deserializeMapper(data: Record<string, unknown>): void {
    if (Array.isArray(data["chrBanks"])) {
      this.chrBanks.set(data["chrBanks"] as number[]);
    }
    this.prgBank = data["prgBank"] as number;
    if (typeof data["currentMirroring"] === "string") {
      this.currentMirroring = data["currentMirroring"] as Mirroring;
    }
    this.irqCounter = data["irqCounter"] as number;
    this.irqLatch = data["irqLatch"] as number;
    this.irqEnabled = data["irqEnabled"] as boolean;
    this.irqPending = data["irqPending"] as boolean;
    if (Array.isArray(data["prgRam"])) {
      this.prgRam.set(data["prgRam"] as number[]);
    }
    if (this.useChrRam && Array.isArray(data["chrRam"])) {
      this.chrData.set((data["chrRam"] as number[]).slice(0, CHR_RAM_SIZE));
    }
    this.onMirroringChange?.(this.currentMirroring);
  }
}
