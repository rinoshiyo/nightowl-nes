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

describe("illegal LAX (*LAX)", () => {
  describe("$A7 zeroPage (2 byte, 3 cycle)", () => {
    it("loads value into both A and X, sets Z/N flags", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xa7;
      ram[0x0201] = 0x50;
      ram[0x0050] = 0x42;
      const cpu = createCpu({ pc: 0x0200 });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(3);
      expect(cpu.pc).toBe(0x0202);
      expect(cpu.a).toBe(0x42);
      expect(cpu.x).toBe(0x42);
      expect(cpu.p & CpuFlags.Z).toBe(0);
      expect(cpu.p & CpuFlags.N).toBe(0);
    });

    it("sets Z flag when value is 0", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xa7;
      ram[0x0201] = 0x50;
      ram[0x0050] = 0x00;
      const cpu = createCpu({ pc: 0x0200, a: 0xff, x: 0xff });

      cpuStep(cpu, bus);
      expect(cpu.a).toBe(0x00);
      expect(cpu.x).toBe(0x00);
      expect(cpu.p & CpuFlags.Z).toBe(CpuFlags.Z);
      expect(cpu.p & CpuFlags.N).toBe(0);
    });

    it("sets N flag when value has bit 7 set", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xa7;
      ram[0x0201] = 0x50;
      ram[0x0050] = 0x80;
      const cpu = createCpu({ pc: 0x0200 });

      cpuStep(cpu, bus);
      expect(cpu.a).toBe(0x80);
      expect(cpu.x).toBe(0x80);
      expect(cpu.p & CpuFlags.N).toBe(CpuFlags.N);
      expect(cpu.p & CpuFlags.Z).toBe(0);
    });
  });

  describe("$A3 (indirect,X) (2 byte, 6 cycle)", () => {
    it("loads via indexed indirect and sets A=X=value", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xa3;
      ram[0x0201] = 0x40;
      ram[0x0043] = 0x80;
      ram[0x0044] = 0x05;
      ram[0x0580] = 0x55;
      const cpu = createCpu({ pc: 0x0200, x: 0x03 });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(6);
      expect(cpu.a).toBe(0x55);
      expect(cpu.x).toBe(0x55);
    });
  });

  describe("$AF absolute (3 byte, 4 cycle)", () => {
    it("loads from absolute address into A and X", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xaf;
      ram[0x0201] = 0x77;
      ram[0x0202] = 0x05;
      ram[0x0577] = 0x87;
      const cpu = createCpu({ pc: 0x0200 });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(4);
      expect(cpu.pc).toBe(0x0203);
      expect(cpu.a).toBe(0x87);
      expect(cpu.x).toBe(0x87);
      expect(cpu.p & CpuFlags.N).toBe(CpuFlags.N);
    });
  });

  describe("$B3 (indirect),Y (2 byte, 5 cycle + 1 page cross)", () => {
    it("loads via indirect indexed Y into A and X", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xb3;
      ram[0x0201] = 0x43;
      ram[0x0043] = 0xff;
      ram[0x0044] = 0x04;
      ram[0x0580] = 0x55;
      const cpu = createCpu({ pc: 0x0200, y: 0x81 });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(6);
      expect(cpu.a).toBe(0x55);
      expect(cpu.x).toBe(0x55);
    });

    it("takes 5 cycles without page cross", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xb3;
      ram[0x0201] = 0x43;
      ram[0x0043] = 0x00;
      ram[0x0044] = 0x05;
      ram[0x0500] = 0x33;
      const cpu = createCpu({ pc: 0x0200, y: 0x00 });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(5);
      expect(cpu.a).toBe(0x33);
      expect(cpu.x).toBe(0x33);
    });
  });

  describe("$B7 zeroPage,Y (2 byte, 4 cycle)", () => {
    it("loads from zeroPage+Y into A and X", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xb7;
      ram[0x0201] = 0x10;
      ram[0x0067] = 0x87;
      const cpu = createCpu({ pc: 0x0200, y: 0x57 });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(4);
      expect(cpu.a).toBe(0x87);
      expect(cpu.x).toBe(0x87);
    });
  });

  describe("$BF absolute,Y (3 byte, 4 cycle + 1 page cross)", () => {
    it("loads from absolute+Y with page cross penalty", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xbf;
      ram[0x0201] = 0xc0;
      ram[0x0202] = 0x04;
      ram[0x0500] = 0x87;
      const cpu = createCpu({ pc: 0x0200, y: 0x40 });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(5);
      expect(cpu.a).toBe(0x87);
      expect(cpu.x).toBe(0x87);
    });

    it("takes 4 cycles without page cross", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0xbf;
      ram[0x0201] = 0x00;
      ram[0x0202] = 0x05;
      ram[0x0501] = 0x22;
      const cpu = createCpu({ pc: 0x0200, y: 0x01 });

      const used = cpuStep(cpu, bus);
      expect(used).toBe(4);
      expect(cpu.a).toBe(0x22);
      expect(cpu.x).toBe(0x22);
    });
  });
});

