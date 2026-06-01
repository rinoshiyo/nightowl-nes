import { describe, expect, it } from "vitest";

import type { Bus } from "../src/core/bus.ts";
import { createCpu } from "../src/core/cpu/index.ts";
import { CpuFlags, hasFlag } from "../src/core/cpu/flags.ts";
import { cpuStep } from "../src/core/cpu/step.ts";
import { Apu } from "../src/core/apu.ts";
import { NesConsole } from "../src/core/console.ts";
import type { Cart } from "../src/core/cart.ts";

function makeRamBus(): { bus: Bus; ram: Uint8Array } {
  const ram = new Uint8Array(0x10000);
  const bus: Bus = {
    read: (addr) => ram[addr & 0xffff] ?? 0,
    write: (addr, value) => {
      ram[addr & 0xffff] = value & 0xff;
    },
  };
  return { bus, ram };
}

function makeTestCart(prgRom?: Uint8Array): Cart {
  const rom = prgRom ?? new Uint8Array(0x8000);
  if (!prgRom) {
    rom[0x7ffc] = 0x00;
    rom[0x7ffd] = 0x80;
    rom[0x0000] = 0xea;
  }
  return {
    header: {
      prgRomSize: rom.length,
      chrRomSize: 0,
      mapper: 0,
      mirroring: "vertical",
      hasBattery: false,
      hasTrainer: false,
      fourScreen: false,
    },
    prgRom: rom,
    chrRom: new Uint8Array(0),
    trainer: null,
  };
}

