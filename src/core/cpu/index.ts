import { CpuFlags } from "./flags.ts";
import type { CpuState } from "../state.ts";

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
  /** NMI 保留フラグ (PPU VBlank 開始時にセット) */
  nmiPending: boolean;
  /** IRQ 保留フラグ (APU 等の IRQ ソースがアサート中に true) */
  irqPending: boolean;
  /** *KIL 命令で CPU が停止した状態 */
  halted: boolean;
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
    nmiPending: false,
    irqPending: false,
    halted: false,
    ...overrides,
  };
}

export function serializeCpu(cpu: Cpu): CpuState {
  return {
    a: cpu.a,
    x: cpu.x,
    y: cpu.y,
    sp: cpu.sp,
    pc: cpu.pc,
    p: cpu.p,
    cycles: cpu.cycles,
    nmiPending: cpu.nmiPending,
    irqPending: cpu.irqPending,
    halted: cpu.halted,
  };
}

