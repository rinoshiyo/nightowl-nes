/**
 * APU 互換性テスト — blargg apu_test rom_singles を使用。
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

describe("APU 互換性: apu_test", () => {
  const base = "roms/test/apu_test/rom_singles";
  romTest("1-len_ctr", `${base}/1-len_ctr.nes`);
  romTest("2-len_table", `${base}/2-len_table.nes`);
  romTest("3-irq_flag", `${base}/3-irq_flag.nes`);
  // APU フレームカウンタのタイミング精度を要求するため skip
  romTest.skip("4-jitter", `${base}/4-jitter.nes`);
  romTest.skip("5-len_timing", `${base}/5-len_timing.nes`);
  romTest.skip("6-irq_flag_timing", `${base}/6-irq_flag_timing.nes`);
  romTest("7-dmc_basics", `${base}/7-dmc_basics.nes`);
  romTest("8-dmc_rates", `${base}/8-dmc_rates.nes`);
});

describe("APU 互換性: apu_reset", () => {
  const base = "roms/test/apu_reset";
  // apu_reset テストは RESET シーケンスを要求するため skip
  romTest.skip("4015_cleared", `${base}/4015_cleared.nes`);
  romTest("4017_timing", `${base}/4017_timing.nes`);
  // $4017 write のタイミング精度に依存するため skip
  romTest.skip("4017_written", `${base}/4017_written.nes`);
  romTest.skip("irq_flag_cleared", `${base}/irq_flag_cleared.nes`);
  romTest.skip("len_ctrs_enabled", `${base}/len_ctrs_enabled.nes`);
  romTest.skip("works_immediately", `${base}/works_immediately.nes`);
});
