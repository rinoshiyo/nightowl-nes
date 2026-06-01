/**
 * Mapper 24 (VRC6a) / Mapper 26 (VRC6b) — Konami VRC6。
 *
 * 悪魔城伝説 (JP)、Madara、Esper Dream 2 等で使用。
 * VRC6a と VRC6b はアドレス線 A0/A1 のスワップのみ異なり、機能は同一。
 *
 * - PRG ROM: 16KB ($8000) + 8KB ($C000) バンク切替。$E000-$FFFF は最終バンク固定
 * - CHR ROM: 1KB × 8 バンク切替
 * - ミラーリング: レジスタ ($B003) で制御
 * - IRQ: CPU cycle ベース (prescaler 付き)
 * - 拡張音源: pulse ×2 (8 段階 duty + 4bit volume) + sawtooth (5bit アキュムレータ)
 *
 * レジスタマップ (VRC6a / VRC6b のアドレス差分は swapAddr で吸収):
 *   $8000-$8003: PRG bank 0 (16KB)
 *   $9000-$9002: Pulse 1
 *   $A000-$A002: Pulse 2
 *   $B000-$B002: Sawtooth
 *   $B003: ミラーリング制御 + PRG RAM 有効
 *   $C000-$C003: PRG bank 1 (8KB)
 *   $D000-$D003: CHR bank 0-3
 *   $E000-$E003: CHR bank 4-7
 *   $F000: IRQ latch
 *   $F001: IRQ control
 *   $F002: IRQ acknowledge
 *
 * 仕様参照: https://www.nesdev.org/wiki/VRC6
 */

import type { Cart } from "../cart.ts";
import type { Mirroring } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const PRG_BANK_16K = 0x4000; // 16KB
const PRG_BANK_8K = 0x2000;  // 8KB
const CHR_BANK_1K = 0x0400;  // 1KB
const PRG_RAM_SIZE = 0x2000;  // 8KB

export class MapperVrc6 implements Mapper {
  irqPending = false;
  onMirroringChange: ((m: Mirroring) => void) | null = null;

  private readonly prgRom: Uint8Array;
  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
  private readonly chrData: Uint8Array;
  private readonly useChrRam: boolean;

  private readonly prgBankCount16k: number;
  private readonly prgBankCount8k: number;
  private readonly chrBankCount: number;

  /** VRC6b (mapper 26) なら A0/A1 をスワップ */
  private readonly isVrc6b: boolean;

  /** PRG bank 0 レジスタ (16KB 単位、$8000-$BFFF) */
  private prgBank0 = 0;
  /** PRG bank 1 レジスタ (8KB 単位、$C000-$DFFF) */
  private prgBank1 = 0;

  /** CHR バンクレジスタ (1KB × 8) */
  private readonly chrBanks = new Uint8Array(8);

  /** PRG RAM chip enable (bit 7) */
  private prgRamEnabled = false;
  /** PRG RAM write enable (bit 6) */
  private prgRamWriteEnabled = false;

  // --- IRQ ---
  /** IRQ latch 値 */
  private irqLatch = 0;
  /** IRQ カウンタ */
  private irqCounter = 0;
  /** IRQ 有効フラグ */
  private irqEnabled = false;
  /** IRQ モード: true = cycle mode (毎 CPU cycle)、false = scanline mode (prescaler 使用) */
  private irqCycleMode = false;
  /** IRQ prescaler カウンタ (scanline mode 用) */
  private irqPrescaler = 0;

  // --- 拡張音源: Pulse 1 ---
  private pulse1Volume = 0;
  private pulse1DutyCycle = 0;
  private pulse1DigitizedMode = false;
  private pulse1PeriodLow = 0;
  private pulse1PeriodHigh = 0;
  private pulse1Enabled = false;
  private pulse1Timer = 0;
  private pulse1Phase = 0;

  // --- 拡張音源: Pulse 2 ---
  private pulse2Volume = 0;
  private pulse2DutyCycle = 0;
  private pulse2DigitizedMode = false;
  private pulse2PeriodLow = 0;
  private pulse2PeriodHigh = 0;
  private pulse2Enabled = false;
  private pulse2Timer = 0;
  private pulse2Phase = 0;

