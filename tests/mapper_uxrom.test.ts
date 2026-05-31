import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperUxrom } from "../src/core/mappers/uxrom.ts";

function makeUxromCart(bankCount: number): Cart {
  const prgSize = bankCount * 0x4000;
  const prgRom = new Uint8Array(prgSize);
  for (let bank = 0; bank < bankCount; bank++) {
    const offset = bank * 0x4000;
    prgRom[offset] = bank;
    prgRom[offset + 1] = 0xaa;
    prgRom[offset + 0x3fff] = bank | 0xf0;
  }
  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: 0,
      mapper: 2,
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

describe("MapperUxrom PRG bank switching", () => {
  it("初期状態でバンク 0 が $8000-$BFFF にマップ", () => {
    const mapper = new MapperUxrom(makeUxromCart(8));
    expect(mapper.readPrg(0x8000)).toBe(0);
    expect(mapper.readPrg(0x8001)).toBe(0xaa);
  });

  it("$C000-$FFFF は最終バンクに固定", () => {
    const mapper = new MapperUxrom(makeUxromCart(8));
    expect(mapper.readPrg(0xc000)).toBe(7);
    expect(mapper.readPrg(0xffff)).toBe(7 | 0xf0);
  });

  it("$8000-$FFFF write でバンク切替", () => {
    const mapper = new MapperUxrom(makeUxromCart(8));
    mapper.writePrg(0x8000, 3);
    expect(mapper.readPrg(0x8000)).toBe(3);
    expect(mapper.readPrg(0x8001)).toBe(0xaa);
    expect(mapper.readPrg(0xbfff)).toBe(3 | 0xf0);
  });

  it("バンク番号は bankCount でマスクされる", () => {
    const mapper = new MapperUxrom(makeUxromCart(4));
    mapper.writePrg(0x8000, 7);
    expect(mapper.readPrg(0x8000)).toBe(3);
  });

  it("最終バンクはバンク切替に影響されない", () => {
    const mapper = new MapperUxrom(makeUxromCart(8));
    mapper.writePrg(0x8000, 5);
    expect(mapper.readPrg(0xc000)).toBe(7);
  });

  it("複数回のバン��切替が正しく動作", () => {
    const mapper = new MapperUxrom(makeUxromCart(8));
    mapper.writePrg(0x8000, 2);
    expect(mapper.readPrg(0x8000)).toBe(2);
    mapper.writePrg(0x9000, 6);
    expect(mapper.readPrg(0x8000)).toBe(6);
    mapper.writePrg(0xa000, 0);
    expect(mapper.readPrg(0x8000)).toBe(0);
  });
});

describe("MapperUxrom CHR RAM", () => {
  it("CHR RAM 8KB が read/write できる", () => {
    const mapper = new MapperUxrom(makeUxromCart(8));
    expect(mapper.readChr(0x0000)).toBe(0);
    mapper.writeChr(0x0000, 0x42);
    expect(mapper.readChr(0x0000)).toBe(0x42);
    mapper.writeChr(0x1fff, 0xef);
    expect(mapper.readChr(0x1fff)).toBe(0xef);
  });

  it("CHR アドレスは $1FFF でマスクされる", () => {
    const mapper = new MapperUxrom(makeUxromCart(4));
    mapper.writeChr(0x2000, 0xab);
    expect(mapper.readChr(0x0000)).toBe(0xab);
  });
});

describe("MapperUxrom edge cases", () => {
  it("2 バンク構成で正しく動作", () => {
    const mapper = new MapperUxrom(makeUxromCart(2));
    expect(mapper.readPrg(0x8000)).toBe(0);
    expect(mapper.readPrg(0xc000)).toBe(1);
    mapper.writePrg(0x8000, 1);
    expect(mapper.readPrg(0x8000)).toBe(1);
  });

  it("write アドレスに関わらずバンク切替が発生する", () => {
    const mapper = new MapperUxrom(makeUxromCart(8));
    mapper.writePrg(0xffff, 4);
    expect(mapper.readPrg(0x8000)).toBe(4);
  });
});
