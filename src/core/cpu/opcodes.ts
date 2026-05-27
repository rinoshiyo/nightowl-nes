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

/**
 * 比較命令 (CMP/CPX/CPY) 共通処理。 符号なし減算 register - value を行い、
 * C = (register >= value)、 Z = (register == value)、 N = 結果 bit7 を更新する
 * (register 自体は変更しない)。
 */
function compare(cpu: Cpu, register: number, value: number): void {
  const r = (register - value) & 0xff;
  cpu.p = register >= value ? setFlag(cpu.p, CpuFlags.C) : clearFlag(cpu.p, CpuFlags.C);
  cpu.p = register === value ? setFlag(cpu.p, CpuFlags.Z) : clearFlag(cpu.p, CpuFlags.Z);
  cpu.p = (r & 0x80) !== 0 ? setFlag(cpu.p, CpuFlags.N) : clearFlag(cpu.p, CpuFlags.N);
}

/**
 * A レジスタへの加算共通処理 (ADC / SBC で共用)。
 * `A = A + operand + C` を binary で計算し C/V/Z/N を更新する。
 * SBC は operand に `M ^ 0xFF` (~M) を渡すことで `A - M - (1-C)` と等価になる。
 * NES の 6502 は decimal mode 無効なので D フラグは参照しない。
 */
