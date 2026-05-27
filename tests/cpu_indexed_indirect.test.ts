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

describe("LDA zeroPage (0xA5)", () => {
  it("loads from zero page and updates Z/N, consumes 3 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x10] = 0x42;
    ram[0x0200] = 0xa5; // LDA $10
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200 });

    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x42);
    expect(used).toBe(3);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("sets Z when loaded value is zero", () => {
    const { bus, ram } = makeRamBus();
    ram[0x10] = 0x00;
    ram[0x0200] = 0xa5;
    ram[0x0201] = 0x10;
    const cpu = createCpu({ pc: 0x0200, a: 0xff });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x00);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
  });
});

describe("(indirect,X) addressing mode", () => {
  it("LDA ($80,X) resolves pointer at zp[base+X] and consumes 6 cycles", () => {
    const { bus, ram } = makeRamBus();
    // X=2 → ptr=$82 → $82/$83 = $0300、 $0300 = $5B
    ram[0x82] = 0x00;
    ram[0x83] = 0x03;
    ram[0x0300] = 0x5b;
    ram[0x0200] = 0xa1; // LDA ($80,X)
    ram[0x0201] = 0x80;
    const cpu = createCpu({ pc: 0x0200, x: 0x02 });

    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x5b);
    expect(used).toBe(6);
  });

  it("wraps base+X within the zero page (base $FF + X $81 → ptr $80)", () => {
    const { bus, ram } = makeRamBus();
    // ($FF + $81) & 0xFF = $80 → $80/$81 = $0200、 $0200 = $5A
    ram[0x80] = 0x00;
    ram[0x81] = 0x02;
    ram[0x0200] = 0x5a;
    ram[0x0400] = 0xa1; // LDA ($FF,X)
    ram[0x0401] = 0xff;
    const cpu = createCpu({ pc: 0x0400, x: 0x81 });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x5a);
  });

  it("wraps the pointer high-byte fetch within the zero page (ptr $FF → hi at $00)", () => {
    const { bus, ram } = makeRamBus();
    // X=0 → ptr=$FF → lo=read($FF), hi=read($00) (← $100 ではない)
    ram[0xff] = 0x34;
    ram[0x00] = 0x12; // → 実効アドレス $1234
    ram[0x1234] = 0x77;
    ram[0x0500] = 0xa1; // LDA ($FF,X)
    ram[0x0501] = 0xff;
    const cpu = createCpu({ pc: 0x0500, x: 0x00 });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x77);
  });

  it("STA ($80,X) stores A at the resolved address", () => {
    const { bus, ram } = makeRamBus();
    ram[0x80] = 0x00;
    ram[0x81] = 0x06; // → $0600
    ram[0x0200] = 0x81; // STA ($80,X)
    ram[0x0201] = 0x80;
    const cpu = createCpu({ pc: 0x0200, x: 0x00, a: 0xab });

    const used = cpuStep(cpu, bus);
    expect(ram[0x0600]).toBe(0xab);
    expect(used).toBe(6);
  });

  it("ORA/AND/EOR ($80,X) apply logic against the resolved operand", () => {
    const cases: { op: number; init: number; mem: number; want: number }[] = [
      { op: 0x01, init: 0x55, mem: 0xaa, want: 0xff }, // ORA
      { op: 0x21, init: 0x55, mem: 0xf0, want: 0x50 }, // AND
      { op: 0x41, init: 0x5f, mem: 0xaa, want: 0xf5 }, // EOR
    ];
    for (const c of cases) {
      const { bus, ram } = makeRamBus();
      ram[0x80] = 0x00;
      ram[0x81] = 0x02; // → $0200
      ram[0x0200] = c.mem;
      ram[0x0300] = c.op;
      ram[0x0301] = 0x80;
      const cpu = createCpu({ pc: 0x0300, x: 0x00, a: c.init });

      const used = cpuStep(cpu, bus);
      expect(cpu.a, `opcode $${c.op.toString(16)}`).toBe(c.want);
      expect(used).toBe(6);
    }
  });

  it("ADC ($80,X) adds with carry and sets V on signed overflow", () => {
    const { bus, ram } = makeRamBus();
    ram[0x80] = 0x00;
    ram[0x81] = 0x02; // → $0200
    ram[0x0200] = 0x50;
    ram[0x0300] = 0x61; // ADC ($80,X)
    ram[0x0301] = 0x80;
    const cpu = createCpu({ pc: 0x0300, x: 0x00, a: 0x50 });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0xa0); // 0x50 + 0x50 = 0xA0
    expect(hasFlag(cpu.p, CpuFlags.V)).toBe(true); // 正 + 正 = 負
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(false);
  });

  it("SBC ($80,X) subtracts with borrow (carry set = no borrow)", () => {
    const { bus, ram } = makeRamBus();
    ram[0x80] = 0x00;
    ram[0x81] = 0x02; // → $0200
    ram[0x0200] = 0x30;
    ram[0x0300] = 0xe1; // SBC ($80,X)
    ram[0x0301] = 0x80;
    const cpu = createCpu({ pc: 0x0300, x: 0x00, a: 0x50, p: CpuFlags.I | CpuFlags.U | CpuFlags.C });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x20); // 0x50 - 0x30 = 0x20
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true); // borrow なし
  });

  it("CMP ($80,X) sets C/Z on equality without altering A", () => {
    const { bus, ram } = makeRamBus();
    ram[0x80] = 0x00;
    ram[0x81] = 0x02; // → $0200
    ram[0x0200] = 0x40;
    ram[0x0300] = 0xc1; // CMP ($80,X)
    ram[0x0301] = 0x80;
    const cpu = createCpu({ pc: 0x0300, x: 0x00, a: 0x40 });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x40); // CMP は A を変更しない
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true); // A == M
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true); // A >= M
  });
});
