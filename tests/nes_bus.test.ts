import { describe, expect, it } from "vitest";

import { Apu } from "../src/core/apu.ts";
import type { Cart } from "../src/core/cart.ts";
import { Controller } from "../src/core/controller.ts";
import { createMapper } from "../src/core/mappers/index.ts";
import { NesBus } from "../src/core/nes-bus.ts";
import { Ppu } from "../src/core/ppu.ts";

function makeDummyCart(prgSize = 0x4000): Cart {
  const prgRom = new Uint8Array(prgSize);
  prgRom[0] = 0xaa;
  prgRom[1] = 0xbb;
  const resetOffset = (0xfffc - 0x8000) % prgSize;
  prgRom[resetOffset] = 0xfc;
  prgRom[resetOffset + 1] = 0xc0;
  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: 0,
      mapper: 0,
      mirroring: "horizontal",
      hasBattery: false,
      hasTrainer: false,
      fourScreen: false,
    },
    prgRom,
    chrRom: new Uint8Array(0),
    trainer: null,
  };
}

describe("NesBus RAM", () => {
  it("$0000-$07FF に read/write できる", () => {
    const bus = new NesBus(new Ppu(), createMapper(makeDummyCart()), new Controller(), new Controller(), new Apu());
    bus.write(0x0000, 0x42);
    expect(bus.read(0x0000)).toBe(0x42);
    bus.write(0x07ff, 0xff);
    expect(bus.read(0x07ff)).toBe(0xff);
  });

  it("$0800-$1FFF は RAM ミラー", () => {
    const bus = new NesBus(new Ppu(), createMapper(makeDummyCart()), new Controller(), new Controller(), new Apu());
    bus.write(0x0000, 0x11);
    expect(bus.read(0x0800)).toBe(0x11);
    expect(bus.read(0x1000)).toBe(0x11);
    expect(bus.read(0x1800)).toBe(0x11);
  });

  it("ミラー経由の書き込みが元アドレスから読める", () => {
    const bus = new NesBus(new Ppu(), createMapper(makeDummyCart()), new Controller(), new Controller(), new Apu());
    bus.write(0x0800, 0x22);
    expect(bus.read(0x0000)).toBe(0x22);
    bus.write(0x1234, 0x33);
    expect(bus.read(0x0234)).toBe(0x33);
  });
});

describe("NesBus PPU dispatch", () => {
  it("$2000 write が PPU CTRL に反映される", () => {
    const ppu = new Ppu();
    const bus = new NesBus(ppu, createMapper(makeDummyCart()), new Controller(), new Controller(), new Apu());
    bus.write(0x2000, 0x90);
    expect(ppu.ctrl).toBe(0x90);
  });

  it("$2001 write が PPU MASK に反映される", () => {
    const ppu = new Ppu();
    const bus = new NesBus(ppu, createMapper(makeDummyCart()), new Controller(), new Controller(), new Apu());
    bus.write(0x2001, 0x1e);
    expect(ppu.mask).toBe(0x1e);
  });

  it("$2008-$3FFF は PPU ミラー ($2008 = $2000)", () => {
    const ppu = new Ppu();
    const bus = new NesBus(ppu, createMapper(makeDummyCart()), new Controller(), new Controller(), new Apu());
    bus.write(0x2008, 0xab);
    expect(ppu.ctrl).toBe(0xab);
    bus.write(0x3ff8, 0xcd);
    expect(ppu.ctrl).toBe(0xcd);
  });
});

describe("NesBus APU/IO", () => {
  it("$4000-$4017 write が受け付けられる", () => {
    const bus = new NesBus(new Ppu(), createMapper(makeDummyCart()), new Controller(), new Controller(), new Apu());
    // $4015 write で pulse2 enable → read はステータス (長さカウンタ 0 なので bit は立たない)
    bus.write(0x4015, 0x02);
    expect(bus.read(0x4015)).toBe(0x00);
  });

  it("$4018-$401F は 0 を返す", () => {
    const bus = new NesBus(new Ppu(), createMapper(makeDummyCart()), new Controller(), new Controller(), new Apu());
    expect(bus.read(0x4018)).toBe(0);
    expect(bus.read(0x401f)).toBe(0);
  });
});

describe("NesBus Cart", () => {
  it("$8000 から PRG ROM が読める", () => {
    const bus = new NesBus(new Ppu(), createMapper(makeDummyCart()), new Controller(), new Controller(), new Apu());
    expect(bus.read(0x8000)).toBe(0xaa);
    expect(bus.read(0x8001)).toBe(0xbb);
  });

  it("16KB PRG が $C000 にミラーされる", () => {
    const bus = new NesBus(new Ppu(), createMapper(makeDummyCart(0x4000)), new Controller(), new Controller(), new Apu());
    expect(bus.read(0xc000)).toBe(0xaa);
    expect(bus.read(0xc001)).toBe(0xbb);
  });

  it("RESET ベクタ ($FFFC/$FFFD) が読める", () => {
    const bus = new NesBus(new Ppu(), createMapper(makeDummyCart()), new Controller(), new Controller(), new Apu());
    expect(bus.read(0xfffc)).toBe(0xfc);
    expect(bus.read(0xfffd)).toBe(0xc0);
  });

  it("PPU write-only レジスタ ($2000) の read は open bus (IO latch)", () => {
    const ppu = new Ppu();
    const bus = new NesBus(ppu, createMapper(makeDummyCart()), new Controller(), new Controller(), new Apu());
    bus.write(0x2000, 0xab);
    expect(bus.read(0x2000)).toBe(0xab);
  });

  it("PPU $2002 read は open bus の下位 5 bit を含む", () => {
    const ppu = new Ppu();
    const bus = new NesBus(ppu, createMapper(makeDummyCart()), new Controller(), new Controller(), new Apu());
    bus.write(0x2000, 0x1f);
    ppu.status = 0xa0;
    const val = bus.read(0x2002);
    expect(val).toBe(0xbf);
  });

  it("PPU ミラー ($2008-$3FFF) 経由でも open bus が動作する", () => {
    const ppu = new Ppu();
    const bus = new NesBus(ppu, createMapper(makeDummyCart()), new Controller(), new Controller(), new Apu());
    bus.write(0x2008, 0x55);
    expect(bus.read(0x2008)).toBe(0x55);
  });
});
