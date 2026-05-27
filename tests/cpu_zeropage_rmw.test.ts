import { describe, expect, it } from "vitest";

import type { Bus } from "../src/core/bus.ts";
import { createCpu } from "../src/core/cpu/index.ts";
import { CpuFlags, hasFlag } from "../src/core/cpu/flags.ts";
import { cpuStep } from "../src/core/cpu/step.ts";

/** $0000-$FFFF をフラット 64KB RAM として扱う単体テスト用 Bus */
function makeRamBus(): { bus: Bus; ram: Uint8Array } {
  const ram = new Uint8Array(0x10000);
  const bus: Bus = {
    read: (addr) => ram[addr & 0xffff] ?? 0,
    write: (addr, value) => {
      ram[addr & 0xffff] = value & 0xff;
    },
  };
  return { bus, ram };
}

/**
 * zeroPage RMW 命令を 1 つ実行するヘルパー。
 * `opcode + zpAddr` を $0200 に置き、 対象アドレスへ初期値 `value` を書いてから実行する。
 */
function runRmw(
  opcode: number,
  zpAddr: number,
  value: number,
  init?: Parameters<typeof createCpu>[0],
) {
  const { bus, ram } = makeRamBus();
  ram[0x0200] = opcode;
  ram[0x0201] = zpAddr;
  ram[zpAddr] = value;
  const cpu = createCpu({ pc: 0x0200, ...init });
  const used = cpuStep(cpu, bus);
  return { cpu, ram, used };
}

const C = CpuFlags.C;
const I = CpuFlags.I;
const U = CpuFlags.U;

