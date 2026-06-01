import { describe, expect, it } from "vitest";
import { NesConsole } from "../src/core/console.ts";
import type { Cart } from "../src/core/cart.ts";

function makeTestCart(prgRom?: Uint8Array): Cart {
  const rom = prgRom ?? new Uint8Array(0x8000);
  if (!prgRom) {
    rom[0x7ffc] = 0x00;
    rom[0x7ffd] = 0x80;
    rom[0x0000] = 0xea;
    rom[0x0001] = 0xea;
    rom[0x0002] = 0xea;
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

describe("NesConsole APU フレームカウンタ IRQ 連携", () => {
  it("APU onIrq コールバックが CPU irqPending をセットする", () => {
    const cart = makeTestCart();
    const nes = new NesConsole(cart);

    expect(nes.cpu.irqPending).toBe(false);
    nes.apu.onIrq!();
    expect(nes.cpu.irqPending).toBe(true);
  });

  it("step() 後に frameIrqFlag が irqPending に反映される", () => {
    const cart = makeTestCart();
    const nes = new NesConsole(cart);

    nes.apu.frameIrqFlag = true;
    nes.step();
    expect(nes.cpu.irqPending).toBe(true);
  });

  it("frameIrqFlag がクリアされると irqPending も落ちる", () => {
    const cart = makeTestCart();
    const nes = new NesConsole(cart);

    nes.apu.frameIrqFlag = true;
    nes.step();
    expect(nes.cpu.irqPending).toBe(true);

    nes.apu.frameIrqFlag = false;
    nes.apu.dmc.irqFlag = false;
    nes.step();
    expect(nes.cpu.irqPending).toBe(false);
  });

  it("reset() で frameIrqFlag と dmc.irqFlag がクリアされる", () => {
    const cart = makeTestCart();
    const nes = new NesConsole(cart);

    nes.apu.frameIrqFlag = true;
    nes.apu.dmc.irqFlag = true;
    nes.reset();
    expect(nes.apu.frameIrqFlag).toBe(false);
    expect(nes.apu.dmc.irqFlag).toBe(false);
  });
});

describe("NesConsole CPU-PPU 同期", () => {
  it("step() が CPU cycle × 3 回 PPU を tick する", () => {
    const cart = makeTestCart();
    const nes = new NesConsole(cart);

    const ppuDotBefore = nes.ppu.dot;
    const ppuLineBefore = nes.ppu.scanline;
    const ppuTotal = ppuLineBefore * 341 + ppuDotBefore;

    const cycles = nes.step();
    const ppuTotalAfter = nes.ppu.scanline * 341 + nes.ppu.dot;

    expect(ppuTotalAfter - ppuTotal).toBe(cycles * 3);
  });

  it("PPU NMI → CPU nmiPending がセットされる", () => {
    const cart = makeTestCart();
    const nes = new NesConsole(cart);

    nes.ppu.ctrl = 0x80;
    expect(nes.cpu.nmiPending).toBe(false);

    nes.ppu.onNmi!();
    expect(nes.cpu.nmiPending).toBe(true);
  });

  it("mapper.onMirroringChange → PPU mirroring に反映される", () => {
    const cart = makeTestCart();
    const nes = new NesConsole(cart);
    expect(nes.ppu.mirroring).toBe("vertical"); // 初期値

    // mapper 経由で mirroring 変更を通知
    nes.mapper.onMirroringChange!("horizontal");
    expect(nes.ppu.mirroring).toBe("horizontal");

    nes.mapper.onMirroringChange!("single-lower");
    expect(nes.ppu.mirroring).toBe("single-lower");

    nes.mapper.onMirroringChange!("single-upper");
    expect(nes.ppu.mirroring).toBe("single-upper");
  });

  it("fourScreen カートでは onMirroringChange が null になる", () => {
    const cart: Cart = {
      header: {
        prgRomSize: 0x8000, chrRomSize: 0, mapper: 0,
        mirroring: "vertical", hasBattery: false, hasTrainer: false,
        fourScreen: true,
      },
      prgRom: (() => { const r = new Uint8Array(0x8000); r[0x7ffc] = 0x00; r[0x7ffd] = 0x80; r[0] = 0xea; return r; })(),
      chrRom: new Uint8Array(0),
      trainer: null,
    };
    const nes = new NesConsole(cart);
    expect(nes.ppu.mirroring).toBe("four-screen");
    expect(nes.mapper.onMirroringChange).toBeNull();
  });

  it("AxROM (mapper 7) の writePrg で PPU ミラーリングが切り替わる", () => {
    const prgRom = new Uint8Array(0x8000 * 4);
    prgRom[0x7ffc] = 0x00;
    prgRom[0x7ffd] = 0x80;
    prgRom[0x0000] = 0xea;
    const cart: Cart = {
      header: {
        prgRomSize: prgRom.length,
        chrRomSize: 0,
        mapper: 7,
        mirroring: "vertical",
        hasBattery: false,
        hasTrainer: false,
        fourScreen: false,
      },
      prgRom,
      chrRom: new Uint8Array(0),
      trainer: null,
    };
    const nes = new NesConsole(cart);

    nes.mapper.writePrg(0x8000, 0x00);
    expect(nes.ppu.mirroring).toBe("single-lower");

    nes.mapper.writePrg(0x8000, 0x10);
    expect(nes.ppu.mirroring).toBe("single-upper");

    nes.mapper.writePrg(0x8000, 0x02);
    expect(nes.ppu.mirroring).toBe("single-lower");
  });

  it("stepFrame() で 1 フレーム分実行される", () => {
    const prgRom = new Uint8Array(0x8000);
    prgRom.fill(0xea);

    prgRom[0x0000] = 0x4c;
    prgRom[0x0001] = 0x00;
    prgRom[0x0002] = 0x80;

    prgRom[0x7ffc] = 0x00;
    prgRom[0x7ffd] = 0x80;

    const nmiAddr = 0x8100;
    prgRom[0x7ffa] = nmiAddr & 0xff;
    prgRom[0x7ffb] = (nmiAddr >> 8) & 0xff;
    prgRom[nmiAddr - 0x8000] = 0x40;

    const cart = makeTestCart(prgRom);
    const nes = new NesConsole(cart);
    nes.ppu.ctrl = 0x80;

    nes.stepFrame();
    expect(nes.ppu.frameComplete).toBe(true);
  });
});
