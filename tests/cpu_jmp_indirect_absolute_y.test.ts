import { describe, expect, it } from "vitest";

import type { Bus } from "../src/core/bus.ts";
import { createCpu } from "../src/core/cpu/index.ts";
import { CpuFlags, hasFlag } from "../src/core/cpu/flags.ts";
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

describe("JMP indirect", () => {
  it("JMP ($0200) jumps to the address stored at $0200/$0201, consumes 5 cycles", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x78;
    ram[0x0201] = 0x56;
    ram[0x0100] = 0x6c; // JMP ($0200)
    ram[0x0101] = 0x00;
    ram[0x0102] = 0x02;
    const cpu = createCpu({ pc: 0x0100 });

    const used = cpuStep(cpu, bus);
    expect(cpu.pc).toBe(0x5678);
    expect(used).toBe(5);
  });

  it("page boundary bug: JMP ($02FF) reads hi from $0200 instead of $0300", () => {
    const { bus, ram } = makeRamBus();
    ram[0x02ff] = 0x34;
    ram[0x0200] = 0x12; // バグ: $0300 でなく $0200 から hi を読む
    ram[0x0300] = 0xff; // 正しい実装ならここを読まない
    ram[0x0100] = 0x6c; // JMP ($02FF)
    ram[0x0101] = 0xff;
    ram[0x0102] = 0x02;
    const cpu = createCpu({ pc: 0x0100 });

    const used = cpuStep(cpu, bus);
    expect(cpu.pc).toBe(0x1234);
    expect(used).toBe(5);
  });

  it("JMP ($0000) reads from page zero boundary correctly", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0000] = 0xcd;
    ram[0x0001] = 0xab;
    ram[0x0100] = 0x6c;
    ram[0x0101] = 0x00;
    ram[0x0102] = 0x00;
    const cpu = createCpu({ pc: 0x0100 });

    const used = cpuStep(cpu, bus);
    expect(cpu.pc).toBe(0xabcd);
    expect(used).toBe(5);
  });
});

describe("absolute,Y addressing mode", () => {
  it("LDA $0400,Y loads from base+Y, 4 cycles (no page cross)", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0405] = 0x77;
    ram[0x0200] = 0xb9; // LDA $0400,Y
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, y: 0x05 });

    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x77);
    expect(used).toBe(4);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("LDA abs,Y adds +1 cycle on page cross", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0500] = 0xaa; // $04FF + $01 = $0500 (page cross)
    ram[0x0200] = 0xb9;
    ram[0x0201] = 0xff;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, y: 0x01 });

    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0xaa);
    expect(used).toBe(5); // 4 + 1 page cross
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });

  it("LDA abs,Y sets Z flag for zero value", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0400] = 0x00;
    ram[0x0200] = 0xb9;
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, y: 0x00 });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("ORA $0400,Y performs bitwise OR", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0400] = 0x0f;
    ram[0x0200] = 0x19; // ORA $0400,Y
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, a: 0xf0, y: 0x00 });

    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0xff);
    expect(used).toBe(4);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
  });

  it("AND $0400,Y performs bitwise AND", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0400] = 0x0f;
    ram[0x0200] = 0x39; // AND $0400,Y
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, a: 0x3c, y: 0x00 });

    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x0c);
    expect(used).toBe(4);
  });

  it("EOR $0400,Y performs bitwise XOR", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0400] = 0xff;
    ram[0x0200] = 0x59; // EOR $0400,Y
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, a: 0xaa, y: 0x00 });

    const used = cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x55);
    expect(used).toBe(4);
  });

  it("ADC $0400,Y adds with carry and sets C/V flags", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0400] = 0x7f;
    ram[0x0200] = 0x79; // ADC $0400,Y
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, a: 0x01, y: 0x00 });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x80);
    expect(hasFlag(cpu.p, CpuFlags.V)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(false);
  });

  it("SBC $0400,Y subtracts with borrow", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0400] = 0x01;
    ram[0x0200] = 0xf9; // SBC $0400,Y
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, a: 0x50, y: 0x00, p: CpuFlags.C | 0x20 });

    cpuStep(cpu, bus);
    expect(cpu.a).toBe(0x4f);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
  });

  it("CMP $0400,Y compares A with memory (A > M)", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0400] = 0x30;
    ram[0x0200] = 0xd9; // CMP $0400,Y
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, a: 0x40, y: 0x00 });

    cpuStep(cpu, bus);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(false);
    expect(hasFlag(cpu.p, CpuFlags.N)).toBe(false);
  });

  it("CMP $0400,Y sets Z when A == M", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0400] = 0x40;
    ram[0x0200] = 0xd9;
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, a: 0x40, y: 0x00 });

    cpuStep(cpu, bus);
    expect(hasFlag(cpu.p, CpuFlags.C)).toBe(true);
    expect(hasFlag(cpu.p, CpuFlags.Z)).toBe(true);
  });

  it("STA $0400,Y writes A to base+Y, 5 cycles fixed (no page cross penalty)", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x99; // STA $0400,Y
    ram[0x0201] = 0x00;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, a: 0xcd, y: 0x10 });

    const used = cpuStep(cpu, bus);
    expect(ram[0x0410]).toBe(0xcd);
    expect(used).toBe(5);
  });

  it("STA abs,Y does not add cycle on page cross (fixed 5 cycles)", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0x99; // STA $04FF,Y
    ram[0x0201] = 0xff;
    ram[0x0202] = 0x04;
    const cpu = createCpu({ pc: 0x0200, a: 0xef, y: 0x01 });

    const used = cpuStep(cpu, bus);
    expect(ram[0x0500]).toBe(0xef); // $04FF + $01 = $0500
    expect(used).toBe(5); // page cross でも 5 cycle 固定
  });

  it("LDA abs,Y with Y=0xFF wraps address within 16-bit space", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0033] = 0xbb;
    ram[0x0200] = 0xb9; // LDA $FF34,Y
    ram[0x0201] = 0x34;
    ram[0x0202] = 0xff;
    const cpu = createCpu({ pc: 0x0200, y: 0xff });

    cpuStep(cpu, bus);
    // $FF34 + $FF = $10033 → $0033 (16-bit wrap)
    expect(cpu.a).toBe(0xbb);
  });
});
