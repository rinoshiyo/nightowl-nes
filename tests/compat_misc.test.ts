/**
 * 各種互換性テスト — sprite overflow、PPU read buffer 等。
 */

import { describe } from "vitest";
import { romTest } from "./helpers/run-test-rom.ts";

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
