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
 * absolute 命令を 1 つ実行するヘルパー。
 * `opcode + lo + hi` (実効アドレス $0300) を $0200 に置き、 対象アドレスへ
 * 初期値 `value` を書いてから 1 命令実行する。
 */
function runAbs(opcode: number, value: number, init?: Parameters<typeof createCpu>[0]) {
  const { bus, ram } = makeRamBus();
  const addr = 0x0300;
  ram[0x0200] = opcode;
  ram[0x0201] = addr & 0xff;
  ram[0x0202] = (addr >> 8) & 0xff;
  ram[addr] = value;
  const cpu = createCpu({ pc: 0x0200, ...init });
  const used = cpuStep(cpu, bus);
  return { cpu, ram, used };
}

const C = CpuFlags.C;
const Z = CpuFlags.Z;
const N = CpuFlags.N;
const V = CpuFlags.V;
const I = CpuFlags.I;
const U = CpuFlags.U;
const base = I | U; // createCpu の既定フラグ (Interrupt disable + Unused)

describe("BIT absolute (0x2C)", () => {
  it("consumes 4 cycles and leaves A unchanged", () => {
    const { cpu, used } = runAbs(0x2c, 0x0f, { a: 0xf0 });
    expect(used).toBe(4);
    expect(cpu.a).toBe(0xf0); // BIT は A を破壊しない
  });

  it("sets Z when A & M is zero", () => {
    const { cpu } = runAbs(0x2c, 0x0f, { a: 0xf0 });
    expect(hasFlag(cpu.p, Z)).toBe(true);
  });

  it("copies M bit6 to V and bit7 to N (not from A)", () => {
    const { cpu } = runAbs(0x2c, 0xc0, { a: 0x00 });
    expect(hasFlag(cpu.p, V)).toBe(true); // M bit6
    expect(hasFlag(cpu.p, N)).toBe(true); // M bit7
    expect(hasFlag(cpu.p, Z)).toBe(true); // A & M = 0
  });
});

describe("absolute logic ops", () => {
  it("ORA (0x0D) ORs into A and sets N", () => {
    const { cpu, used } = runAbs(0x0d, 0x80, { a: 0x01 });
    expect(cpu.a).toBe(0x81);
    expect(used).toBe(4);
    expect(hasFlag(cpu.p, N)).toBe(true);
  });

  it("AND (0x2D) ANDs into A and sets Z", () => {
    const { cpu } = runAbs(0x2d, 0x0f, { a: 0xf0 });
    expect(cpu.a).toBe(0x00);
    expect(hasFlag(cpu.p, Z)).toBe(true);
  });

  it("EOR (0x4D) XORs into A", () => {
    const { cpu } = runAbs(0x4d, 0xff, { a: 0x0f });
    expect(cpu.a).toBe(0xf0);
    expect(hasFlag(cpu.p, N)).toBe(true);
  });
});

describe("absolute arithmetic ops", () => {
  it("ADC (0x6D) adds M + carry-in to A", () => {
    const { cpu, used } = runAbs(0x6d, 0x10, { a: 0x20, p: base | C });
    expect(cpu.a).toBe(0x31); // 0x20 + 0x10 + 1
    expect(used).toBe(4);
    expect(hasFlag(cpu.p, C)).toBe(false);
  });

  it("ADC sets C on unsigned overflow and V on signed overflow", () => {
    const { cpu } = runAbs(0x6d, 0x50, { a: 0xd0 }); // 0xD0 + 0x50 = 0x120
    expect(cpu.a).toBe(0x20);
    expect(hasFlag(cpu.p, C)).toBe(true); // 桁あふれ
    expect(hasFlag(cpu.p, V)).toBe(false); // 負 + 正 は符号矛盾しない
  });

  it("ADC sets V when two positives overflow into negative", () => {
    const { cpu } = runAbs(0x6d, 0x50, { a: 0x50 }); // 80 + 80 = 160 -> 符号反転
    expect(cpu.a).toBe(0xa0);
    expect(hasFlag(cpu.p, V)).toBe(true);
    expect(hasFlag(cpu.p, N)).toBe(true);
  });

  it("SBC (0xED) subtracts with borrow when C is set (no borrow)", () => {
    const { cpu, used } = runAbs(0xed, 0x10, { a: 0x50, p: base | C });
    expect(cpu.a).toBe(0x40); // 0x50 - 0x10 - 0
    expect(used).toBe(4);
    expect(hasFlag(cpu.p, C)).toBe(true); // borrow なし
  });

  it("SBC borrows an extra 1 when C is clear", () => {
    const { cpu } = runAbs(0xed, 0x10, { a: 0x50 }); // C=0 -> -1 余分に引く
    expect(cpu.a).toBe(0x3f); // 0x50 - 0x10 - 1
    expect(hasFlag(cpu.p, C)).toBe(true);
  });

  it("SBC clears C (sets borrow) when result underflows", () => {
    const { cpu } = runAbs(0xed, 0x50, { a: 0x10, p: base | C }); // 0x10 - 0x50
    expect(cpu.a).toBe(0xc0);
    expect(hasFlag(cpu.p, C)).toBe(false); // borrow 発生
    expect(hasFlag(cpu.p, N)).toBe(true);
  });
});

describe("absolute compare ops", () => {
  it("CMP (0xCD) sets C and Z when A equals M", () => {
    const { cpu, used } = runAbs(0xcd, 0x42, { a: 0x42 });
    expect(used).toBe(4);
    expect(hasFlag(cpu.p, C)).toBe(true); // A >= M
    expect(hasFlag(cpu.p, Z)).toBe(true); // A == M
    expect(cpu.a).toBe(0x42); // CMP は A を変えない
  });

  it("CMP sets C only when A is greater than M", () => {
    const { cpu } = runAbs(0xcd, 0x10, { a: 0x42 });
    expect(hasFlag(cpu.p, C)).toBe(true);
    expect(hasFlag(cpu.p, Z)).toBe(false);
  });

  it("CMP clears C (sets N) when A is less than M", () => {
    const { cpu } = runAbs(0xcd, 0x50, { a: 0x10 });
    expect(hasFlag(cpu.p, C)).toBe(false);
    expect(hasFlag(cpu.p, N)).toBe(true); // (0x10 - 0x50) bit7
  });

  it("CPX (0xEC) compares against X", () => {
    const { cpu } = runAbs(0xec, 0x20, { x: 0x20 });
    expect(hasFlag(cpu.p, Z)).toBe(true);
    expect(hasFlag(cpu.p, C)).toBe(true);
  });

  it("CPY (0xCC) compares against Y", () => {
    const { cpu } = runAbs(0xcc, 0x30, { y: 0x10 });
    expect(hasFlag(cpu.p, C)).toBe(false); // Y < M
    expect(hasFlag(cpu.p, N)).toBe(true);
  });
});