function addToA(cpu: Cpu, operand: number): void {
  const carryIn = hasFlag(cpu.p, CpuFlags.C) ? 1 : 0;
  const sum = cpu.a + operand + carryIn;
  const result = sum & 0xff;
  cpu.p = sum > 0xff ? setFlag(cpu.p, CpuFlags.C) : clearFlag(cpu.p, CpuFlags.C);
  // overflow: 両オペランドと結果の符号が食い違う (同符号の加算で符号が反転) 時に立つ
  const overflow = ((cpu.a ^ result) & (operand ^ result) & 0x80) !== 0;
  cpu.p = overflow ? setFlag(cpu.p, CpuFlags.V) : clearFlag(cpu.p, CpuFlags.V);
  cpu.a = result;
  setZeroNeg(cpu, cpu.a);
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
def(0x40, {
  name: "RTI",
  mode: implied,
  cycles: 6,
  exec: (cpu, bus) => {
    // PLP と同じく pull 値の B(bit4) を捨て U(bit5) を 1 にして P を復元、
    // 続けて PC を pull16 する。 RTS と違い pull した PC に +1 しない。
    cpu.p = (pull8(cpu, bus) & ~0x10 & 0xff) | 0x20;
    cpu.pc = pull16(cpu, bus);
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

// ---- store / load (absolute) ----
// absolute は固定アドレスのため page-cross 加算なし。 store は cycle 4 でフラグ非変化、
// load は cycle 4 で Z/N 更新。
def(0x8d, {
  name: "STA",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    bus.write(op.addr, cpu.a);
    return 0;
  },
});
def(0x8e, {
  name: "STX",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    bus.write(op.addr, cpu.x);
    return 0;
  },
});
def(0x8c, {
  name: "STY",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    bus.write(op.addr, cpu.y);
    return 0;
  },
});
def(0xad, {
  name: "LDA",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0xae, {
  name: "LDX",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.x = bus.read(op.addr);
    setZeroNeg(cpu, cpu.x);
    return 0;
  },
});
def(0xac, {
  name: "LDY",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.y = bus.read(op.addr);
    setZeroNeg(cpu, cpu.y);
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

// ---- スタック命令 ----
// PHP は B(bit4)|U(bit5) を立てて push、 PLP は pull 値の B を捨て U を常に 1 にする
// (6502 の break flag の扱い。 nesdev wiki "Status flags" 参照)
def(0x48, {
  name: "PHA",
  mode: implied,
  cycles: 3,
  exec: (cpu, bus) => {
    push8(cpu, bus, cpu.a);
    return 0;
  },
});
def(0x68, {
  name: "PLA",
  mode: implied,
  cycles: 4,
  exec: (cpu, bus) => {
    cpu.a = pull8(cpu, bus);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x08, {
  name: "PHP",
  mode: implied,
  cycles: 3,
  exec: (cpu, bus) => {
    push8(cpu, bus, cpu.p | 0x30);
    return 0;
  },
});
def(0x28, {
  name: "PLP",
  mode: implied,
  cycles: 4,
  exec: (cpu, bus) => {
    cpu.p = (pull8(cpu, bus) & ~0x10 & 0xff) | 0x20;
    return 0;
  },
});

// ---- 論理 / 比較 (immediate) ----
def(0x29, {
  name: "AND",
  mode: immediate,
  cycles: 2,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a & bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x09, {
  name: "ORA",
  mode: immediate,
  cycles: 2,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a | bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x49, {
  name: "EOR",
  mode: immediate,
  cycles: 2,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a ^ bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0xc9, {
  name: "CMP",
  mode: immediate,
  cycles: 2,
  exec: (cpu, bus, op) => {
    compare(cpu, cpu.a, bus.read(op.addr));
    return 0;
  },
});
def(0xe0, {
  name: "CPX",
  mode: immediate,
  cycles: 2,
  exec: (cpu, bus, op) => {
    compare(cpu, cpu.x, bus.read(op.addr));
    return 0;
  },
});
def(0xc0, {
  name: "CPY",
  mode: immediate,
  cycles: 2,
  exec: (cpu, bus, op) => {
    compare(cpu, cpu.y, bus.read(op.addr));
    return 0;
  },
});

// ---- 算術 (immediate) ----
def(0x69, {
  name: "ADC",
  mode: immediate,
  cycles: 2,
  exec: (cpu, bus, op) => {
    addToA(cpu, bus.read(op.addr));
    return 0;
  },
});
def(0xe9, {
  name: "SBC",
  mode: immediate,
  cycles: 2,
  exec: (cpu, bus, op) => {
    // SBC は ~M を足すと ADC と同じ回路になる (A - M - (1-C) = A + ~M + C)
    addToA(cpu, bus.read(op.addr) ^ 0xff);
    return 0;
  },
});

// ---- LDY ----
def(0xa0, {
  name: "LDY",
  mode: immediate,
  cycles: 2,
  exec: (cpu, bus, op) => {
    cpu.y = bus.read(op.addr);
    setZeroNeg(cpu, cpu.y);
    return 0;
  },
});

// ---- レジスタ増減 (implied) ----
def(0xe8, {
  name: "INX",
  mode: implied,
  cycles: 2,
  exec: (cpu) => {
    cpu.x = (cpu.x + 1) & 0xff;
    setZeroNeg(cpu, cpu.x);
    return 0;
  },
});
def(0xc8, {
  name: "INY",
  mode: implied,
  cycles: 2,
  exec: (cpu) => {
    cpu.y = (cpu.y + 1) & 0xff;
    setZeroNeg(cpu, cpu.y);
    return 0;
  },
});
def(0xca, {
  name: "DEX",
  mode: implied,
  cycles: 2,
  exec: (cpu) => {
    cpu.x = (cpu.x - 1) & 0xff;
    setZeroNeg(cpu, cpu.x);
    return 0;
  },
});
def(0x88, {
  name: "DEY",
  mode: implied,
  cycles: 2,
  exec: (cpu) => {
    cpu.y = (cpu.y - 1) & 0xff;
    setZeroNeg(cpu, cpu.y);
    return 0;
  },
});

// ---- レジスタ転送 (implied) ----
// TXS のみ Z/N を更新しない (6502 の仕様)。 他の 5 命令は転送後に Z/N を更新する。
def(0xaa, {
  name: "TAX",
  mode: implied,
  cycles: 2,
  exec: (cpu) => {
    cpu.x = cpu.a;
    setZeroNeg(cpu, cpu.x);
    return 0;
  },
});
def(0xa8, {
  name: "TAY",
  mode: implied,
  cycles: 2,
  exec: (cpu) => {
    cpu.y = cpu.a;
    setZeroNeg(cpu, cpu.y);
    return 0;
  },
});
def(0x8a, {
  name: "TXA",
  mode: implied,
  cycles: 2,
  exec: (cpu) => {
    cpu.a = cpu.x;
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x98, {
  name: "TYA",
  mode: implied,
  cycles: 2,
  exec: (cpu) => {
    cpu.a = cpu.y;
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0xba, {
  name: "TSX",
  mode: implied,
  cycles: 2,
  exec: (cpu) => {
    cpu.x = cpu.sp;
    setZeroNeg(cpu, cpu.x);
    return 0;
  },
});
def(0x9a, {
  name: "TXS",
  mode: implied,
  cycles: 2,
  exec: (cpu) => {
    // TXS は SP を設定するだけで Z/N フラグは変化させない
    cpu.sp = cpu.x;
    return 0;
  },
});

// ---- 割り込み禁止フラグ ----
def(0x78, { name: "SEI", mode: implied, cycles: 2, exec: (cpu) => ((cpu.p = setFlag(cpu.p, CpuFlags.I)), 0) });
def(0x58, { name: "CLI", mode: implied, cycles: 2, exec: (cpu) => ((cpu.p = clearFlag(cpu.p, CpuFlags.I)), 0) });
def(0xb8, { name: "CLV", mode: implied, cycles: 2, exec: (cpu) => ((cpu.p = clearFlag(cpu.p, CpuFlags.V)), 0) });
