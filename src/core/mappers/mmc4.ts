/**
 * Mapper 10 (MMC4 / FxROM)。
 *
 * ファイアーエムブレム等で使用。
 * MMC2 と同じ CHR latch 機構を持つが、以下が異なる:
 * - PRG ROM: 16KB switchable ($8000-$BFFF) + 16KB fixed ($C000-$FFFF, 最終バンク)
 * - CHR latch のトリガーアドレス範囲が異なる:
 *   $0FD8-$0FDF / $0FE8-$0FEF (低位テーブル)
 *   $1FD8-$1FDF / $1FE8-$1FEF (高位テーブル)
 *   (MMC2 は低位テーブルが $0FD8 / $0FE8 のみ)
 * - PRG RAM ($6000-$7FFF) あり (8KB)
 * 仕様参照: https://www.nesdev.org/wiki/MMC4
 */

import type { Cart } from "../cart.ts";
import type { Mirroring } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const PRG_BANK_SIZE = 0x4000; // 16KB
const CHR_BANK_SIZE = 0x1000; // 4KB
const PRG_RAM_SIZE = 0x2000;  // 8KB

export class MapperMmc4 implements Mapper {
  onMirroringChange: ((m: Mirroring) => void) | null = null;
  irqPending = false;

  private readonly prgRom: Uint8Array;
  private readonly chrRom: Uint8Array;
  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;

  /** PRG バンクレジスタ ($A000): $8000-$BFFF の 16KB バンクを選択 */
  private prgBank = 0;

  /** CHR latch レジスタ (MMC2 と同じ構造) */
  private readonly chrBankFD = [0, 0];
  private readonly chrBankFE = [0, 0];

  /** 現在の latch 状態 (0=FD, 1=FE)。index 0=$0000-$0FFF, 1=$1000-$1FFF */
  private readonly latch = [0, 0];

  /** ミラーリング */
  private currentMirroring: Mirroring = "vertical";

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    this.chrRom = cart.chrRom;
    this.prgBankCount = Math.max(1, cart.prgRom.length / PRG_BANK_SIZE);
    this.chrBankCount = Math.max(1, cart.chrRom.length / CHR_BANK_SIZE);
  }

  readPrg(addr: number): number {
    if (addr < 0xc000) {
      // $8000-$BFFF: switchable 16KB
      const offset = addr & 0x3fff;
      return this.prgRom[(this.prgBank % this.prgBankCount) * PRG_BANK_SIZE + offset] ?? 0;
    }
    // $C000-$FFFF: 最終 16KB バンクに固定
    const fixedBase = (this.prgBankCount - 1) * PRG_BANK_SIZE;
    const offset = addr & 0x3fff;
    return this.prgRom[fixedBase + offset] ?? 0;
  }

  writePrg(addr: number, value: number): void {
    if (addr < 0xa000) {
      return;
    }

    if (addr < 0xb000) {
      // $A000-$AFFF: PRG バンク選択 (下位 4 bit)
      this.prgBank = value & 0x0f;
    } else if (addr < 0xc000) {
      // $B000-$BFFF: CHR FD bank for $0000-$0FFF (下位 5 bit)
      this.chrBankFD[0] = value & 0x1f;
    } else if (addr < 0xd000) {
      // $C000-$CFFF: CHR FE bank for $0000-$0FFF (下位 5 bit)
      this.chrBankFE[0] = value & 0x1f;
    } else if (addr < 0xe000) {
      // $D000-$DFFF: CHR FD bank for $1000-$1FFF (下位 5 bit)
      this.chrBankFD[1] = value & 0x1f;
    } else if (addr < 0xf000) {
      // $E000-$EFFF: CHR FE bank for $1000-$1FFF (下位 5 bit)
      this.chrBankFE[1] = value & 0x1f;
    } else {
      // $F000-$FFFF: Mirroring (bit 0)
      this.currentMirroring = (value & 1) === 0 ? "vertical" : "horizontal";
      this.onMirroringChange?.(this.currentMirroring);
    }
  }

  readChr(addr: number): number {
    const half = (addr >> 12) & 1;
    const bank = this.latch[half] === 0
      ? this.chrBankFD[half]!
      : this.chrBankFE[half]!;
    const offset = addr & 0x0fff;
    return this.chrRom[(bank % this.chrBankCount) * CHR_BANK_SIZE + offset] ?? 0;
  }

  /**
   * PPU が CHR を読んだ後に呼ばれる latch 更新。
   * MMC4 のトリガー (MMC2 と異なり低位・高位とも対称的に全行でトリガー):
   * - $0FD8-$0FDF → latch[0] = FD (タイル全行)
   * - $0FE8-$0FEF → latch[0] = FE (タイル全行)
   * - $1FD8-$1FDF → latch[1] = FD (タイル全行)
   * - $1FE8-$1FEF → latch[1] = FE (タイル全行)
   */
  onChrRead(addr: number): void {
    if (addr >= 0x0fd8 && addr <= 0x0fdf) {
      this.latch[0] = 0;
    } else if (addr >= 0x0fe8 && addr <= 0x0fef) {
      this.latch[0] = 1;
    } else if (addr >= 0x1fd8 && addr <= 0x1fdf) {
      this.latch[1] = 0;
    } else if (addr >= 0x1fe8 && addr <= 0x1fef) {
      this.latch[1] = 1;
    }
  }

  writeChr(_addr: number, _value: number): void {
    // CHR ROM: 書き込み不可
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
    this.prgBank = 0;
    this.chrBankFD[0] = 0;
    this.chrBankFD[1] = 0;
    this.chrBankFE[0] = 0;
    this.chrBankFE[1] = 0;
    this.latch[0] = 0;
    this.latch[1] = 0;
    this.currentMirroring = "vertical";
    this.onMirroringChange?.(this.currentMirroring);
  }

  clockIrqCounter(): void {}

  mapperId(): number { return 10; }

  serializeMapper(): Record<string, unknown> {
    return {
      prgBank: this.prgBank,
      chrBankFD: [...this.chrBankFD],
      chrBankFE: [...this.chrBankFE],
      latch: [...this.latch],
      currentMirroring: this.currentMirroring,
      prgRam: Array.from(this.prgRam),
    };
  }

  deserializeMapper(data: Record<string, unknown>): void {
    this.prgBank = data["prgBank"] as number;
    if (Array.isArray(data["chrBankFD"])) {
      this.chrBankFD[0] = (data["chrBankFD"] as number[])[0]!;
      this.chrBankFD[1] = (data["chrBankFD"] as number[])[1]!;
    }
    if (Array.isArray(data["chrBankFE"])) {
      this.chrBankFE[0] = (data["chrBankFE"] as number[])[0]!;
      this.chrBankFE[1] = (data["chrBankFE"] as number[])[1]!;
    }
    if (Array.isArray(data["latch"])) {
      this.latch[0] = (data["latch"] as number[])[0]!;
      this.latch[1] = (data["latch"] as number[])[1]!;
    }
    if (typeof data["currentMirroring"] === "string") {
      this.currentMirroring = data["currentMirroring"] as Mirroring;
    }
    if (Array.isArray(data["prgRam"])) {
      this.prgRam.set(data["prgRam"] as number[]);
    }
    this.onMirroringChange?.(this.currentMirroring);
  }
}
