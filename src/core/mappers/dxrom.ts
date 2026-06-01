/**
 * Mapper 206 (DxROM / Namco 108 / MIMIC-1)。
 *
 * MMC3 のサブセット。IRQ カウンタなし・ミラーリング制御なし。
 * - Bank Select ($8000): バンク番号選択 (bit 0-2 のみ使用、bit 6-7 は無視)
 * - Bank Data ($8001): 選択されたバンクの値を設定
 * - PRG ROM: 8KB × 4 ウィンドウ (R6=$8000, R7=$A000, 固定2バンク=$C000/$E000)
 * - CHR ROM/RAM: 2KB × 2 + 1KB × 4 ウィンドウ (R0-R5)
 *   - R0/R1 は 2KB (下位ビット無視)、R2-R5 は 1KB
 *   - CHR バンクは 6bit 幅 (最大 64KB)
 * - $A000-$FFFF の奇数/偶数レジスタは機能なし (ミラーリング・IRQ 無し)
 * 仕様参照: https://www.nesdev.org/wiki/INES_Mapper_206
 */

import type { Cart } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const PRG_BANK_SIZE = 0x2000; // 8KB
const CHR_BANK_SIZE = 0x0400; // 1KB
const CHR_RAM_SIZE = 0x2000;  // 8KB
const PRG_RAM_SIZE = 0x2000;

export class MapperDxrom implements Mapper {
  onMirroringChange: ((m: import("../cart.ts").Mirroring) => void) | null = null;
  irqPending = false;

  private readonly prgRom: Uint8Array;
  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
  private readonly chrData: Uint8Array;
  private readonly useChrRam: boolean;

  private readonly prgBankCount: number;
  private readonly chrBankCount: number;

  /** バンクレジスタ R0-R7 (R0-R5: CHR, R6-R7: PRG) */
  private readonly registers = new Uint8Array(8);

  /** $8000 のバンク選択インデックス (bit 0-2) */
  private bankSelect = 0;

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    this.prgBankCount = Math.max(2, cart.prgRom.length / PRG_BANK_SIZE);

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
    const offset = addr & 0x1fff;
    const bank = this.resolvePrgBank(addr);
    return this.prgRom[bank * PRG_BANK_SIZE + offset] ?? 0;
  }

  writePrg(addr: number, value: number): void {
    if (addr >= 0xa000) return;

    const isOdd = addr & 1;
    if (isOdd === 0) {
      // $8000: Bank Select (bit 0-2 のみ)
      this.bankSelect = value & 0x07;
    } else {
      // $8001: Bank Data — CHR は 6bit、PRG は実効バンク数に依存
      const sel = this.bankSelect;
      if (sel <= 5) {
        this.registers[sel] = value & 0x3f;
      } else {
        this.registers[sel] = value & 0x0f;
      }
    }
  }

  readChr(addr: number): number {
    if (this.useChrRam) {
      return this.chrData[addr & 0x1fff] ?? 0;
    }
    const bank = this.resolveChrBank(addr);
    const offset = addr & 0x03ff;
    return this.chrData[bank * CHR_BANK_SIZE + offset] ?? 0;
  }

  writeChr(addr: number, value: number): void {
    if (!this.useChrRam) return;
    this.chrData[addr & 0x1fff] = value;
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
    this.bankSelect = 0;
    this.registers.fill(0);
  }

  clockIrqCounter(): void {}

  mapperId(): number { return 206; }

  serializeMapper(): Record<string, unknown> {
    return {
      registers: Array.from(this.registers),
      bankSelect: this.bankSelect,
      prgRam: Array.from(this.prgRam),
      chrRam: this.useChrRam ? Array.from(this.chrData) : undefined,
    };
  }

  deserializeMapper(data: Record<string, unknown>): void {
    if (Array.isArray(data["registers"])) {
      this.registers.set(data["registers"] as number[]);
    }
    this.bankSelect = data["bankSelect"] as number;
    if (Array.isArray(data["prgRam"])) {
      this.prgRam.set(data["prgRam"] as number[]);
    }
    if (this.useChrRam && Array.isArray(data["chrRam"])) {
      this.chrData.set((data["chrRam"] as number[]).slice(0, CHR_RAM_SIZE));
    }
  }

  /** PRG ROM バンク番号を解決 (8KB 単位) */
  private resolvePrgBank(addr: number): number {
    const r6 = this.registers[6]! % this.prgBankCount;
    const r7 = this.registers[7]! % this.prgBankCount;
    const secondLast = this.prgBankCount - 2;
    const last = this.prgBankCount - 1;

    if (addr < 0xa000) return r6;           // $8000-$9FFF: R6
    if (addr < 0xc000) return r7;           // $A000-$BFFF: R7
    if (addr < 0xe000) return secondLast;   // $C000-$DFFF: 固定 (最後から2番目)
    return last;                             // $E000-$FFFF: 固定 (最終バンク)
  }

  /** CHR バンク番号を解決 (1KB 単位、chrInversion 常に 0) */
  private resolveChrBank(addr: number): number {
    const slot = (addr >> 10) & 7;

    let bank: number;
    switch (slot) {
      case 0: bank = this.registers[0]! & 0xfe; break;
      case 1: bank = this.registers[0]! | 1; break;
      case 2: bank = this.registers[1]! & 0xfe; break;
      case 3: bank = this.registers[1]! | 1; break;
      case 4: bank = this.registers[2]!; break;
      case 5: bank = this.registers[3]!; break;
      case 6: bank = this.registers[4]!; break;
      default: bank = this.registers[5]!; break;
    }

    return bank % this.chrBankCount;
  }
}
