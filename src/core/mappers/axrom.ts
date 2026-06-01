/**
 * Mapper 7 (AxROM)。
 *
 * - PRG ROM: 32KB × N banks
 *   - $8000-$FFFF: 32KB 単位で切替可能
 * - CHR: CHR RAM 8KB (AxROM は CHR ROM を持たない)
 * - バンク切替: $8000-$FFFF への write
 *   - bit 0-2: PRG バンク番号
 *   - bit 4: VRAM ページ選択 (0 = single-lower, 1 = single-upper)
 * - バスコンフリクトはエミュレーションしない
 * 仕様参照: https://www.nesdev.org/wiki/AxROM
 */

import type { Cart, Mirroring } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const PRG_BANK_SIZE = 0x8000;
const CHR_RAM_SIZE = 0x2000;
const PRG_RAM_SIZE = 0x2000;

export class MapperAxrom implements Mapper {
  onMirroringChange: ((m: Mirroring) => void) | null = null;
  irqPending = false;

  private readonly prgRom: Uint8Array;
  private readonly chrRam = new Uint8Array(CHR_RAM_SIZE);
  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
  private readonly bankMask: number;
  private bankOffset = 0;

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    const bankCount = Math.max(1, cart.prgRom.length / PRG_BANK_SIZE);
    this.bankMask = bankCount - 1;
  }

  readPrg(addr: number): number {
    return this.prgRom[this.bankOffset + (addr & 0x7fff)] ?? 0;
  }

  writePrg(_addr: number, value: number): void {
    this.bankOffset = (value & this.bankMask) * PRG_BANK_SIZE;

    const mirroring: Mirroring = (value & 0x10) !== 0 ? "single-upper" : "single-lower";
    this.onMirroringChange?.(mirroring);
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

  reset(): void {
    this.bankOffset = 0;
    this.onMirroringChange?.("single-lower");
  }

  clockIrqCounter(): void {}

  mapperId(): number { return 7; }

  serializeMapper(): Record<string, unknown> {
    return {
      bankOffset: this.bankOffset,
      chrRam: Array.from(this.chrRam),
      prgRam: Array.from(this.prgRam),
    };
  }

  deserializeMapper(data: Record<string, unknown>): void {
    this.bankOffset = data["bankOffset"] as number;
    if (Array.isArray(data["chrRam"])) {
      this.chrRam.set(data["chrRam"] as number[]);
    }
    if (Array.isArray(data["prgRam"])) {
      this.prgRam.set(data["prgRam"] as number[]);
    }
  }
}