  // --- 拡張音源: Sawtooth ---
  private sawRate = 0;
  private sawPeriodLow = 0;
  private sawPeriodHigh = 0;
  private sawEnabled = false;
  private sawTimer = 0;
  private sawAccumulator = 0;
  private sawAccumStep = 0;

  constructor(cart: Cart, mapperNumber: number) {
    this.prgRom = cart.prgRom;
    this.isVrc6b = mapperNumber === 26;

    this.prgBankCount16k = Math.max(1, cart.prgRom.length / PRG_BANK_16K);
    this.prgBankCount8k = Math.max(1, cart.prgRom.length / PRG_BANK_8K);

    if (cart.header.chrRomSize === 0) {
      this.chrData = new Uint8Array(0x2000);
      this.useChrRam = true;
      this.chrBankCount = this.chrData.length / CHR_BANK_1K;
    } else {
      this.chrData = cart.chrRom;
      this.useChrRam = false;
      this.chrBankCount = Math.max(1, cart.chrRom.length / CHR_BANK_1K);
    }
  }

  /**
   * VRC6b ではアドレスの A0 と A1 をスワップして VRC6a 相当にする。
   * VRC6a: A0=$x000, A1=$x001
   * VRC6b: A0=$x001, A1=$x000
   */
  private swapAddr(addr: number): number {
    if (!this.isVrc6b) return addr;
    const a0 = addr & 1;
    const a1 = (addr >> 1) & 1;
    return (addr & ~3) | (a0 << 1) | a1;
  }

  readPrg(addr: number): number {
    if (addr < 0xc000) {
      // $8000-$BFFF: 16KB バンク切替
      const bank = this.prgBank0 % this.prgBankCount16k;
      return this.prgRom[bank * PRG_BANK_16K + (addr & 0x3fff)] ?? 0;
    }
    if (addr < 0xe000) {
      // $C000-$DFFF: 8KB バンク切替
      const bank = this.prgBank1 % this.prgBankCount8k;
      return this.prgRom[bank * PRG_BANK_8K + (addr & 0x1fff)] ?? 0;
    }
    // $E000-$FFFF: 最終 8KB バンク固定
    const lastBank = this.prgBankCount8k - 1;
    return this.prgRom[lastBank * PRG_BANK_8K + (addr & 0x1fff)] ?? 0;
  }

