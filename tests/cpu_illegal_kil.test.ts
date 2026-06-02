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

const KIL_OPCODES = [
  0x02, 0x12, 0x22, 0x32, 0x42, 0x52,
  0x62, 0x72, 0x92, 0xb2, 0xd2, 0xf2,
];

describe("illegal *KIL / *JAM", () => {
  for (const opcode of KIL_OPCODES) {
    const hex = opcode.toString(16).toUpperCase().padStart(2, "0");

    it(`$${hex}: halts CPU`, () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = opcode;
      const cpu = createCpu({ pc: 0x0200 });

      expect(cpu.halted).toBe(false);
      cpuStep(cpu, bus);
      expect(cpu.halted).toBe(true);
    });

    it(`$${hex}: subsequent cpuStep returns 1 cycle without advancing`, () => {
      const { bus, ram } = makeRamBus();
      ram[0x0200] = opcode;
      const cpu = createCpu({ pc: 0x0200 });

      cpuStep(cpu, bus);
      const pcAfterHalt = cpu.pc;
      const cyclesAfterHalt = cpu.cycles;

      const used = cpuStep(cpu, bus);
      expect(used).toBe(1);
      expect(cpu.pc).toBe(pcAfterHalt);
      expect(cpu.cycles).toBe(cyclesAfterHalt + 1);
    });
  }

  it("halted CPU ignores NMI", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x02;
    const cpu = createCpu({ pc: 0x0200 });

    cpuStep(cpu, bus);
    expect(cpu.halted).toBe(true);

    cpu.nmiPending = true;
    const used = cpuStep(cpu, bus);
    expect(used).toBe(1);
    expect(cpu.nmiPending).toBe(true);
  });

  it("halted CPU ignores IRQ", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x12;
    const cpu = createCpu({ pc: 0x0200, p: 0x00 });

    cpuStep(cpu, bus);
    expect(cpu.halted).toBe(true);

    cpu.irqPending = true;
    const used = cpuStep(cpu, bus);
    expect(used).toBe(1);
    expect(cpu.irqPending).toBe(true);
  });
});
