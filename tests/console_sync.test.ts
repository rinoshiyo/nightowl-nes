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