describe("CPU IRQ ハンドリング", () => {
  it("IRQ ベクタ ($FFFE/$FFFF) から PC をロードする", () => {
    const { bus, ram } = makeRamBus();
    ram[0xfffe] = 0x34;
    ram[0xffff] = 0x12;
    const cpu = createCpu({ pc: 0x0200, sp: 0xfd, p: CpuFlags.U, irqPending: true });
    cpuStep(cpu, bus);
    expect(cpu.pc).toBe(0x1234);
  });

  it("PC (hi/lo) と P (B=0, U=1) をスタックに push する", () => {
    const { bus, ram } = makeRamBus();
    ram[0xfffe] = 0x00;
    ram[0xffff] = 0x04;
    const cpu = createCpu({
      pc: 0x0200,
      sp: 0xfd,
      p: CpuFlags.U | CpuFlags.C | CpuFlags.Z,
      irqPending: true,
    });
    cpuStep(cpu, bus);
    expect(ram[0x01fd]).toBe(0x02);
    expect(ram[0x01fc]).toBe(0x00);
    const pushed = ram[0x01fb]!;
    expect(pushed & CpuFlags.B).toBe(0);
    expect(pushed & CpuFlags.U).toBe(CpuFlags.U);
    expect(pushed & CpuFlags.C).toBe(CpuFlags.C);
    expect(pushed & CpuFlags.Z).toBe(CpuFlags.Z);
    expect(cpu.sp).toBe(0xfa);
  });

  it("I フラグをセットする", () => {
    const { bus, ram } = makeRamBus();
    ram[0xfffe] = 0x00;
    ram[0xffff] = 0x04;
    const cpu = createCpu({ pc: 0x0200, sp: 0xfd, p: CpuFlags.U, irqPending: true });
    expect(hasFlag(cpu.p, CpuFlags.I)).toBe(false);
    cpuStep(cpu, bus);
    expect(hasFlag(cpu.p, CpuFlags.I)).toBe(true);
  });

  it("7 CPU cycle 消費する", () => {
    const { bus, ram } = makeRamBus();
    ram[0xfffe] = 0x00;
    ram[0xffff] = 0x04;
    const cpu = createCpu({ pc: 0x0200, sp: 0xfd, p: CpuFlags.U, irqPending: true, cycles: 0 });
    const used = cpuStep(cpu, bus);
    expect(used).toBe(7);
    expect(cpu.cycles).toBe(7);
  });

  it("I フラグがセットされている時に IRQ がマスクされる", () => {
    const { bus, ram } = makeRamBus();
    ram[0x0200] = 0xea; // NOP
    ram[0xfffe] = 0x34;
    ram[0xffff] = 0x12;
    const cpu = createCpu({
      pc: 0x0200,
      sp: 0xfd,
      p: CpuFlags.U | CpuFlags.I,
      irqPending: true,
    });
    cpuStep(cpu, bus);
    expect(cpu.pc).toBe(0x0201);
  });

  it("I フラグがクリアの時に irqPending=true なら IRQ ハンドラが実行される", () => {
    const { bus, ram } = makeRamBus();
    ram[0xfffe] = 0x00;
    ram[0xffff] = 0x04;
    ram[0x0200] = 0xea; // NOP
    const cpu = createCpu({ pc: 0x0200, sp: 0xfd, p: CpuFlags.U, irqPending: true });
    cpuStep(cpu, bus);
    expect(cpu.pc).toBe(0x0400);
  });

  it("irqPending は IRQ ハンドラ実行時にクリアされない (レベルトリガ)", () => {
    const { bus, ram } = makeRamBus();
    ram[0xfffe] = 0x00;
    ram[0xffff] = 0x04;
    const cpu = createCpu({ pc: 0x0200, sp: 0xfd, p: CpuFlags.U, irqPending: true });
    cpuStep(cpu, bus);
    expect(cpu.irqPending).toBe(true);
  });

  it("NMI が IRQ より優先される", () => {
    const { bus, ram } = makeRamBus();
    ram[0xfffa] = 0xaa;
    ram[0xfffb] = 0xbb;
    ram[0xfffe] = 0x34;
    ram[0xffff] = 0x12;
    const cpu = createCpu({
      pc: 0x0200,
      sp: 0xfd,
      p: CpuFlags.U,
      irqPending: true,
      nmiPending: true,
    });
    cpuStep(cpu, bus);
    expect(cpu.pc).toBe(0xbbaa);
    expect(cpu.nmiPending).toBe(false);
    expect(cpu.irqPending).toBe(true);
  });

  it("CLI 後に IRQ がペンディングなら次命令で IRQ が発火する", () => {
    const { bus, ram } = makeRamBus();
    // $0200: CLI ($58)
    ram[0x0200] = 0x58;
    // $0201: NOP ($EA)
    ram[0x0201] = 0xea;
    ram[0xfffe] = 0x00;
    ram[0xffff] = 0x04;
    const cpu = createCpu({
      pc: 0x0200,
      sp: 0xfd,
      p: CpuFlags.U | CpuFlags.I,
      irqPending: true,
    });
    cpuStep(cpu, bus);
    expect(cpu.pc).toBe(0x0201);
    expect(hasFlag(cpu.p, CpuFlags.I)).toBe(false);

    cpuStep(cpu, bus);
    expect(cpu.pc).toBe(0x0400);
  });

  it("SEI で IRQ がマスクされる", () => {
    const { bus, ram } = makeRamBus();
    // $0200: SEI ($78)
    ram[0x0200] = 0x78;
    // $0201: NOP ($EA)
    ram[0x0201] = 0xea;
    ram[0xfffe] = 0x34;
    ram[0xffff] = 0x12;
    const cpu = createCpu({
      pc: 0x0200,
      sp: 0xfd,
      p: CpuFlags.U,
      irqPending: false,
    });
    cpuStep(cpu, bus);
    expect(hasFlag(cpu.p, CpuFlags.I)).toBe(true);

    cpu.irqPending = true;
    cpuStep(cpu, bus);
    expect(cpu.pc).toBe(0x0202);
  });

  it("RTI で P が復元され I がクリアされていれば IRQ が発火可能になる", () => {
    const { bus, ram } = makeRamBus();
    // スタックに RTI 用のデータを準備: P(I=0), PCL, PCH
    ram[0x01fb] = CpuFlags.U;
    ram[0x01fc] = 0x00;
    ram[0x01fd] = 0x03;
    // $0200: RTI ($40)
    ram[0x0200] = 0x40;
    ram[0xfffe] = 0x00;
    ram[0xffff] = 0x05;
    const cpu = createCpu({
      pc: 0x0200,
      sp: 0xfa,
      p: CpuFlags.U | CpuFlags.I,
      irqPending: true,
    });
    cpuStep(cpu, bus);
    expect(cpu.pc).toBe(0x0300);
    expect(hasFlag(cpu.p, CpuFlags.I)).toBe(false);

    cpuStep(cpu, bus);
    expect(cpu.pc).toBe(0x0500);
  });
});

