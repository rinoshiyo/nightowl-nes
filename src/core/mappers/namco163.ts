/**
 * Mapper 19 (Namco 163)。
 *
 * 拡張音源 (最大 8ch 波形メモリ音源) を持つ複雑な Mapper。
 * 女神転生 II、Rolling Thunder 等で使用。
 *
 * - PRG ROM: 8KB × 4 バンク切替 (3 ウィンドウ可変 + 1 固定 or 可変)
 * - CHR ROM: 1KB × 8 バンク切替 (NT バンクも CHR ROM から供給可能)
 * - 内部 RAM: 128 bytes (波形テーブル + 音源レジスタ兼用)
 * - IRQ カウンタ: 15bit アップカウンタ (CPU cycle ベース)
 * - 拡張音源: 波形メモリ音源 (最大 8ch)
 *
 * レジスタマップ:
 *   $4800: 内部 RAM data port (auto-increment 付き)
 *   $5000: IRQ カウンタ下位 8bit (R/W)
 *   $5800: IRQ カウンタ上位 8bit [6:0] + IRQ 有効 [7] (R/W)
 *   $8000-$DFFF: CHR/NT バンク切替 (1KB 単位、$x000 の上位ニブルでスロット選択)
 *   $E000: PRG bank 0 ($8000-$9FFF) + サウンド有効
 *   $E800: PRG bank 1 ($A000-$BFFF) + CHR RAM 制御
 *   $F000: PRG bank 2 ($C000-$DFFF)
 *   $F800: 内部 RAM address port + write protect
 *
 * 仕様参照: https://www.nesdev.org/wiki/Namco_163
 */

import type { Cart } from "../cart.ts";
import type { Mirroring } from "../cart.ts";
import type { Mapper } from "./mapper.ts";

const PRG_BANK_SIZE = 0x2000; // 8KB
const CHR_BANK_SIZE = 0x0400; // 1KB
const PRG_RAM_SIZE = 0x2000;  // 8KB
const INTERNAL_RAM_SIZE = 128;

/** 拡張音源の CPU クロック分周比 (15 cycle ごとに 1 更新) */
const SOUND_CLOCK_DIVIDER = 15;

export class MapperNamco163 implements Mapper {
  irqPending = false;
  onMirroringChange: ((m: Mirroring) => void) | null = null;

  private readonly prgRom: Uint8Array;
  private readonly prgRam = new Uint8Array(PRG_RAM_SIZE);
  private readonly chrData: Uint8Array;
  private readonly useChrRam: boolean;

  private readonly prgBankCount: number;
  private readonly chrBankCount: number;

  /** CHR バンクレジスタ 0-7 (1KB 単位) */
  private readonly chrBanks = new Uint8Array(8);
  /** NT バンクレジスタ 0-3 ($2000-$2FFF の各 1KB) */
  private readonly ntBanks = new Uint8Array(4);

  /** PRG バンクレジスタ (8KB 単位、3 ウィンドウ) */
  private readonly prgBanks = new Uint8Array(3);

  /** 内部 RAM (128 bytes — 波形テーブル + 音源レジスタ兼用) */
  private readonly internalRam = new Uint8Array(INTERNAL_RAM_SIZE);

  /** 内部 RAM アドレスポインタ (7bit) */
  private ramAddr = 0;
  /** 内部 RAM auto-increment フラグ */
  private ramAutoIncrement = false;

  /** IRQ カウンタ (15bit) */
  private irqCounter = 0;
  /** IRQ 有効フラグ */
  private irqEnabled = false;

  /** サウンド有効フラグ ($E000 bit6) */
  private soundEnabled = false;

  /** CHR RAM 制御 ($E800 の上位 2bit) */
  private chrRamHigh = false; // bit7: $1000-$1FFF が RAM
  private chrRamLow = false;  // bit6: $0000-$0FFF が RAM

  /** 拡張音源: サウンドクロック分周カウンタ */
  private soundClockCounter = 0;
  /** 拡張音源: 現在更新中のチャンネルインデックス (0-7) */
  private soundChannelIndex = 7;
  /** 拡張音源: 蓄積中の出力値 (全チャンネル合算完了前の中間値) */
  private soundAccum = 0;
  /** 拡張音源: 最終確定出力値 (全チャンネル合算完了後、audioOutput が参照) */
  private soundOutput = 0;

