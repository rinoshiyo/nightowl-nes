/**
 * Mapper 18 (Jaleco SS8806)。
 *
 * - PRG ROM: 8KB × 3 バンク切替 ($8000/$A000/$C000 可変、$E000 最終バンク固定)
 * - CHR ROM: 1KB × 8 バンク切替 (各バンクは 2 レジスタの上下 4bit で 8bit 値を構成)
 * - IRQ カウンタ: 16bit ダウンカウンタ (4bit ずつ 4 レジスタで構成、CPU cycle ベース)
 * - ミラーリング制御: 4種類
 * 仕様参照: https://www.nesdev.org/wiki/INES_Mapper_018
 */

import type { Cart } from "../cart.ts";
import type { Mirroring } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const PRG_BANK_SIZE = 0x2000; // 8KB
const CHR_BANK_SIZE = 0x0400; // 1KB
const CHR_RAM_SIZE = 0x2000;  // 8KB
const PRG_RAM_SIZE = 0x2000;  // 8KB

export class MapperJalecoSs8806 implements Mapper {
  irqPending = false;
  onMirroringChange: ((m: Mirroring) => void) | null = null;

  private readonly prgRom: Uint8Array;
  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
  private readonly chrData: Uint8Array;
  private readonly useChrRam: boolean;

  private readonly prgBankCount: number;
  private readonly chrBankCount: number;

  /** PRG バンクレジスタ 0-2 ($8000/$A000/$C000 の 8KB バンク番号) */
  private readonly prgBanks = new Uint8Array(3);

  /** CHR バンクレジスタ 0-7 (1KB 単位、各 8bit) */
  private readonly chrBanks = new Uint8Array(8);

  /** 現在のミラーリングモード */
  private currentMirroring: Mirroring = "vertical";

  /** IRQ カウンタ (16bit) */
  private irqCounter = 0;
  /** IRQ ラッチ値 (16bit、4bit ずつ書き込み) */
  private irqLatch = 0;
  /** IRQ 有効フラグ */
  private irqEnabled = false;
  /** IRQ カウンタ幅マスク (0xFFFF=16bit, 0x0FFF=12bit, 0x00FF=8bit, 0x000F=4bit) */
  private irqMask = 0xffff;

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    this.prgBankCount = Math.max(1, cart.prgRom.length / PRG_BANK_SIZE);

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
    let bank: number;

    if (addr < 0xa000) {
      bank = this.prgBanks[0]! % this.prgBankCount;
    } else if (addr < 0xc000) {
      bank = this.prgBanks[1]! % this.prgBankCount;
    } else if (addr < 0xe000) {
      bank = this.prgBanks[2]! % this.prgBankCount;
    } else {
      bank = this.prgBankCount - 1;
    }

