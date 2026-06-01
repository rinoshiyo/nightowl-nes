/**
 * Mapper 3 (CNROM)。
 *
 * - PRG ROM: NROM と同じ (16KB ミラー or 32KB 固定、バンク切替なし)
 * - CHR ROM: 8KB × N banks、$8000-$FFFF への write で切替
 * - バンク番号は下位ビットのみ使用 (バンク数に応じたマスク)
 * 仕様参照: https://www.nesdev.org/wiki/INES_Mapper_003
 */

import type { Cart } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const CHR_BANK_SIZE = 0x2000;

export class MapperCnrom implements Mapper {
  irqPending = false;

  private readonly prgRom: Uint8Array;
  private readonly prgMask: number;
  private readonly chrRom: Uint8Array;
  private readonly chrBankMask: number;
  private chrBankOffset = 0;

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    this.prgMask = cart.prgRom.length - 1;
    this.chrRom = cart.chrRom;
    const chrBankCount = Math.max(1, cart.chrRom.length / CHR_BANK_SIZE);
    this.chrBankMask = chrBankCount - 1;
  }

  readPrg(addr: number): number {
    return this.prgRom[(addr - 0x8000) & this.prgMask] ?? 0;
  }

  writePrg(_addr: number, value: number): void {
    this.chrBankOffset = (value & this.chrBankMask) * CHR_BANK_SIZE;
  }

  readChr(addr: number): number {
    return this.chrRom[this.chrBankOffset + (addr & 0x1fff)] ?? 0;
  }

  writeChr(_addr: number, _value: number): void {
    // CNROM: CHR ROM は読み取り専用
  }

  readPrgRam(_addr: number): number { return 0; }
  writePrgRam(_addr: number, _value: number): void {}
  clockIrqCounter(): void {}
}
