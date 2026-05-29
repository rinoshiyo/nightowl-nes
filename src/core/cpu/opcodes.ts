import type { Bus } from "../bus.ts";
import {
  absolute,
  absoluteIndirect,
  absoluteX,
  absoluteY,
  immediate,
  implied,
  indexedIndirect,
  indirectIndexed,
  type Operand,
  relative,
  zeroPage,
  zeroPageX,
  zeroPageY,
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
 * BIT 命令 (zeroPage / absolute) 共通処理。 A は変更せず、
 * Z = (A & M) == 0、 V = M の bit6、 N = M の bit7 を更新する
 * (V/N は A ではなく被テスト値 M のビットを直接反映する点に注意)。
 */
function bitTest(cpu: Cpu, m: number): void {
  cpu.p = (cpu.a & m) === 0 ? setFlag(cpu.p, CpuFlags.Z) : clearFlag(cpu.p, CpuFlags.Z);
  cpu.p = (m & 0x40) !== 0 ? setFlag(cpu.p, CpuFlags.V) : clearFlag(cpu.p, CpuFlags.V);
  cpu.p = (m & 0x80) !== 0 ? setFlag(cpu.p, CpuFlags.N) : clearFlag(cpu.p, CpuFlags.N);
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

// ---- シフト / ローテートの値演算 (accumulator・zeroPage RMW で共用) ----
// いずれも C フラグの in/out のみ処理し、 結果値 (0-255) を返す。
// Z/N の更新は結果値に対して呼び出し側が setZeroNeg で行う。

/** ASL: bit7 を C へ、 左 1 シフト */
function aslValue(cpu: Cpu, v: number): number {
  cpu.p = (v & 0x80) !== 0 ? setFlag(cpu.p, CpuFlags.C) : clearFlag(cpu.p, CpuFlags.C);
  return (v << 1) & 0xff;
}

/** LSR: bit0 を C へ、 右 1 シフト (bit7 へ 0 が入る) */
function lsrValue(cpu: Cpu, v: number): number {
  cpu.p = (v & 0x01) !== 0 ? setFlag(cpu.p, CpuFlags.C) : clearFlag(cpu.p, CpuFlags.C);
  return v >> 1;
}

/** ROL: oldC を C 更新前に退避し、 左 1 ローテート (bit0 へ oldC、 bit7 が新 C) */
function rolValue(cpu: Cpu, v: number): number {
  const oldC = hasFlag(cpu.p, CpuFlags.C) ? 1 : 0;
  cpu.p = (v & 0x80) !== 0 ? setFlag(cpu.p, CpuFlags.C) : clearFlag(cpu.p, CpuFlags.C);
  return ((v << 1) | oldC) & 0xff;
}

/** ROR: oldC を C 更新前に退避し、 右 1 ローテート (bit7 へ oldC、 bit0 が新 C) */
function rorValue(cpu: Cpu, v: number): number {
  const oldC = hasFlag(cpu.p, CpuFlags.C) ? 1 : 0;
  cpu.p = (v & 0x01) !== 0 ? setFlag(cpu.p, CpuFlags.C) : clearFlag(cpu.p, CpuFlags.C);
  return (v >> 1) | (oldC << 7);
}

/**
 * zeroPage read-modify-write 共通処理 (ASL/LSR/ROL/ROR/INC/DEC zp、 cycle 5)。
 * `bus.read(addr)` した値を transform で変換し、 結果を同じ addr に write back して
 * Z/N を更新する。 page cross は無いため追加サイクルは常に 0。
 */
function rmwZeroPage(
  cpu: Cpu,
  bus: Bus,
  op: Operand,
  transform: (cpu: Cpu, v: number) => number,
): number {
  const result = transform(cpu, bus.read(op.addr)) & 0xff;
  bus.write(op.addr, result);
  setZeroNeg(cpu, result);
  return 0;
}

/**
 * absolute read-modify-write 共通処理 (ASL/LSR/ROL/ROR/INC/DEC absolute、 cycle 6)。
 * rmwZeroPage の兄弟。アドレスが 2 byte (absolute) になる以外は同一。
 */
function rmwAbsolute(
  cpu: Cpu,
  bus: Bus,
  op: Operand,
  transform: (cpu: Cpu, v: number) => number,
): number {
  const result = transform(cpu, bus.read(op.addr)) & 0xff;
  bus.write(op.addr, result);
  setZeroNeg(cpu, result);
  return 0;
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
def(0x6c, {
  name: "JMP",
  mode: absoluteIndirect,
  cycles: 5,
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
def(0xa5, {
  name: "LDA",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    cpu.a = bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
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

// ---- BIT (zeroPage cycle 3 / absolute cycle 4) ----
// フラグ演算は bitTest ヘルパーに集約し zp/abs で共用する。
def(0x24, {
  name: "BIT",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    bitTest(cpu, bus.read(op.addr));
    return 0;
  },
});
def(0x2c, {
  name: "BIT",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    bitTest(cpu, bus.read(op.addr));
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

// ---- シフト / ローテート (accumulator) ----
// accumulator モードは addressing に無いため implied で cpu.a を直接操作する。
// 値演算は aslValue 等の共通ヘルパーに委譲し、 zeroPage RMW 版と挙動を共有する。
def(0x0a, {
  name: "ASL",
  mode: implied,
  cycles: 2,
  exec: (cpu) => {
    cpu.a = aslValue(cpu, cpu.a);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x4a, {
  name: "LSR",
  mode: implied,
  cycles: 2,
  exec: (cpu) => {
    cpu.a = lsrValue(cpu, cpu.a);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x2a, {
  name: "ROL",
  mode: implied,
  cycles: 2,
  exec: (cpu) => {
    cpu.a = rolValue(cpu, cpu.a);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x6a, {
  name: "ROR",
  mode: implied,
  cycles: 2,
  exec: (cpu) => {
    cpu.a = rorValue(cpu, cpu.a);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});

// ---- シフト / ローテート (zeroPage RMW、 cycle 5) ----
// accumulator 版と同じ値演算を rmwZeroPage 経由で実効アドレスに適用する。
def(0x06, { name: "ASL", mode: zeroPage, cycles: 5, exec: (cpu, bus, op) => rmwZeroPage(cpu, bus, op, aslValue) });
def(0x46, { name: "LSR", mode: zeroPage, cycles: 5, exec: (cpu, bus, op) => rmwZeroPage(cpu, bus, op, lsrValue) });
def(0x26, { name: "ROL", mode: zeroPage, cycles: 5, exec: (cpu, bus, op) => rmwZeroPage(cpu, bus, op, rolValue) });
def(0x66, { name: "ROR", mode: zeroPage, cycles: 5, exec: (cpu, bus, op) => rmwZeroPage(cpu, bus, op, rorValue) });

// ---- シフト / ローテート (absolute RMW、 cycle 6) ----
def(0x0e, { name: "ASL", mode: absolute, cycles: 6, exec: (cpu, bus, op) => rmwAbsolute(cpu, bus, op, aslValue) });
def(0x4e, { name: "LSR", mode: absolute, cycles: 6, exec: (cpu, bus, op) => rmwAbsolute(cpu, bus, op, lsrValue) });
def(0x2e, { name: "ROL", mode: absolute, cycles: 6, exec: (cpu, bus, op) => rmwAbsolute(cpu, bus, op, rolValue) });
def(0x6e, { name: "ROR", mode: absolute, cycles: 6, exec: (cpu, bus, op) => rmwAbsolute(cpu, bus, op, rorValue) });

// ---- メモリ増減 (absolute RMW、 cycle 6) ----
def(0xee, { name: "INC", mode: absolute, cycles: 6, exec: (cpu, bus, op) => rmwAbsolute(cpu, bus, op, (_cpu, v) => v + 1) });
def(0xce, { name: "DEC", mode: absolute, cycles: 6, exec: (cpu, bus, op) => rmwAbsolute(cpu, bus, op, (_cpu, v) => v - 1) });

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

// ---- メモリ増減 (zeroPage RMW、 cycle 5) ----
// (v±1)&0xFF を write back し Z/N を更新する。 C フラグは触らない (INX/DEX と同じ)。
def(0xe6, {
  name: "INC",
  mode: zeroPage,
  cycles: 5,
  exec: (cpu, bus, op) => rmwZeroPage(cpu, bus, op, (_cpu, v) => v + 1),
});
def(0xc6, {
  name: "DEC",
  mode: zeroPage,
  cycles: 5,
  exec: (cpu, bus, op) => rmwZeroPage(cpu, bus, op, (_cpu, v) => v - 1),
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

// ---- (indirect,X) アドレッシング ----
// いずれも固定 6 cycle (page-cross 加算なし)。 immediate 版と同じ演算ヘルパーを
// indexedIndirect が解決した実効アドレス越しに再利用する。
def(0xa1, {
  name: "LDA",
  mode: indexedIndirect,
  cycles: 6,
  exec: (cpu, bus, op) => {
    cpu.a = bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x81, {
  name: "STA",
  mode: indexedIndirect,
  cycles: 6,
  exec: (cpu, bus, op) => {
    bus.write(op.addr, cpu.a);
    return 0;
  },
});
def(0x01, {
  name: "ORA",
  mode: indexedIndirect,
  cycles: 6,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a | bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x21, {
  name: "AND",
  mode: indexedIndirect,
  cycles: 6,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a & bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x41, {
  name: "EOR",
  mode: indexedIndirect,
  cycles: 6,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a ^ bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x61, {
  name: "ADC",
  mode: indexedIndirect,
  cycles: 6,
  exec: (cpu, bus, op) => {
    addToA(cpu, bus.read(op.addr));
    return 0;
  },
});
def(0xc1, {
  name: "CMP",
  mode: indexedIndirect,
  cycles: 6,
  exec: (cpu, bus, op) => {
    compare(cpu, cpu.a, bus.read(op.addr));
    return 0;
  },
});
def(0xe1, {
  name: "SBC",
  mode: indexedIndirect,
  cycles: 6,
  exec: (cpu, bus, op) => {
    // SBC は ~M を足すと ADC と同じ回路になる (immediate 版と同じ)
    addToA(cpu, bus.read(op.addr) ^ 0xff);
    return 0;
  },
});

// ---- zeroPage load / store (夜 10) ----
// LDA/STA/STX zp は実装済み。 残る load/store として LDY/LDX/STY zp を追加する。
// load は cycle 3 で Z/N 更新、 store は cycle 3 でフラグ非変化。
def(0xa4, {
  name: "LDY",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    cpu.y = bus.read(op.addr);
    setZeroNeg(cpu, cpu.y);
    return 0;
  },
});
def(0xa6, {
  name: "LDX",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    cpu.x = bus.read(op.addr);
    setZeroNeg(cpu, cpu.x);
    return 0;
  },
});
def(0x84, {
  name: "STY",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    bus.write(op.addr, cpu.y);
    return 0;
  },
});

// ---- zeroPage 論理 (夜 10) ----
// immediate / (ind,X) 版と同じ演算を zeroPage 実効アドレス越しに行う。 全 cycle 3。
def(0x05, {
  name: "ORA",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a | bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x25, {
  name: "AND",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a & bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x45, {
  name: "EOR",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a ^ bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});

// ---- zeroPage 算術 (夜 10) ----
// addToA を再利用 (SBC は ~M)。 全 cycle 3。
def(0x65, {
  name: "ADC",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    addToA(cpu, bus.read(op.addr));
    return 0;
  },
});
def(0xe5, {
  name: "SBC",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    // SBC は ~M を足すと ADC と同じ回路になる (immediate 版と同じ)
    addToA(cpu, bus.read(op.addr) ^ 0xff);
    return 0;
  },
});

// ---- zeroPage 比較 (夜 10) ----
// compare ヘルパーで C/Z/N のみ更新 (register は変更しない)。 全 cycle 3。
def(0xc5, {
  name: "CMP",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    compare(cpu, cpu.a, bus.read(op.addr));
    return 0;
  },
});
def(0xe4, {
  name: "CPX",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    compare(cpu, cpu.x, bus.read(op.addr));
    return 0;
  },
});
def(0xc4, {
  name: "CPY",
  mode: zeroPage,
  cycles: 3,
  exec: (cpu, bus, op) => {
    compare(cpu, cpu.y, bus.read(op.addr));
    return 0;
  },
});

// ---- absolute 論理 (夜 12) ----
// immediate / zeroPage 版と同じ演算を absolute 実効アドレス越しに行う。 全 cycle 4。
def(0x0d, {
  name: "ORA",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a | bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x2d, {
  name: "AND",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a & bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x4d, {
  name: "EOR",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a ^ bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});

// ---- absolute 算術 (夜 12) ----
// addToA を再利用 (SBC は ~M)。 全 cycle 4。
def(0x6d, {
  name: "ADC",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    addToA(cpu, bus.read(op.addr));
    return 0;
  },
});
def(0xed, {
  name: "SBC",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    // SBC は ~M を足すと ADC と同じ回路になる (immediate 版と同じ)
    addToA(cpu, bus.read(op.addr) ^ 0xff);
    return 0;
  },
});

// ---- absolute 比較 (夜 12) ----
// compare ヘルパーで C/Z/N のみ更新 (register は変更しない)。 全 cycle 4。
def(0xcd, {
  name: "CMP",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    compare(cpu, cpu.a, bus.read(op.addr));
    return 0;
  },
});
def(0xec, {
  name: "CPX",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    compare(cpu, cpu.x, bus.read(op.addr));
    return 0;
  },
});
def(0xcc, {
  name: "CPY",
  mode: absolute,
  cycles: 4,
  exec: (cpu, bus, op) => {
    compare(cpu, cpu.y, bus.read(op.addr));
    return 0;
  },
});

// ---- (indirect),Y アドレッシング (夜 014) ----
// read 系は cycle 5 (+1 page cross)、write 系 (STA) は cycle 6 固定。
// 演算ロジックは (indirect,X) 版と同一。
def(0xb1, {
  name: "LDA",
  mode: indirectIndexed,
  cycles: 5,
  exec: (cpu, bus, op) => {
    cpu.a = bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return op.pageCrossed ? 1 : 0;
  },
});
def(0x11, {
  name: "ORA",
  mode: indirectIndexed,
  cycles: 5,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a | bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return op.pageCrossed ? 1 : 0;
  },
});
def(0x31, {
  name: "AND",
  mode: indirectIndexed,
  cycles: 5,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a & bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return op.pageCrossed ? 1 : 0;
  },
});
def(0x51, {
  name: "EOR",
  mode: indirectIndexed,
  cycles: 5,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a ^ bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return op.pageCrossed ? 1 : 0;
  },
});
def(0x71, {
  name: "ADC",
  mode: indirectIndexed,
  cycles: 5,
  exec: (cpu, bus, op) => {
    addToA(cpu, bus.read(op.addr));
    return op.pageCrossed ? 1 : 0;
  },
});
def(0xf1, {
  name: "SBC",
  mode: indirectIndexed,
  cycles: 5,
  exec: (cpu, bus, op) => {
    addToA(cpu, bus.read(op.addr) ^ 0xff);
    return op.pageCrossed ? 1 : 0;
  },
});
def(0xd1, {
  name: "CMP",
  mode: indirectIndexed,
  cycles: 5,
  exec: (cpu, bus, op) => {
    compare(cpu, cpu.a, bus.read(op.addr));
    return op.pageCrossed ? 1 : 0;
  },
});
def(0x91, {
  name: "STA",
  mode: indirectIndexed,
  cycles: 6,
  exec: (cpu, bus, op) => {
    bus.write(op.addr, cpu.a);
    return 0;
  },
});

// ---- absolute,Y アドレッシング (夜 015) ----
// read 系は cycle 4 (+1 page cross)、write 系 (STA) は cycle 5 固定。
def(0xb9, {
  name: "LDA",
  mode: absoluteY,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return op.pageCrossed ? 1 : 0;
  },
});
def(0x19, {
  name: "ORA",
  mode: absoluteY,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a | bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return op.pageCrossed ? 1 : 0;
  },
});
def(0x39, {
  name: "AND",
  mode: absoluteY,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a & bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return op.pageCrossed ? 1 : 0;
  },
});
def(0x59, {
  name: "EOR",
  mode: absoluteY,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a ^ bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return op.pageCrossed ? 1 : 0;
  },
});
def(0x79, {
  name: "ADC",
  mode: absoluteY,
  cycles: 4,
  exec: (cpu, bus, op) => {
    addToA(cpu, bus.read(op.addr));
    return op.pageCrossed ? 1 : 0;
  },
});
def(0xf9, {
  name: "SBC",
  mode: absoluteY,
  cycles: 4,
  exec: (cpu, bus, op) => {
    addToA(cpu, bus.read(op.addr) ^ 0xff);
    return op.pageCrossed ? 1 : 0;
  },
});
def(0xd9, {
  name: "CMP",
  mode: absoluteY,
  cycles: 4,
  exec: (cpu, bus, op) => {
    compare(cpu, cpu.a, bus.read(op.addr));
    return op.pageCrossed ? 1 : 0;
  },
});
def(0x99, {
  name: "STA",
  mode: absoluteY,
  cycles: 5,
  exec: (cpu, bus, op) => {
    bus.write(op.addr, cpu.a);
    return 0;
  },
});

// ---- zeroPage,X ----

// load/store zpX
def(0xb4, {
  name: "LDY",
  mode: zeroPageX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.y = bus.read(op.addr);
    setZeroNeg(cpu, cpu.y);
    return 0;
  },
});
def(0x94, {
  name: "STY",
  mode: zeroPageX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    bus.write(op.addr, cpu.y);
    return 0;
  },
});
def(0xb5, {
  name: "LDA",
  mode: zeroPageX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x95, {
  name: "STA",
  mode: zeroPageX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    bus.write(op.addr, cpu.a);
    return 0;
  },
});

// 論理演算 zpX
def(0x15, {
  name: "ORA",
  mode: zeroPageX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a | bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x35, {
  name: "AND",
  mode: zeroPageX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a & bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});
def(0x55, {
  name: "EOR",
  mode: zeroPageX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a ^ bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return 0;
  },
});

// 算術/比較 zpX
def(0x75, {
  name: "ADC",
  mode: zeroPageX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    addToA(cpu, bus.read(op.addr));
    return 0;
  },
});
def(0xf5, {
  name: "SBC",
  mode: zeroPageX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    addToA(cpu, bus.read(op.addr) ^ 0xff);
    return 0;
  },
});
def(0xd5, {
  name: "CMP",
  mode: zeroPageX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    compare(cpu, cpu.a, bus.read(op.addr));
    return 0;
  },
});

// RMW zpX (cycle 6)
def(0x16, { name: "ASL", mode: zeroPageX, cycles: 6, exec: (cpu, bus, op) => rmwZeroPage(cpu, bus, op, aslValue) });
def(0x56, { name: "LSR", mode: zeroPageX, cycles: 6, exec: (cpu, bus, op) => rmwZeroPage(cpu, bus, op, lsrValue) });
def(0x36, { name: "ROL", mode: zeroPageX, cycles: 6, exec: (cpu, bus, op) => rmwZeroPage(cpu, bus, op, rolValue) });
def(0x76, { name: "ROR", mode: zeroPageX, cycles: 6, exec: (cpu, bus, op) => rmwZeroPage(cpu, bus, op, rorValue) });
def(0xf6, {
  name: "INC",
  mode: zeroPageX,
  cycles: 6,
  exec: (cpu, bus, op) => rmwZeroPage(cpu, bus, op, (_cpu, v) => v + 1),
});
def(0xd6, {
  name: "DEC",
  mode: zeroPageX,
  cycles: 6,
  exec: (cpu, bus, op) => rmwZeroPage(cpu, bus, op, (_cpu, v) => v - 1),
});

// ---- zeroPage,Y ----
def(0xb6, {
  name: "LDX",
  mode: zeroPageY,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.x = bus.read(op.addr);
    setZeroNeg(cpu, cpu.x);
    return 0;
  },
});
def(0x96, {
  name: "STX",
  mode: zeroPageY,
  cycles: 4,
  exec: (cpu, bus, op) => {
    bus.write(op.addr, cpu.x);
    return 0;
  },
});

// ---- absolute,X ----

// load absX (cycle 4, +1 page cross)
def(0xbc, {
  name: "LDY",
  mode: absoluteX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.y = bus.read(op.addr);
    setZeroNeg(cpu, cpu.y);
    return op.pageCrossed ? 1 : 0;
  },
});
def(0xbd, {
  name: "LDA",
  mode: absoluteX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return op.pageCrossed ? 1 : 0;
  },
});

