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

describe("absolute,X addressing mode", () => {
  it("LDA $0400,X loads from base+X, 4 cycles (no page cross)", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0410] = 0x77;
    ram[0x0200] = 0xbd; // LDA $0400,X
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, x: 0x10 });

    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x77);
    expect(used).toBe(4);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("LDA abs,X adds +1 cycle on page cross", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0500] = 0x42;
    ram[0x0200] = 0xbd; // LDA $04FF,X
    ram[0x0201] = 0xff;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, x: 0x01 });

    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x42);
    expect(used).toBe(5);
  });

  it("LDY abs,X sets Z flag for zero value", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0305] = 0x00;
    ram[0x0200] = 0xbc; // LDY $0300,X
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x03;
    const cpu = createCpu({ pc: 0x0200, x: 0x05 });

    cpuStep(cpu, bus);
    expect(cpu.y).toBe(0x00);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("LDY abs,X sets N flag for negative value", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0305] = 0x80;
    ram[0x0200] = 0xbc;
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x03;
    const cpu = createCpu({ pc: 0x0200, x: 0x05 });

    cpuStep(cpu, bus);
    expect(cpu.y).toBe(0x80);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });

  it("ORA abs,X performs bitwise OR, 4 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0610] = 0x0f;
    ram[0x0200] = 0x1d; // ORA $0600,X
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x06;
    const cpu = createCpu({ pc: 0x0200, x: 0x10, a: 0xf0 });

    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0xff);
    expect(used).toBe(4);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });

  it("AND abs,X performs bitwise AND", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0610] = 0x0f;
    ram[0x0200] = 0x3d; // AND $0600,X
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x06;
    const cpu = createCpu({ pc: 0x0200, x: 0x10, a: 0xf5 });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x05);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("EOR abs,X performs bitwise XOR", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0610] = 0xff;
    ram[0x0200] = 0x5d; // EOR $0600,X
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x06;
    const cpu = createCpu({ pc: 0x0200, x: 0x10, a: 0xaa });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x55);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("ADC abs,X adds with carry, sets C/V flags", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0610] = 0x50;
    ram[0x0200] = 0x7d; // ADC $0600,X
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x06;
    const cpu = createCpu({ pc: 0x0200, x: 0x10, a: 0x50 });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0xa0);
    expect(hasFlag(cpu.p, CpuFlags.V)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(false);
  });

  it("SBC abs,X subtracts with borrow", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0610] = 0x10;
    ram[0x0200] = 0xfd; // SBC $0600,X
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x06;
    const cpu = createCpu({ pc: 0x0200, x: 0x10, a: 0x50, p: CpuFlags.C | CpuFlags.I });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x40);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
  });

  it("CMP abs,X compares A with memory, +1 page cross", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0500] = 0x30;
    ram[0x0200] = 0xdd; // CMP $04FF,X
    ram[0x0201] = 0xff;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, x: 0x01, a: 0x30 });

    const used = cpuStep(cpu, bus);
    expect(used).toBe(5);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
  });

  it("STA abs,X writes A to base+X, 5 cycles (no page cross penalty)", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x9d; // STA $0600,X
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x06;
    const cpu = createCpu({ pc: 0x0200, x: 0x10, a: 0xab });

    const used = cpuStep(cpu, bus);
    expect(ram[0x0610]).toBe(0xab);
    expect(used).toBe(5);
  });

  it("STA abs,X is still 5 cycles even on page cross", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x9d; // STA $04FF,X
    ram[0x0201] = 0xff;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, x: 0x01, a: 0xcd });

    const used = cpuStep(cpu, bus);
    expect(ram[0x0500]).toBe(0xcd);
    expect(used).toBe(5);
  });

  it("ASL abs,X shifts left, 7 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0610] = 0x81;
    ram[0x0200] = 0x1e; // ASL $0600,X
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x06;
    const cpu = createCpu({ pc: 0x0200, x: 0x10 });

    const used = cpuStep(cpu, bus);
    expect(ram[0x0610]).toBe(0x02);
    expect(used).toBe(7);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
  });

  it("LSR abs,X shifts right, 7 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0610] = 0x03;
    ram[0x0200] = 0x5e; // LSR $0600,X
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x06;
    const cpu = createCpu({ pc: 0x0200, x: 0x10 });

    const used = cpuStep(cpu, bus);
    expect(ram[0x0610]).toBe(0x01);
    expect(used).toBe(7);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
  });

  it("ROL abs,X rotates left through carry, 7 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0610] = 0x80;
    ram[0x0200] = 0x3e; // ROL $0600,X
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x06;
    const cpu = createCpu({ pc: 0x0200, x: 0x10, p: CpuFlags.C | CpuFlags.I });

    const used = cpuStep(cpu, bus);
    expect(ram[0x0610]).toBe(0x01);
    expect(used).toBe(7);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
  });

  it("ROR abs,X rotates right through carry, 7 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0610] = 0x01;
    ram[0x0200] = 0x7e; // ROR $0600,X
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x06;
    const cpu = createCpu({ pc: 0x0200, x: 0x10, p: CpuFlags.C | CpuFlags.I });

    const used = cpuStep(cpu, bus);
    expect(ram[0x0610]).toBe(0x80);
    expect(used).toBe(7);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });

  it("INC abs,X increments memory, 7 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0610] = 0xff;
    ram[0x0200] = 0xfe; // INC $0600,X
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x06;
    const cpu = createCpu({ pc: 0x0200, x: 0x10 });

    const used = cpuStep(cpu, bus);
    expect(ram[0x0610]).toBe(0x00);
    expect(used).toBe(7);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
  });

  it("DEC abs,X decrements memory, 7 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0610] = 0x01;
    ram[0x0200] = 0xde; // DEC $0600,X
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x06;
    const cpu = createCpu({ pc: 0x0200, x: 0x10 });

    const used = cpuStep(cpu, bus);
    expect(ram[0x0610]).toBe(0x00);
    expect(used).toBe(7);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
  });

  it("RMW abs,X is always 7 cycles even on page cross", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0500] = 0x10;
    ram[0x0200] = 0x1e; // ASL $04FF,X
    ram[0x0201] = 0xff;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, x: 0x01 });

    const used = cpuStep(cpu, bus);
    expect(ram[0x0500]).toBe(0x20);
    expect(used).toBe(7);
  });
});

describe("LDX absolute,Y", () => {
  it("LDX $0400,Y loads X from base+Y, 4 cycles (no page cross)", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0410] = 0x55;
    ram[0x0200] = 0xbe; // LDX $0400,Y
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, y: 0x10 });

    const used = cpuStep(cpu, bus);
    expect(cpu.x).toBe(0x55);
    expect(used).toBe(4);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("LDX abs,Y adds +1 cycle on page cross", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0500] = 0x99;
    ram[0x0200] = 0xbe; // LDX $04FF,Y
    ram[0x0201] = 0xff;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, y: 0x01 });

    const used = cpuStep(cpu, bus);
    expect(cpu.x).toBe(0x99);
    expect(used).toBe(5);
  });

  it("LDX abs,Y sets Z flag for zero", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0410] = 0x00;
    ram[0x0200] = 0xbe;
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, y: 0x10 });

    cpuStep(cpu, bus);
    expect(cpu.x).toBe(0x00);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
  });

  it("LDX abs,Y sets N flag for negative", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0410] = 0x80;
    ram[0x0200] = 0xbe;
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, y: 0x10 });

    cpuStep(cpu, bus);
    expect(cpu.x).toBe(0x80);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });
});