  constructor(cart: Cart) {
    this.prgRom = cart.prgRom;
    this.prgBankCount = Math.max(1, cart.prgRom.length / PRG_BANK_SIZE);

    if (cart.header.chrRomSize === 0) {
      this.chrData = new Uint8Array(0x2000);
      this.useChrRam = true;
      this.chrBankCount = this.chrData.length / CHR_BANK_SIZE;
    } else {
      this.chrData = cart.chrRom;
      this.useChrRam = false;
      this.chrBankCount = Math.max(1, cart.chrRom.length / CHR_BANK_SIZE);
    }

    // 初期状態: 最終バンクに固定
    this.prgBanks[0] = 0;
    this.prgBanks[1] = 0;
    this.prgBanks[2] = 0;
  }

  readPrg(addr: number): number {
    if (addr < 0xa000) {
      // $8000-$9FFF: bank 0
      const bank = (this.prgBanks[0] ?? 0) & 0x3f;
      return this.prgRom[(bank % this.prgBankCount) * PRG_BANK_SIZE + (addr & 0x1fff)] ?? 0;
    }
    if (addr < 0xc000) {
      // $A000-$BFFF: bank 1
      const bank = (this.prgBanks[1] ?? 0) & 0x3f;
      return this.prgRom[(bank % this.prgBankCount) * PRG_BANK_SIZE + (addr & 0x1fff)] ?? 0;
    }
    if (addr < 0xe000) {
      // $C000-$DFFF: bank 2
      const bank = (this.prgBanks[2] ?? 0) & 0x3f;
      return this.prgRom[(bank % this.prgBankCount) * PRG_BANK_SIZE + (addr & 0x1fff)] ?? 0;
    }
    // $E000-$FFFF: 最終バンク固定
    const lastBank = this.prgBankCount - 1;
    return this.prgRom[lastBank * PRG_BANK_SIZE + (addr & 0x1fff)] ?? 0;
  }

  writePrg(addr: number, value: number): void {
    const reg = addr & 0xf800;

    if (reg >= 0x8000 && reg <= 0xd800) {
      // $8000-$DFFF: CHR/NT バンク切替
      const slot = (addr >> 11) & 0x0f;
      if (slot < 8) {
        this.chrBanks[slot] = value;
      } else if (slot >= 8 && slot <= 11) {
        this.ntBanks[slot - 8] = value;
        this.updateMirroring();
      }
      return;
    }

    switch (reg) {
      case 0xe000:
        // PRG bank 0 + サウンド有効
        this.prgBanks[0] = value & 0x3f;
        this.soundEnabled = (value & 0x40) === 0;
        break;
      case 0xe800:
        // PRG bank 1 + CHR RAM 制御
        this.prgBanks[1] = value & 0x3f;
        this.chrRamLow = (value & 0x40) !== 0;
        this.chrRamHigh = (value & 0x80) !== 0;
        break;
      case 0xf000:
        // PRG bank 2
        this.prgBanks[2] = value & 0x3f;
        break;
      case 0xf800:
        // 内部 RAM address port
        this.ramAddr = value & 0x7f;
        this.ramAutoIncrement = (value & 0x80) !== 0;
        break;
    }
  }

  readChr(addr: number): number {
    if (addr >= 0x2000) return 0;

    // CHR RAM のみのカート: バンク切替なしの flat アクセス
    if (this.useChrRam) {
      return this.chrData[addr & 0x1fff] ?? 0;
    }

    const slot = (addr >> 10) & 7;
    const bankValue = this.chrBanks[slot] ?? 0;

    // $E800 bit6/7 による CHR RAM 切替: 該当半分で bank >= $E0 なら CIRAM 相当
    // (Namco 163 では $E0 以上のバンク値は内蔵 VRAM を示す)
    if (addr < 0x1000 && this.chrRamLow && bankValue >= 0xe0) {
      return 0;
    }
    if (addr >= 0x1000 && this.chrRamHigh && bankValue >= 0xe0) {
      return 0;
    }

    const bank = bankValue % this.chrBankCount;
    return this.chrData[bank * CHR_BANK_SIZE + (addr & 0x03ff)] ?? 0;
  }

