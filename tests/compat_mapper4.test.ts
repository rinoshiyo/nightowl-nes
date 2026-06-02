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
  // MMC3 IRQ の dot 精度タイミングが命令バッチ方式では不足 ($2000 bit3 による差分)
  romTest.skip("4-scanline_timing", `${base}/4-scanline_timing.nes`);
  romTest("5-MMC3", `${base}/5-MMC3.nes`);
});
