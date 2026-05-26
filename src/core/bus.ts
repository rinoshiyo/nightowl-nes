/**
 * CPU バスインターフェース。
 *
 * CPU から見える 16bit アドレス空間 (0x0000-0xFFFF) を抽象化する。
 * 具象実装は RAM / PPU レジスタ / APU レジスタ / カートリッジ (Mapper) を
 * アドレスに応じてディスパッチする責務を持つ。
 *
 * - read(addr): 1 byte 読み出し (0-255 を返却)
 * - write(addr, value): 1 byte 書き込み (value の下位 8bit のみ有効)
 */
export interface Bus {
  read(addr: number): number;
  write(addr: number, value: number): void;
}
