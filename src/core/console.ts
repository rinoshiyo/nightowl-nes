/**
 * NES Console — CPU + Bus + PPU を wiring し、CPU-PPU 同期で step 実行する。
 */

import type { Cpu } from "./cpu/index.ts";
import { createCpu, serializeCpu } from "./cpu/index.ts";
import { CpuFlags } from "./cpu/flags.ts";
import { cpuStep } from "./cpu/step.ts";
import { Apu } from "./apu.ts";
import type { Cart } from "./cart.ts";
import { Controller } from "./controller.ts";
import type { Mapper } from "./mappers/index.ts";
import { createMapper } from "./mappers/index.ts";
import { NesBus } from "./nes-bus.ts";
import { Ppu } from "./ppu.ts";
import type { NesState } from "./state.ts";
import { STATE_VERSION } from "./state.ts";

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
    if (this.mapper.audioOutput) {
      this.apu.expansionAudioCallback = () => this.mapper.audioOutput!();
    }
    if ("ciram" in this.mapper) {
      (this.mapper as { ciram: Uint8Array }).ciram = this.ppu.vram;
    }
    this.apu.powerOn();
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
    this.cpu.halted = false;
    this.bus.dmaCycles = 0;
    this.apu.reset();
    this.apu.resetFilters();
    this.mapper.reset();
    this.ppu.reset();
  }

  /** CPU 1 命令を実行し、消費 cycle × 3 回 PPU を tick。消費 CPU cycle 数を返す */
  step(): number {
    const cycles = cpuStep(this.cpu, this.bus);
    let totalCycles = cycles;

    const dma = this.bus.dmaCycles;
    if (dma > 0) {
      totalCycles += dma;
      this.bus.dmaCycles = 0;
    }

    const dmcStall = this.apu.dmc.stallCycles;
    if (dmcStall > 0) {
      totalCycles += dmcStall;
      this.apu.dmc.stallCycles = 0;
    }

    const ppu = this.ppu;
    const apu = this.apu;
    const ppuTicks = totalCycles * PPU_TICKS_PER_CPU_CYCLE;
    for (let i = 0; i < ppuTicks; i++) {
      ppu.tick();
    }
    for (let i = 0; i < totalCycles; i++) {
      apu.tick();
    }
    const mapper = this.mapper;
    if (mapper.cpuCycleTick) {
      for (let i = 0; i < totalCycles; i++) {
        mapper.cpuCycleTick();
      }
    }
    this.cpu.irqPending = apu.frameIrqFlag || apu.dmc.irqFlag || mapper.irqPending;

    // $2000 書き込みによる遅延 NMI (次の命令完了後に発火)
    if (ppu.nmiDelay > 0) {
      ppu.nmiDelay--;
      if (ppu.nmiDelay === 0 && (ppu.ctrl & 0x80) !== 0 && (ppu.status & 0x80) !== 0) {
        this.cpu.nmiPending = true;
      }
    }

    return totalCycles;
  }

  /** 1 フレーム分実行 (frameComplete になるまで step を繰り返す) */
  stepFrame(): void {
    const ppu = this.ppu;
    ppu.frameComplete = false;
    while (!ppu.frameComplete) {
      this.step();
    }
    ppu.decayOpenBus();
  }

  saveState(): NesState {
    return {
      version: STATE_VERSION,
      cpu: serializeCpu(this.cpu),
      ppu: this.ppu.serialize(),
      apu: this.apu.serialize(),
      bus: this.bus.serialize(),
      mapper: {
        id: this.mapper.mapperId(),
        data: this.mapper.serializeMapper(),
      },
    };
  }

  loadState(state: NesState): void {
    if (state.version !== STATE_VERSION) {
      throw new Error(`ステートバージョン不一致: 期待=${STATE_VERSION}, 実際=${state.version}`);
    }
    if (state.mapper.id !== this.mapper.mapperId()) {
      throw new Error(`Mapper 不一致: 期待=${this.mapper.mapperId()}, 実際=${state.mapper.id}`);
    }
    Object.assign(this.cpu, state.cpu);
    this.ppu.deserialize(state.ppu);
    this.apu.deserialize(state.apu);
    this.bus.deserialize(state.bus);
    this.mapper.deserializeMapper(state.mapper.data);
  }
}
