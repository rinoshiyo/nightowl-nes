/**
 * Mapper 66 (GxROM)。
 *
 * - PRG ROM: 32KB × N banks ($8000-$FFFF 全域で切替)
 * - CHR ROM: 8KB × N banks
 * - バンク切替: $8000-$FFFF への write
 *   - bit 4-5: PRG バンク番号
 *   - bit 0-1: CHR バンク番号
 * - バスコンフリクトあり (Color Dreams とビット配置が逆)
 * 仕様参照: https://www.nesdev.org/wiki/GxROM
 */

import type { Cart } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const PRG_BANK_SIZE = 0x8000; // 32KB
const CHR_BANK_SIZE = 0x2000; // 8KB
const PRG_RAM_SIZE = 0x2000;

export class MapperGxrom implements Mapper {
  onMirroringChange: ((m: import("../cart.ts").Mirroring) => void) | null = null;
  irqPending = false;

  private readonly prgRom: Uint8Array;
  private readonly chrRom: Uint8Array;
  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
  private readonly prgBankMask: number;
  private readonly chrBankMask: number;
  private prgBankOffset = 0;
  private chrBankOffset = 0;

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    this.chrRom = cart.chrRom;
    const prgBankCount = Math.max(1, cart.prgRom.length / PRG_BANK_SIZE);
    const chrBankCount = Math.max(1, cart.chrRom.length / CHR_BANK_SIZE);
    this.prgBankMask = prgBankCount - 1;
    this.chrBankMask = chrBankCount - 1;
  }

  readPrg(addr: number): number {
    return this.prgRom[this.prgBankOffset + (addr & 0x7fff)] ?? 0;
  }

  writePrg(_addr: number, value: number): void {
    this.prgBankOffset = ((value >> 4) & this.prgBankMask) * PRG_BANK_SIZE;
    this.chrBankOffset = (value & this.chrBankMask) * CHR_BANK_SIZE;
  }

  readChr(addr: number): number {
    return this.chrRom[this.chrBankOffset + (addr & 0x1fff)] ?? 0;
  }

  writeChr(_addr: number, _value: number): void {
    // CHR ROM は読み取り専用
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

  reset(): void {
    this.prgBankOffset = 0;
    this.chrBankOffset = 0;
  }

  clockIrqCounter(): void {}

  mapperId(): number { return 66; }

  serializeMapper(): Record<string, unknown> {
    return {
      prgBankOffset: this.prgBankOffset,
      chrBankOffset: this.chrBankOffset,
      prgRam: Array.from(this.prgRam),
    };
  }

  deserializeMapper(data: Record<string, unknown>): void {
    this.prgBankOffset = data["prgBankOffset"] as number;
    this.chrBankOffset = data["chrBankOffset"] as number;
    if (Array.isArray(data["prgRam"])) {
      this.prgRam.set(data["prgRam"] as number[]);
    }
  }
}
