/**
 * CPU 命令互換性テスト — blargg instr_test-v5 rom_singles を使用。
 */

import { describe } from "vitest";
import { romTest } from "./helpers/run-test-rom.ts";

describe("CPU 命令互換性: instr_test-v5", () => {
  const base = "roms/test/instr_test-v5/rom_singles";
  romTest("01-basics", `${base}/01-basics.nes`);
  romTest("02-implied", `${base}/02-implied.nes`);
  romTest("03-immediate", `${base}/03-immediate.nes`);
  romTest("04-zero_page", `${base}/04-zero_page.nes`);
  romTest("05-zp_xy", `${base}/05-zp_xy.nes`);
  romTest("06-absolute", `${base}/06-absolute.nes`);
  romTest("07-abs_xy", `${base}/07-abs_xy.nes`);
  romTest("08-ind_x", `${base}/08-ind_x.nes`);
  romTest("09-ind_y", `${base}/09-ind_y.nes`);
  romTest("10-branches", `${base}/10-branches.nes`);
  romTest("11-stack", `${base}/11-stack.nes`);
  romTest("12-jmp_jsr", `${base}/12-jmp_jsr.nes`);
  romTest("13-rts", `${base}/13-rts.nes`);
  romTest("14-rti", `${base}/14-rti.nes`);
  romTest("15-brk", `${base}/15-brk.nes`);
  romTest("16-special", `${base}/16-special.nes`);
});