describe("illegal SAX (*SAX)", () => {
  describe("$87 zeroPage (2 byte, 3 cycle)", () => {
    it("stores A AND X to zeroPage, no flag change", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x87;
      ram[0x0201] = 0x49;
      const cpu = createCpu({ pc: 0x0200, a: 0x55, x: 0xaa });
      const pBefore = cpu.p;

      const used = cpuStep(cpu, bus);
      expect(used).toBe(3);
      expect(cpu.pc).toBe(0x0202);
      expect(ram[0x0049]).toBe(0x55 & 0xaa);
      expect(cpu.a).toBe(0x55);
      expect(cpu.x).toBe(0xaa);
      expect(cpu.p).toBe(pBefore);
    });

    it("stores 0 when A and X have no common bits", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x87;
      ram[0x0201] = 0x50;
      ram[0x0050] = 0xff;
      const cpu = createCpu({ pc: 0x0200, a: 0xf0, x: 0x0f });
      const pBefore = cpu.p;

      cpuStep(cpu, bus);
      expect(ram[0x0050]).toBe(0x00);
      expect(cpu.p).toBe(pBefore);
    });
  });

  describe("$83 (indirect,X) (2 byte, 6 cycle)", () => {
    it("stores A AND X via indexed indirect", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x83;
      ram[0x0201] = 0x49;
      ram[0x0060] = 0x89;
      ram[0x0061] = 0x04;
      const cpu = createCpu({ pc: 0x0200, a: 0x3e, x: 0x17 });
      const pBefore = cpu.p;

      const used = cpuStep(cpu, bus);
      expect(used).toBe(6);
      expect(ram[0x0489]).toBe(0x3e & 0x17);
      expect(cpu.p).toBe(pBefore);
    });
  });

  describe("$8F absolute (3 byte, 4 cycle)", () => {
    it("stores A AND X to absolute address", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x8f;
      ram[0x0201] = 0x49;
      ram[0x0202] = 0x05;
      const cpu = createCpu({ pc: 0x0200, a: 0xf5, x: 0xaf });
      const pBefore = cpu.p;

      const used = cpuStep(cpu, bus);
      expect(used).toBe(4);
      expect(cpu.pc).toBe(0x0203);
      expect(ram[0x0549]).toBe(0xf5 & 0xaf);
      expect(cpu.p).toBe(pBefore);
    });
  });

  describe("$97 zeroPage,Y (2 byte, 4 cycle)", () => {
    it("stores A AND X to zeroPage+Y", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x97;
      ram[0x0201] = 0x4a;
      const cpu = createCpu({ pc: 0x0200, a: 0x55, x: 0xaa, y: 0xff });
      const pBefore = cpu.p;

      const used = cpuStep(cpu, bus);
      expect(used).toBe(4);
      expect(ram[0x0049]).toBe(0x55 & 0xaa);
      expect(cpu.p).toBe(pBefore);
    });
  });
});
