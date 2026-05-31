/**
 * APU 長さカウンタテーブル。
 *
 * $4003/$4007 等のビット 3-7 (5bit) をインデックスに長さカウンタ値を返す。
 * 仕様参照: https://www.nesdev.org/wiki/APU_Length_Counter
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
export const LENGTH_TABLE: readonly number[] = [
  10, 254, 20, 2, 40, 4, 80, 6,
  160, 8, 60, 10, 14, 12, 26, 14,
  12, 16, 24, 18, 48, 20, 96, 22,
  192, 24, 72, 26, 16, 28, 32, 30,
] as const;
