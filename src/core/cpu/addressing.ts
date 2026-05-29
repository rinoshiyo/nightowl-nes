import type { Bus } from "../bus.ts";
import type { Cpu } from "./index.ts";

/**
 * アドレッシングモードの解決結果。
 *
 * - addr: 実効アドレス (implied など対象アドレスを持たないモードは -1)
 * - pageCrossed: base アドレスと実効アドレスが別ページにまたがったか
 *   (read 系命令・分岐命令の追加 1 サイクル判定に使う)
 */
export interface Operand {
  addr: number;
  pageCrossed: boolean;
}

/**
 * 各アドレッシング関数は「`cpu.pc` が opcode の次 (オペランド先頭) を指す」 状態で
 * 呼ばれ、 オペランドを読み終えた分だけ `cpu.pc` を進める破壊的関数。
 *
 * 夜 2 では nestest 先頭 50 行で実際に使う 5 モードのみ実装する。
 * zeroPageX/Y・absoluteX/Y・indirect 系は使用する命令を実装する夜で追加する。
 */

export function implied(_cpu: Cpu, _bus: Bus): Operand {
  return { addr: -1, pageCrossed: false };
}

export function immediate(cpu: Cpu, _bus: Bus): Operand {
  const addr = cpu.pc;
  cpu.pc = (cpu.pc + 1) & 0xffff;
  return { addr, pageCrossed: false };
}

export function zeroPage(cpu: Cpu, bus: Bus): Operand {
  const addr = bus.read(cpu.pc);
  cpu.pc = (cpu.pc + 1) & 0xffff;
  return { addr, pageCrossed: false };
}

export function absolute(cpu: Cpu, bus: Bus): Operand {
  const lo = bus.read(cpu.pc);
  const hi = bus.read((cpu.pc + 1) & 0xffff);
  cpu.pc = (cpu.pc + 2) & 0xffff;
  return { addr: (lo | (hi << 8)) & 0xffff, pageCrossed: false };
}

/**
 * indexedIndirect ((indirect,X)): zeroPage のオペランドバイトに X を加算した
 * (ゼロページ内ラップ) アドレスから 16bit ポインタを読み、 その指す先を実効
 * アドレスとする。 ポインタの上位バイト読みも `& 0xFF` でゼロページ内にラップする
 * (6502 の古典挙動)。 このモードは page-cross 加算を持たない (常に固定 6 cycle)。
 */
export function indexedIndirect(cpu: Cpu, bus: Bus): Operand {
  const base = bus.read(cpu.pc);
  cpu.pc = (cpu.pc + 1) & 0xffff;
  const ptr = (base + cpu.x) & 0xff;
  const lo = bus.read(ptr);
  const hi = bus.read((ptr + 1) & 0xff);
  return { addr: (lo | (hi << 8)) & 0xffff, pageCrossed: false };
}

/**
 * indirectIndexed ((indirect),Y): zeroPage のオペランドバイトが指すアドレスから
 * 16bit ポインタを読み (上位バイトも `& 0xFF` でゼロページラップ)、
 * Y を加算して実効アドレスを算出する。
 * page cross 判定: base と base+Y が別ページならば pageCrossed=true。
 */
export function indirectIndexed(cpu: Cpu, bus: Bus): Operand {
  const zp = bus.read(cpu.pc);
  cpu.pc = (cpu.pc + 1) & 0xffff;
  const lo = bus.read(zp);
  const hi = bus.read((zp + 1) & 0xff);
  const base = (lo | (hi << 8)) & 0xffff;
  const addr = (base + cpu.y) & 0xffff;
  const pageCrossed = (base & 0xff00) !== (addr & 0xff00);
  return { addr, pageCrossed };
}

/**
 * absoluteIndirect (JMP indirect): 16bit のオペランドアドレスから lo/hi を読み、
 * (hi<<8)|lo にジャンプする。6502 page boundary バグ: オペランドの lo byte が
 * 0xFF の場合、hi byte を addr+1 (次ページ) でなく同ページ先頭から読む。
 */
export function absoluteIndirect(cpu: Cpu, bus: Bus): Operand {
  const lo = bus.read(cpu.pc);
  const hi = bus.read((cpu.pc + 1) & 0xffff);
  cpu.pc = (cpu.pc + 2) & 0xffff;
  const ptr = (lo | (hi << 8)) & 0xffff;
  const targetLo = bus.read(ptr);
  const targetHi = (ptr & 0xff) === 0xff
    ? bus.read(ptr & 0xff00)
    : bus.read((ptr + 1) & 0xffff);
  return { addr: (targetLo | (targetHi << 8)) & 0xffff, pageCrossed: false };
}

/**
 * absoluteY: absolute の実効アドレスに Y を加算する。
 * page cross 判定: base と base+Y が別ページならば pageCrossed=true。
 */
export function absoluteY(cpu: Cpu, bus: Bus): Operand {
  const lo = bus.read(cpu.pc);
  const hi = bus.read((cpu.pc + 1) & 0xffff);
  cpu.pc = (cpu.pc + 2) & 0xffff;
  const base = (lo | (hi << 8)) & 0xffff;
  const addr = (base + cpu.y) & 0xffff;
  const pageCrossed = (base & 0xff00) !== (addr & 0xff00);
  return { addr, pageCrossed };
}

/**
 * relative: 分岐命令専用。 符号付き 8bit オフセットを読み、
 * オフセット読み込み後の PC を基準とした分岐先アドレスを返す。
 * pageCrossed は分岐成立時の追加 1 サイクル判定に使う。
 */
export function relative(cpu: Cpu, bus: Bus): Operand {
  const raw = bus.read(cpu.pc);
  cpu.pc = (cpu.pc + 1) & 0xffff;
  const offset = raw < 0x80 ? raw : raw - 0x100;
  const addr = (cpu.pc + offset) & 0xffff;
  const pageCrossed = (cpu.pc & 0xff00) !== (addr & 0xff00);
  return { addr, pageCrossed };
}
