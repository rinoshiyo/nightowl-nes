/**
 * Mapper 1 (MMC1) 互換性テスト — blargg テスト ROM を使用。
 * multi-bank テストは実行時間が長いため大きいタイムアウトを設定。
 */

import { describe } from "vitest";
import { romTest } from "./helpers/run-test-rom.ts";

describe("Mapper 1 互換性: instr_test-v5 (official_only)", () => {
  const path = "roms/test/instr_test-v5/official_only.nes";
  romTest("official_only (全命令テスト)", path, 6000, 120_000);
});

describe("Mapper 1 互換性: blargg_nes_cpu_test5", () => {
  romTest("official (CPU テスト)", "roms/test/blargg_nes_cpu_test5/official.nes", 6000, 120_000);
});