describe("APU IRQ 伝達", () => {
  it("Apu に onIrq コールバックが存在する", () => {
    const apu = new Apu();
    let called = false;
    apu.onIrq = () => {
      called = true;
    };
    apu["frameIrqInhibit"] = false;
    apu["frameMode"] = 0;
    apu["frameStep"] = 3;
    apu["frameCycle"] = 29828;
    apu.tick();
    expect(called).toBe(true);
  });

  it("DMC の irqFlag セット時に onIrq が呼ばれる", () => {
    const apu = new Apu();
    let called = false;
    apu.onIrq = () => {
      called = true;
    };
    apu.dmc.writeControl(0x80);
    apu.dmc.writeAddress(0x00);
    apu.dmc.writeLength(0x00);
    apu.dmc["bytesRemaining"] = 1;
    apu.dmc["bitsRemaining"] = 0;
    apu.dmc.timerValue = 1;
    apu.dmc.readSample = () => 0;
    while (!called && apu.dmc.timerValue > 0) {
      apu.dmc.tickTimer();
    }
    apu.dmc.tickTimer();
    expect(apu.dmc.irqFlag).toBe(true);
    expect(called).toBe(true);
  });
});

describe("NesConsole IRQ 接続", () => {
  it("apu.onIrq が CPU の irqPending をセットする", () => {
    const cart = makeTestCart();
    const nes = new NesConsole(cart);
    expect(nes.cpu.irqPending).toBe(false);
    nes.apu.onIrq!();
    expect(nes.cpu.irqPending).toBe(true);
  });

  it("step() 末尾で IRQ ソースから irqPending が再評価される", () => {
    const cart = makeTestCart();
    const nes = new NesConsole(cart);
    nes.cpu.irqPending = true;
    nes.apu.frameIrqFlag = false;
    nes.apu.dmc.irqFlag = false;
    nes.step();
    expect(nes.cpu.irqPending).toBe(false);
  });

  it("IRQ ソースがクリアされると irqPending が false になる", () => {
    const cart = makeTestCart();
    const nes = new NesConsole(cart);
    nes.apu.frameIrqFlag = true;
    nes.cpu.irqPending = true;
    nes.apu.frameIrqFlag = false;
    nes.step();
    expect(nes.cpu.irqPending).toBe(false);
  });

  it("reset() で cpu.irqPending が false にクリアされる", () => {
    const cart = makeTestCart();
    const nes = new NesConsole(cart);
    nes.cpu.irqPending = true;
    nes.reset();
    expect(nes.cpu.irqPending).toBe(false);
  });

  it("reset() で APU の frameIrqFlag が false にクリアされる", () => {
    const cart = makeTestCart();
    const nes = new NesConsole(cart);
    nes.apu.frameIrqFlag = true;
    nes.reset();
    expect(nes.apu.frameIrqFlag).toBe(false);
  });

  it("$4015 読み出しでフレーム IRQ フラグがクリアされ step() 末尾の再評価で irqPending も落ちる", () => {
    const prgRom = new Uint8Array(0x8000);
    prgRom[0x7ffc] = 0x00;
    prgRom[0x7ffd] = 0x80;
    // $8000: LDA $4015 (AD 15 40)
    prgRom[0x0000] = 0xad;
    prgRom[0x0001] = 0x15;
    prgRom[0x0002] = 0x40;
    const cart = makeTestCart(prgRom);
    const nes = new NesConsole(cart);
    nes.apu.frameIrqFlag = true;
    nes.cpu.irqPending = true;
    nes.cpu.p |= CpuFlags.I;
    nes.step();
    expect(nes.apu.frameIrqFlag).toBe(false);
    expect(nes.cpu.irqPending).toBe(false);
  });
});
