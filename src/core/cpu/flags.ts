/**
 * 6502 CPU ステータスフラグ (P レジスタ) のビット定数とユーティリティ。
 *
 * NES 6502 (RP2A03) では D (Decimal) フラグはハードウェア上無効化されているが、
 * ビット位置自体は存在するため定数として保持する。 U (Unused) は常時 1 にしておく。
 */
export const CpuFlags = {
  C: 1 << 0,
  Z: 1 << 1,
  I: 1 << 2,
  D: 1 << 3,
  B: 1 << 4,
  U: 1 << 5,
  V: 1 << 6,
  N: 1 << 7,
} as const;

export type CpuFlag = (typeof CpuFlags)[keyof typeof CpuFlags];

export function setFlag(p: number, flag: CpuFlag): number {
  return (p | flag) & 0xff;
}

export function clearFlag(p: number, flag: CpuFlag): number {
  return (p & ~flag) & 0xff;
}

export function hasFlag(p: number, flag: CpuFlag): boolean {
  return (p & flag) !== 0;
}
