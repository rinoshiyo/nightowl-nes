import { describe, expect, it } from "vitest";

import type { Bus } from "../src/core/bus.ts";
import { createCpu } from "../src/core/cpu/index.ts";
import { CpuFlags, hasFlag } from "../src/core/cpu/flags.ts";
import { cpuStep } from "../src/core/cpu/step.ts";

/**
 * 単体テスト用の RAM Bus。 $0000-$FFFF をフラットな 64KB RAM として扱い、
 * 命令バイト列を任意アドレスに置いてステップ実行できるようにする。
 */
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

/** opcode + zp オペランドを $0200 に置き 1 命令実行するヘルパー */
function runZp(opcode: number, zpAddr: number, init: Parameters<typeof createCpu>[0]) {
  const { bus, ram } = makeRamBus();
  ram[0x0200] = opcode;
  ram[0x0201] = zpAddr;
  const cpu = createCpu({ pc: 0x0200, ...init });
  const used = cpuStep(cpu, bus);
  return { cpu, ram, used };
}

describe("zeroPage load (LDY 0xA4 / LDX 0xA6)", () => {
  it("LDY $10 loads into Y, updates Z/N, consumes 3 cycles", () => {
    const { cpu, used } = (() => {
      const { bus, ram } = makeRamBus();
      ram[0x10] = 0x37;
      ram[0x0200] = 0xa4;
      ram[0x0201] = 0x10;
      const c = createCpu({ pc: 0x0200 });
      const u = cpuStep(c, bus);
      return { cpu: c, used: u };
    })();
    expect(cpu.y).toBe(0x37);
    expect(used).toBe(3);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("LDY sets N when bit7 set", () => {
    const { bus, ram } = makeRamBus();
    ram[0x10] = 0x80;
    ram[0x0200] = 0xa4;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200 });
    cpuStep(cpu, bus);
    expect(cpu.y).toBe(0x80);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });

  it("LDX $10 loads into X, sets Z on zero, consumes 3 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x10] = 0x00;
    ram[0x0200] = 0xa6;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, x: 0xff });
    const used = cpuStep(cpu, bus);
    expect(cpu.x).toBe(0x00);
    expect(used).toBe(3);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
  });
});

describe("zeroPage store (STY 0x84)", () => {
  it("STY $20 writes Y to zero page, leaves flags untouched, consumes 3 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x84;
    ram[0x0201] = 0x20;
    const cpu = createCpu({ pc: 0x0200, y: 0x5a, p: 0x24 });
    const used = cpuStep(cpu, bus);
    expect(ram[0x20]).toBe(0x5a);
    expect(used).toBe(3);
    expect(cpu.p).toBe(0x24); // store はフラグ非変化
  });
});

describe("zeroPage logic (ORA 0x05 / AND 0x25 / EOR 0x45)", () => {
  it("ORA $30 OR-accumulates into A and updates Z/N", () => {
    const { cpu, used } = runZp(0x05, 0x30, { a: 0x0f });
    // ram[0x30] は 0 のままなので A=0x0f | 0 = 0x0f
    expect(cpu.a).toBe(0x0f);
    expect(used).toBe(3);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
  });

  it("ORA combines memory bits", () => {
    const { bus, ram } = makeRamBus();
    ram[0x30] = 0xf0;
    ram[0x0200] = 0x05;
    ram[0x0201] = 0x30;
    const cpu = createCpu({ pc: 0x0200, a: 0x0f });
    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0xff);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });

  it("AND $30 masks A and sets Z when result is zero", () => {
    const { bus, ram } = makeRamBus();
    ram[0x30] = 0xf0;
    ram[0x0200] = 0x25;
    ram[0x0201] = 0x30;
    const cpu = createCpu({ pc: 0x0200, a: 0x0f });
    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x00);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
  });

  it("EOR $30 toggles bits", () => {
    const { bus, ram } = makeRamBus();
    ram[0x30] = 0xff;
    ram[0x0200] = 0x45;
    ram[0x0201] = 0x30;
    const cpu = createCpu({ pc: 0x0200, a: 0x0f });
    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0xf0);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });
});

describe("zeroPage arithmetic (ADC 0x65 / SBC 0xE5)", () => {
  it("ADC $40 adds memory + carry, sets C/V on overflow", () => {
    const { bus, ram } = makeRamBus();
    ram[0x40] = 0x01;
    ram[0x0200] = 0x65;
    ram[0x0201] = 0x40;
    // A=0x7f + 0x01 = 0x80 → 符号付きオーバーフロー (V=1, N=1)
    const cpu = createCpu({ pc: 0x0200, a: 0x7f, p: 0x24 });
    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x80);
    expect(used).toBe(3);
    expect(hasFlag(cpu.p, CpuFlags.V)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(false);
  });

  it("ADC propagates carry-in", () => {
    const { bus, ram } = makeRamBus();
    ram[0x40] = 0x10;
    ram[0x0200] = 0x65;
    ram[0x0201] = 0x40;
    const cpu = createCpu({ pc: 0x0200, a: 0x10, p: 0x24 | CpuFlags.C });
    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x21); // 0x10 + 0x10 + 1
  });

  it("SBC $40 subtracts memory with borrow (C set = no borrow)", () => {
    const { bus, ram } = makeRamBus();
    ram[0x40] = 0x01;
    ram[0x0200] = 0xe5;
    ram[0x0201] = 0x40;
    // C=1 (borrow なし): A=0x05 - 0x01 = 0x04
    const cpu = createCpu({ pc: 0x0200, a: 0x05, p: 0x24 | CpuFlags.C });
    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x04);
    expect(used).toBe(3);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true); // 借りなし
  });
});

describe("zeroPage compare (CMP 0xC5 / CPX 0xE4 / CPY 0xC4)", () => {
  it("CMP $50 sets C and Z when A equals memory, leaves A unchanged", () => {
    const { bus, ram } = makeRamBus();
    ram[0x50] = 0x42;
    ram[0x0200] = 0xc5;
    ram[0x0201] = 0x50;
    const cpu = createCpu({ pc: 0x0200, a: 0x42 });
    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x42); // 比較は register 非変化
    expect(used).toBe(3);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
  });

  it("CMP clears C when A < memory and sets N from borrow result", () => {
    const { bus, ram } = makeRamBus();
    ram[0x50] = 0x80;
    ram[0x0200] = 0xc5;
    ram[0x0201] = 0x50;
    const cpu = createCpu({ pc: 0x0200, a: 0x10 });
    cpuStep(cpu, bus);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true); // (0x10 - 0x80) & 0xff = 0x90
  });

  it("CPX $50 compares X register", () => {
    const { bus, ram } = makeRamBus();
    ram[0x50] = 0x20;
    ram[0x0200] = 0xe4;
    ram[0x0201] = 0x50;
    const cpu = createCpu({ pc: 0x0200, x: 0x30 });
    cpuStep(cpu, bus);
    expect(cpu.x).toBe(0x30);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true); // 0x30 >= 0x20
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
  });

  it("CPY $50 compares Y register", () => {
    const { bus, ram } = makeRamBus();
    ram[0x50] = 0x46;
    ram[0x0200] = 0xc4;
    ram[0x0201] = 0x50;
    const cpu = createCpu({ pc: 0x0200, y: 0x46 });
    cpuStep(cpu, bus);
    expect(cpu.y).toBe(0x46);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
  });
});
