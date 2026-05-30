import { describe, expect, it } from "vitest";

import type { Bus } from "../src/core/bus.ts";
import { CpuFlags } from "../src/core/cpu/flags.ts";
import { createCpu } from "../src/core/cpu/index.ts";
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

describe("illegal ISB (*ISB)", () => {
  describe("$E7 zeroPage (2 byte, 5 cycle)", () => {
    it("increments memory and subtracts from A, sets C/Z/N/V flags", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xe7;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0x3f;
      const cpu = createCpu({ pc: 0x0200, a: 0x40, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(5);
      expect(cpu.pc).toBe(0x0202);
      expect(ram[0x0047]).toBe(0x40);
      expect(cpu.a).toBe(0x00);
      expect(cpu.p & CpuFlags.Z).toBe(CpuFlags.Z);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
      expect(cpu.p & CpuFlags.N).toBe(0);
    });

    it("sets N flag on negative result", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xe7;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0x40;
      const cpu = createCpu({ pc: 0x0200, a: 0x40, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0x41);
      expect(cpu.a).toBe(0xff);
      expect(cpu.p & CpuFlags.N).toBe(CpuFlags.N);
      expect(cpu.p & CpuFlags.C).toBe(0);
    });

    it("wraps 0xFF to 0x00 on increment", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xe7;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0xff;
      const cpu = createCpu({ pc: 0x0200, a: 0x01, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0x00);
      expect(cpu.a).toBe(0x01);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
      expect(cpu.p & CpuFlags.Z).toBe(0);
    });

    it("uses borrow (C=0) correctly", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xe7;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0x3f;
      const cpu = createCpu({ pc: 0x0200, a: 0x40, p: CpuFlags.U | CpuFlags.I });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0x40);
      expect(cpu.a).toBe(0xff);
      expect(cpu.p & CpuFlags.C).toBe(0);
      expect(cpu.p & CpuFlags.N).toBe(CpuFlags.N);
    });
  });

  describe("$E3 (indirect,X) (2 byte, 8 cycle)", () => {
    it("INC+SBC via indexed indirect", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xe3;
      ram[0x0201] = 0x45;
      ram[0x0047] = 0x47;
      ram[0x0048] = 0x06;
      ram[0x0647] = 0xea;
      const cpu = createCpu({ pc: 0x0200, a: 0x40, x: 0x02, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(8);
      expect(ram[0x0647]).toBe(0xeb);
      expect(cpu.a).toBe(0x54);
    });
  });

  describe("$EF absolute (3 byte, 6 cycle)", () => {
    it("INC+SBC at absolute address", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xef;
      ram[0x0201] = 0x47;
      ram[0x0202] = 0x06;
      ram[0x0647] = 0xea;
      const cpu = createCpu({ pc: 0x0200, a: 0x40, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(6);
      expect(cpu.pc).toBe(0x0203);
      expect(ram[0x0647]).toBe(0xeb);
      expect(cpu.a).toBe(0x55);
    });
  });

  describe("$F3 (indirect),Y (2 byte, 8 cycle)", () => {
    it("INC+SBC via indirect indexed Y", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xf3;
      ram[0x0201] = 0x45;
      ram[0x0045] = 0x48;
      ram[0x0046] = 0x05;
      ram[0x0647] = 0x3f;
      const cpu = createCpu({ pc: 0x0200, a: 0x40, y: 0xff, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(8);
      expect(ram[0x0647]).toBe(0x40);
      expect(cpu.a).toBe(0x00);
      expect(cpu.p & CpuFlags.Z).toBe(CpuFlags.Z);
    });
  });

  describe("$F7 zeroPage,X (2 byte, 6 cycle)", () => {
    it("INC+SBC at zeroPage+X", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xf7;
      ram[0x0201] = 0x48;
      ram[0x0047] = 0x36;
      const cpu = createCpu({ pc: 0x0200, a: 0xf0, x: 0xff, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(6);
      expect(ram[0x0047]).toBe(0x37);
      expect(cpu.a).toBe(0xb9);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
      expect(cpu.p & CpuFlags.N).toBe(CpuFlags.N);
    });
  });

  describe("$FB absolute,Y (3 byte, 7 cycle)", () => {
    it("INC+SBC at absolute+Y", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xfb;
      ram[0x0201] = 0x48;
      ram[0x0202] = 0x05;
      ram[0x0647] = 0xea;
      const cpu = createCpu({ pc: 0x0200, a: 0x40, y: 0xff, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(7);
      expect(ram[0x0647]).toBe(0xeb);
      expect(cpu.a).toBe(0x55);
    });
  });

  describe("$FF absolute,X (3 byte, 7 cycle)", () => {
    it("INC+SBC at absolute+X", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xff;
      ram[0x0201] = 0x48;
      ram[0x0202] = 0x05;
      ram[0x0647] = 0xea;
      const cpu = createCpu({ pc: 0x0200, a: 0x40, x: 0xff, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(7);
      expect(ram[0x0647]).toBe(0xeb);
      expect(cpu.a).toBe(0x55);
      expect(cpu.p & CpuFlags.C).toBe(0);
    });
  });

  it("updates V flag (unlike DCP)", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0xe7;
    ram[0x0201] = 0x47;
    ram[0x0047] = 0x7e;
    const cpu = createCpu({ pc: 0x0200, a: 0x80, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

    cpuStep(cpu, bus);
    expect(ram[0x0047]).toBe(0x7f);
    expect(cpu.a).toBe(0x01);
    expect(cpu.p & CpuFlags.V).toBe(CpuFlags.V);
  });

  it("clears V flag when no overflow", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0xe7;
    ram[0x0201] = 0x47;
    ram[0x0047] = 0x09;
    const cpu = createCpu({ pc: 0x0200, a: 0x20, p: CpuFlags.U | CpuFlags.I | CpuFlags.C | CpuFlags.V });

    cpuStep(cpu, bus);
    expect(ram[0x0047]).toBe(0x0a);
    expect(cpu.a).toBe(0x16);
    expect(cpu.p & CpuFlags.V).toBe(0);
  });
});
