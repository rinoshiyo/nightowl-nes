/**
 * Mapper 1 (MMC1) 互換性テスト — blargg テスト ROM を使用。
 * multi-bank テストは実行時間が長いため大きいタイムアウトを設定。
 */

import { describe, it, expect } from "vitest";
import { runTestRom } from "./helpers/run-test-rom.ts";
import { existsSync } from "node:fs";

function romTest(name: string, path: string, maxFrames = 600, timeout = 30_000) {
  const skip = !existsSync(path);
  (skip ? it.skip : it)(name, () => {
    const result = runTestRom(path, maxFrames);
    expect(result.passed, `status=${result.status}, message: ${result.message}`).toBe(true);
  }, timeout);
}

describe("Mapper 1 互換性: instr_test-v5 (official_only)", () => {
  const path = "roms/test/instr_test-v5/official_only.nes";
  romTest("official_only (全命令テスト)", path, 6000, 120_000);
});

describe("Mapper 1 互換性: blargg_nes_cpu_test5", () => {
  romTest("official (CPU テスト)", "roms/test/blargg_nes_cpu_test5/official.nes", 6000, 120_000);
});
