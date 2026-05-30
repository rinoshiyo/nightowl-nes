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

describe("illegal *SBC ($EB)", () => {
  it("behaves identically to regular SBC immediate ($E9)", () => {
    const { bus: bus1, ram: ram1 } = makeRamBus();
    const { bus: bus2, ram: ram2 } = makeRamBus();

    ram1[0x0200] = 0xe9;
    ram1[0x0201] = 0x40;
    ram2[0x0200] = 0xeb;
    ram2[0x0201] = 0x40;

    const cpu1 = createCpu({ pc: 0x0200, a: 0x40, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });
    const cpu2 = createCpu({ pc: 0x0200, a: 0x40, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

    const used1 = cpuStep(cpu1, bus1);
    const used2 = cpuStep(cpu2, bus2);

    expect(used2).toBe(used1);
    expect(cpu2.a).toBe(cpu1.a);
    expect(cpu2.p).toBe(cpu1.p);
    expect(cpu2.pc).toBe(cpu1.pc);
  });

  it("subtracts with borrow and sets flags correctly", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0xeb;
    ram[0x0201] = 0x40;
    const cpu = createCpu({ pc: 0x0200, a: 0x40, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

    const used = cpuStep(cpu, bus);
    expect(used).toBe(2);
    expect(cpu.a).toBe(0x00);
    expect(cpu.p & CpuFlags.Z).toBe(CpuFlags.Z);
    expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
    expect(cpu.p & CpuFlags.N).toBe(0);
  });

  it("sets N flag on negative result", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0xeb;
    ram[0x0201] = 0x41;
    const cpu = createCpu({ pc: 0x0200, a: 0x40, p: CpuFlags.U | CpuFlags.I | CpuFlags.C });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0xff);
    expect(cpu.p & CpuFlags.N).toBe(CpuFlags.N);
    expect(cpu.p & CpuFlags.C).toBe(0);
  });
});

describe("illegal DCP (*DCP)", () => {
  describe("$C7 zeroPage (2 byte, 5 cycle)", () => {
    it("decrements memory and compares with A, sets C/Z/N flags", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xc7;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0x41;
      const cpu = createCpu({ pc: 0x0200, a: 0x40 });
      const vBefore = cpu.p & CpuFlags.V;

      const used = cpuStep(cpu, bus);
      expect(used).toBe(5);
      expect(cpu.pc).toBe(0x0202);
      expect(ram[0x0047]).toBe(0x40);
      expect(cpu.p & CpuFlags.Z).toBe(CpuFlags.Z);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
      expect(cpu.p & CpuFlags.N).toBe(0);
      expect(cpu.p & CpuFlags.V).toBe(vBefore);
    });

    it("sets C when A >= decremented value", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xc7;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0x20;
      const cpu = createCpu({ pc: 0x0200, a: 0x40 });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0x1f);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
      expect(cpu.p & CpuFlags.Z).toBe(0);
    });

    it("clears C when A < decremented value", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xc7;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0x80;
      const cpu = createCpu({ pc: 0x0200, a: 0x40 });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0x7f);
      expect(cpu.p & CpuFlags.C).toBe(0);
      expect(cpu.p & CpuFlags.N).toBe(CpuFlags.N);
    });

    it("wraps 0x00 to 0xFF on decrement", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xc7;
      ram[0x0201] = 0x47;
      ram[0x0047] = 0x00;
      const cpu = createCpu({ pc: 0x0200, a: 0xff });

      cpuStep(cpu, bus);
      expect(ram[0x0047]).toBe(0xff);
      expect(cpu.p & CpuFlags.Z).toBe(CpuFlags.Z);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
    });
  });

  describe("$C3 (indirect,X) (2 byte, 8 cycle)", () => {
    it("DEC+CMP via indexed indirect", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xc3;
      ram[0x0201] = 0x45;
      ram[0x0047] = 0x47;
      ram[0x0048] = 0x06;
      ram[0x0647] = 0xeb;
      const cpu = createCpu({ pc: 0x0200, a: 0x40, x: 0x02 });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(8);
      expect(ram[0x0647]).toBe(0xea);
      expect(cpu.p & CpuFlags.C).toBe(0);
    });
  });

  describe("$CF absolute (3 byte, 6 cycle)", () => {
    it("DEC+CMP at absolute address", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xcf;
      ram[0x0201] = 0x47;
      ram[0x0202] = 0x06;
      ram[0x0647] = 0x41;
      const cpu = createCpu({ pc: 0x0200, a: 0x40 });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(6);
      expect(cpu.pc).toBe(0x0203);
      expect(ram[0x0647]).toBe(0x40);
      expect(cpu.p & CpuFlags.Z).toBe(CpuFlags.Z);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
    });
  });

  describe("$D3 (indirect),Y (2 byte, 8 cycle)", () => {
    it("DEC+CMP via indirect indexed Y", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xd3;
      ram[0x0201] = 0x45;
      ram[0x0045] = 0x48;
      ram[0x0046] = 0x05;
      ram[0x0647] = 0x41;
      const cpu = createCpu({ pc: 0x0200, a: 0x40, y: 0xff });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(8);
      expect(ram[0x0647]).toBe(0x40);
      expect(cpu.p & CpuFlags.Z).toBe(CpuFlags.Z);
    });
  });

  describe("$D7 zeroPage,X (2 byte, 6 cycle)", () => {
    it("DEC+CMP at zeroPage+X", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xd7;
      ram[0x0201] = 0x48;
      ram[0x0047] = 0x38;
      const cpu = createCpu({ pc: 0x0200, a: 0xf0, x: 0xff });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(6);
      expect(ram[0x0047]).toBe(0x37);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
      expect(cpu.p & CpuFlags.N).toBe(CpuFlags.N);
    });
  });

  describe("$DB absolute,Y (3 byte, 7 cycle)", () => {
    it("DEC+CMP at absolute+Y", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xdb;
      ram[0x0201] = 0x48;
      ram[0x0202] = 0x05;
      ram[0x0647] = 0x41;
      const cpu = createCpu({ pc: 0x0200, a: 0x40, y: 0xff });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(7);
      expect(ram[0x0647]).toBe(0x40);
      expect(cpu.p & CpuFlags.Z).toBe(CpuFlags.Z);
    });
  });

  describe("$DF absolute,X (3 byte, 7 cycle)", () => {
    it("DEC+CMP at absolute+X", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xdf;
      ram[0x0201] = 0x48;
      ram[0x0202] = 0x05;
      ram[0x0647] = 0x41;
      const cpu = createCpu({ pc: 0x0200, a: 0x40, x: 0xff });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(7);
      expect(ram[0x0647]).toBe(0x40);
      expect(cpu.p & CpuFlags.Z).toBe(CpuFlags.Z);
      expect(cpu.p & CpuFlags.C).toBe(CpuFlags.C);
    });
  });

  it("does not modify V flag", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0xc7;
    ram[0x0201] = 0x47;
    ram[0x0047] = 0x80;
    const cpu = createCpu({ pc: 0x0200, a: 0x40, p: CpuFlags.U | CpuFlags.I | CpuFlags.V });

    cpuStep(cpu, bus);
    expect(cpu.p & CpuFlags.V).toBe(CpuFlags.V);
  });
});
