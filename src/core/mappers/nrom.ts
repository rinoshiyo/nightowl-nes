/**
 * Mapper 0 (NROM)。
 *
 * - PRG ROM: 16KB ($8000-$BFFF = $C000-$FFFF ミラー) or 32KB ($8000-$FFFF)
 * - CHR: chrRomSize > 0 → CHR ROM (read only)、0 → CHR RAM 8KB (read/write)
 * - バンク切替なし
 * 仕様参照: https://www.nesdev.org/wiki/NROM
 */

import type { Cart } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const CHR_RAM_SIZE = 0x2000;

export class MapperNrom implements Mapper {
  private readonly prgRom: Uint8Array;
  private readonly chrData: Uint8Array;
  private readonly chrIsRam: boolean;

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    if (cart.header.chrRomSize > 0) {
      this.chrData = cart.chrRom;
      this.chrIsRam = false;
    } else {
      this.chrData = new Uint8Array(CHR_RAM_SIZE);
      this.chrIsRam = true;
    }
  }

  readPrg(addr: number): number {
    return this.prgRom[(addr - 0x8000) % this.prgRom.length] ?? 0;
  }

  writePrg(_addr: number, _value: number): void {
    // NROM: $8000-$FFFF への write は無視
  }

  readChr(addr: number): number {
    return this.chrData[addr & 0x1fff] ?? 0;
  }

  writeChr(addr: number, value: number): void {
    if (this.chrIsRam) {
      this.chrData[addr & 0x1fff] = value;
    }
  }
}
