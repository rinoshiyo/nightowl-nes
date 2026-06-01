/**
 * Mapper 1 (MMC1 / SxROM)。
 *
 * - 5-bit シフトレジスタ経由で内部レジスタに書き込む
 * - Control ($8000-$9FFF): ミラーリング + PRG/CHR バンクモード
 * - CHR Bank 0 ($A000-$BFFF): CHR 切替
 * - CHR Bank 1 ($C000-$DFFF): 4KB モード時のみ有効
 * - PRG Bank ($E000-$FFFF): PRG 切替
 * 仕様参照: https://www.nesdev.org/wiki/MMC1
 */

import type { Cart } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const PRG_BANK_SIZE = 0x4000; // 16KB
const CHR_BANK_SIZE = 0x1000; // 4KB
const CHR_RAM_SIZE = 0x2000;  // 8KB

export class MapperMmc1 implements Mapper {
  onMirroringChange: ((m: import("../cart.ts").Mirroring) => void) | null = null;
  irqPending = false;

  private readonly prgRom: Uint8Array;
  private readonly chrData: Uint8Array;
  private readonly useChrRam: boolean;

  private readonly prgBankCount: number;
  private readonly chrBankCount: number;

  /** 5-bit シフトレジスタ */
  private shiftRegister = 0b10000;
  /** 書き込み回数 (0-4、5 回目で転送) */
  private shiftCount = 0;

  /**
   * Control レジスタ (内部レジスタ 0)
   * bit 0-1: ミラーリング (0=one-screen lower, 1=one-screen upper, 2=vertical, 3=horizontal)
   * bit 2-3: PRG ROM バンクモード
   *   0,1 = 32KB 切替 (bit 1 無視)
   *   2   = $8000 固定(先頭バンク) + $C000 切替
   *   3   = $8000 切替 + $C000 固定(末尾バンク)
   * bit 4: CHR ROM バンクモード (0=8KB, 1=4KB×2)
   */
  private control = 0x0c; // 初期: PRG mode 3, CHR mode 0

  /** CHR bank 0 レジスタ (内部レジスタ 1) */
  private chrBank0 = 0;
  /** CHR bank 1 レジスタ (内部レジスタ 2) */
  private chrBank1 = 0;
  /** PRG bank レジスタ (内部レジスタ 3) */
  private prgBank = 0;

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
    const prgMode = (this.control >> 2) & 0x03;
    const offset = addr & 0x3fff;

    if (prgMode <= 1) {
      // モード 0,1: 32KB 切替 (prgBank の bit 0 を無視して 32KB 単位)
      const bank32 = (this.prgBank & 0x0e) >> 1;
      const base = (bank32 % Math.max(1, this.prgBankCount >> 1)) * PRG_BANK_SIZE * 2;
      return this.prgRom[base + (addr & 0x7fff)] ?? 0;
    }

    if (addr < 0xc000) {
      if (prgMode === 2) {
        // モード 2: $8000-$BFFF は先頭バンク固定
        return this.prgRom[offset] ?? 0;
      }
      // モード 3: $8000-$BFFF は切替
      const bank = (this.prgBank & 0x0f) % this.prgBankCount;
      return this.prgRom[bank * PRG_BANK_SIZE + offset] ?? 0;
    }

    if (prgMode === 2) {
      // モード 2: $C000-$FFFF は切替
      const bank = (this.prgBank & 0x0f) % this.prgBankCount;
      return this.prgRom[bank * PRG_BANK_SIZE + offset] ?? 0;
    }
    // モード 3: $C000-$FFFF は末尾バンク固定
    return this.prgRom[(this.prgBankCount - 1) * PRG_BANK_SIZE + offset] ?? 0;
  }

  writePrg(_addr: number, value: number): void {
    // bit 7 セットでシフトレジスタリセット
    if (value & 0x80) {
      this.shiftRegister = 0b10000;
      this.shiftCount = 0;
      // リセット時は control の PRG モードを 3 にする (末尾固定)
      this.control |= 0x0c;
      return;
    }

    // bit 0 をシフトレジスタに取り込み (LSB first)
    this.shiftRegister = ((this.shiftRegister >> 1) | ((value & 1) << 4)) & 0x1f;
    this.shiftCount++;

    if (this.shiftCount === 5) {
      // 5 回目で対象レジスタに転送
      this.writeInternalRegister(_addr, this.shiftRegister);
      this.shiftRegister = 0b10000;
      this.shiftCount = 0;
    }
  }

  readChr(addr: number): number {
    const maskedAddr = addr & 0x1fff;

    // CHR RAM (8KB) はバンク切替なし — フラットアドレッシング
    if (this.useChrRam) {
      return this.chrData[maskedAddr] ?? 0;
    }

    const chrMode = (this.control >> 4) & 1;

    if (chrMode === 0) {
      // 8KB モード: chrBank0 の bit 0 を無視して 8KB 単位
      const bank8k = ((this.chrBank0 & 0x1e) >> 1) % Math.max(1, this.chrBankCount >> 1);
      return this.chrData[bank8k * CHR_BANK_SIZE * 2 + maskedAddr] ?? 0;
    }

    // 4KB モード
    if (maskedAddr < 0x1000) {
      const bank = (this.chrBank0 & 0x1f) % this.chrBankCount;
      return this.chrData[bank * CHR_BANK_SIZE + maskedAddr] ?? 0;
    }

    const bank = (this.chrBank1 & 0x1f) % this.chrBankCount;
    return this.chrData[bank * CHR_BANK_SIZE + (maskedAddr & 0x0fff)] ?? 0;
  }

  writeChr(addr: number, value: number): void {
    if (!this.useChrRam) return;
    this.chrData[addr & 0x1fff] = value;
  }

  readPrgRam(_addr: number): number { return 0; }
  writePrgRam(_addr: number, _value: number): void {}
  reset(): void {}
  clockIrqCounter(): void {}

  /** 内部レジスタへの書き込み (アドレスの bit 13-14 でレジスタ選択) */
  private writeInternalRegister(addr: number, value: number): void {
    const reg = (addr >> 13) & 0x03;

    switch (reg) {
      case 0: // Control ($8000-$9FFF)
        this.control = value;
        break;
      case 1: // CHR bank 0 ($A000-$BFFF)
        this.chrBank0 = value;
        break;
      case 2: // CHR bank 1 ($C000-$DFFF)
        this.chrBank1 = value;
        break;
      case 3: // PRG bank ($E000-$FFFF)
        this.prgBank = value;
        break;
    }
  }
}
