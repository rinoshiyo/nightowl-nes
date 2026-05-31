/**
 * Mapper インターフェース。
 *
 * カートリッジのメモリマッピング (PRG ROM バンク切替・CHR ROM/RAM アクセス) を
 * 抽象化し、各 mapper 番号ごとの実装に差し替え可能にする。
 * 仕様参照: https://www.nesdev.org/wiki/Mapper
 */

import type { Cart } from "../cart.ts";
import { MapperNrom } from "./nrom.ts";
import { MapperUxrom } from "./uxrom.ts";

export interface Mapper {
  /** CPU アドレス空間 $8000-$FFFF の読み出し */
  readPrg(addr: number): number;
  /** CPU アドレス空間 $8000-$FFFF への書き込み (バンク切替レジスタ等) */
  writePrg(addr: number, value: number): void;
  /** PPU アドレス空間 $0000-$1FFF の読み出し (CHR ROM/RAM) */
  readChr(addr: number): number;
  /** PPU アドレス空間 $0000-$1FFF への書き込み (CHR RAM 時のみ有効) */
  writeChr(addr: number, value: number): void;
}

export function createMapper(cart: Cart): Mapper {
  switch (cart.header.mapper) {
    case 0:
      return new MapperNrom(cart);
    case 2:
      return new MapperUxrom(cart);
    default:
      throw new Error(`Unsupported mapper: ${cart.header.mapper}`);
  }
}
