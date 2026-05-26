import type { Bus } from "../bus.ts";
import type { Cpu } from "./index.ts";
import { OPCODES } from "./opcodes.ts";

/**
 * 1 命令を fetch → decode → execute し、 消費した CPU サイクル数を返す。
 * cpu の各レジスタ・cycles は破壊的に更新される。
 *
 * 未実装の opcode に当たった場合は throw する (どの命令が未対応か判別するため)。
 */
export function cpuStep(cpu: Cpu, bus: Bus): number {
  const opcode = bus.read(cpu.pc);
  cpu.pc = (cpu.pc + 1) & 0xffff;

  const inst = OPCODES[opcode];
  if (inst == null) {
    const hex = opcode.toString(16).toUpperCase().padStart(2, "0");
    throw new Error(`cpuStep: unimplemented opcode $${hex}`);
  }

  const op = inst.mode(cpu, bus);
  const extra = inst.exec(cpu, bus, op);
  const used = inst.cycles + extra;
  cpu.cycles += used;
  return used;
}
