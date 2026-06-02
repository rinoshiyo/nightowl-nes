/**
 * Mapper 85 — Konami VRC7。
 *
 * Lagrange Point、Tiny Toon Adventures 2 (JP) 等で使用。
 * OPLL (YM2413) 互換の FM 音源 (6ch) を搭載した NES 最高峰の音源 Mapper。
 *
 * - PRG ROM: 8KB × 3 バンク切替。$E000-$FFFF は最終バンク固定
 * - CHR ROM: 1KB × 8 バンク切替
 * - PRG RAM: 8KB ($6000-$7FFF)
 * - ミラーリング: レジスタ ($E000) で制御
 * - IRQ: CPU cycle ベース (prescaler 付き、VRC6 と同等)
 * - 拡張音源: OPLL (YM2413) サブセット — 6ch FM 音源
 *
 * レジスタマップ:
 *   $8000: PRG bank 0 (8KB、$8000-$9FFF)
 *   $8010: PRG bank 1 (8KB、$A000-$BFFF)
 *   $9000: PRG bank 2 (8KB、$C000-$DFFF)
 *   $9010: FM 音源レジスタアドレス選択
 *   $9030: FM 音源レジスタデータ書き込み
 *   $A000: CHR bank 0 ($0000-$03FF)
 *   $A010: CHR bank 1 ($0400-$07FF)
 *   $B000: CHR bank 2 ($0800-$0BFF)
 *   $B010: CHR bank 3 ($0C00-$0FFF)
 *   $C000: CHR bank 4 ($1000-$13FF)
 *   $C010: CHR bank 5 ($1400-$17FF)
 *   $D000: CHR bank 6 ($1800-$1BFF)
 *   $D010: CHR bank 7 ($1C00-$1FFF)
 *   $E000: ミラーリング制御 + PRG RAM enable/write protect + silence
 *   $E010: IRQ latch
 *   $F000: IRQ control
 *   $F010: IRQ acknowledge
 *
 * 仕様参照: https://www.nesdev.org/wiki/VRC7
 */

import type { Cart } from "../cart.ts";
import type { Mirroring } from "../cart.ts";
import type { Mapper } from "./mapper.ts";
import { Vrc7Audio } from "./vrc7-audio.ts";

const PRG_BANK_8K = 0x2000;
const CHR_BANK_1K = 0x0400;
const PRG_RAM_SIZE = 0x2000;

export class MapperVrc7 implements Mapper {
  irqPending = false;
  onMirroringChange: ((m: Mirroring) => void) | null = null;

  private readonly prgRom: Uint8Array;
  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
  private readonly chrData: Uint8Array;
  private readonly useChrRam: boolean;

  private readonly prgBankCount: number;
  private readonly chrBankCount: number;

  /** PRG bank レジスタ (8KB × 3) */
  private prgBank0 = 0;
  private prgBank1 = 0;
  private prgBank2 = 0;

  /** CHR バンクレジスタ (1KB × 8) */
  private readonly chrBanks = new Uint8Array(8);

  /** PRG RAM enable (bit 7 of $E000) */
  private prgRamEnabled = false;
  /** FM 音源 silence (bit 6 of $E000) */
  private audioSilenced = false;

  // --- IRQ ---
  private irqLatch = 0;
  private irqCounter = 0;
  private irqEnabled = false;
  private irqCycleMode = false;
  private irqPrescaler = 0;

  // --- FM 音源 ---
  private readonly audio: Vrc7Audio;

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    this.prgBankCount = Math.max(1, cart.prgRom.length / PRG_BANK_8K);

    if (cart.header.chrRomSize === 0) {
      this.chrData = new Uint8Array(0x2000);
      this.useChrRam = true;
      this.chrBankCount = this.chrData.length / CHR_BANK_1K;
    } else {
      this.chrData = cart.chrRom;
      this.useChrRam = false;
      this.chrBankCount = Math.max(1, cart.chrRom.length / CHR_BANK_1K);
    }

