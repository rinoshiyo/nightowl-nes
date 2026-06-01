import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperMmc1 } from "../src/core/mappers/mmc1.ts";
import { MapperMmc3 } from "../src/core/mappers/mmc3.ts";
import { MapperNrom } from "../src/core/mappers/nrom.ts";
import { MapperUxrom } from "../src/core/mappers/uxrom.ts";
import { MapperCnrom } from "../src/core/mappers/cnrom.ts";
import { NesBus } from "../src/core/nes-bus.ts";
import { Ppu } from "../src/core/ppu.ts";
import { Controller } from "../src/core/controller.ts";
import { Apu } from "../src/core/apu.ts";

function makeCart(mapper: number, opts: { hasBattery?: boolean } = {}): Cart {
  const prgRom = new Uint8Array(0x8000);
  prgRom[0x7ffc] = 0x00;
  prgRom[0x7ffd] = 0x80;
  return {
    header: {
      prgRomSize: prgRom.length,
      chrRomSize: 0,
      mapper,
      mirroring: "horizontal",
      hasBattery: opts.hasBattery ?? false,
      hasTrainer: false,
      fourScreen: false,
    },
    prgRom,
    chrRom: new Uint8Array(0),
    trainer: null,
  };
}

describe("PRG RAM — MMC1", () => {
  it("$6000-$7FFF の read/write が機能する", () => {
    const mapper = new MapperMmc1(makeCart(1));
    mapper.writePrgRam(0x6000, 0x42);
    mapper.writePrgRam(0x7fff, 0xab);
    expect(mapper.readPrgRam(0x6000)).toBe(0x42);
    expect(mapper.readPrgRam(0x7fff)).toBe(0xab);
  });

  it("8KB 全域に書き込み/読み出しができる", () => {
    const mapper = new MapperMmc1(makeCart(1));
    for (let i = 0; i < 0x2000; i++) {
      mapper.writePrgRam(0x6000 + i, i & 0xff);
    }
    for (let i = 0; i < 0x2000; i++) {
      expect(mapper.readPrgRam(0x6000 + i)).toBe(i & 0xff);
    }
  });

  it("getPrgRam() が PRG RAM バッファを返す", () => {
    const mapper = new MapperMmc1(makeCart(1));
    mapper.writePrgRam(0x6000, 0xde);
    mapper.writePrgRam(0x6001, 0xad);
    const ram = mapper.getPrgRam();
    expect(ram).not.toBeNull();
    expect(ram!.length).toBe(0x2000);
    expect(ram![0]).toBe(0xde);
    expect(ram![1]).toBe(0xad);
  });

  it("setPrgRam() で PRG RAM が復元される", () => {
    const mapper = new MapperMmc1(makeCart(1));
    const data = new Uint8Array(0x2000);
    data[0] = 0xca;
    data[0x1fff] = 0xfe;
    mapper.setPrgRam(data);
    expect(mapper.readPrgRam(0x6000)).toBe(0xca);
    expect(mapper.readPrgRam(0x7fff)).toBe(0xfe);
  });
});

describe("PRG RAM — MMC3", () => {
  function makeMmc3Cart(): Cart {
    const prgRom = new Uint8Array(0x20000);
    return {
      header: {
        prgRomSize: prgRom.length,
        chrRomSize: 0,
        mapper: 4,
        mirroring: "vertical",
        hasBattery: false,
        hasTrainer: false,
        fourScreen: false,
      },
      prgRom,
      chrRom: new Uint8Array(0),
      trainer: null,
    };
  }

  it("$6000-$7FFF の read/write が機能する", () => {
    const mapper = new MapperMmc3(makeMmc3Cart());
    mapper.writePrgRam(0x6000, 0x55);
    mapper.writePrgRam(0x7fff, 0xaa);
    expect(mapper.readPrgRam(0x6000)).toBe(0x55);
    expect(mapper.readPrgRam(0x7fff)).toBe(0xaa);
  });

  it("getPrgRam/setPrgRam で保存/復元できる", () => {
    const mapper = new MapperMmc3(makeMmc3Cart());
    mapper.writePrgRam(0x6123, 0xbe);
    const ram = mapper.getPrgRam();
    expect(ram).not.toBeNull();
    expect(ram![0x123]).toBe(0xbe);

    const mapper2 = new MapperMmc3(makeMmc3Cart());
    mapper2.setPrgRam(ram!);
    expect(mapper2.readPrgRam(0x6123)).toBe(0xbe);
  });
});

describe("PRG RAM — NROM/UxROM/CNROM は非搭載", () => {
  it("NROM: readPrgRam は 0 を返す", () => {
    const mapper = new MapperNrom(makeCart(0));
    expect(mapper.readPrgRam(0x6000)).toBe(0);
    expect(mapper.getPrgRam()).toBeNull();
  });

  it("UxROM: readPrgRam は 0 を返す", () => {
    const mapper = new MapperUxrom(makeCart(2));
    expect(mapper.readPrgRam(0x6000)).toBe(0);
    expect(mapper.getPrgRam()).toBeNull();
  });

  it("CNROM: readPrgRam は 0 を返す", () => {
    const cart = makeCart(3);
    cart.chrRom = new Uint8Array(0x2000);
    cart.header.chrRomSize = 0x2000;
    const mapper = new MapperCnrom(cart);
    expect(mapper.readPrgRam(0x6000)).toBe(0);
    expect(mapper.getPrgRam()).toBeNull();
  });
});

describe("PRG RAM — NesBus dispatch", () => {
  it("$6000-$7FFF が mapper.readPrgRam/writePrgRam に dispatch される", () => {
    const cart = makeCart(1);
    const mapper = new MapperMmc1(cart);
    const ppu = new Ppu();
    const controller = new Controller();
    const apu = new Apu();
    const bus = new NesBus(ppu, mapper, controller, apu);

    bus.write(0x6000, 0x12);
    bus.write(0x7fff, 0x34);
    expect(bus.read(0x6000)).toBe(0x12);
    expect(bus.read(0x7fff)).toBe(0x34);
  });

  it("$6000-$7FFF の中間アドレスも正しく動く", () => {
    const cart = makeCart(1);
    const mapper = new MapperMmc1(cart);
    const ppu = new Ppu();
    const controller = new Controller();
    const apu = new Apu();
    const bus = new NesBus(ppu, mapper, controller, apu);

    for (let i = 0; i < 256; i++) {
      bus.write(0x6000 + i, i);
    }
    for (let i = 0; i < 256; i++) {
      expect(bus.read(0x6000 + i)).toBe(i);
    }
  });
});