  writePrg(addr: number, value: number): void {
    const mapped = this.swapAddr(addr);
    const reg = mapped & 0xf003;

    switch (reg) {
      // --- PRG バンク切替 ---
      case 0x8000: case 0x8001: case 0x8002: case 0x8003:
        this.prgBank0 = value & 0x0f;
        break;
      case 0xc000: case 0xc001: case 0xc002: case 0xc003:
        this.prgBank1 = value & 0x1f;
        break;

      // --- Pulse 1 ($9000-$9002) ---
      case 0x9000:
        this.pulse1Volume = value & 0x0f;
        this.pulse1DutyCycle = (value >> 4) & 0x07;
        this.pulse1DigitizedMode = (value & 0x80) !== 0;
        break;
      case 0x9001:
        this.pulse1PeriodLow = value;
        break;
      case 0x9002:
        this.pulse1PeriodHigh = value & 0x0f;
        this.pulse1Enabled = (value & 0x80) !== 0;
        if (!this.pulse1Enabled) {
          this.pulse1Phase = 0;
        }
        break;

      // --- Pulse 2 ($A000-$A002) ---
      case 0xa000:
        this.pulse2Volume = value & 0x0f;
        this.pulse2DutyCycle = (value >> 4) & 0x07;
        this.pulse2DigitizedMode = (value & 0x80) !== 0;
        break;
      case 0xa001:
        this.pulse2PeriodLow = value;
        break;
      case 0xa002:
        this.pulse2PeriodHigh = value & 0x0f;
        this.pulse2Enabled = (value & 0x80) !== 0;
        if (!this.pulse2Enabled) {
          this.pulse2Phase = 0;
        }
        break;

      // --- Sawtooth ($B000-$B002) ---
      case 0xb000:
        this.sawRate = value & 0x3f;
        break;
      case 0xb001:
        this.sawPeriodLow = value;
        break;
      case 0xb002:
        this.sawPeriodHigh = value & 0x0f;
        this.sawEnabled = (value & 0x80) !== 0;
        if (!this.sawEnabled) {
          this.sawAccumulator = 0;
          this.sawAccumStep = 0;
        }
        break;

      // --- ミラーリング + PRG RAM ($B003) ---
      case 0xb003:
        this.prgRamEnabled = (value & 0x80) !== 0;
        this.prgRamWriteEnabled = (value & 0x40) !== 0;
        this.updateMirroring(value);
        break;

      // --- CHR バンク切替 ($D000-$E003) ---
      case 0xd000: this.chrBanks[0] = value; break;
      case 0xd001: this.chrBanks[1] = value; break;
      case 0xd002: this.chrBanks[2] = value; break;
      case 0xd003: this.chrBanks[3] = value; break;
      case 0xe000: this.chrBanks[4] = value; break;
      case 0xe001: this.chrBanks[5] = value; break;
      case 0xe002: this.chrBanks[6] = value; break;
      case 0xe003: this.chrBanks[7] = value; break;

      // --- IRQ ---
      case 0xf000:
        this.irqLatch = value;
        break;
      case 0xf001:
        this.irqEnabled = (value & 0x02) !== 0;
        this.irqCycleMode = (value & 0x04) !== 0;
        if (this.irqEnabled) {
          this.irqCounter = this.irqLatch;
          this.irqPrescaler = 341;
        }
        this.irqPending = false;
        break;
      case 0xf002:
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
    if (!this.prgRamEnabled || !this.prgRamWriteEnabled) return;
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
    this.chrBanks.fill(0);
    this.prgRamEnabled = false;
    this.prgRamWriteEnabled = false;
    this.irqLatch = 0;
    this.irqCounter = 0;
    this.irqEnabled = false;
    this.irqCycleMode = false;
    this.irqPrescaler = 0;
    this.irqPending = false;
    this.resetAudio();
  }

  private resetAudio(): void {
    this.pulse1Volume = 0;
    this.pulse1DutyCycle = 0;
    this.pulse1DigitizedMode = false;
    this.pulse1PeriodLow = 0;
    this.pulse1PeriodHigh = 0;
    this.pulse1Enabled = false;
    this.pulse1Timer = 0;
    this.pulse1Phase = 0;
    this.pulse2Volume = 0;
    this.pulse2DutyCycle = 0;
    this.pulse2DigitizedMode = false;
    this.pulse2PeriodLow = 0;
    this.pulse2PeriodHigh = 0;
    this.pulse2Enabled = false;
    this.pulse2Timer = 0;
    this.pulse2Phase = 0;
    this.sawRate = 0;
    this.sawPeriodLow = 0;
    this.sawPeriodHigh = 0;
    this.sawEnabled = false;
    this.sawTimer = 0;
    this.sawAccumulator = 0;
    this.sawAccumStep = 0;
  }

  clockIrqCounter(): void {
    // VRC6 IRQ は CPU cycle ベース。scanline ベースではない。
  }

  /** CPU サイクルごとの IRQ clocking */
  cpuCycleTick(): void {
    if (this.irqEnabled) {
      if (this.irqCycleMode) {
        this.clockIrq();
      } else {
        // Scanline mode: prescaler で分周 (341 CPU cycle ≈ 1 scanline)
        this.irqPrescaler -= 3;
        if (this.irqPrescaler <= 0) {
          this.irqPrescaler += 341;
          this.clockIrq();
        }
      }
    }

    // 拡張音源の更新 (IRQ 状態と独立)
    this.tickPulse1();
    this.tickPulse2();
    this.tickSaw();
  }

  private clockIrq(): void {
    if (this.irqCounter === 0xff) {
      this.irqCounter = this.irqLatch;
      this.irqPending = true;
    } else {
      this.irqCounter++;
    }
  }

  // --- 拡張音源 ---

  /**
   * Pulse チャンネルの出力を計算。
   * 8 段階 duty cycle: phase (0-15) が duty 値以下なら volume を出力。
   * digitized mode: 常に volume を出力 (wave の形状を無視)。
   */
  private getPulseOutput(
    enabled: boolean, digitizedMode: boolean,
    dutyCycle: number, volume: number, phase: number,
  ): number {
    if (!enabled) return 0;
    if (digitizedMode) return volume;
    // 16 ステップ中、phase <= dutyCycle の間 HIGH
    return phase <= dutyCycle ? volume : 0;
  }

  private tickPulse1(): void {
    if (!this.pulse1Enabled) return;
    const period = this.pulse1PeriodLow | (this.pulse1PeriodHigh << 8);
    if (period === 0) return;

    this.pulse1Timer--;
    if (this.pulse1Timer <= 0) {
      this.pulse1Timer = period;
      this.pulse1Phase = (this.pulse1Phase + 1) & 0x0f;
    }
  }

  private tickPulse2(): void {
    if (!this.pulse2Enabled) return;
    const period = this.pulse2PeriodLow | (this.pulse2PeriodHigh << 8);
    if (period === 0) return;

    this.pulse2Timer--;
    if (this.pulse2Timer <= 0) {
      this.pulse2Timer = period;
      this.pulse2Phase = (this.pulse2Phase + 1) & 0x0f;
    }
  }

  /**
   * Sawtooth チャンネルの tick。
   * 14 ステップ (7 回の加算 × 2 クロック) で 1 周期。
   * 偶数ステップで rate を加算、14 ステップでリセット。
   */
  private tickSaw(): void {
    if (!this.sawEnabled) return;
    const period = this.sawPeriodLow | (this.sawPeriodHigh << 8);
    if (period === 0) return;

    this.sawTimer--;
    if (this.sawTimer <= 0) {
      this.sawTimer = period;
      this.sawAccumStep++;

      if (this.sawAccumStep >= 14) {
        // 1 周期完了: リセット
        this.sawAccumulator = 0;
        this.sawAccumStep = 0;
      } else if ((this.sawAccumStep & 1) === 0) {
        // 偶数ステップで rate を加算
        this.sawAccumulator = (this.sawAccumulator + this.sawRate) & 0xff;
      }
    }
  }

  /**
   * 拡張音源の出力 (APU ミキサー統合用)。
   * pulse ×2 + sawtooth の合算を [-1, 1] に正規化。
   */
  audioOutput(): number {
    const p1 = this.getPulseOutput(
      this.pulse1Enabled, this.pulse1DigitizedMode,
      this.pulse1DutyCycle, this.pulse1Volume, this.pulse1Phase,
    );
    const p2 = this.getPulseOutput(
      this.pulse2Enabled, this.pulse2DigitizedMode,
      this.pulse2DutyCycle, this.pulse2Volume, this.pulse2Phase,
    );
    // Sawtooth 出力は上位 5bit (>> 3)
    const saw = this.sawAccumulator >> 3;

    // pulse 最大: 15 × 2 = 30
    // saw 最大: 31
    // 合計最大: 61
    // 正規化 + APU とのバランス調整 (0.2 程度)
    return ((p1 + p2 + saw) / 61) * 0.2;
  }

  /** ミラーリング更新 ($B003 の bits 2-3) */
  private updateMirroring(value: number): void {
    const mirror = (value >> 2) & 0x03;
    switch (mirror) {
      case 0: this.onMirroringChange?.("vertical"); break;
      case 1: this.onMirroringChange?.("horizontal"); break;
      case 2: this.onMirroringChange?.("single-lower"); break;
      case 3: this.onMirroringChange?.("single-upper"); break;
    }
  }

  mapperId(): number {
    return this.isVrc6b ? 26 : 24;
  }

  serializeMapper(): Record<string, unknown> {
    return {
      isVrc6b: this.isVrc6b,
      prgBank0: this.prgBank0,
      prgBank1: this.prgBank1,
      chrBanks: Array.from(this.chrBanks),
      prgRamEnabled: this.prgRamEnabled,
      prgRamWriteEnabled: this.prgRamWriteEnabled,
      irqLatch: this.irqLatch,
      irqCounter: this.irqCounter,
      irqEnabled: this.irqEnabled,
      irqCycleMode: this.irqCycleMode,
      irqPrescaler: this.irqPrescaler,
      irqPending: this.irqPending,
      pulse1Volume: this.pulse1Volume,
      pulse1DutyCycle: this.pulse1DutyCycle,
      pulse1DigitizedMode: this.pulse1DigitizedMode,
      pulse1PeriodLow: this.pulse1PeriodLow,
      pulse1PeriodHigh: this.pulse1PeriodHigh,
      pulse1Enabled: this.pulse1Enabled,
      pulse1Timer: this.pulse1Timer,
      pulse1Phase: this.pulse1Phase,
      pulse2Volume: this.pulse2Volume,
      pulse2DutyCycle: this.pulse2DutyCycle,
      pulse2DigitizedMode: this.pulse2DigitizedMode,
      pulse2PeriodLow: this.pulse2PeriodLow,
      pulse2PeriodHigh: this.pulse2PeriodHigh,
      pulse2Enabled: this.pulse2Enabled,
      pulse2Timer: this.pulse2Timer,
      pulse2Phase: this.pulse2Phase,
      sawRate: this.sawRate,
      sawPeriodLow: this.sawPeriodLow,
      sawPeriodHigh: this.sawPeriodHigh,
      sawEnabled: this.sawEnabled,
      sawTimer: this.sawTimer,
      sawAccumulator: this.sawAccumulator,
      sawAccumStep: this.sawAccumStep,
      prgRam: Array.from(this.prgRam),
      chrRam: this.useChrRam ? Array.from(this.chrData) : undefined,
    };
  }

  deserializeMapper(data: Record<string, unknown>): void {
    this.prgBank0 = data["prgBank0"] as number;
    this.prgBank1 = data["prgBank1"] as number;
    if (Array.isArray(data["chrBanks"])) this.chrBanks.set(data["chrBanks"] as number[]);
    this.prgRamEnabled = data["prgRamEnabled"] as boolean;
    this.prgRamWriteEnabled = data["prgRamWriteEnabled"] as boolean;
    this.irqLatch = data["irqLatch"] as number;
    this.irqCounter = data["irqCounter"] as number;
    this.irqEnabled = data["irqEnabled"] as boolean;
    this.irqCycleMode = data["irqCycleMode"] as boolean;
    this.irqPrescaler = data["irqPrescaler"] as number;
    this.irqPending = data["irqPending"] as boolean;
    this.pulse1Volume = data["pulse1Volume"] as number;
    this.pulse1DutyCycle = data["pulse1DutyCycle"] as number;
    this.pulse1DigitizedMode = data["pulse1DigitizedMode"] as boolean;
    this.pulse1PeriodLow = data["pulse1PeriodLow"] as number;
    this.pulse1PeriodHigh = data["pulse1PeriodHigh"] as number;
    this.pulse1Enabled = data["pulse1Enabled"] as boolean;
    this.pulse1Timer = data["pulse1Timer"] as number;
    this.pulse1Phase = data["pulse1Phase"] as number;
    this.pulse2Volume = data["pulse2Volume"] as number;
    this.pulse2DutyCycle = data["pulse2DutyCycle"] as number;
    this.pulse2DigitizedMode = data["pulse2DigitizedMode"] as boolean;
    this.pulse2PeriodLow = data["pulse2PeriodLow"] as number;
    this.pulse2PeriodHigh = data["pulse2PeriodHigh"] as number;
    this.pulse2Enabled = data["pulse2Enabled"] as boolean;
    this.pulse2Timer = data["pulse2Timer"] as number;
    this.pulse2Phase = data["pulse2Phase"] as number;
    this.sawRate = data["sawRate"] as number;
    this.sawPeriodLow = data["sawPeriodLow"] as number;
    this.sawPeriodHigh = data["sawPeriodHigh"] as number;
    this.sawEnabled = data["sawEnabled"] as boolean;
    this.sawTimer = data["sawTimer"] as number;
    this.sawAccumulator = data["sawAccumulator"] as number;
    this.sawAccumStep = data["sawAccumStep"] as number;
    if (Array.isArray(data["prgRam"])) this.prgRam.set(data["prgRam"] as number[]);
    if (this.useChrRam && Array.isArray(data["chrRam"])) {
      this.chrData.set((data["chrRam"] as number[]).slice(0, this.chrData.length));
    }
  }
}
