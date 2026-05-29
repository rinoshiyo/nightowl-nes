import { describe, expect, it } from "vitest";

import type { Bus } from "../src/core/bus.ts";
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

describe("illegal/undocumented NOP", () => {
  describe("implied NOP (1 byte, 2 cycle)", () => {
    for (const opcode of [0x1a, 0x3a, 0x5a, 0x7a, 0xda, 0xfa]) {
      const hex = opcode.toString(16).toUpperCase().padStart(2, "0");
      it(`$${hex}: consumes 2 cycles, advances PC by 1, no state change`, () => {
        const { bus, ram } = makeRamBus();
        ram[0x0200] = opcode;
        const cpu = createCpu({ pc: 0x0200, a: 0x42, x: 0x10, y: 0x20 });
        const pBefore = cpu.p;

        const used = cpuStep(cpu, bus);
        expect(used).toBe(2);
        expect(cpu.pc).toBe(0x0201);
        expect(cpu.a).toBe(0x42);
        expect(cpu.x).toBe(0x10);
        expect(cpu.y).toBe(0x20);
        expect(cpu.p).toBe(pBefore);
      });
    }
  });

  describe("immediate NOP (2 byte, 2 cycle)", () => {
    it("$80: consumes 2 cycles, advances PC by 2, no state change", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x80;
      ram[0x0201] = 0xff;
      const cpu = createCpu({ pc: 0x0200, a: 0x42, x: 0x10, y: 0x20 });
      const pBefore = cpu.p;

      const used = cpuStep(cpu, bus);
      expect(used).toBe(2);
      expect(cpu.pc).toBe(0x0202);
      expect(cpu.a).toBe(0x42);
      expect(cpu.x).toBe(0x10);
      expect(cpu.y).toBe(0x20);
      expect(cpu.p).toBe(pBefore);
    });
  });

  describe("zeroPage NOP (2 byte, 3 cycle)", () => {
    for (const opcode of [0x04, 0x44, 0x64]) {
      const hex = opcode.toString(16).toUpperCase().padStart(2, "0");
      it(`$${hex}: consumes 3 cycles, advances PC by 2, no state change`, () => {
        const { bus, ram } = makeRamBus();
        ram[0x0200] = opcode;
        ram[0x0201] = 0x42;
        const cpu = createCpu({ pc: 0x0200, a: 0x55, x: 0x10, y: 0x20 });
        const pBefore = cpu.p;

        const used = cpuStep(cpu, bus);
        expect(used).toBe(3);
        expect(cpu.pc).toBe(0x0202);
        expect(cpu.a).toBe(0x55);
        expect(cpu.x).toBe(0x10);
        expect(cpu.y).toBe(0x20);
        expect(cpu.p).toBe(pBefore);
      });
    }
  });

  describe("absolute NOP (3 byte, 4 cycle)", () => {
    it("$0C: consumes 4 cycles, advances PC by 3, no state change", () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = 0x0c;
      ram[0x0201] = 0x00;
      ram[0x0202] = 0x04;
      const cpu = createCpu({ pc: 0x0200, a: 0x55, x: 0x10, y: 0x20 });
      const pBefore = cpu.p;

      const used = cpuStep(cpu, bus);
      expect(used).toBe(4);
      expect(cpu.pc).toBe(0x0203);
      expect(cpu.a).toBe(0x55);
      expect(cpu.x).toBe(0x10);
      expect(cpu.y).toBe(0x20);
      expect(cpu.p).toBe(pBefore);
    });
  });

  describe("zeroPage,X NOP (2 byte, 4 cycle)", () => {
    for (const opcode of [0x14, 0x34, 0x54, 0x74, 0xd4, 0xf4]) {
      const hex = opcode.toString(16).toUpperCase().padStart(2, "0");
      it(`$${hex}: consumes 4 cycles, advances PC by 2, no state change`, () => {
        const { bus, ram } = makeRamBus();
        ram[0x0200] = opcode;
        ram[0x0201] = 0x42;
        const cpu = createCpu({ pc: 0x0200, a: 0x55, x: 0x10, y: 0x20 });
        const pBefore = cpu.p;

        const used = cpuStep(cpu, bus);
        expect(used).toBe(4);
        expect(cpu.pc).toBe(0x0202);
        expect(cpu.a).toBe(0x55);
        expect(cpu.x).toBe(0x10);
        expect(cpu.y).toBe(0x20);
        expect(cpu.p).toBe(pBefore);
      });
    }
  });

  describe("absolute,X NOP (3 byte, 4 cycle + page cross)", () => {
    for (const opcode of [0x1c, 0x3c, 0x5c, 0x7c, 0xdc, 0xfc]) {
      const hex = opcode.toString(16).toUpperCase().padStart(2, "0");
      it(`$${hex}: consumes 4 cycles without page cross`, () => {
        const { bus, ram } = makeRamBus();
        ram[0x0200] = opcode;
        ram[0x0201] = 0x00;
        ram[0x0202] = 0x04;
        const cpu = createCpu({ pc: 0x0200, a: 0x55, x: 0x10, y: 0x20 });
        const pBefore = cpu.p;

        const used = cpuStep(cpu, bus);
        expect(used).toBe(4);
        expect(cpu.pc).toBe(0x0203);
        expect(cpu.a).toBe(0x55);
        expect(cpu.x).toBe(0x10);
        expect(cpu.y).toBe(0x20);
        expect(cpu.p).toBe(pBefore);
      });

      it(`$${hex}: consumes 5 cycles with page cross`, () => {
        const { bus, ram } = makeRamBus();
        ram[0x0200] = opcode;
        ram[0x0201] = 0xff; // $04FF + X(0x10) = $050F (page cross)
        ram[0x0202] = 0x04;
        const cpu = createCpu({ pc: 0x0200, a: 0x55, x: 0x10, y: 0x20 });
        const pBefore = cpu.p;

        const used = cpuStep(cpu, bus);
        expect(used).toBe(5);
        expect(cpu.pc).toBe(0x0203);
        expect(cpu.a).toBe(0x55);
        expect(cpu.p).toBe(pBefore);
      });
    }
  });
});
