import type { Cpu } from "./index.ts";

function hex(value: number, width: number): string {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

/**
 * CPU の現在状態を nestest.log と比較可能な 1 行文字列にフォーマットする。
 *
 * nestest.log の本来の行は
 *   `C000  4C F5 C5  JMP $C5F5  ... A:00 X:00 Y:00 P:24 SP:FD PPU:  0, 21 CYC:7`
 * だが、 夜 2 では opcode バイト列・逆アセンブル・PPU 列は検証対象にせず、
 * PC / A / X / Y / P / SP / CYC のみを比較する (これらが命令実行の正しさを担保する)。
 */
export function formatTrace(cpu: Cpu): string {
  return (
    `${hex(cpu.pc, 4)} ` +
    `A:${hex(cpu.a, 2)} X:${hex(cpu.x, 2)} Y:${hex(cpu.y, 2)} ` +
    `P:${hex(cpu.p, 2)} SP:${hex(cpu.sp, 2)} CYC:${cpu.cycles}`
  );
}
