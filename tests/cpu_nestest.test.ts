import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { Bus } from "../src/core/bus.ts";
import { parseINes } from "../src/core/cart.ts";
import { createCpu } from "../src/core/cpu/index.ts";

const NESTEST_PATH = resolve(import.meta.dirname, "../roms/test/other/nestest.nes");

/**
 * NROM 用の最小 Bus 実装。
 * 16KB PRG を 0x8000-0xBFFF と 0xC000-0xFFFF にミラーマップする。
 * 書き込みは読み取り専用テストなので no-op。
 */
function makeRomBus(prgRom: Uint8Array): Bus {
  return {
    read(addr: number): number {
      if (addr >= 0x8000) {
        const offset = (addr - 0x8000) % prgRom.length;
        return prgRom[offset] ?? 0;
      }
      return 0;
    },
    write(_addr: number, _value: number): void {
      // 1 命令 fetch の検証用 Bus なので書き込みは無視
    },
  };
}

describe("cpu_nestest harness", () => {
  it("parses nestest.nes iNES header (NROM, 16KB PRG)", () => {
    const buf = new Uint8Array(readFileSync(NESTEST_PATH));
    const cart = parseINes(buf);
    expect(cart.header.mapper).toBe(0);
    expect(cart.header.prgRomSize).toBe(16 * 1024);
    expect(cart.header.chrRomSize).toBe(8 * 1024);
    expect(cart.prgRom.length).toBe(16 * 1024);
  });

  it("first instruction at $C000 is JMP absolute (0x4C $C5F5)", () => {
    // nestest automated entry point は $C000 で、 実機・nestest.log の事実は
    // 「4C F5 C5  JMP $C5F5」。 夜 1 md には LDX 0xA2 と書かれていたが
    // nestest.log と一致する 0x4C (JMP absolute) が正解なのでそちらに合わせる。
    const buf = new Uint8Array(readFileSync(NESTEST_PATH));
    const cart = parseINes(buf);
    const bus = makeRomBus(cart.prgRom);

    const cpu = createCpu({ pc: 0xc000 });

    const opcode = bus.read(cpu.pc);
    const lo = bus.read((cpu.pc + 1) & 0xffff);
    const hi = bus.read((cpu.pc + 2) & 0xffff);

    expect(opcode).toBe(0x4c);
    expect(lo).toBe(0xf5);
    expect(hi).toBe(0xc5);
  });
});