  writeChr(addr: number, value: number): void {
    if (addr >= 0x2000) return;
    if (this.useChrRam) {
      this.chrData[addr & 0x1fff] = value;
    }
  }

  /**
   * NT (ネームテーブル) 読み出しのカスタム処理。
   * Namco 163 は NT バンクに CHR ROM を割り当て可能。
   * bank 値が $E0 以上なら内蔵 VRAM (通常ミラーリング)、
   * それ以下なら CHR ROM から供給。
   */
  readNametable(addr: number): number | undefined {
    const ntSlot = (addr >> 10) & 3;
    const bankValue = this.ntBanks[ntSlot] ?? 0;

    if (bankValue >= 0xe0) {
      // $E0 以上: 内蔵 VRAM (PPU の通常処理に委譲)
      return undefined;
    }

    // CHR ROM から供給
    if (this.useChrRam) return undefined;
    const bank = bankValue % this.chrBankCount;
    return this.chrData[bank * CHR_BANK_SIZE + (addr & 0x03ff)] ?? 0;
  }

  /**
   * NT 書き込みのカスタム処理。
   * bank 値が $E0 以上なら内蔵 VRAM に委譲。
   * CHR ROM 割り当て時は書き込み不可。
   */
  writeNametable(addr: number, _value: number): boolean {
    const ntSlot = (addr >> 10) & 3;
    const bankValue = this.ntBanks[ntSlot] ?? 0;

    if (bankValue >= 0xe0) {
      // 内蔵 VRAM に委譲
      return false;
    }
    // CHR ROM 割り当て時は書き込み不可
    return true;
  }

  /** $4800-$5FFF のレジスタ読み出し */
  readRegister(addr: number): number {
    if ((addr & 0xf800) === 0x4800) {
      // 内部 RAM data port
      const val = this.internalRam[this.ramAddr] ?? 0;
      if (this.ramAutoIncrement) {
        this.ramAddr = (this.ramAddr + 1) & 0x7f;
      }
      return val;
    }
    if ((addr & 0xf800) === 0x5000) {
      // IRQ カウンタ下位 8bit (読み出しで IRQ acknowledge)
      this.irqPending = false;
      return this.irqCounter & 0xff;
    }
    if ((addr & 0xf800) === 0x5800) {
      // IRQ カウンタ上位 7bit + IRQ 有効 (読み出しで IRQ acknowledge)
      this.irqPending = false;
      return ((this.irqCounter >> 8) & 0x7f) | (this.irqEnabled ? 0x80 : 0);
    }
    return 0;
  }

  /** $4800-$5FFF のレジスタ書き込み */
  writeRegister(addr: number, value: number): void {
    if ((addr & 0xf800) === 0x4800) {
      // 内部 RAM data port
      this.internalRam[this.ramAddr] = value;
      if (this.ramAutoIncrement) {
        this.ramAddr = (this.ramAddr + 1) & 0x7f;
      }
      return;
    }
    if ((addr & 0xf800) === 0x5000) {
      // IRQ カウンタ下位 8bit
      this.irqCounter = (this.irqCounter & 0x7f00) | value;
      this.irqPending = false;
      return;
    }
    if ((addr & 0xf800) === 0x5800) {
      // IRQ カウンタ上位 7bit + IRQ 有効
      this.irqCounter = (this.irqCounter & 0x00ff) | ((value & 0x7f) << 8);
      this.irqEnabled = (value & 0x80) !== 0;
      this.irqPending = false;
      return;
    }
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
    this.chrBanks.fill(0);
    this.ntBanks.fill(0xe0);
    this.prgBanks.fill(0);
    this.internalRam.fill(0);
    this.ramAddr = 0;
    this.ramAutoIncrement = false;
    this.irqCounter = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.soundEnabled = false;
    this.chrRamHigh = false;
    this.chrRamLow = false;
    this.soundClockCounter = 0;
    this.soundChannelIndex = 7;
    this.soundAccum = 0;
    this.soundOutput = 0;
  }

