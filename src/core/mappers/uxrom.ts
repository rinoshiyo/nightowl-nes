/**
 * Mapper 2 (UxROM)。
 *
 * - PRG ROM: 16KB × N banks
 *   - $8000-$BFFF: 切替可能バンク (bankSelect で選択)
 *   - $C000-$FFFF: 最終バンクに固定
 * - CHR: CHR RAM 8KB (read/write)
 * - バンク切替: $8000-$FFFF への write で下位ビットがバンク番号
 * 仕様参照: https://www.nesdev.org/wiki/UxROM
 */

import type { Cart } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const PRG_BANK_SIZE = 0x4000;
const CHR_RAM_SIZE = 0x2000;

export class MapperUxrom implements Mapper {
  private readonly prgRom: Uint8Array;
  private readonly chrRam = new Uint8Array(CHR_RAM_SIZE);
  private readonly bankCount: number;
  private readonly bankMask: number;
  private bankSelect = 0;
  private readonly lastBankOffset: number;

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    this.bankCount = Math.max(1, cart.prgRom.length / PRG_BANK_SIZE);
    this.bankMask = this.bankCount - 1;
    this.lastBankOffset = (this.bankCount - 1) * PRG_BANK_SIZE;
  }

  readPrg(addr: number): number {
    const offset = addr & 0x7fff;
    if (offset < PRG_BANK_SIZE) {
      const bankOffset = (this.bankSelect & this.bankMask) * PRG_BANK_SIZE;
      return this.prgRom[bankOffset + offset] ?? 0;
    }
    return this.prgRom[this.lastBankOffset + (offset - PRG_BANK_SIZE)] ?? 0;
  }

  writePrg(_addr: number, value: number): void {
    this.bankSelect = value & this.bankMask;
  }

  readChr(addr: number): number {
    return this.chrRam[addr & 0x1fff] ?? 0;
  }

  writeChr(addr: number, value: number): void {
    this.chrRam[addr & 0x1fff] = value;
  }
}
