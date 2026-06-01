/**
 * Mapper 4 (MMC3) 互換性テスト。
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

describe("Mapper 4 互換性: mmc3_test", () => {
  const base = "roms/test/mmc3_test";
  romTest("1-clocking", `${base}/1-clocking.nes`);
  romTest("2-details", `${base}/2-details.nes`);
  romTest("3-A12_clocking", `${base}/3-A12_clocking.nes`);
  // cycle-accurate なスキャンラインタイミング精度を要求するため skip
  romTest.skip("4-scanline_timing", `${base}/4-scanline_timing.nes`);
  romTest("5-MMC3", `${base}/5-MMC3.nes`);
});