    return this.prgRom[bank * PRG_BANK_SIZE + offset] ?? 0;
  }

  writePrg(addr: number, value: number): void {
    const nibble = value & 0x0f;

    // アドレスのデコード: $X000/$X001/$X002/$X003
    // 上位アドレスでカテゴリ、bit 0-1 でサブレジスタ
    const region = addr & 0xf003;

    switch (region) {
      // PRG バンク 0 ($8000-$8003)
      case 0x8000:
        this.prgBanks[0] = (this.prgBanks[0]! & 0xf0) | nibble;
        break;
      case 0x8001:
        // PRG Select 上位は bit [5:4] のみ (6bit 幅)
        this.prgBanks[0] = (this.prgBanks[0]! & 0x0f) | ((nibble & 0x03) << 4);
        break;
      case 0x8002:
        this.prgBanks[1] = (this.prgBanks[1]! & 0xf0) | nibble;
        break;
      case 0x8003:
        this.prgBanks[1] = (this.prgBanks[1]! & 0x0f) | ((nibble & 0x03) << 4);
        break;

      // PRG バンク 2 ($9000-$9001)
      case 0x9000:
        this.prgBanks[2] = (this.prgBanks[2]! & 0xf0) | nibble;
        break;
      case 0x9001:
        this.prgBanks[2] = (this.prgBanks[2]! & 0x0f) | ((nibble & 0x03) << 4);
        break;

      // CHR バンク 0 ($A000-$A003)
      case 0xa000:
        this.chrBanks[0] = (this.chrBanks[0]! & 0xf0) | nibble;
        break;
      case 0xa001:
        this.chrBanks[0] = (this.chrBanks[0]! & 0x0f) | (nibble << 4);
        break;
      case 0xa002:
        this.chrBanks[1] = (this.chrBanks[1]! & 0xf0) | nibble;
        break;
      case 0xa003:
        this.chrBanks[1] = (this.chrBanks[1]! & 0x0f) | (nibble << 4);
        break;

      // CHR バンク 2-3 ($B000-$B003)
      case 0xb000:
        this.chrBanks[2] = (this.chrBanks[2]! & 0xf0) | nibble;
        break;
      case 0xb001:
        this.chrBanks[2] = (this.chrBanks[2]! & 0x0f) | (nibble << 4);
        break;
      case 0xb002:
        this.chrBanks[3] = (this.chrBanks[3]! & 0xf0) | nibble;
        break;
      case 0xb003:
        this.chrBanks[3] = (this.chrBanks[3]! & 0x0f) | (nibble << 4);
        break;

      // CHR バンク 4-5 ($C000-$C003)
      case 0xc000:
        this.chrBanks[4] = (this.chrBanks[4]! & 0xf0) | nibble;
        break;
      case 0xc001:
        this.chrBanks[4] = (this.chrBanks[4]! & 0x0f) | (nibble << 4);
        break;
      case 0xc002:
        this.chrBanks[5] = (this.chrBanks[5]! & 0xf0) | nibble;
        break;
      case 0xc003:
        this.chrBanks[5] = (this.chrBanks[5]! & 0x0f) | (nibble << 4);
        break;

      // CHR バンク 6-7 ($D000-$D003)
      case 0xd000:
        this.chrBanks[6] = (this.chrBanks[6]! & 0xf0) | nibble;
        break;
      case 0xd001:
        this.chrBanks[6] = (this.chrBanks[6]! & 0x0f) | (nibble << 4);
        break;
      case 0xd002:
        this.chrBanks[7] = (this.chrBanks[7]! & 0xf0) | nibble;
        break;
      case 0xd003:
        this.chrBanks[7] = (this.chrBanks[7]! & 0x0f) | (nibble << 4);
        break;

      // IRQ ラッチ ($E000-$E003)
      case 0xe000:
        this.irqLatch = (this.irqLatch & 0xfff0) | nibble;
        break;
      case 0xe001:
        this.irqLatch = (this.irqLatch & 0xff0f) | (nibble << 4);
        break;
      case 0xe002:
        this.irqLatch = (this.irqLatch & 0xf0ff) | (nibble << 8);
        break;
      case 0xe003:
        this.irqLatch = (this.irqLatch & 0x0fff) | (nibble << 12);
        break;

      // IRQ 制御 ($F000-$F003)
      case 0xf000:
        this.irqPending = false;
        this.irqCounter = this.irqLatch;
        break;
      case 0xf001:
        this.irqPending = false;
        this.irqEnabled = (nibble & 0x01) !== 0;
        // bit 1-3 でカウンタ幅を選択
        if (nibble & 0x08) {
          this.irqMask = 0x000f; // 4bit
        } else if (nibble & 0x04) {
          this.irqMask = 0x00ff; // 8bit
        } else if (nibble & 0x02) {
          this.irqMask = 0x0fff; // 12bit
        } else {
          this.irqMask = 0xffff; // 16bit
        }
        break;

      // ミラーリング ($F002)
      case 0xf002:
        switch (nibble & 0x03) {
          case 0:
            this.currentMirroring = "horizontal";
            break;
          case 1:
            this.currentMirroring = "vertical";
            break;
          case 2:
            this.currentMirroring = "single-lower";
            break;
          case 3:
            this.currentMirroring = "single-upper";
            break;
        }
        this.onMirroringChange?.(this.currentMirroring);
        break;

      // $F003: サウンド (非対応)
    }
  }

  readChr(addr: number): number {
    if (this.useChrRam) {
      return this.chrData[addr & 0x1fff] ?? 0;
    }
    const slot = (addr >> 10) & 7;
    const bank = (this.chrBanks[slot] ?? 0) % this.chrBankCount;
    const offset = addr & 0x03ff;
    return this.chrData[bank * CHR_BANK_SIZE + offset] ?? 0;
  }

  writeChr(addr: number, value: number): void {
    if (!this.useChrRam) return;
    this.chrData[addr & 0x1fff] = value;
  }

  readPrgRam(addr: number): number {
    return this.prgRam[addr & 0x1fff] ?? 0;
  }

  writePrgRam(addr: number, value: number): void {
    this.prgRam[addr & 0x1fff] = value;
  }

  getPrgRam(): Uint8Array | null {
    return this.prgRam;
  }

  setPrgRam(data: Uint8Array): void {
    this.prgRam.set(data.subarray(0, PRG_RAM_SIZE));
  }

  reset(): void {
    this.prgBanks.fill(0);
    this.chrBanks.fill(0);
    this.currentMirroring = "vertical";
    this.irqCounter = 0;
    this.irqLatch = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.irqMask = 0xffff;
    this.onMirroringChange?.(this.currentMirroring);
  }

  /** PPU scanline ベースの IRQ は使用しない (CPU cycle ベース) */
  clockIrqCounter(): void {}

  /** CPU サイクルごとの IRQ カウンタ clocking */
  cpuCycleTick(): void {
    if (!this.irqEnabled) return;
    const masked = this.irqCounter & this.irqMask;
    if (masked > 0) {
      // マスク範囲内のビットのみデクリメント
      const upper = this.irqCounter & ~this.irqMask;
      this.irqCounter = upper | ((masked - 1) & this.irqMask);
      if ((this.irqCounter & this.irqMask) === 0) {
        this.irqPending = true;
      }
    }
  }

  mapperId(): number { return 18; }

  serializeMapper(): Record<string, unknown> {
    return {
      prgBanks: Array.from(this.prgBanks),
      chrBanks: Array.from(this.chrBanks),
      currentMirroring: this.currentMirroring,
      irqCounter: this.irqCounter,
      irqLatch: this.irqLatch,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      irqMask: this.irqMask,
      prgRam: Array.from(this.prgRam),
      chrRam: this.useChrRam ? Array.from(this.chrData) : undefined,
    };
  }

  deserializeMapper(data: Record<string, unknown>): void {
    if (Array.isArray(data["prgBanks"])) {
      this.prgBanks.set(data["prgBanks"] as number[]);
    }
    if (Array.isArray(data["chrBanks"])) {
      this.chrBanks.set(data["chrBanks"] as number[]);
    }
    if (typeof data["currentMirroring"] === "string") {
      this.currentMirroring = data["currentMirroring"] as Mirroring;
    }
    this.irqCounter = data["irqCounter"] as number;
    this.irqLatch = data["irqLatch"] as number;
    this.irqEnabled = data["irqEnabled"] as boolean;
    this.irqPending = data["irqPending"] as boolean;
    this.irqMask = data["irqMask"] as number;
    if (Array.isArray(data["prgRam"])) {
      this.prgRam.set(data["prgRam"] as number[]);
    }
    if (this.useChrRam && Array.isArray(data["chrRam"])) {
      this.chrData.set((data["chrRam"] as number[]).slice(0, CHR_RAM_SIZE));
    }
    this.onMirroringChange?.(this.currentMirroring);
  }
}
