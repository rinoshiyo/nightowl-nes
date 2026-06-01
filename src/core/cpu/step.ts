import type { Bus } from "../bus.ts";
import type { Cpu } from "./index.ts";
import { CpuFlags } from "./flags.ts";
import { OPCODES } from "./opcodes.ts";

const NMI_VECTOR = 0xfffa;
const IRQ_VECTOR = 0xfffe;
const NMI_CYCLES = 7;
const IRQ_CYCLES = 7;

/** NMI 割り込みを処理: PC と P をスタックに push し、NMI ベクタへジャンプ */
function handleNmi(cpu: Cpu, bus: Bus): number {
  cpu.nmiPending = false;
  const pc = cpu.pc;
  bus.write(0x0100 | cpu.sp, (pc >> 8) & 0xff);
  cpu.sp = (cpu.sp - 1) & 0xff;
  bus.write(0x0100 | cpu.sp, pc & 0xff);
  cpu.sp = (cpu.sp - 1) & 0xff;
  bus.write(0x0100 | cpu.sp, (cpu.p & ~CpuFlags.B) | CpuFlags.U);
  cpu.sp = (cpu.sp - 1) & 0xff;
  cpu.p |= CpuFlags.I;
  const lo = bus.read(NMI_VECTOR);
  const hi = bus.read(NMI_VECTOR + 1);
  cpu.pc = (hi << 8) | lo;
  cpu.cycles += NMI_CYCLES;
  return NMI_CYCLES;
}

/** IRQ 割り込みを処理: PC と P をスタックに push し、IRQ ベクタへジャンプ */
function handleIrq(cpu: Cpu, bus: Bus): number {
  const pc = cpu.pc;
  bus.write(0x0100 | cpu.sp, (pc >> 8) & 0xff);
  cpu.sp = (cpu.sp - 1) & 0xff;
  bus.write(0x0100 | cpu.sp, pc & 0xff);
  cpu.sp = (cpu.sp - 1) & 0xff;
  bus.write(0x0100 | cpu.sp, (cpu.p & ~CpuFlags.B) | CpuFlags.U);
  cpu.sp = (cpu.sp - 1) & 0xff;
  cpu.p |= CpuFlags.I;
  const lo = bus.read(IRQ_VECTOR);
  const hi = bus.read(IRQ_VECTOR + 1);
  cpu.pc = (hi << 8) | lo;
  cpu.cycles += IRQ_CYCLES;
  return IRQ_CYCLES;
}

/**
 * 1 命令を fetch → decode → execute し、 消費した CPU サイクル数を返す。
 * NMI 保留中は先に NMI を処理し、次に IRQ を確認する。
 */
export function cpuStep(cpu: Cpu, bus: Bus): number {
  if (cpu.nmiPending) {
    return handleNmi(cpu, bus);
  }
  if (cpu.irqPending && (cpu.p & CpuFlags.I) === 0) {
    return handleIrq(cpu, bus);
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
