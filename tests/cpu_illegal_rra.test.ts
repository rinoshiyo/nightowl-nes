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

describe("illegal RRA (*RRA)", () => {
  describe("$67 zeroPage (2 byte, 5 cycle)", () => {
    it("rotates memory right through carry and ADCs with A", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x67;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb2, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(5);
      expect(cpu.pc).toBe(0x0202);
      // ROR(0xA5, C=0): bit0=1→C=1, result=0x52
      expect(ram[0x0047]).toBe(0x52);
      // ADC: 0xB2 + 0x52 + 1(C from ROR) = 0x105 → 0x05, C=1
      expect(cpu.a).toBe(0x05);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
      expect(cpu.p & CpuFlags.N).toBe(0);
      expect(cpu.p & CpuFlags.Z).toBe(0);
      expect(cpu.p & CpuFlags.V).toBe(0);
    });

    it("ROR uses carry-in (C=1 rotates into bit7)", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x67;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0x37;
      const cpu = createCpu({ pc: 0x0200, a: 0x75, p: CpuFlags.U | CpuFlags.I | CpuFlags.C | CpuFlags.V });

      cpuStep(cpu, bus);
      // ROR(0x37, C=1): bit0=1→C=1, (0x37>>1)|0x80 = 0x9B
      expect(ram[0x0047]).toBe(0x9b);
      // ADC: 0x75 + 0x9B + 1(C) = 0x111 → 0x11, C=1
      expect(cpu.a).toBe(0x11);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
    });

    it("sets Z flag when ADC result is zero", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x67;
      ram[0x0201] = 0x47;
      // ROR(0x00, C=0) → 0x00, C=0. ADC: 0x00 + 0x00 + 0 = 0x00
      ram[0x0047] = 0x00;
      const cpu = createCpu({ pc: 0x0200, a: 0x00, p: CpuFlags.U | CpuFlags.I });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0x00);
      expect(cpu.a).toBe(0x00);
      expect(cpu.p & CpuFlags.Z).toBe(CpuFlags.Z);
      expect(cpu.p & CpuFlags.N).toBe(0);
      expect(cpu.p & CpuFlags.C).toBe(0);
    });

    it("sets N flag when ADC result has bit7 set", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x67;
      ram[0x0201] = 0x47;
      // ROR(0x02, C=1) → 0x81, C=0. ADC: 0x10 + 0x81 + 0 = 0x91
      ram[0x0047] = 0x02;
      const cpu = createCpu({ pc: 0x0200, a: 0x10, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0x81);
      expect(cpu.a).toBe(0x91);
      expect(cpu.p & CpuFlags.N).toBe(CpuFlags.N);
    });

    it("sets V flag on signed overflow (positive + positive → negative)", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x67;
      ram[0x0201] = 0x47;
      // ROR(0x80, C=0) → 0x40, C=0. ADC: 0x50 + 0x40 + 0 = 0x90 (overflow)
      ram[0x0047] = 0x80;
      const cpu = createCpu({ pc: 0x0200, a: 0x50, p: CpuFlags.U | CpuFlags.I });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0x40);
      expect(cpu.a).toBe(0x90);
      expect(cpu.p & CpuFlags.V).toBe(CpuFlags.V);
      expect(cpu.p & CpuFlags.N).toBe(CpuFlags.N);
      expect(cpu.p & CpuFlags.C).toBe(0);
    });

    it("C flag from ROR propagates into ADC carry-in", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x67;
      ram[0x0201] = 0x47;
      // ROR(0x01, C=0): bit0=1→C=1, result=0x00. ADC: 0x00 + 0x00 + 1(C) = 0x01
      ram[0x0047] = 0x01;
      const cpu = createCpu({ pc: 0x0200, a: 0x00, p: CpuFlags.U | CpuFlags.I });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0x00);
      expect(cpu.a).toBe(0x01);
      expect(cpu.p & CpuFlags.C).toBe(0);
      expect(cpu.p & CpuFlags.Z).toBe(0);
    });
  });

  describe("$63 (indirect,X) (2 byte, 8 cycle)", () => {
    it("ROR+ADC via indexed indirect", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x63;
      ram[0x0201] = 0x45;
      ram[0x0047] = 0x47;
      ram[0x0048] = 0x06;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb2, x: 0x02, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(8);
      expect(ram[0x0647]).toBe(0x52);
      expect(cpu.a).toBe(0x05);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
    });
  });

  describe("$6F absolute (3 byte, 6 cycle)", () => {
    it("ROR+ADC at absolute address", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x6f;
      ram[0x0201] = 0x47;
      ram[0x0202] = 0x06;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb2, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(6);
      expect(cpu.pc).toBe(0x0203);
      expect(ram[0x0647]).toBe(0x52);
      expect(cpu.a).toBe(0x05);
    });
  });

  describe("$73 (indirect),Y (2 byte, 8 cycle)", () => {
    it("ROR+ADC via indirect indexed Y", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x73;
      ram[0x0201] = 0x45;
      ram[0x0045] = 0x48;
      ram[0x0046] = 0x05;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb2, y: 0xff, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(8);
      expect(ram[0x0647]).toBe(0x52);
      expect(cpu.a).toBe(0x05);
    });
  });

  describe("$77 zeroPage,X (2 byte, 6 cycle)", () => {
    it("ROR+ADC at zeroPage+X", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x77;
      ram[0x0201] = 0x48;
      ram[0x0047] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb2, x: 0xff, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(6);
      expect(ram[0x0047]).toBe(0x52);
      expect(cpu.a).toBe(0x05);
    });
  });

  describe("$7B absolute,Y (3 byte, 7 cycle)", () => {
    it("ROR+ADC at absolute+Y", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x7b;
      ram[0x0201] = 0x48;
      ram[0x0202] = 0x05;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb2, y: 0xff, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(7);
      expect(ram[0x0647]).toBe(0x52);
      expect(cpu.a).toBe(0x05);
    });
  });

  describe("$7F absolute,X (3 byte, 7 cycle)", () => {
    it("ROR+ADC at absolute+X", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x7f;
      ram[0x0201] = 0x48;
      ram[0x0202] = 0x05;
      ram[0x0647] = 0xa5;
      const cpu = createCpu({ pc: 0x0200, a: 0xb2, x: 0xff, p: CpuFlags.U | CpuFlags.I });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(7);
      expect(ram[0x0647]).toBe(0x52);
      expect(cpu.a).toBe(0x05);
    });
  });
});
