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

describe("illegal RLA (*RLA)", () => {
  describe("$27 zeroPage (2 byte, 5 cycle)", () => {
    it("rotates memory left and ANDs with A, sets C from bit7", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x27;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb3, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(5);
      expect(cpu.pc).toBe(0x0202);
      expect(ram[0x0047]).toBe(0x4a);
      expect(cpu.a).toBe(0x02);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
      expect(cpu.p & CpuFlags.N).toBe(0);
      expect(cpu.p & CpuFlags.Z).toBe(0);
    });

    it("rotates with carry-in: oldC feeds into bit0", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x27;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0x37;
      const cpu = createCpu({ pc: 0x0200, a: 0xff, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0x6f);
      expect(cpu.a).toBe(0x6f);
      expect(cpu.p & CpuFlags.C).toBe(0);
    });

    it("sets Z flag when AND result is zero", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x27;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0x55;
      const cpu = createCpu({ pc: 0x0200, a: 0x54, p: CpuFlags.U | CpuFlags.I });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0xaa);
      expect(cpu.a).toBe(0x00);
      expect(cpu.p & CpuFlags.Z).toBe(CpuFlags.Z);
      expect(cpu.p & CpuFlags.N).toBe(0);
    });

    it("sets N flag when AND result has bit7 set", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x27;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0x55;
      const cpu = createCpu({ pc: 0x0200, a: 0xff, p: CpuFlags.U | CpuFlags.I });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0xaa);
      expect(cpu.a).toBe(0xaa);
      expect(cpu.p & CpuFlags.N).toBe(CpuFlags.N);
    });
  });

  describe("$23 (indirect,X) (2 byte, 8 cycle)", () => {
    it("ROL+AND via indexed indirect", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x23;
      ram[0x0201] = 0x45;
      ram[0x0047] = 0x47;
      ram[0x0048] = 0x06;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb3, x: 0x02, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(8);
      expect(ram[0x0647]).toBe(0x4a);
      expect(cpu.a).toBe(0x02);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
    });
  });

  describe("$2F absolute (3 byte, 6 cycle)", () => {
    it("ROL+AND at absolute address", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x2f;
      ram[0x0201] = 0x47;
      ram[0x0202] = 0x06;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb3, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(6);
      expect(cpu.pc).toBe(0x0203);
      expect(ram[0x0647]).toBe(0x4a);
      expect(cpu.a).toBe(0x02);
    });
  });

  describe("$33 (indirect),Y (2 byte, 8 cycle)", () => {
    it("ROL+AND via indirect indexed Y", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x33;
      ram[0x0201] = 0x45;
      ram[0x0045] = 0x48;
      ram[0x0046] = 0x05;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb3, y: 0xff, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(8);
      expect(ram[0x0647]).toBe(0x4a);
      expect(cpu.a).toBe(0x02);
    });
  });

  describe("$37 zeroPage,X (2 byte, 6 cycle)", () => {
    it("ROL+AND at zeroPage+X", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x37;
      ram[0x0201] = 0x48;
      ram[0x0047] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb3, x: 0xff, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(6);
      expect(ram[0x0047]).toBe(0x4a);
      expect(cpu.a).toBe(0x02);
    });
  });

  describe("$3B absolute,Y (3 byte, 7 cycle)", () => {
    it("ROL+AND at absolute+Y", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x3b;
      ram[0x0201] = 0x48;
      ram[0x0202] = 0x05;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb3, y: 0xff, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(7);
      expect(ram[0x0647]).toBe(0x4a);
      expect(cpu.a).toBe(0x02);
    });
  });

  describe("$3F absolute,X (3 byte, 7 cycle)", () => {
    it("ROL+AND at absolute+X", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x3f;
      ram[0x0201] = 0x48;
      ram[0x0202] = 0x05;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb3, x: 0xff, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(7);
      expect(ram[0x0647]).toBe(0x4a);
      expect(cpu.a).toBe(0x02);
    });
  });

  it("does not modify V flag", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x27;
    ram[0x0201] = 0x47;
    ram[0x0047] = 0xa5;
    const cpu = createCpu({ pc: 0x0200, a: 0xb3, p: CpuFlags.U | CpuFlags.I | CpuFlags.V });

    cpuStep(cpu, bus);
    expect(cpu.p & CpuFlags.V).toBe(CpuFlags.V);
  });

  it("does not set V flag when V was clear", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x27;
    ram[0x0201] = 0x47;
    ram[0x0047] = 0xff;
    const cpu = createCpu({ pc: 0x0200, a: 0x7f, p: CpuFlags.U | CpuFlags.I });

    cpuStep(cpu, bus);
    expect(cpu.p & CpuFlags.V).toBe(0);
  });
});
