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

describe("(indirect),Y addressing mode", () => {
  it("LDA ($33),Y resolves pointer and adds Y, consumes 5 cycles (no page cross)", () => {
    const { bus, ram } = makeRamBus();
    // zp[$33]/$34 = $0400, Y=0 → addr=$0400
    ram[0x33] = 0x00;
    ram[0x34] = 0x04;
    ram[0x0400] = 0xab;
    ram[0x0200] = 0xb1; // LDA ($33),Y
    ram[0x0201] = 0x33;
    const cpu = createCpu({ pc: 0x0200, y: 0x00 });

    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0xab);
    expect(used).toBe(5);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
  });

  it("LDA ($33),Y adds Y to the resolved base address", () => {
    const { bus, ram } = makeRamBus();
    ram[0x33] = 0x00;
    ram[0x34] = 0x04;
    ram[0x0405] = 0x42;
    ram[0x0200] = 0xb1;
    ram[0x0201] = 0x33;
    const cpu = createCpu({ pc: 0x0200, y: 0x05 });

    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x42);
    expect(used).toBe(5); // 同一ページ内 → page cross なし
  });

  it("LDA ($33),Y adds +1 cycle on page cross", () => {
    const { bus, ram } = makeRamBus();
    // base=$04FF, Y=$01 → addr=$0500 (page cross)
    ram[0x33] = 0xff;
    ram[0x34] = 0x04;
    ram[0x0500] = 0x77;
    ram[0x0200] = 0xb1;
    ram[0x0201] = 0x33;
    const cpu = createCpu({ pc: 0x0200, y: 0x01 });

    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x77);
    expect(used).toBe(6); // 5 + 1 page cross
  });

  it("wraps the pointer high-byte fetch within the zero page (operand=0xFF)", () => {
    const { bus, ram } = makeRamBus();
    // zp[0xFF]=lo, zp[0x00]=hi (ゼロページラップ)
    ram[0xff] = 0x34;
    ram[0x00] = 0x12; // → base=$1234
    ram[0x1234] = 0x99;
    ram[0x0200] = 0xb1;
    ram[0x0201] = 0xff;
    const cpu = createCpu({ pc: 0x0200, y: 0x00 });

    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x99);
    expect(used).toBe(5);
  });

  it("STA ($33),Y stores A at the resolved address, always 6 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x33] = 0x00;
    ram[0x34] = 0x04;
    ram[0x0200] = 0x91; // STA ($33),Y
    ram[0x0201] = 0x33;
    const cpu = createCpu({ pc: 0x0200, y: 0x00, a: 0xcd });

    const used = cpuStep(cpu, bus);
    expect(ram[0x0400]).toBe(0xcd);
    expect(used).toBe(6);
  });

  it("STA ($33),Y is 6 cycles even with page cross", () => {
    const { bus, ram } = makeRamBus();
    ram[0x33] = 0xff;
    ram[0x34] = 0x04; // base=$04FF
    ram[0x0200] = 0x91;
    ram[0x0201] = 0x33;
    const cpu = createCpu({ pc: 0x0200, y: 0x01, a: 0xef });

    const used = cpuStep(cpu, bus);
    expect(ram[0x0500]).toBe(0xef);
    expect(used).toBe(6); // STA は page cross でも固定 6
  });

  it("ORA/AND/EOR ($33),Y apply logic with page cross penalty", () => {
    const cases: { op: number; init: number; mem: number; want: number }[] = [
      { op: 0x11, init: 0x55, mem: 0xaa, want: 0xff }, // ORA
      { op: 0x31, init: 0x55, mem: 0xf0, want: 0x50 }, // AND
      { op: 0x51, init: 0x5f, mem: 0xaa, want: 0xf5 }, // EOR
    ];
    for (const c of cases) {
      const { bus, ram } = makeRamBus();
      ram[0x33] = 0x00;
      ram[0x34] = 0x04;
      ram[0x0400] = c.mem;
      ram[0x0300] = c.op;
      ram[0x0301] = 0x33;
      const cpu = createCpu({ pc: 0x0300, y: 0x00, a: c.init });

      const used = cpuStep(cpu, bus);
      expect(cpu.a, `opcode $${c.op.toString(16)}`).toBe(c.want);
      expect(used).toBe(5); // page cross なし
    }
  });

  it("ADC ($33),Y adds with carry and sets V on signed overflow", () => {
    const { bus, ram } = makeRamBus();
    ram[0x33] = 0x00;
    ram[0x34] = 0x04;
    ram[0x0400] = 0x50;
    ram[0x0300] = 0x71; // ADC ($33),Y
    ram[0x0301] = 0x33;
    const cpu = createCpu({ pc: 0x0300, y: 0x00, a: 0x50 });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0xa0);
    expect(hasFlag(cpu.p, CpuFlags.V)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(false);
  });

  it("SBC ($33),Y subtracts with borrow (carry set = no borrow)", () => {
    const { bus, ram } = makeRamBus();
    ram[0x33] = 0x00;
    ram[0x34] = 0x04;
    ram[0x0400] = 0x30;
    ram[0x0300] = 0xf1; // SBC ($33),Y
    ram[0x0301] = 0x33;
    const cpu = createCpu({ pc: 0x0300, y: 0x00, a: 0x50, p: CpuFlags.I | CpuFlags.U | CpuFlags.C });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x20);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
  });

  it("CMP ($33),Y sets C/Z on equality without altering A", () => {
    const { bus, ram } = makeRamBus();
    ram[0x33] = 0x00;
    ram[0x34] = 0x04;
    ram[0x0400] = 0x40;
    ram[0x0300] = 0xd1; // CMP ($33),Y
    ram[0x0301] = 0x33;
    const cpu = createCpu({ pc: 0x0300, y: 0x00, a: 0x40 });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x40);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
  });

  it("CMP ($33),Y with page cross adds 1 cycle", () => {
    const { bus, ram } = makeRamBus();
    ram[0x33] = 0x80;
    ram[0x34] = 0x04; // base=$0480
    ram[0x0500] = 0x20;
    ram[0x0300] = 0xd1;
    ram[0x0301] = 0x33;
    const cpu = createCpu({ pc: 0x0300, y: 0x80, a: 0x40 }); // $0480+$80=$0500 page cross

    const used = cpuStep(cpu, bus);
    expect(used).toBe(6); // 5 + 1 page cross
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true); // A > M
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
  });
});
