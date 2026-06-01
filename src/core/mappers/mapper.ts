/**
 * Mapper インターフェース。
 *
 * カートリッジのメモリマッピング (PRG ROM バンク切替・CHR ROM/RAM アクセス) を
 * 抽象化し、各 mapper 番号ごとの実装に差し替え可能にする。
 * 仕様参照: https://www.nesdev.org/wiki/Mapper
 */

import type { Cart } from "../cart.ts";
import { MapperNrom } from "./nrom.ts";
import { MapperMmc1 } from "./mmc1.ts";
import { MapperUxrom } from "./uxrom.ts";
import { MapperCnrom } from "./cnrom.ts";
import { MapperMmc3 } from "./mmc3.ts";
import { MapperAxrom } from "./axrom.ts";
import { MapperColorDreams } from "./color-dreams.ts";
import { MapperGxrom } from "./gxrom.ts";
import { MapperCodemasters } from "./codemasters.ts";
import { MapperMmc2 } from "./mmc2.ts";
import { MapperMmc4 } from "./mmc4.ts";
import { MapperDxrom } from "./dxrom.ts";
import { MapperBandaiFcg } from "./bandai-fcg.ts";
import { MapperJalecoSs8806 } from "./jaleco-ss8806.ts";
import { MapperNamco163 } from "./namco163.ts";
import { MapperSunsoftFme7 } from "./sunsoft-fme7.ts";
import { MapperMmc5 } from "./mmc5.ts";
import { MapperVrc6 } from "./vrc6.ts";

export interface Mapper {
  /** CPU アドレス空間 $8000-$FFFF の読み出し */
  readPrg(addr: number): number;
  /** CPU アドレス空間 $8000-$FFFF への書き込み (バンク切替レジスタ等) */
  writePrg(addr: number, value: number): void;
  /** PPU アドレス空間 $0000-$1FFF の読み出し (CHR ROM/RAM) */
  readChr(addr: number): number;
  /** PPU アドレス空間 $0000-$1FFF への書き込み (CHR RAM 時のみ有効) */
  writeChr(addr: number, value: number): void;
  /** CPU アドレス空間 $6000-$7FFF の読み出し (PRG RAM) */
  readPrgRam(addr: number): number;
  /** CPU アドレス空間 $6000-$7FFF への書き込み (PRG RAM) */
  writePrgRam(addr: number, value: number): void;
  /** PRG RAM の生バイト列を返す (バッテリーセーブ用)。PRG RAM 非搭載の mapper は null */
  getPrgRam(): Uint8Array | null;
  /** PRG RAM にバイト列を復元する (バッテリーロード用) */
  setPrgRam(data: Uint8Array): void;
  /** ミラーリング変更通知コールバック (動的 mirroring を持つ mapper 用) */
  onMirroringChange: ((m: import("../cart.ts").Mirroring) => void) | null;
  /** mapper 内部状態をリセット */
  reset(): void;
  /** IRQ 保留フラグ (MMC3 等の scanline カウンタ用。未使用 mapper は常に false) */
  irqPending: boolean;
  /** scanline ごとの IRQ カウンタ clocking (PPU が呼び出す)。未使用 mapper は空実装 */
  clockIrqCounter(): void;
  /** mapper 番号を返す */
  mapperId(): number;
  /** mapper 固有の状態をシリアライズ */
  serializeMapper(): Record<string, unknown>;
  /** mapper 固有の状態をデシリアライズ */
  deserializeMapper(data: Record<string, unknown>): void;
  /** PPU が CHR 領域を読み出した時の通知 (MMC2/MMC4 の latch 機構用) */
  onChrRead?(addr: number): void;
  /** CPU サイクルごとの IRQ clocking (Bandai FCG / Jaleco SS8806 等、CPU cycle ベース IRQ 用) */
  cpuCycleTick?(): void;
  /** 拡張音源出力 (Namco 163 等)。正規化された [-1, 1] の値を返す */
  audioOutput?(): number;
  /** $4018-$5FFF のレジスタ読み出し (Namco 163 等の拡張レジスタ用) */
  readRegister?(addr: number): number;
  /** $4018-$5FFF のレジスタ書き込み (Namco 163 等の拡張レジスタ用) */
  writeRegister?(addr: number, value: number): void;
  /** NT 読み出しのカスタム処理。undefined を返すと PPU の通常処理に委譲 */
  readNametable?(addr: number): number | undefined;
  /** NT 書き込みのカスタム処理。true を返すと書き込みを mapper が処理済み (PPU は書き込まない) */
  writeNametable?(addr: number, value: number): boolean;
}

export function createMapper(cart: Cart): Mapper {
  switch (cart.header.mapper) {
    case 0:
      return new MapperNrom(cart);
    case 1:
      return new MapperMmc1(cart);
    case 2:
      return new MapperUxrom(cart);
    case 3:
      return new MapperCnrom(cart);
    case 4:
      return new MapperMmc3(cart);
    case 5:
      return new MapperMmc5(cart);
    case 7:
      return new MapperAxrom(cart);
    case 9:
      return new MapperMmc2(cart);
    case 10:
      return new MapperMmc4(cart);
    case 11:
      return new MapperColorDreams(cart);
    case 16:
      return new MapperBandaiFcg(cart);
    case 18:
      return new MapperJalecoSs8806(cart);
    case 19:
      return new MapperNamco163(cart);
    case 24:
      return new MapperVrc6(cart, 24);
    case 26:
      return new MapperVrc6(cart, 26);
    case 66:
      return new MapperGxrom(cart);
    case 69:
      return new MapperSunsoftFme7(cart);
    case 71:
      return new MapperCodemasters(cart);
    case 206:
      return new MapperDxrom(cart);
    default:
      throw new Error(`Unsupported mapper: ${cart.header.mapper}`);
  }
}
