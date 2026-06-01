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
const PRG_RAM_SIZE = 0x2000;

export class MapperUxrom implements Mapper {
  onMirroringChange: ((m: import("../cart.ts").Mirroring) => void) | null = null;
  irqPending = false;

  private readonly prgRom: Uint8Array;
  private readonly chrRam = new Uint8Array(CHR_RAM_SIZE);
  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
  private readonly bankMask: number;
  private switchBankOffset = 0;
  private readonly lastBankOffset: number;

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    const bankCount = Math.max(1, cart.prgRom.length / PRG_BANK_SIZE);
    this.bankMask = bankCount - 1;
    this.lastBankOffset = (bankCount - 1) * PRG_BANK_SIZE;
  }

  readPrg(addr: number): number {
    if (addr < 0xc000) {
      return this.prgRom[this.switchBankOffset + (addr & 0x3fff)] ?? 0;
    }
    return this.prgRom[this.lastBankOffset + (addr & 0x3fff)] ?? 0;
  }

  writePrg(_addr: number, value: number): void {
    this.switchBankOffset = (value & this.bankMask) * PRG_BANK_SIZE;
  }

  readChr(addr: number): number {
    return this.chrRam[addr & 0x1fff] ?? 0;
  }

  writeChr(addr: number, value: number): void {
    this.chrRam[addr & 0x1fff] = value;
  }

  readPrgRam(addr: number): number {
    return this.prgRam[(addr - 0x6000) & 0x1fff] ?? 0;
  }
  writePrgRam(addr: number, value: number): void {
    this.prgRam[(addr - 0x6000) & 0x1fff] = value;
  }
  getPrgRam(): Uint8Array | null { return this.prgRam; }
  setPrgRam(data: Uint8Array): void {
    this.prgRam.set(data.subarray(0, PRG_RAM_SIZE));
  }
  reset(): void {}
  clockIrqCounter(): void {}

  mapperId(): number { return 2; }

  serializeMapper(): Record<string, unknown> {
    return {
      switchBankOffset: this.switchBankOffset,
      chrRam: Array.from(this.chrRam),
      prgRam: Array.from(this.prgRam),
    };
  }

  deserializeMapper(data: Record<string, unknown>): void {
    this.switchBankOffset = data["switchBankOffset"] as number;
    if (Array.isArray(data["chrRam"])) {
      this.chrRam.set(data["chrRam"] as number[]);
    }
    if (Array.isArray(data["prgRam"])) {
      this.prgRam.set(data["prgRam"] as number[]);
    }
  }
}