describe("zeroPage ASL (0x06)", () => {
  it("shifts left, writes back, consumes 5 cycles", () => {
    const { ram, used } = runRmw(0x06, 0x10, 0x40);
    expect(ram[0x10]).toBe(0x80);
    expect(used).toBe(5);
  });

  it("sets C from bit7 and Z when result is 0", () => {
    const { cpu, ram } = runRmw(0x06, 0x10, 0x80);
    expect(ram[0x10]).toBe(0x00);
    expect(hasFlag(cpu.p, C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("sets N when result bit7 is set", () => {
    const { cpu, ram } = runRmw(0x06, 0x10, 0x41);
    expect(ram[0x10]).toBe(0x82);
    expect(hasFlag(cpu.p, C)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });
});

describe("zeroPage LSR (0x46)", () => {
  it("shifts right, C from bit0, bit7 cleared", () => {
    const { cpu, ram, used } = runRmw(0x46, 0x10, 0x01);
    expect(ram[0x10]).toBe(0x00);
    expect(used).toBe(5);
    expect(hasFlag(cpu.p, C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("does not set C when bit0 is clear", () => {
    const { cpu, ram } = runRmw(0x46, 0x10, 0xfe);
    expect(ram[0x10]).toBe(0x7f);
    expect(hasFlag(cpu.p, C)).toBe(false);
  });
});

describe("zeroPage ROL (0x26)", () => {
  it("rotates in oldC at bit0, C from bit7", () => {
    const { cpu, ram, used } = runRmw(0x26, 0x10, 0x80, { p: I | U | C });
    expect(ram[0x10]).toBe(0x01);
    expect(used).toBe(5);
    expect(hasFlag(cpu.p, C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("with C clear shifts left without bit0 carry-in", () => {
    const { cpu, ram } = runRmw(0x26, 0x10, 0x40, { p: I | U });
    expect(ram[0x10]).toBe(0x80);
    expect(hasFlag(cpu.p, C)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });
});

describe("zeroPage ROR (0x66)", () => {
  it("rotates oldC into bit7, C from bit0", () => {
    const { cpu, ram, used } = runRmw(0x66, 0x10, 0x01, { p: I | U | C });
    expect(ram[0x10]).toBe(0x80);
    expect(used).toBe(5);
    expect(hasFlag(cpu.p, C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });

  it("with C clear and bit0 clear yields plain right shift", () => {
    const { cpu, ram } = runRmw(0x66, 0x10, 0x02, { p: I | U });
    expect(ram[0x10]).toBe(0x01);
    expect(hasFlag(cpu.p, C)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });
});

describe("zeroPage INC (0xE6)", () => {
  it("increments memory, updates Z/N, leaves C untouched", () => {
    const { cpu, ram, used } = runRmw(0xe6, 0x10, 0x7f, { p: I | U | C });
    expect(ram[0x10]).toBe(0x80);
    expect(used).toBe(5);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
    expect(hasFlag(cpu.p, C)).toBe(true); // C は不変
  });

  it("wraps 0xFF to 0x00 and sets Z", () => {
    const { cpu, ram } = runRmw(0xe6, 0x10, 0xff);
    expect(ram[0x10]).toBe(0x00);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });
});

describe("zeroPage DEC (0xC6)", () => {
  it("decrements memory, updates Z/N, leaves C untouched", () => {
    const { cpu, ram, used } = runRmw(0xc6, 0x10, 0x01, { p: I | U | C });
    expect(ram[0x10]).toBe(0x00);
    expect(used).toBe(5);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
    expect(hasFlag(cpu.p, C)).toBe(true); // C は不変
  });

  it("wraps 0x00 to 0xFF and sets N", () => {
    const { cpu, ram } = runRmw(0xc6, 0x10, 0x00);
    expect(ram[0x10]).toBe(0xff);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
  });
});

// 夜 10 申し送り: SBC zeroPage (0xE5) の borrow (C=0) / overflow ケースを補完。
describe("zeroPage SBC (0xE5) borrow / overflow", () => {
  /** SBC $10 を実行 (A と zp 値・初期フラグを指定) */
  function runSbc(a: number, m: number, p: number) {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0xe5;
    ram[0x0201] = 0x10;
    ram[0x10] = m;
    const cpu = createCpu({ pc: 0x0200, a, p });
    const used = cpuStep(cpu, bus);
    return { cpu, used };
  }

  it("with C=0 subtracts an extra borrow (A - M - 1)", () => {
    // A=0x50, M=0x10, C=0 → 0x50 - 0x10 - 1 = 0x3F
    const { cpu, used } = runSbc(0x50, 0x10, I | U);
    expect(cpu.a).toBe(0x3f);
    expect(used).toBe(3);
    expect(hasFlag(cpu.p, C)).toBe(true); // 借り発生せず → C=1
  });

  it("clears C when a borrow is required (result wraps)", () => {
    // A=0x10, M=0x20, C=1 → 0x10 - 0x20 = -0x10 → 0xF0, 借り発生 → C=0
    const { cpu } = runSbc(0x10, 0x20, I | U | C);
    expect(cpu.a).toBe(0xf0);
    expect(hasFlag(cpu.p, C)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });

  it("sets V on signed overflow (positive - negative = negative)", () => {
    // A=0x50 (+80), M=0xB0 (-80), C=1 → 0x50 - 0xB0 = 0xA0 (-96), 符号反転 → V=1
    const { cpu } = runSbc(0x50, 0xb0, I | U | C);
    expect(cpu.a).toBe(0xa0);
    expect(hasFlag(cpu.p, CpuFlags.V)).toBe(true);
    expect(hasFlag(cpu.p, C)).toBe(false);
  });

  it("does not set V on normal signed subtraction", () => {
    // A=0x50 (+80), M=0x30 (+48), C=1 → 0x20 (+32), 符号矛盾なし → V=0
    const { cpu } = runSbc(0x50, 0x30, I | U | C);
    expect(cpu.a).toBe(0x20);
    expect(hasFlag(cpu.p, CpuFlags.V)).toBe(false);
    expect(hasFlag(cpu.p, C)).toBe(true);
  });
});
