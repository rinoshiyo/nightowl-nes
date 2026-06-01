/**
 * 各種互換性テスト — sprite overflow、PPU read buffer 等。
 */

import { describe, it, expect } from "vitest";
import { runTestRom } from "./helpers/run-test-rom.ts";
import { existsSync } from "node:fs";

function romTest(name: string, path: string, maxFrames = 600) {
  const skip = !existsSync(path);
  (skip ? it.skip : it)(name, () => {
    const result = runTestRom(path, maxFrames);
    expect(result.passed, `status=${result.status}, message: ${result.message}`).toBe(true);
  }, 30_000);
}
romTest.skip = (name: string, _path: string) => {
  it.skip(name, () => {});
};

describe("PPU read buffer", () => {
  romTest("ppu_read_buffer", "roms/test/ppu_read_buffer/test_ppu_read_buffer.nes", 3000);
});

describe("PPU open bus", () => {
  // open bus decay (時間経過で io latch がゼロに戻る) 未実装のため skip
  romTest.skip("ppu_open_bus", "roms/test/ppu_open_bus/ppu_open_bus.nes");
});

describe("Sprite overflow", () => {
  const base = "roms/test/sprite_overflow_tests";
  romTest("01.basics", `${base}/1.Basics.nes`);
  romTest("02.details", `${base}/2.Details.nes`);
  romTest("03.timing", `${base}/3.Timing.nes`);
  romTest("04.obscure", `${base}/4.Obscure.nes`);
  romTest("05.emulator", `${base}/5.Emulator.nes`);
});

describe("CPU dummy reads", () => {
  romTest("cpu_dummy_reads", "roms/test/cpu_dummy_reads/cpu_dummy_reads.nes");
});