  clockIrqCounter(): void {
    // Namco 163 の IRQ は CPU cycle ベース。scanline ベースではない。
  }

  /** CPU サイクルごとの IRQ カウンタ clocking */
  cpuCycleTick(): void {
    if (this.irqEnabled) {
      if (this.irqCounter < 0x7fff) {
        this.irqCounter++;
        if (this.irqCounter >= 0x7fff) {
          this.irqPending = true;
        }
      }
    }

    // 拡張音源の更新
    if (this.soundEnabled) {
      this.soundClockCounter++;
      if (this.soundClockCounter >= SOUND_CLOCK_DIVIDER) {
        this.soundClockCounter = 0;
        this.tickSound();
      }
    }
  }

  /** 拡張音源: 1 チャンネル分を更新 */
  private tickSound(): void {
    const numChannels = this.getActiveChannelCount();
    if (numChannels === 0) {
      this.soundOutput = 0;
      return;
    }

    const ch = this.soundChannelIndex;
    const baseAddr = 0x40 + ch * 8;

    // チャンネルレジスタを内部 RAM から読み出し
    const freqLo = this.internalRam[baseAddr] ?? 0;
    const phaseLo = this.internalRam[baseAddr + 1] ?? 0;
    const freqMid = this.internalRam[baseAddr + 2] ?? 0;
    const phaseMid = this.internalRam[baseAddr + 3] ?? 0;
    const freqHi = this.internalRam[baseAddr + 4] ?? 0;
    const waveLength = 256 - (freqHi & 0xfc);
    const waveAddr = this.internalRam[baseAddr + 6] ?? 0;
    const volume = (this.internalRam[baseAddr + 7] ?? 0) & 0x0f;

    // 18bit 周波数
    const freq = freqLo | (freqMid << 8) | ((freqHi & 0x03) << 16);

    // 24bit 位相 (レジスタ上は内部 RAM に保存される)
    let phase = phaseLo | (phaseMid << 8) | ((this.internalRam[baseAddr + 5] ?? 0) << 16);

    // 位相を進める
    phase = (phase + freq) & 0xffffff;

    // 位相をレジスタに書き戻し
    this.internalRam[baseAddr + 1] = phase & 0xff;
    this.internalRam[baseAddr + 3] = (phase >> 8) & 0xff;
    this.internalRam[baseAddr + 5] = (phase >> 16) & 0xff;

    // 波形テーブルから現在のサンプルを取得
    const sampleIndex = ((phase >> 16) % waveLength) & 0xff;
    const tableAddr = waveAddr + (sampleIndex >> 1);
    const rawByte = this.internalRam[tableAddr & 0x7f] ?? 0;
    // 4bit サンプル: 偶数インデックスは下位ニブル、奇数インデックスは上位ニブル
    const sample = (sampleIndex & 1) ? (rawByte >> 4) : (rawByte & 0x0f);

    // 出力: (sample - 8) * volume
    const channelOutput = (sample - 8) * volume;

    // チャンネル出力を蓄積
    if (ch === 7) {
      this.soundAccum = channelOutput;
    } else {
      this.soundAccum += channelOutput;
    }

    // 次のチャンネルへ (ch7 → ch6 → ... → 最小アクティブチャンネル → ch7 に戻る)
    this.soundChannelIndex--;
    if (this.soundChannelIndex < 8 - numChannels) {
      // 全チャンネル更新完了: 確定値を soundOutput に反映
      this.soundOutput = this.soundAccum;
      this.soundChannelIndex = 7;
    }
  }

  /** アクティブチャンネル数を取得 (1-8) */
  private getActiveChannelCount(): number {
    // $7F の上位 3bit がチャンネル数 - 1 を示す
    return ((this.internalRam[0x7f]! >> 4) & 0x07) + 1;
  }

  /**
   * 拡張音源の出力値を返す (APU ミキサー統合用)。
   * 全アクティブチャンネルの合算値を正規化して [-1, 1] の範囲で返す。
   */
  audioOutput(): number {
    if (!this.soundEnabled) return 0;
    const numChannels = this.getActiveChannelCount();
    if (numChannels === 0) return 0;
    // 各チャンネル最大出力: (15 - 8) * 15 = 105, 最小: (0 - 8) * 15 = -120
    // 8ch 合算時の最大: 8 * 105 = 840
    // 正規化: /960 で概ね [-1, 1] に収める (0.2 程度の音量で APU とバランスを取る)
    return (this.soundOutput / 960) * 0.2;
  }

