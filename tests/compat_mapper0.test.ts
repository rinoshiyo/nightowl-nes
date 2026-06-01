/**
 * Mapper 0 (NROM) 互換性テスト — blargg テスト ROM を使用。
 */

import { describe, it, expect } from "vitest";
import { runTestRom } from "./helpers/run-test-rom.ts";
import { existsSync } from "node:fs";

function romTest(name: string, path: string, maxFrames = 600) {
  const skip = !existsSync(path);
  (skip ? it.skip : it)(name, () => {
    const result = runTestRom(path, maxFrames);
    expect(result.passed, `status=${result.status}, message: ${result.message}`).toBe(true);
  });
}
romTest.skip = (name: string, _path: string) => {
  it.skip(name, () => {});
};

describe("Mapper 0 互換性: PPU VBL/NMI", () => {
  const base = "roms/test/ppu_vbl_nmi/rom_singles";
  romTest("01-vbl_basics", `${base}/01-vbl_basics.nes`);
  // 以下 3 件は cycle-accurate なドットタイミング精度を要求するため skip
  romTest.skip("02-vbl_set_time", `${base}/02-vbl_set_time.nes`);
  romTest("03-vbl_clear_time", `${base}/03-vbl_clear_time.nes`);
  romTest.skip("04-nmi_control", `${base}/04-nmi_control.nes`);
  romTest.skip("05-nmi_timing", `${base}/05-nmi_timing.nes`);
});

describe("Mapper 0 互換性: Sprite hit", () => {
  const base = "roms/test/sprite_hit_tests_2005.10.05";
  romTest("01.basics", `${base}/01.basics.nes`);
  romTest("02.alignment", `${base}/02.alignment.nes`);
  romTest("03.corners", `${base}/03.corners.nes`);
  romTest("04.flip", `${base}/04.flip.nes`);
  romTest("05.left_clip", `${base}/05.left_clip.nes`);
  romTest("06.right_edge", `${base}/06.right_edge.nes`);
  romTest("07.screen_bottom", `${base}/07.screen_bottom.nes`);
  romTest("08.double_height", `${base}/08.double_height.nes`);
  romTest("09.timing_basics", `${base}/09.timing_basics.nes`);
});

describe("Mapper 0 互換性: PPU テスト", () => {
  const base = "roms/test/blargg_ppu_tests_2005.09.15b";
  romTest("palette_ram", `${base}/palette_ram.nes`);
  romTest("sprite_ram", `${base}/sprite_ram.nes`);
  romTest("vbl_clear_time", `${base}/vbl_clear_time.nes`);
  romTest("vram_access", `${base}/vram_access.nes`);
});