// 論理演算 absX (cycle 4, +1 page cross)
def(0x1d, {
  name: "ORA",
  mode: absoluteX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a | bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return op.pageCrossed ? 1 : 0;
  },
});
def(0x3d, {
  name: "AND",
  mode: absoluteX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a & bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return op.pageCrossed ? 1 : 0;
  },
});
def(0x5d, {
  name: "EOR",
  mode: absoluteX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.a = cpu.a ^ bus.read(op.addr);
    setZeroNeg(cpu, cpu.a);
    return op.pageCrossed ? 1 : 0;
  },
});

// 算術/比較 absX (cycle 4, +1 page cross)
def(0x7d, {
  name: "ADC",
  mode: absoluteX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    addToA(cpu, bus.read(op.addr));
    return op.pageCrossed ? 1 : 0;
  },
});
def(0xfd, {
  name: "SBC",
  mode: absoluteX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    addToA(cpu, bus.read(op.addr) ^ 0xff);
    return op.pageCrossed ? 1 : 0;
  },
});
def(0xdd, {
  name: "CMP",
  mode: absoluteX,
  cycles: 4,
  exec: (cpu, bus, op) => {
    compare(cpu, cpu.a, bus.read(op.addr));
    return op.pageCrossed ? 1 : 0;
  },
});

