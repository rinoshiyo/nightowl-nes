/**
 * Mapper 9 (MMC2 / PxROM)。
 *
 * パンチアウト!! 専用 mapper。
 * - PRG ROM: 8KB switchable ($8000-$9FFF) + 24KB fixed ($A000-$FFFF, 最後3バンク)
 * - CHR ROM: 4KB × 2 ウィンドウ。各ウィンドウに 2 レジスタ (FD/FE) を持ち、
 *   PPU が特定タイル番号 ($FD/$FE) を fetch した瞬間に latch が切り替わる
 * - Mirroring: レジスタ $F000 で vertical/horizontal 切替
 * 仕様参照: https://www.nesdev.org/wiki/MMC2
 */

import type { Cart } from "../cart.ts";
import type { Mirroring } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const PRG_BANK_SIZE = 0x2000; // 8KB
const CHR_BANK_SIZE = 0x1000; // 4KB

export class MapperMmc2 implements Mapper {
  onMirroringChange: ((m: Mirroring) => void) | null = null;
  irqPending = false;

  private readonly prgRom: Uint8Array;
  private readonly chrRom: Uint8Array;
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;

  /** PRG バンクレジスタ ($A000): $8000-$9FFF の 8KB バンクを選択 */
  private prgBank = 0;

  /**
   * CHR latch レジスタ
   * chrBankFD[0]: $0000-$0FFF 用 FD latch 値
   * chrBankFE[0]: $0000-$0FFF 用 FE latch 値
   * chrBankFD[1]: $1000-$1FFF 用 FD latch 値
   * chrBankFE[1]: $1000-$1FFF 用 FE latch 値
   */
  private readonly chrBankFD = [0, 0];
  private readonly chrBankFE = [0, 0];

  /** 現在の latch 状態 (0=FD, 1=FE)。index 0=$0000-$0FFF, 1=$1000-$1FFF */
  private readonly latch = [0, 0]; // 初期値: FD (0)

  /** ミラーリング */
  private currentMirroring: Mirroring = "vertical";

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    this.chrRom = cart.chrRom;
    this.prgBankCount = Math.max(1, cart.prgRom.length / PRG_BANK_SIZE);
    this.chrBankCount = Math.max(1, cart.chrRom.length / CHR_BANK_SIZE);
  }

  readPrg(addr: number): number {
    if (addr < 0xa000) {
      // $8000-$9FFF: switchable 8KB
      const offset = addr & 0x1fff;
      return this.prgRom[(this.prgBank % this.prgBankCount) * PRG_BANK_SIZE + offset] ?? 0;
    }
    // $A000-$FFFF: 最後の 3 バンク (24KB) に固定
    const fixedBase = (this.prgBankCount - 3) * PRG_BANK_SIZE;
    const offset = addr - 0xa000;
    return this.prgRom[fixedBase + offset] ?? 0;
  }

  writePrg(addr: number, value: number): void {
    if (addr < 0xa000) {
      // $8000-$9FFF は無視 (ROM 領域、レジスタは $A000 以上)
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
    const half = (addr >> 12) & 1; // 0=$0000-$0FFF, 1=$1000-$1FFF
    const bank = this.latch[half] === 0
      ? this.chrBankFD[half]!
      : this.chrBankFE[half]!;
    const offset = addr & 0x0fff;
    return this.chrRom[(bank % this.chrBankCount) * CHR_BANK_SIZE + offset] ?? 0;
  }

  /**
   * PPU が CHR を読んだ後に呼ばれる latch 更新。
   * MMC2 のトリガー (非対称: 低位は単一アドレス、高位は範囲):
   * - $0FD8 のみ → latch[0] = FD (タイル先頭行のみ)
   * - $0FE8 のみ → latch[0] = FE (タイル先頭行のみ)
   * - $1FD8-$1FDF → latch[1] = FD (タイル全行)
   * - $1FE8-$1FEF → latch[1] = FE (タイル全行)
   */
  onChrRead(addr: number): void {
    if (addr === 0x0fd8) {
      this.latch[0] = 0;
    } else if (addr === 0x0fe8) {
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

  readPrgRam(_addr: number): number { return 0; }
  writePrgRam(_addr: number, _value: number): void {}
  getPrgRam(): Uint8Array | null { return null; }
  setPrgRam(_data: Uint8Array): void {}

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

  mapperId(): number { return 9; }

  serializeMapper(): Record<string, unknown> {
    return {
      prgBank: this.prgBank,
      chrBankFD: [...this.chrBankFD],
      chrBankFE: [...this.chrBankFE],
      latch: [...this.latch],
      currentMirroring: this.currentMirroring,
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
    this.onMirroringChange?.(this.currentMirroring);
  }
}
