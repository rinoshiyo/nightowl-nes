/**
 * NES Console — CPU + Bus + PPU を wiring し、CPU-PPU 同期で step 実行する。
 */

import type { Cpu } from "./cpu/index.ts";
import { createCpu } from "./cpu/index.ts";
import { CpuFlags } from "./cpu/flags.ts";
import { cpuStep } from "./cpu/step.ts";
import { Apu } from "./apu.ts";
import type { Cart } from "./cart.ts";
import { Controller } from "./controller.ts";
import type { Mapper } from "./mappers/index.ts";
import { createMapper } from "./mappers/index.ts";
import { NesBus } from "./nes-bus.ts";
import { Ppu } from "./ppu.ts";

const PPU_TICKS_PER_CPU_CYCLE = 3;

export class NesConsole {
  readonly cpu: Cpu;
  readonly ppu: Ppu;
  readonly bus: NesBus;
  readonly apu: Apu;
  readonly mapper: Mapper;
  readonly controller1: Controller;
  readonly controller2: Controller;

  constructor(cart: Cart) {
    this.mapper = createMapper(cart);
    this.ppu = new Ppu();
    this.ppu.mirroring = cart.header.fourScreen ? "four-screen" : cart.header.mirroring;
    this.ppu.mapper = this.mapper;
    this.apu = new Apu();
    this.controller1 = new Controller();
    this.controller2 = new Controller();
    this.bus = new NesBus(this.ppu, this.mapper, this.controller1, this.controller2, this.apu);
    this.apu.dmc.readSample = (addr) => this.bus.read(addr);
    this.cpu = createCpu();
    this.ppu.onNmi = () => {
      this.cpu.nmiPending = true;
    };
    this.apu.onIrq = () => {
      this.cpu.irqPending = true;
    };
    this.mapper.onMirroringChange = cart.header.fourScreen
      ? null
      : (m) => { this.ppu.mirroring = m; };
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
    this.cpu.nmiPending = false;
    this.cpu.irqPending = false;
    this.bus.dmaCycles = 0;
    this.apu.powerOn();
    this.apu.resetFilters();
    this.mapper.reset();
    this.ppu.reset();
  }

  /** CPU 1 命令を実行し、消費 cycle × 3 回 PPU を tick。消費 CPU cycle 数を返す */
  step(): number {
    const cycles = cpuStep(this.cpu, this.bus);
    let totalCycles = cycles;

    if (this.bus.dmaCycles > 0) {
      totalCycles += this.bus.dmaCycles;
      this.bus.dmaCycles = 0;
    }

    const ppuTicks = totalCycles * PPU_TICKS_PER_CPU_CYCLE;
    for (let i = 0; i < ppuTicks; i++) {
      this.ppu.tick();
    }
    for (let i = 0; i < totalCycles; i++) {
      this.apu.tick();
    }
    this.cpu.irqPending = this.apu.frameIrqFlag || this.apu.dmc.irqFlag || this.mapper.irqPending;
    return totalCycles;
  }

  /** 1 フレーム分実行 (frameComplete になるまで step を繰り返す) */
  stepFrame(): void {
    this.ppu.frameComplete = false;
    while (!this.ppu.frameComplete) {
      this.step();
    }
  }
}
