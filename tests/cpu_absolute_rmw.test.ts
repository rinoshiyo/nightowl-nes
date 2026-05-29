import { describe, expect, it } from "vitest";

import type { Bus } from "../src/core/bus.ts";
import { createCpu } from "../src/core/cpu/index.ts";
import { CpuFlags, hasFlag } from "../src/core/cpu/flags.ts";
import { cpuStep } from "../src/core/cpu/step.ts";

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
 * absolute RMW 命令を 1 つ実行するヘルパー。
 * `opcode + lo + hi` を $0200 に置き、 対象アドレスへ初期値 `value` を書いてから実行する。
 */
function runRmw(
  opcode: number,
  absAddr: number,
  value: number,
  init?: Parameters<typeof createCpu>[0],
) {
  const { bus, ram } = makeRamBus();
  ram[0x0200] = opcode;
  ram[0x0201] = absAddr & 0xff;
  ram[0x0202] = (absAddr >> 8) & 0xff;
  ram[absAddr] = value;
  const cpu = createCpu({ pc: 0x0200, ...init });
  const used = cpuStep(cpu, bus);
  return { cpu, ram, used };
}

const C = CpuFlags.C;
const I = CpuFlags.I;
const U = CpuFlags.U;

describe("absolute ASL (0x0E)", () => {
  it("shifts left, writes back, consumes 6 cycles", () => {
    const { ram, used } = runRmw(0x0e, 0x0678, 0x40);
    expect(ram[0x0678]).toBe(0x80);
    expect(used).toBe(6);
  });

  it("sets C from bit7 and Z when result is 0", () => {
    const { cpu, ram } = runRmw(0x0e, 0x0678, 0x80);
    expect(ram[0x0678]).toBe(0x00);
    expect(hasFlag(cpu.p, C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("sets N when result bit7 is set", () => {
    const { cpu, ram } = runRmw(0x0e, 0x0678, 0x41);
    expect(ram[0x0678]).toBe(0x82);
    expect(hasFlag(cpu.p, C)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });
});

describe("absolute LSR (0x4E)", () => {
  it("shifts right, C from bit0, bit7 cleared", () => {
    const { cpu, ram, used } = runRmw(0x4e, 0x0678, 0x01);
    expect(ram[0x0678]).toBe(0x00);
    expect(used).toBe(6);
    expect(hasFlag(cpu.p, C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("does not set C when bit0 is clear", () => {
    const { cpu, ram } = runRmw(0x4e, 0x0678, 0xfe);
    expect(ram[0x0678]).toBe(0x7f);
    expect(hasFlag(cpu.p, C)).toBe(false);
  });
});

describe("absolute ROL (0x2E)", () => {
  it("rotates in oldC at bit0, C from bit7", () => {
    const { cpu, ram, used } = runRmw(0x2e, 0x0678, 0x80, { p: I | U | C });
    expect(ram[0x0678]).toBe(0x01);
    expect(used).toBe(6);
    expect(hasFlag(cpu.p, C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("with C clear shifts left without bit0 carry-in", () => {
    const { cpu, ram } = runRmw(0x2e, 0x0678, 0x40, { p: I | U });
    expect(ram[0x0678]).toBe(0x80);
    expect(hasFlag(cpu.p, C)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });
});

describe("absolute ROR (0x6E)", () => {
  it("rotates oldC into bit7, C from bit0", () => {
    const { cpu, ram, used } = runRmw(0x6e, 0x0678, 0x01, { p: I | U | C });
    expect(ram[0x0678]).toBe(0x80);
    expect(used).toBe(6);
    expect(hasFlag(cpu.p, C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });

  it("with C clear and bit0 clear yields plain right shift", () => {
    const { cpu, ram } = runRmw(0x6e, 0x0678, 0x02, { p: I | U });
    expect(ram[0x0678]).toBe(0x01);
    expect(hasFlag(cpu.p, C)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });
});

describe("absolute INC (0xEE)", () => {
  it("increments memory, updates Z/N, leaves C untouched", () => {
    const { cpu, ram, used } = runRmw(0xee, 0x0678, 0x7f, { p: I | U | C });
    expect(ram[0x0678]).toBe(0x80);
    expect(used).toBe(6);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
    expect(hasFlag(cpu.p, C)).toBe(true);
  });

  it("wraps 0xFF to 0x00 and sets Z", () => {
    const { cpu, ram } = runRmw(0xee, 0x0678, 0xff);
    expect(ram[0x0678]).toBe(0x00);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });
});

describe("absolute DEC (0xCE)", () => {
  it("decrements memory, updates Z/N, leaves C untouched", () => {
    const { cpu, ram, used } = runRmw(0xce, 0x0678, 0x01, { p: I | U | C });
    expect(ram[0x0678]).toBe(0x00);
    expect(used).toBe(6);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
    expect(hasFlag(cpu.p, C)).toBe(true);
  });

  it("wraps 0x00 to 0xFF and sets N", () => {
    const { cpu, ram } = runRmw(0xce, 0x0678, 0x00);
    expect(ram[0x0678]).toBe(0xff);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
  });
});