  /** ミラーリング更新 */
  private updateMirroring(): void {
    // NT バンクの $E0/$E1 で CIRAM の A10 を決定
    // ただし CHR ROM 割り当て時はカスタムミラーリングのため
    // PPU 側で readNametable を呼び出して処理する
    const nt0 = this.ntBanks[0] ?? 0xe0;
    const nt1 = this.ntBanks[1] ?? 0xe0;

    // 全て $E0 以上なら通常ミラーリングを判定
    if ((this.ntBanks[0] ?? 0) >= 0xe0 &&
        (this.ntBanks[1] ?? 0) >= 0xe0 &&
        (this.ntBanks[2] ?? 0) >= 0xe0 &&
        (this.ntBanks[3] ?? 0) >= 0xe0) {
      // $E0 = CIRAM page 0, $E1 = CIRAM page 1
      if (nt0 === nt1) {
        if ((nt0 & 1) === 0) {
          this.onMirroringChange?.("single-lower");
        } else {
          this.onMirroringChange?.("single-upper");
        }
      } else if (nt0 === (this.ntBanks[2] ?? 0)) {
        this.onMirroringChange?.("vertical");
      } else {
        this.onMirroringChange?.("horizontal");
      }
    }
    // CHR ROM 割り当て含む場合は readNametable で個別処理
  }

  mapperId(): number { return 19; }

  serializeMapper(): Record<string, unknown> {
    return {
      chrBanks: Array.from(this.chrBanks),
      ntBanks: Array.from(this.ntBanks),
      prgBanks: Array.from(this.prgBanks),
      internalRam: Array.from(this.internalRam),
      ramAddr: this.ramAddr,
      ramAutoIncrement: this.ramAutoIncrement,
      irqCounter: this.irqCounter,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      soundEnabled: this.soundEnabled,
      chrRamHigh: this.chrRamHigh,
      chrRamLow: this.chrRamLow,
      soundClockCounter: this.soundClockCounter,
      soundChannelIndex: this.soundChannelIndex,
      soundAccum: this.soundAccum,
      soundOutput: this.soundOutput,
      prgRam: Array.from(this.prgRam),
      chrRam: this.useChrRam ? Array.from(this.chrData) : undefined,
    };
  }

  deserializeMapper(data: Record<string, unknown>): void {
    if (Array.isArray(data["chrBanks"])) this.chrBanks.set(data["chrBanks"] as number[]);
    if (Array.isArray(data["ntBanks"])) this.ntBanks.set(data["ntBanks"] as number[]);
    if (Array.isArray(data["prgBanks"])) this.prgBanks.set(data["prgBanks"] as number[]);
    if (Array.isArray(data["internalRam"])) this.internalRam.set(data["internalRam"] as number[]);
    this.ramAddr = data["ramAddr"] as number;
    this.ramAutoIncrement = data["ramAutoIncrement"] as boolean;
    this.irqCounter = data["irqCounter"] as number;
    this.irqEnabled = data["irqEnabled"] as boolean;
    this.irqPending = data["irqPending"] as boolean;
    this.soundEnabled = data["soundEnabled"] as boolean;
    this.chrRamHigh = data["chrRamHigh"] as boolean;
    this.chrRamLow = data["chrRamLow"] as boolean;
    this.soundClockCounter = data["soundClockCounter"] as number;
    this.soundChannelIndex = data["soundChannelIndex"] as number;
    this.soundAccum = data["soundAccum"] as number ?? 0;
    this.soundOutput = data["soundOutput"] as number;
    if (Array.isArray(data["prgRam"])) this.prgRam.set(data["prgRam"] as number[]);
    if (this.useChrRam && Array.isArray(data["chrRam"])) {
      this.chrData.set((data["chrRam"] as number[]).slice(0, this.chrData.length));
    }
    this.onMirroringChange && this.updateMirroring();
  }
}
