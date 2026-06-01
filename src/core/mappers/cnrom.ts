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
const PRG_RAM_SIZE = 0x2000;

export class MapperCnrom implements Mapper {
  onMirroringChange: ((m: import("../cart.ts").Mirroring) => void) | null = null;
  irqPending = false;

  private readonly prgRom: Uint8Array;
  private readonly prgMask: number;
  private readonly chrRom: Uint8Array;
  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
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

  mapperId(): number { return 3; }

  serializeMapper(): Record<string, unknown> {
    return {
      chrBankOffset: this.chrBankOffset,
      prgRam: Array.from(this.prgRam),
    };
  }

  deserializeMapper(data: Record<string, unknown>): void {
    this.chrBankOffset = data["chrBankOffset"] as number;
    if (Array.isArray(data["prgRam"])) {
      this.prgRam.set(data["prgRam"] as number[]);
    }
  }
}
