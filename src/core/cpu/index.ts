import { CpuFlags } from "./flags.ts";

/**
 * 6502 CPU の状態を表す型。
 *
 * - a / x / y: 8bit レジスタ (0x00 - 0xFF)
 * - sp: 8bit スタックポインタ (実効アドレスは 0x0100 | sp)
 * - pc: 16bit プログラムカウンタ
 * - p: 8bit ステータスフラグ (CpuFlags 参照)
 * - cycles: 累積実行サイクル数 (テスト・PPU 同期用)
 */
export interface Cpu {
  a: number;
  x: number;
  y: number;
  sp: number;
  pc: number;
  p: number;
  cycles: number;
}

/**
 * Cpu のデフォルト初期値を返す factory。
 * overrides で個別フィールドを差し替えられる (テスト用)。
 *
 * 初期値は reset 直後を意図する暫定値であり、 正式な reset シーケンスは
 * 後続の夜で IRQ ベクタ ($FFFC/$FFFD) から PC をロードする実装に置き換える。
 */
export function createCpu(overrides?: Partial<Cpu>): Cpu {
  return {
    a: 0,
    x: 0,
    y: 0,
    sp: 0xfd,
    pc: 0,
    p: CpuFlags.I | CpuFlags.U,
    cycles: 0,
    ...overrides,
  };
}