// STA absX (cycle 5, page cross ペナルティなし)
def(0x9d, {
  name: "STA",
  mode: absoluteX,
  cycles: 5,
  exec: (cpu, bus, op) => {
    bus.write(op.addr, cpu.a);
    return 0;
  },
});

// RMW absX (cycle 7, page cross ペナルティなし)
def(0x1e, { name: "ASL", mode: absoluteX, cycles: 7, exec: (cpu, bus, op) => rmwAbsolute(cpu, bus, op, aslValue) });
def(0x5e, { name: "LSR", mode: absoluteX, cycles: 7, exec: (cpu, bus, op) => rmwAbsolute(cpu, bus, op, lsrValue) });
def(0x3e, { name: "ROL", mode: absoluteX, cycles: 7, exec: (cpu, bus, op) => rmwAbsolute(cpu, bus, op, rolValue) });
def(0x7e, { name: "ROR", mode: absoluteX, cycles: 7, exec: (cpu, bus, op) => rmwAbsolute(cpu, bus, op, rorValue) });
def(0xfe, {
  name: "INC",
  mode: absoluteX,
  cycles: 7,
  exec: (cpu, bus, op) => rmwAbsolute(cpu, bus, op, (_cpu, v) => v + 1),
});
def(0xde, {
  name: "DEC",
  mode: absoluteX,
  cycles: 7,
  exec: (cpu, bus, op) => rmwAbsolute(cpu, bus, op, (_cpu, v) => v - 1),
});

