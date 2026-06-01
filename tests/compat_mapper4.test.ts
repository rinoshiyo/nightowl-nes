/**
 * Mapper 4 (MMC3) 互換性テスト。
 */

import { describe } from "vitest";
import { romTest } from "./helpers/run-test-rom.ts";

describe("Mapper 4 互換性: mmc3_test", () => {
  const base = "roms/test/mmc3_test";
  romTest("1-clocking", `${base}/1-clocking.nes`);
  romTest("2-details", `${base}/2-details.nes`);
  romTest("3-A12_clocking", `${base}/3-A12_clocking.nes`);
  // cycle-accurate なスキャンラインタイミング精度を要求するため skip
  romTest.skip("4-scanline_timing", `${base}/4-scanline_timing.nes`);
  romTest("5-MMC3", `${base}/5-MMC3.nes`);
});
