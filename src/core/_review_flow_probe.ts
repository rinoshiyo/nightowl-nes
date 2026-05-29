// 検証用 probe3: severity 表記 + bot 柔らかテイストを反映した案 B フローの再確認用。
// high (仕様違反級) と low (スタイル) の指摘が混ざるよう、わざと作ってある。検証後に削除する。

import { clearFlag, CpuFlags, setFlag } from "./cpu/flags.ts";

/**
 * Zero (bit1) / Negative (bit7) フラグを value に基づいて更新する。
 * 6502 仕様どおり、条件成立で set / 不成立で clear する。
 * @param status 現在のステータスレジスタ値 (8bit)
 * @param value  判定対象の値 (8bit)
 */
export function updateZeroNegative(status: number, value: number): number {
  const v = value & 0xff;
  let s = v === 0 ? setFlag(status, CpuFlags.Z) : clearFlag(status, CpuFlags.Z);
  s = (v & 0x80) !== 0 ? setFlag(s, CpuFlags.N) : clearFlag(s, CpuFlags.N);
  return s;
}
