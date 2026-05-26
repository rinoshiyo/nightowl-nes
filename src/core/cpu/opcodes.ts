import type { Bus } from "../bus.ts";
import {
  absolute,
  immediate,
  implied,
  type Operand,
  relative,
  zeroPage,
} from "./addressing.ts";
import { clearFlag, CpuFlags, hasFlag, setFlag } from "./flags.ts";
import type { Cpu } from "./index.ts";

/**
 * 1 命令の定義。
 * - mode: アドレッシング解決 (cpu.pc を進めオペランドの実効アドレスを返す)
 * - exec: 命令本体。 base cycles に上乗せする追加サイクル (分岐成立・page cross) を返す
 * - cycles: 基本サイクル数
 */
export interface Instruction {
  name: string;
  mode: (cpu: Cpu, bus: Bus) => Operand;
  exec: (cpu: Cpu, bus: Bus, op: Operand) => number;
  cycles: number;
}

// ---- スタック操作ヘルパー (スタックは $0100-$01FF) ----

function push8(cpu: Cpu, bus: Bus, value: number): void {
  bus.write(0x100 | cpu.sp, value & 0xff);
  cpu.sp = (cpu.sp - 1) & 0xff;
}

function pull8(cpu: Cpu, bus: Bus): number {
  cpu.sp = (cpu.sp + 1) & 0xff;
  return bus.read(0x100 | cpu.sp);
}

function push16(cpu: Cpu, bus: Bus, value: number): void {
  push8(cpu, bus, (value >> 8) & 0xff);
  push8(cpu, bus, value & 0xff);
}

function pull16(cpu: Cpu, bus: Bus): number {
  const lo = pull8(cpu, bus);
  const hi = pull8(cpu, bus);
  return (lo | (hi << 8)) & 0xffff;
}

/** 演算結果に応じて Zero / Negative フラグを更新する共通処理 */
function setZeroNeg(cpu: Cpu, value: number): void {
  cpu.p = (value & 0xff) === 0 ? setFlag(cpu.p, CpuFlags.Z) : clearFlag(cpu.p, CpuFlags.Z);
  cpu.p = (value & 0x80) !== 0 ? setFlag(cpu.p, CpuFlags.N) : clearFlag(cpu.p, CpuFlags.N);
}

/** 分岐共通処理。 taken なら飛び先へ PC を移し +1 (page cross でさらに +1) */
function branch(cpu: Cpu, op: Operand, taken: boolean): number {
  if (!taken) return 0;
  cpu.pc = op.addr;
  return op.pageCrossed ? 2 : 1;
}

/**
 * 256 エントリの命令ディスパッチテーブル。 未実装の opcode は null。
 * 夜 2 では nestest 先頭 50 行で実際に出現する命令 + JSR と対の RTS を実装する。
 */
export const OPCODES: (Instruction | null)[] = new Array<Instruction | null>(256).fill(null);

function def(opcode: number, inst: Instruction): void {
  OPCODES[opcode] = inst;
}

// ---- 制御転送 ----
def(0x4c, {
  name: "JMP",
  mode: absolute,
  cycles: 3,
  exec: (cpu, _bus, op) => {
    cpu.pc = op.addr;
    return 0;
  },
});
def(0x20, {
  name: "JSR",
  mode: absolute,
  cycles: 6,
  exec: (cpu, bus, op) => {
    // absolute モードが PC を +2 済み。 6502 は「最後のオペランドバイトのアドレス
    // (= リターンアドレス - 1)」 を push する。 現在の PC は次命令を指すので PC-1。
    push16(cpu, bus, (cpu.pc - 1) & 0xffff);
    cpu.pc = op.addr;
    return 0;
  },
});
def(0x60, {
  name: "RTS",
  mode: implied,
  cycles: 6,
  exec: (cpu, bus) => {
    cpu.pc = (pull16(cpu, bus) + 1) & 0xffff;
    return 0;
  },
});

// ---- ロード / ストア ----
def(0xa2, {
  name: "LDX",
  mode: immediate,
  cycles: 2,
  exec: (cpu, bus, op) => {
    cpu.x = bus.read(op.addr);
    setZeroNeg(cpu, cpu.x);
    return 0;
  },
});
def(0xa9, {
  name: "LDA",
  mode: immediate,
  cycles: 2,
  exec: (cpu, bus, op) => {
    cpu.a = bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x86, {
  name: "STX",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    bus.write(op.addr, cpu.x);
    return 0;
  },
});
def(0x85, {
  name: "STA",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    bus.write(op.addr, cpu.a);
    return 0;
  },
});

// ---- BIT (zeroPage) ----
def(0x24, {
  name: "BIT",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    const m = bus.read(op.addr);
    cpu.p = (cpu.a & m) === 0 ? setFlag(cpu.p, CpuFlags.Z) : clearFlag(cpu.p, CpuFlags.Z);
    cpu.p = (m & 0x40) !== 0 ? setFlag(cpu.p, CpuFlags.V) : clearFlag(cpu.p, CpuFlags.V);
    cpu.p = (m & 0x80) !== 0 ? setFlag(cpu.p, CpuFlags.N) : clearFlag(cpu.p, CpuFlags.N);
    return 0;
  },
});

// ---- フラグ操作 ----
def(0x38, { name: "SEC", mode: implied, cycles: 2, exec: (cpu) => ((cpu.p = setFlag(cpu.p, CpuFlags.C)), 0) });
def(0x18, { name: "CLC", mode: implied, cycles: 2, exec: (cpu) => ((cpu.p = clearFlag(cpu.p, CpuFlags.C)), 0) });
def(0xf8, { name: "SED", mode: implied, cycles: 2, exec: (cpu) => ((cpu.p = setFlag(cpu.p, CpuFlags.D)), 0) });
def(0xd8, { name: "CLD", mode: implied, cycles: 2, exec: (cpu) => ((cpu.p = clearFlag(cpu.p, CpuFlags.D)), 0) });

// ---- NOP ----
def(0xea, { name: "NOP", mode: implied, cycles: 2, exec: () => 0 });

// ---- 分岐 (relative) ----
def(0x10, { name: "BPL", mode: relative, cycles: 2, exec: (cpu, _b, op) => branch(cpu, op, !hasFlag(cpu.p, CpuFlags.N)) });
def(0x30, { name: "BMI", mode: relative, cycles: 2, exec: (cpu, _b, op) => branch(cpu, op, hasFlag(cpu.p, CpuFlags.N)) });
def(0x50, { name: "BVC", mode: relative, cycles: 2, exec: (cpu, _b, op) => branch(cpu, op, !hasFlag(cpu.p, CpuFlags.V)) });
def(0x70, { name: "BVS", mode: relative, cycles: 2, exec: (cpu, _b, op) => branch(cpu, op, hasFlag(cpu.p, CpuFlags.V)) });
def(0x90, { name: "BCC", mode: relative, cycles: 2, exec: (cpu, _b, op) => branch(cpu, op, !hasFlag(cpu.p, CpuFlags.C)) });
def(0xb0, { name: "BCS", mode: relative, cycles: 2, exec: (cpu, _b, op) => branch(cpu, op, hasFlag(cpu.p, CpuFlags.C)) });
def(0xd0, { name: "BNE", mode: relative, cycles: 2, exec: (cpu, _b, op) => branch(cpu, op, !hasFlag(cpu.p, CpuFlags.Z)) });
def(0xf0, { name: "BEQ", mode: relative, cycles: 2, exec: (cpu, _b, op) => branch(cpu, op, hasFlag(cpu.p, CpuFlags.Z)) });
