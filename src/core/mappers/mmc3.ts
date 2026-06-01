/**
 * Mapper 4 (MMC3 / TxROM)。
 *
 * - Bank Select ($8000): バンク番号選択 + PRG/CHR モード反転ビット
 * - Bank Data ($8001): 選択されたバンクの値を設定
 * - PRG ROM: 8KB × 4 ウィンドウ (R6, R7, 固定2バンク)
 * - CHR ROM: 2KB × 2 + 1KB × 4 ウィンドウ (R0-R5)
 * - Mirroring ($A000 bit 0): vertical/horizontal 切替
 * - IRQ カウンタ ($C000/$C001/$E000/$E001): scanline ベースの IRQ
 * 仕様参照: https://www.nesdev.org/wiki/MMC3
 */

import type { Cart } from "../cart.ts";
import type { Mirroring } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const PRG_BANK_SIZE = 0x2000; // 8KB
const CHR_BANK_SIZE = 0x0400; // 1KB
const CHR_RAM_SIZE = 0x2000;  // 8KB

export class MapperMmc3 implements Mapper {
  irqPending = false;

  /** ミラーリング変更通知 (NesConsole が設定) */
  onMirroringChange: ((m: Mirroring) => void) | null = null;

  private readonly prgRom: Uint8Array;
  private readonly prgRam = new Uint8Array(0x2000); // 8KB PRG RAM
  private readonly chrData: Uint8Array;
  private readonly useChrRam: boolean;

  private readonly prgBankCount: number;
  private readonly chrBankCount: number;

  /**
   * バンクレジスタ R0-R7
   * R0: CHR 2KB バンク (下位アドレス)
   * R1: CHR 2KB バンク (上位アドレス)
   * R2-R5: CHR 1KB バンク
   * R6: PRG 8KB バンク
   * R7: PRG 8KB バンク
   */
  private readonly registers = new Uint8Array(8);

  /** $8000 のバンク選択インデックス (bit 0-2) */
  private bankSelect = 0;
  /** PRG バンクモード: bit 6 of $8000 (0: R6=$8000, 1: R6=$C000) */
  private prgBankMode = 0;
  /** CHR A12 反転: bit 7 of $8000 */
  private chrInversion = 0;

  /** IRQ カウンタ */
  private irqCounter = 0;
  /** IRQ ラッチ値 */
  private irqLatch = 0;
  /** IRQ リロードフラグ */
  private irqReload = false;
  /** IRQ 有効フラグ */
  private irqEnabled = false;

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
    const isOdd = addr & 1;

    if (addr < 0xa000) {
      if (isOdd === 0) {
        // $8000: Bank Select
        this.bankSelect = value & 0x07;
        this.prgBankMode = (value >> 6) & 1;
        this.chrInversion = (value >> 7) & 1;
      } else {
        // $8001: Bank Data — R6/R7 は 6-bit (実機は PRG アドレス線が 6 本)
        const sel = this.bankSelect;
        this.registers[sel] = (sel === 6 || sel === 7) ? value & 0x3f : value;
      }
    } else if (addr < 0xc000) {
      if (isOdd === 0) {
        // $A000: Mirroring
        const m: Mirroring = (value & 1) === 0 ? "vertical" : "horizontal";
        if (this.onMirroringChange) this.onMirroringChange(m);
      }
      // $A001: PRG RAM protect (未実装 — 多くのゲームで不要)
    } else if (addr < 0xe000) {
      if (isOdd === 0) {
        // $C000: IRQ latch
        this.irqLatch = value;
      } else {
        // $C001: IRQ reload
        this.irqReload = true;
      }
    } else {
      if (isOdd === 0) {
        // $E000: IRQ disable + pending クリア
        this.irqEnabled = false;
        this.irqPending = false;
      } else {
        // $E001: IRQ enable
        this.irqEnabled = true;
      }
    }
  }

  readPrgRam(addr: number): number {
    return this.prgRam[addr & 0x1fff] ?? 0;
  }

  writePrgRam(addr: number, value: number): void {
    this.prgRam[addr & 0x1fff] = value;
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

  reset(): void {
    this.bankSelect = 0;
    this.prgBankMode = 0;
    this.chrInversion = 0;
    this.registers.fill(0);
    this.irqCounter = 0;
    this.irqLatch = 0;
    this.irqReload = false;
    this.irqEnabled = false;
    this.irqPending = false;
  }

  clockIrqCounter(): void {
    if (this.irqCounter === 0 || this.irqReload) {
      this.irqCounter = this.irqLatch;
      this.irqReload = false;
    } else {
      this.irqCounter--;
    }

    if (this.irqCounter === 0 && this.irqEnabled) {
      this.irqPending = true;
    }
  }

  /** PRG ROM バンク番号を解決 */
  private resolvePrgBank(addr: number): number {
    const r6 = this.registers[6]! % this.prgBankCount;
    const r7 = this.registers[7]! % this.prgBankCount;
    const secondLast = this.prgBankCount - 2;
    const last = this.prgBankCount - 1;

    if (addr < 0xa000) {
      // $8000-$9FFF
      return this.prgBankMode === 0 ? r6 : secondLast;
    }
    if (addr < 0xc000) {
      // $A000-$BFFF: 常に R7
      return r7;
    }
    if (addr < 0xe000) {
      // $C000-$DFFF
      return this.prgBankMode === 0 ? secondLast : r6;
    }
    // $E000-$FFFF: 常に最終バンク
    return last;
  }

  /** CHR バンク番号を解決 (1KB 単位) */
  private resolveChrBank(addr: number): number {
    const slot = (addr >> 10) & 7;

    let bank: number;
    if (this.chrInversion === 0) {
      // 通常モード: R0/R1 が $0000-$0FFF (2KB), R2-R5 が $1000-$1FFF (1KB)
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
    } else {
      // 反転モード: R2-R5 が $0000-$0FFF (1KB), R0/R1 が $1000-$1FFF (2KB)
      switch (slot) {
        case 0: bank = this.registers[2]!; break;
        case 1: bank = this.registers[3]!; break;
        case 2: bank = this.registers[4]!; break;
        case 3: bank = this.registers[5]!; break;
        case 4: bank = this.registers[0]! & 0xfe; break;
        case 5: bank = this.registers[0]! | 1; break;
        case 6: bank = this.registers[1]! & 0xfe; break;
        default: bank = this.registers[1]! | 1; break;
      }
    }

    return bank % this.chrBankCount;
  }
}
