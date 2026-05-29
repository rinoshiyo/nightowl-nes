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

describe("zeroPage,X addressing", () => {
  it("wraps within zero page: $FF + X=$02 = $01", () => {
    const { bus, ram } = makeRamBus();
    ram[0x01] = 0x42;
    ram[0x0200] = 0xb5; // LDA zpX
    ram[0x0201] = 0xff;
    const cpu = createCpu({ pc: 0x0200, x: 0x02 });
    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x42);
  });

  it("does not cross into page 1", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0100] = 0xee;
    ram[0x00] = 0x77;
    ram[0x0200] = 0xb5; // LDA zpX
    ram[0x0201] = 0x80;
    const cpu = createCpu({ pc: 0x0200, x: 0x80 });
    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x77);
  });
});

describe("LDY/STY zpX", () => {
  it("LDY $10,X loads into Y with Z/N flags, 4 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x15] = 0xab;
    ram[0x0200] = 0xb4;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0x05 });
    const used = cpuStep(cpu, bus);
    expect(cpu.y).toBe(0xab);
    expect(used).toBe(4);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
  });

  it("STY $10,X stores Y, 4 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x94;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0x05, y: 0x33 });
    const used = cpuStep(cpu, bus);
    expect(ram[0x15]).toBe(0x33);
    expect(used).toBe(4);
  });
});

describe("LDA/STA zpX", () => {
  it("LDA $20,X loads into A, 4 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x28] = 0x00;
    ram[0x0200] = 0xb5;
    ram[0x0201] = 0x20;
    const cpu = createCpu({ pc: 0x0200, x: 0x08 });
    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x00);
    expect(used).toBe(4);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
  });

  it("STA $20,X stores A, 4 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x95;
    ram[0x0201] = 0x20;
    const cpu = createCpu({ pc: 0x0200, x: 0x08, a: 0x7f });
    const used = cpuStep(cpu, bus);
    expect(ram[0x28]).toBe(0x7f);
    expect(used).toBe(4);
  });
});

describe("ORA/AND/EOR zpX", () => {
  it("ORA $10,X", () => {
    const { bus, ram } = makeRamBus();
    ram[0x15] = 0x0f;
    ram[0x0200] = 0x15;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0x05, a: 0xf0 });
    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0xff);
    expect(used).toBe(4);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });

  it("AND $10,X", () => {
    const { bus, ram } = makeRamBus();
    ram[0x15] = 0x0f;
    ram[0x0200] = 0x35;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0x05, a: 0xff });
    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x0f);
  });

  it("EOR $10,X", () => {
    const { bus, ram } = makeRamBus();
    ram[0x15] = 0xff;
    ram[0x0200] = 0x55;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0x05, a: 0xaa });
    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x55);
  });
});

describe("ADC/SBC/CMP zpX", () => {
  it("ADC $10,X with carry", () => {
    const { bus, ram } = makeRamBus();
    ram[0x15] = 0x01;
    ram[0x0200] = 0x75;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0x05, a: 0xff, p: CpuFlags.C | CpuFlags.I });
    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x01);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
  });

  it("SBC $10,X", () => {
    const { bus, ram } = makeRamBus();
    ram[0x15] = 0x01;
    ram[0x0200] = 0xf5;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0x05, a: 0x10, p: CpuFlags.C | CpuFlags.I });
    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x0f);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
  });

  it("CMP $10,X sets C when A >= M", () => {
    const { bus, ram } = makeRamBus();
    ram[0x15] = 0x10;
    ram[0x0200] = 0xd5;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0x05, a: 0x20 });
    cpuStep(cpu, bus);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
    expect(cpu.a).toBe(0x20);
  });
});

describe("RMW zpX (ASL/LSR/ROL/ROR/INC/DEC)", () => {
  it("ASL $10,X shifts left, 6 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x15] = 0x81;
    ram[0x0200] = 0x16;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0x05 });
    const used = cpuStep(cpu, bus);
    expect(ram[0x15]).toBe(0x02);
    expect(used).toBe(6);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
  });

  it("LSR $10,X shifts right", () => {
    const { bus, ram } = makeRamBus();
    ram[0x15] = 0x03;
    ram[0x0200] = 0x56;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0x05 });
    cpuStep(cpu, bus);
    expect(ram[0x15]).toBe(0x01);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
  });

  it("ROL $10,X rotates left through carry", () => {
    const { bus, ram } = makeRamBus();
    ram[0x15] = 0x80;
    ram[0x0200] = 0x36;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0x05, p: CpuFlags.C | CpuFlags.I });
    cpuStep(cpu, bus);
    expect(ram[0x15]).toBe(0x01);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
  });

  it("ROR $10,X rotates right through carry", () => {
    const { bus, ram } = makeRamBus();
    ram[0x15] = 0x01;
    ram[0x0200] = 0x76;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0x05, p: CpuFlags.C | CpuFlags.I });
    cpuStep(cpu, bus);
    expect(ram[0x15]).toBe(0x80);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
  });

  it("INC $10,X increments, 6 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x15] = 0xff;
    ram[0x0200] = 0xf6;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0x05 });
    const used = cpuStep(cpu, bus);
    expect(ram[0x15]).toBe(0x00);
    expect(used).toBe(6);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
  });

  it("DEC $10,X decrements", () => {
    const { bus, ram } = makeRamBus();
    ram[0x15] = 0x00;
    ram[0x0200] = 0xd6;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0x05 });
    cpuStep(cpu, bus);
    expect(ram[0x15]).toBe(0xff);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });
});

describe("zeroPage,Y (LDX/STX)", () => {
  it("LDX $10,Y loads into X, wraps in zero page, 4 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0f] = 0xcc;
    ram[0x0200] = 0xb6;
    ram[0x0201] = 0xf0;
    const cpu = createCpu({ pc: 0x0200, y: 0x1f });
    const used = cpuStep(cpu, bus);
    expect(cpu.x).toBe(0xcc);
    expect(used).toBe(4);
  });

  it("STX $10,Y stores X, wraps in zero page", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x96;
    ram[0x0201] = 0x80;
    const cpu = createCpu({ pc: 0x0200, x: 0x42, y: 0xff });
    const used = cpuStep(cpu, bus);
    expect(ram[0x7f]).toBe(0x42);
    expect(used).toBe(4);
  });
});
