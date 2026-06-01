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

describe("PRG RAM — NROM は搭載、UxROM/CNROM は非搭載", () => {
  it("NROM: PRG RAM 読み書き可能", () => {
    const mapper = new MapperNrom(makeCart(0));
    expect(mapper.readPrgRam(0x6000)).toBe(0);
    mapper.writePrgRam(0x6000, 0x42);
    expect(mapper.readPrgRam(0x6000)).toBe(0x42);
    expect(mapper.getPrgRam()).not.toBeNull();
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

describe("PRG RAM — setPrgRam の境界ケース", () => {
  it("setPrgRam に大きいデータを渡しても 8KB に切り詰められる", () => {
    const mapper = new MapperMmc1(makeCart(1));
    const big = new Uint8Array(0x4000);
    big[0] = 0x11;
    big[0x1fff] = 0x22;
    big[0x2000] = 0x33;
    mapper.setPrgRam(big);
    expect(mapper.readPrgRam(0x6000)).toBe(0x11);
    expect(mapper.readPrgRam(0x7fff)).toBe(0x22);
    const ram = mapper.getPrgRam()!;
    expect(ram.length).toBe(0x2000);
  });

  it("setPrgRam に小さいデータを渡すとデータ部分のみ上書きされる", () => {
    const mapper = new MapperMmc1(makeCart(1));
    mapper.writePrgRam(0x7fff, 0xff);
    const small = new Uint8Array(16);
    small[0] = 0xaa;
    mapper.setPrgRam(small);
    expect(mapper.readPrgRam(0x6000)).toBe(0xaa);
    expect(mapper.readPrgRam(0x6010)).toBe(0);
    // $7FFF は small の範囲外なので前の値が残る
    expect(mapper.readPrgRam(0x7fff)).toBe(0xff);
  });

  it("MMC3: setPrgRam の round-trip で全バイトが保持される", () => {
    const cart: Cart = {
      header: {
        prgRomSize: 0x20000,
        chrRomSize: 0,
        mapper: 4,
        mirroring: "vertical",
        hasBattery: true,
        hasTrainer: false,
        fourScreen: false,
      },
      prgRom: new Uint8Array(0x20000),
      chrRom: new Uint8Array(0),
      trainer: null,
    };
    const mapper1 = new MapperMmc3(cart);
    for (let i = 0; i < 0x2000; i++) {
      mapper1.writePrgRam(0x6000 + i, (i * 7 + 3) & 0xff);
    }
    const saved = mapper1.getPrgRam()!;

    const mapper2 = new MapperMmc3(cart);
    mapper2.setPrgRam(new Uint8Array(saved));
    for (let i = 0; i < 0x2000; i++) {
      expect(mapper2.readPrgRam(0x6000 + i)).toBe((i * 7 + 3) & 0xff);
    }
  });
});

describe("PRG RAM — NesBus dispatch", () => {
  it("$6000-$7FFF が mapper.readPrgRam/writePrgRam に dispatch される", () => {
    const cart = makeCart(1);
    const mapper = new MapperMmc1(cart);
    const ppu = new Ppu();
    const controller = new Controller();
    const apu = new Apu();
    const bus = new NesBus(ppu, mapper, controller, new Controller(), apu);

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
    const bus = new NesBus(ppu, mapper, controller, new Controller(), apu);

    for (let i = 0; i < 256; i++) {
      bus.write(0x6000 + i, i);
    }
    for (let i = 0; i < 256; i++) {
      expect(bus.read(0x6000 + i)).toBe(i);
    }
  });
});
