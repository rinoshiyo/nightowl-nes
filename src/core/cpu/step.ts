import type { Bus } from "../bus.ts";
import type { Cpu } from "./index.ts";
import { CpuFlags } from "./flags.ts";
import { OPCODES } from "./opcodes.ts";

const NMI_VECTOR = 0xfffa;
const IRQ_VECTOR = 0xfffe;
const INTERRUPT_CYCLES = 7;

/** 割り込み共通処理: PC と P をスタックに push し、指定ベクタへジャンプ */
function handleInterrupt(cpu: Cpu, bus: Bus, vector: number): number {
  const pc = cpu.pc;
  bus.write(0x0100 | cpu.sp, (pc >> 8) & 0xff);
  cpu.sp = (cpu.sp - 1) & 0xff;
  bus.write(0x0100 | cpu.sp, pc & 0xff);
  cpu.sp = (cpu.sp - 1) & 0xff;
  bus.write(0x0100 | cpu.sp, (cpu.p & ~CpuFlags.B) | CpuFlags.U);
  cpu.sp = (cpu.sp - 1) & 0xff;
  cpu.p |= CpuFlags.I;
  const lo = bus.read(vector);
  const hi = bus.read(vector + 1);
  cpu.pc = (hi << 8) | lo;
  cpu.cycles += INTERRUPT_CYCLES;
  return INTERRUPT_CYCLES;
}

/**
 * 1 命令を fetch → decode → execute し、 消費した CPU サイクル数を返す。
 * NMI 保留中は先に NMI を処理し、次に IRQ を確認する。
 */
export function cpuStep(cpu: Cpu, bus: Bus): number {
  if (cpu.halted) {
    cpu.cycles += 1;
    return 1;
  }
  if (cpu.nmiPending) {
    cpu.nmiPending = false;
    return handleInterrupt(cpu, bus, NMI_VECTOR);
  }
  if (cpu.irqPending && (cpu.p & CpuFlags.I) === 0) {
    return handleInterrupt(cpu, bus, IRQ_VECTOR);
  }

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