    this.audio = new Vrc7Audio();
  }

  readPrg(addr: number): number {
    if (addr < 0xa000) {
      // $8000-$9FFF: 8KB バンク 0
      const bank = this.prgBank0 % this.prgBankCount;
      return this.prgRom[bank * PRG_BANK_8K + (addr & 0x1fff)] ?? 0;
    }
    if (addr < 0xc000) {
      // $A000-$BFFF: 8KB バンク 1
      const bank = this.prgBank1 % this.prgBankCount;
      return this.prgRom[bank * PRG_BANK_8K + (addr & 0x1fff)] ?? 0;
    }
    if (addr < 0xe000) {
      // $C000-$DFFF: 8KB バンク 2
      const bank = this.prgBank2 % this.prgBankCount;
      return this.prgRom[bank * PRG_BANK_8K + (addr & 0x1fff)] ?? 0;
    }
    // $E000-$FFFF: 最終 8KB バンク固定
    const lastBank = this.prgBankCount - 1;
    return this.prgRom[lastBank * PRG_BANK_8K + (addr & 0x1fff)] ?? 0;
  }

  writePrg(addr: number, value: number): void {
    const reg = addr & 0xf010;

    switch (reg) {
      // --- PRG バンク切替 ---
      case 0x8000:
        this.prgBank0 = value & 0x3f;
        break;
      case 0x8010:
        this.prgBank1 = value & 0x3f;
        break;
      case 0x9000:
        this.prgBank2 = value & 0x3f;
        break;

      // --- FM 音源 (silence 中は書き込み無視) ---
      case 0x9010:
        if (!this.audioSilenced) this.audio.writeAddress(value);
        break;
      case 0x9030:
        if (!this.audioSilenced) this.audio.writeData(value);
        break;

      // --- CHR バンク切替 ---
      case 0xa000: this.chrBanks[0] = value; break;
      case 0xa010: this.chrBanks[1] = value; break;
      case 0xb000: this.chrBanks[2] = value; break;
      case 0xb010: this.chrBanks[3] = value; break;
      case 0xc000: this.chrBanks[4] = value; break;
      case 0xc010: this.chrBanks[5] = value; break;
      case 0xd000: this.chrBanks[6] = value; break;
      case 0xd010: this.chrBanks[7] = value; break;

      // --- ミラーリング + PRG RAM ---
      case 0xe000: {
        this.prgRamEnabled = (value & 0x80) !== 0;
        const newSilence = (value & 0x40) !== 0;
        if (newSilence && !this.audioSilenced) {
          this.audio.silence();
        }
        this.audioSilenced = newSilence;
        this.updateMirroring(value);
        break;
      }

      // --- IRQ ---
      case 0xe010:
        this.irqLatch = value;
        break;
      case 0xf000:
        this.irqEnabled = (value & 0x02) !== 0;
        this.irqCycleMode = (value & 0x04) !== 0;
        if (this.irqEnabled) {
          this.irqCounter = this.irqLatch;
          this.irqPrescaler = 341;
        }
        this.irqPending = false;
        break;
      case 0xf010:
        this.irqPending = false;
        this.irqEnabled = (value & 0x02) !== 0;
        break;
    }
  }

  readChr(addr: number): number {
    if (addr >= 0x2000) return 0;

    if (this.useChrRam) {
      return this.chrData[addr & 0x1fff] ?? 0;
    }

    const slot = (addr >> 10) & 7;
    const bank = (this.chrBanks[slot] ?? 0) % this.chrBankCount;
    return this.chrData[bank * CHR_BANK_1K + (addr & 0x03ff)] ?? 0;
  }

  writeChr(addr: number, value: number): void {
    if (addr >= 0x2000) return;
    if (this.useChrRam) {
      this.chrData[addr & 0x1fff] = value;
    }
  }

  readPrgRam(addr: number): number {
    if (!this.prgRamEnabled) return 0;
    return this.prgRam[addr & 0x1fff] ?? 0;
  }

  writePrgRam(addr: number, value: number): void {
    if (!this.prgRamEnabled) return;
    this.prgRam[addr & 0x1fff] = value;
  }

  getPrgRam(): Uint8Array | null {
    return this.prgRam;
  }

  setPrgRam(data: Uint8Array): void {
    this.prgRam.set(data.subarray(0, PRG_RAM_SIZE));
  }

  reset(): void {
    this.prgBank0 = 0;
    this.prgBank1 = 0;
    this.prgBank2 = 0;
    this.chrBanks.fill(0);
    this.prgRamEnabled = false;
    this.audioSilenced = false;
    this.irqLatch = 0;
    this.irqCounter = 0;
    this.irqEnabled = false;
    this.irqCycleMode = false;
    this.irqPrescaler = 0;
    this.irqPending = false;
    this.audio.reset();
  }

  clockIrqCounter(): void {
    // VRC7 IRQ は CPU cycle ベース。scanline ベースではない。
  }

  cpuCycleTick(): void {
    if (this.irqEnabled) {
      if (this.irqCycleMode) {
        this.clockIrq();
      } else {
        this.irqPrescaler -= 3;
        if (this.irqPrescaler <= 0) {
          this.irqPrescaler += 341;
          this.clockIrq();
        }
      }
    }

    this.audio.tick();
  }

  private clockIrq(): void {
    if (this.irqCounter === 0xff) {
      this.irqCounter = this.irqLatch;
      this.irqPending = true;
    } else {
      this.irqCounter++;
    }
  }

  audioOutput(): number {
    if (this.audioSilenced) return 0;
    return this.audio.output();
  }

  private updateMirroring(value: number): void {
    const mirror = value & 0x03;
    switch (mirror) {
      case 0: this.onMirroringChange?.("vertical"); break;
      case 1: this.onMirroringChange?.("horizontal"); break;
      case 2: this.onMirroringChange?.("single-lower"); break;
      case 3: this.onMirroringChange?.("single-upper"); break;
    }
  }

  mapperId(): number {
    return 85;
  }

  serializeMapper(): Record<string, unknown> {
    return {
      prgBank0: this.prgBank0,
      prgBank1: this.prgBank1,
      prgBank2: this.prgBank2,
      chrBanks: Array.from(this.chrBanks),
      prgRamEnabled: this.prgRamEnabled,
      audioSilenced: this.audioSilenced,
      irqLatch: this.irqLatch,
      irqCounter: this.irqCounter,
      irqEnabled: this.irqEnabled,
      irqCycleMode: this.irqCycleMode,
      irqPrescaler: this.irqPrescaler,
      irqPending: this.irqPending,
      prgRam: Array.from(this.prgRam),
      chrRam: this.useChrRam ? Array.from(this.chrData) : undefined,
      audio: this.audio.serialize(),
    };
  }

  deserializeMapper(data: Record<string, unknown>): void {
    this.prgBank0 = data["prgBank0"] as number;
    this.prgBank1 = data["prgBank1"] as number;
    this.prgBank2 = data["prgBank2"] as number;
    if (Array.isArray(data["chrBanks"])) this.chrBanks.set(data["chrBanks"] as number[]);
    this.prgRamEnabled = data["prgRamEnabled"] as boolean;
    this.audioSilenced = data["audioSilenced"] as boolean;
    this.irqLatch = data["irqLatch"] as number;
    this.irqCounter = data["irqCounter"] as number;
    this.irqEnabled = data["irqEnabled"] as boolean;
    this.irqCycleMode = data["irqCycleMode"] as boolean;
    this.irqPrescaler = data["irqPrescaler"] as number;
    this.irqPending = data["irqPending"] as boolean;
    if (Array.isArray(data["prgRam"])) this.prgRam.set(data["prgRam"] as number[]);
    if (this.useChrRam && Array.isArray(data["chrRam"])) {
      this.chrData.set((data["chrRam"] as number[]).slice(0, this.chrData.length));
    }
    if (data["audio"]) {
      this.audio.deserialize(data["audio"] as Record<string, unknown>);
    }
  }
}
