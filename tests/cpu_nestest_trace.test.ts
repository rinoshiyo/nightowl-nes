import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { Bus } from "../src/core/bus.ts";
import { parseINes } from "../src/core/cart.ts";
import { createCpu } from "../src/core/cpu/index.ts";
import { formatTrace } from "../src/core/cpu/nestest_trace.ts";
import { cpuStep } from "../src/core/cpu/step.ts";

const ROM_PATH = resolve(import.meta.dirname, "../roms/test/other/nestest.nes");
const LOG_PATH = resolve(import.meta.dirname, "../roms/test/other/nestest.log");

// STX absolute (opcode 0x8E) が nestest.log 802 行目で初出。 store 命令の absolute 版は
// 夜 7 のスコープなので、 夜 6 時点 (レジスタ転送 TAX/TAY/TXA/TYA/TSX/TXS まで) で到達
// できる 801 行目までを検証対象とする。
const TRACE_LINES = 801;

/**
 * nestest 実行用の最小 Bus。
 * - $0000-$1FFF: 2KB 内蔵 RAM (0x800 ミラー)
 * - $8000-$FFFF: PRG ROM (16KB を 0xC000 にもミラー)
 * その他の領域 (PPU/APU レジスタ等) は先頭 50 行では触れないため 0 を返す。
 */
function makeNestestBus(prgRom: Uint8Array): Bus {
  const ram = new Uint8Array(0x800);
  return {
    read(addr: number): number {
      if (addr < 0x2000) return ram[addr & 0x7ff] ?? 0;
      if (addr >= 0x8000) return prgRom[(addr - 0x8000) % prgRom.length] ?? 0;
      return 0;
    },
    write(addr: number, value: number): void {
      if (addr < 0x2000) ram[addr & 0x7ff] = value & 0xff;
      // ROM / 未対応領域への書き込みは無視
    },
  };
}

/** nestest.log 1 行から PC/A/X/Y/P/SP/CYC を抽出し formatTrace と同じ形式に整形 */
function parseLogLine(raw: string): string {
  const m = raw.match(
    /^([0-9A-F]{4}).*A:([0-9A-F]{2}) X:([0-9A-F]{2}) Y:([0-9A-F]{2}) P:([0-9A-F]{2}) SP:([0-9A-F]{2}).*CYC:(\d+)/,
  );
  if (m === null) throw new Error(`unparseable nestest.log line: ${raw}`);
  const [, pc, a, x, y, p, sp, cyc] = m;
  return `${pc} A:${a} X:${x} Y:${y} P:${p} SP:${sp} CYC:${cyc}`;
}

describe("cpu_nestest_trace", () => {
  it(`matches nestest.log first ${TRACE_LINES} lines (PC/A/X/Y/P/SP/CYC)`, () => {
    const cart = parseINes(new Uint8Array(readFileSync(ROM_PATH)));
    const bus = makeNestestBus(cart.prgRom);

    // nestest automated entry: PC=$C000, P=I|U(0x24), SP=$FD, reset 後 CYC=7
    const cpu = createCpu({ pc: 0xc000, cycles: 7 });

    const expected = readFileSync(LOG_PATH, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .slice(0, TRACE_LINES)
      .map(parseLogLine);

    for (let i = 0; i < expected.length; i++) {
      const want = expected[i] ?? "";
      // 各命令の「実行前」 状態を nestest.log の対応行と突き合わせる
      expect(formatTrace(cpu), `mismatch at log line ${i + 1}`).toBe(want);
      cpuStep(cpu, bus);
    }
  });
});
