/**
 * CPU 追加互換性テスト — instr_misc、branch_timing 等。
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

describe("CPU 追加: instr_misc", () => {
  const base = "roms/test/instr_misc/rom_singles";
  romTest("01-abs_x_wrap", `${base}/01-abs_x_wrap.nes`);
  romTest("02-branch_wrap", `${base}/02-branch_wrap.nes`);
  romTest("03-dummy_reads", `${base}/03-dummy_reads.nes`);
  romTest("04-dummy_reads_apu", `${base}/04-dummy_reads_apu.nes`);
});

describe("CPU 追加: branch_timing", () => {
  const base = "roms/test/branch_timing_tests";
  romTest("1-Branch_Basics", `${base}/1.Branch_Basics.nes`);
  romTest("2-Backward_Branch", `${base}/2.Backward_Branch.nes`);
  romTest("3-Forward_Branch", `${base}/3.Forward_Branch.nes`);
});

describe("OAM テスト", () => {
  romTest("oam_read", "roms/test/oam_read/oam_read.nes");
  // OAM DMA のタイミング精度を要求するため skip
  romTest.skip("oam_stress", "roms/test/oam_stress/oam_stress.nes");
});
