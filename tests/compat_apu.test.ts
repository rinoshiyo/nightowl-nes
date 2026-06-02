/**
 * APU 互換性テスト — blargg apu_test rom_singles を使用。
 */

import { describe } from "vitest";
import { romTest } from "./helpers/run-test-rom.ts";

describe("APU 互換性: apu_test", () => {
  const base = "roms/test/apu_test/rom_singles";
  romTest("1-len_ctr", `${base}/1-len_ctr.nes`);
  romTest("2-len_table", `${base}/2-len_table.nes`);
  romTest("3-irq_flag", `${base}/3-irq_flag.nes`);
  romTest("4-jitter", `${base}/4-jitter.nes`);
  romTest("5-len_timing", `${base}/5-len_timing.nes`, 600, 60_000);
  romTest("6-irq_flag_timing", `${base}/6-irq_flag_timing.nes`);
  romTest("7-dmc_basics", `${base}/7-dmc_basics.nes`);
  romTest("8-dmc_rates", `${base}/8-dmc_rates.nes`);
});

describe("APU 互換性: apu_reset", () => {
  const base = "roms/test/apu_reset";
  romTest("4015_cleared", `${base}/4015_cleared.nes`);
  romTest("4017_timing", `${base}/4017_timing.nes`);
  // パワーオン時の $4017 write タイミングが cycle 精度で合わない (At power テスト)
  romTest.skip("4017_written", `${base}/4017_written.nes`);
  romTest("irq_flag_cleared", `${base}/irq_flag_cleared.nes`);
  // リセット後の length counter enable 状態の検証が実装と合わない
  romTest.skip("len_ctrs_enabled", `${base}/len_ctrs_enabled.nes`);
  romTest("works_immediately", `${base}/works_immediately.nes`);
});