// LDX absoluteY (cycle 4, +1 page cross)
def(0xbe, {
  name: "LDX",
  mode: absoluteY,
  cycles: 4,
  exec: (cpu, bus, op) => {
    cpu.x = bus.read(op.addr);
    setZeroNeg(cpu, cpu.x);
    return op.pageCrossed ? 1 : 0;
  },
});

// ---- illegal/undocumented NOP ----
// nestest が検証する 23 opcode。フラグ・レジスタを一切変更せず、
// アドレッシングモードが PC を進めてサイクルを消費するだけ。

// implied NOP (1 byte, 2 cycle)
for (const op of [0x1a, 0x3a, 0x5a, 0x7a, 0xda, 0xfa]) {
  def(op, { name: "*NOP", mode: implied, cycles: 2, exec: () => 0 });
}

// immediate NOP (2 byte, 2 cycle)
def(0x80, { name: "*NOP", mode: immediate, cycles: 2, exec: () => 0 });

// zeroPage NOP (2 byte, 3 cycle)
for (const op of [0x04, 0x44, 0x64]) {
  def(op, { name: "*NOP", mode: zeroPage, cycles: 3, exec: () => 0 });
}

// absolute NOP (3 byte, 4 cycle)
def(0x0c, { name: "*NOP", mode: absolute, cycles: 4, exec: () => 0 });

// zeroPage,X NOP (2 byte, 4 cycle)
for (const op of [0x14, 0x34, 0x54, 0x74, 0xd4, 0xf4]) {
  def(op, { name: "*NOP", mode: zeroPageX, cycles: 4, exec: () => 0 });
}

// absolute,X NOP (3 byte, 4 cycle + 1 page cross)
for (const op of [0x1c, 0x3c, 0x5c, 0x7c, 0xdc, 0xfc]) {
  def(op, { name: "*NOP", mode: absoluteX, cycles: 4, exec: (_c, _b, o) => (o.pageCrossed ? 1 : 0) });
}
