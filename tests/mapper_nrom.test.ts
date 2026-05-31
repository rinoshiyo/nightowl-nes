import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperNrom } from "../src/core/mappers/nrom.ts";

function makeCart(prgSize: number, chrSize: number): Cart {
  const prgRom = new Uint8Array(prgSize);
  for (let i = 0; i < prgSize; i++) {
    prgRom[i] = i & 0xff;
  }
  const chrRom = new Uint8Array(chrSize);
  for (let i = 0; i < chrSize; i++) {
    chrRom[i] = (i + 0x80) & 0xff;
  }
  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: chrSize,
      mapper: 0,
      mirroring: "vertical",
      hasBattery: false,
      hasTrainer: false,
      fourScreen: false,
    },
    prgRom,
    chrRom,
    trainer: null,
  };
}

describe("MapperNrom PRG", () => {
  it("32KB PRG: $8000-$FFFF がそのままマッピング", () => {
    const mapper = new MapperNrom(makeCart(0x8000, 0x2000));
    expect(mapper.readPrg(0x8000)).toBe(0x00);
    expect(mapper.readPrg(0x8001)).toBe(0x01);
    expect(mapper.readPrg(0xffff)).toBe(0xff);
  });

  it("16KB PRG: $C000-$FFFF が $8000-$BFFF のミラー", () => {
    const mapper = new MapperNrom(makeCart(0x4000, 0x2000));
    expect(mapper.readPrg(0x8000)).toBe(0x00);
    expect(mapper.readPrg(0xc000)).toBe(0x00);
    expect(mapper.readPrg(0xbfff)).toBe(0xff);
    expect(mapper.readPrg(0xffff)).toBe(0xff);
  });

  it("$8000-$FFFF への write は無視される", () => {
    const mapper = new MapperNrom(makeCart(0x8000, 0x2000));
    mapper.writePrg(0x8000, 0x42);
    expect(mapper.readPrg(0x8000)).toBe(0x00);
  });
});

describe("MapperNrom CHR ROM", () => {
  it("CHR ROM のデータが readChr で読める", () => {
    const mapper = new MapperNrom(makeCart(0x4000, 0x2000));
    expect(mapper.readChr(0x0000)).toBe(0x80);
    expect(mapper.readChr(0x0001)).toBe(0x81);
    expect(mapper.readChr(0x1fff)).toBe(0x7f);
  });

  it("CHR ROM は書き込み不可 (writeChr は無視)", () => {
    const mapper = new MapperNrom(makeCart(0x4000, 0x2000));
    mapper.writeChr(0x0000, 0xff);
    expect(mapper.readChr(0x0000)).toBe(0x80);
  });
});

describe("MapperNrom CHR RAM", () => {
  it("chrRomSize=0 の時は CHR RAM (read/write 可能)", () => {
    const mapper = new MapperNrom(makeCart(0x4000, 0));
    expect(mapper.readChr(0x0000)).toBe(0);
    mapper.writeChr(0x0000, 0xab);
    expect(mapper.readChr(0x0000)).toBe(0xab);
    mapper.writeChr(0x1fff, 0xcd);
    expect(mapper.readChr(0x1fff)).toBe(0xcd);
  });
});
