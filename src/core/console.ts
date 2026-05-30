/**
 * NES Console — CPU + Bus + PPU を wiring して step 実行する骨格。
 *
 * reset() で CPU を初期化し、step() で 1 CPU 命令を実行する。
 * PPU のスキャンライン描画・NMI は後の夜で追加する。
 */

import type { Cpu } from "./cpu/index.ts";
import { createCpu } from "./cpu/index.ts";
import { CpuFlags } from "./cpu/flags.ts";
import { cpuStep } from "./cpu/step.ts";
import type { Cart } from "./cart.ts";
import { NesBus } from "./nes-bus.ts";
import { Ppu } from "./ppu.ts";

export class NesConsole {
  readonly cpu: Cpu;
  readonly ppu: Ppu;
  readonly bus: NesBus;

  constructor(cart: Cart) {
    this.ppu = new Ppu();
    this.bus = new NesBus(this.ppu, cart);
    this.cpu = createCpu();
    this.reset();
  }

  /** RESET ベクタ ($FFFC/$FFFD) から PC を読み込む */
  reset(): void {
    const lo = this.bus.read(0xfffc);
    const hi = this.bus.read(0xfffd);
    this.cpu.pc = (hi << 8) | lo;
    this.cpu.sp = 0xfd;
    this.cpu.p = (this.cpu.p | CpuFlags.I) & 0xff;
    this.cpu.cycles = 7;
  }

  /** CPU 1 命令を実行し、消費 cycle 数を返す */
  step(): number {
    return cpuStep(this.cpu, this.bus);
  }
}
