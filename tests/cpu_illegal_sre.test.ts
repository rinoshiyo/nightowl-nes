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

describe("illegal SRE (*SRE)", () => {
  describe("$47 zeroPage (2 byte, 5 cycle)", () => {
    it("shifts memory right and EORs with A, sets C from bit0", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x47;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb3, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(5);
      expect(cpu.pc).toBe(0x0202);
      expect(ram[0x0047]).toBe(0x52);
      expect(cpu.a).toBe(0xe1);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
      expect(cpu.p & CpuFlags.N).toBe(CpuFlags.N);
      expect(cpu.p & CpuFlags.Z).toBe(0);
    });

    it("LSR does not use carry-in (C flag before does not affect shift)", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x47;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0x37;
      const cpu = createCpu({ pc: 0x0200, a: 0x75, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0x1b);
      expect(cpu.a).toBe(0x6e);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
    });

    it("sets Z flag when EOR result is zero", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x47;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0xaa;
      const cpu = createCpu({ pc: 0x0200, a: 0x55, p: CpuFlags.U | CpuFlags.I });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0x55);
      expect(cpu.a).toBe(0x00);
      expect(cpu.p & CpuFlags.Z).toBe(CpuFlags.Z);
      expect(cpu.p & CpuFlags.N).toBe(0);
      expect(cpu.p & CpuFlags.C).toBe(0);
    });

    it("sets N flag when EOR result has bit7 set", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x47;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0xaa;
      const cpu = createCpu({ pc: 0x0200, a: 0xa0, p: CpuFlags.U | CpuFlags.I });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0x55);
      expect(cpu.a).toBe(0xf5);
      expect(cpu.p & CpuFlags.N).toBe(CpuFlags.N);
    });
  });

  describe("$43 (indirect,X) (2 byte, 8 cycle)", () => {
    it("LSR+EOR via indexed indirect", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x43;
      ram[0x0201] = 0x45;
      ram[0x0047] = 0x47;
      ram[0x0048] = 0x06;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb3, x: 0x02, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(8);
      expect(ram[0x0647]).toBe(0x52);
      expect(cpu.a).toBe(0xe1);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
    });
  });

  describe("$4F absolute (3 byte, 6 cycle)", () => {
    it("LSR+EOR at absolute address", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x4f;
      ram[0x0201] = 0x47;
      ram[0x0202] = 0x06;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb3, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(6);
      expect(cpu.pc).toBe(0x0203);
      expect(ram[0x0647]).toBe(0x52);
      expect(cpu.a).toBe(0xe1);
    });
  });

  describe("$53 (indirect),Y (2 byte, 8 cycle)", () => {
    it("LSR+EOR via indirect indexed Y", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x53;
      ram[0x0201] = 0x45;
      ram[0x0045] = 0x48;
      ram[0x0046] = 0x05;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb3, y: 0xff, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(8);
      expect(ram[0x0647]).toBe(0x52);
      expect(cpu.a).toBe(0xe1);
    });
  });

  describe("$57 zeroPage,X (2 byte, 6 cycle)", () => {
    it("LSR+EOR at zeroPage+X", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x57;
      ram[0x0201] = 0x48;
      ram[0x0047] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb3, x: 0xff, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(6);
      expect(ram[0x0047]).toBe(0x52);
      expect(cpu.a).toBe(0xe1);
    });
  });

  describe("$5B absolute,Y (3 byte, 7 cycle)", () => {
    it("LSR+EOR at absolute+Y", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x5b;
      ram[0x0201] = 0x48;
      ram[0x0202] = 0x05;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb3, y: 0xff, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(7);
      expect(ram[0x0647]).toBe(0x52);
      expect(cpu.a).toBe(0xe1);
    });
  });

  describe("$5F absolute,X (3 byte, 7 cycle)", () => {
    it("LSR+EOR at absolute+X", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x5f;
      ram[0x0201] = 0x48;
      ram[0x0202] = 0x05;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb3, x: 0xff, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(7);
      expect(ram[0x0647]).toBe(0x52);
      expect(cpu.a).toBe(0xe1);
    });
  });

  it("does not modify V flag", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x47;
    ram[0x0201] = 0x47;
    ram[0x0047] = 0xa5;
    const cpu = createCpu({ pc: 0x0200, a: 0xb3, p: CpuFlags.U | CpuFlags.I | CpuFlags.V });

    cpuStep(cpu, bus);
    expect(cpu.p & CpuFlags.V).toBe(CpuFlags.V);
  });

  it("does not set V flag when V was clear", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x47;
    ram[0x0201] = 0x47;
    ram[0x0047] = 0xff;
    const cpu = createCpu({ pc: 0x0200, a: 0x7f, p: CpuFlags.U | CpuFlags.I });

    cpuStep(cpu, bus);
    expect(cpu.p & CpuFlags.V).toBe(0);
  });
});
