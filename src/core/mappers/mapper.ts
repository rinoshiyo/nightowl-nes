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
    case 7:
      return new MapperAxrom(cart);
    default:
      throw new Error(`Unsupported mapper: ${cart.header.mapper}`);
  }
}
