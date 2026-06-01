import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperCnrom } from "../src/core/mappers/cnrom.ts";
import { createMapper } from "../src/core/mappers/mapper.ts";

function makeCnromCart(chrBankCount: number, prgSize = 0x8000): Cart {
  const chrSize = chrBankCount * 0x2000;
  const prgRom = new Uint8Array(prgSize);
  prgRom[0] = 0xea;
  prgRom[prgSize - 4] = 0x00;
  prgRom[prgSize - 3] = 0x80;

  const chrRom = new Uint8Array(chrSize);
  for (let bank = 0; bank < chrBankCount; bank++) {
    const offset = bank * 0x2000;
    chrRom[offset] = bank;
    chrRom[offset + 1] = 0xbb;
    chrRom[offset + 0x1fff] = bank | 0xf0;
  }

  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: chrSize,
      mapper: 3,
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

describe("MapperCnrom CHR bank switching", () => {
  it("初期状態でバンク 0 が選択されている", () => {
    const mapper = new MapperCnrom(makeCnromCart(4));
    expect(mapper.readChr(0x0000)).toBe(0);
    expect(mapper.readChr(0x0001)).toBe(0xbb);
  });

  it("$8000-$FFFF write で CHR バンクが切り替わる", () => {
    const mapper = new MapperCnrom(makeCnromCart(4));
    mapper.writePrg(0x8000, 2);
    expect(mapper.readChr(0x0000)).toBe(2);
    expect(mapper.readChr(0x0001)).toBe(0xbb);
    expect(mapper.readChr(0x1fff)).toBe(2 | 0xf0);
  });

  it("バンク番号の下位ビットのみが使用される (4 バンク)", () => {
    const mapper = new MapperCnrom(makeCnromCart(4));
    mapper.writePrg(0x8000, 7);
    expect(mapper.readChr(0x0000)).toBe(3);
  });

  it("バンク番号マスク (2 バンク)", () => {
    const mapper = new MapperCnrom(makeCnromCart(2));
    mapper.writePrg(0x8000, 3);
    expect(mapper.readChr(0x0000)).toBe(1);
  });

  it("複数回のバンク切替が正しく動作", () => {
    const mapper = new MapperCnrom(makeCnromCart(4));
    mapper.writePrg(0x8000, 1);
    expect(mapper.readChr(0x0000)).toBe(1);
    mapper.writePrg(0x9000, 3);
    expect(mapper.readChr(0x0000)).toBe(3);
    mapper.writePrg(0xa000, 0);
    expect(mapper.readChr(0x0000)).toBe(0);
  });

  it("CHR ROM は読み取り専用 (writeChr は無視)", () => {
    const mapper = new MapperCnrom(makeCnromCart(4));
    const original = mapper.readChr(0x0000);
    mapper.writeChr(0x0000, 0xff);
    expect(mapper.readChr(0x0000)).toBe(original);
  });

  it("write アドレスに関わらず CHR バンク切替が発生する", () => {
    const mapper = new MapperCnrom(makeCnromCart(4));
    mapper.writePrg(0xffff, 2);
    expect(mapper.readChr(0x0000)).toBe(2);
  });
});

describe("MapperCnrom PRG ROM", () => {
  it("PRG ROM 32KB は固定 (NROM と同じ)", () => {
    const mapper = new MapperCnrom(makeCnromCart(4, 0x8000));
    expect(mapper.readPrg(0x8000)).toBe(0xea);
  });

  it("PRG ROM 16KB は $C000-$FFFF がミラー", () => {
    const mapper = new MapperCnrom(makeCnromCart(4, 0x4000));
    const lo = mapper.readPrg(0x8000);
    const hi = mapper.readPrg(0xc000);
    expect(lo).toBe(hi);
  });

  it("PRG ROM への write は CHR バンク切替のみ (PRG 内容は変わらない)", () => {
    const mapper = new MapperCnrom(makeCnromCart(4));
    const before = mapper.readPrg(0x8000);
    mapper.writePrg(0x8000, 0xff);
    expect(mapper.readPrg(0x8000)).toBe(before);
  });
});

describe("MapperCnrom createMapper 統合", () => {
  it("createMapper で mapper 3 が MapperCnrom にマッピングされる", () => {
    const cart = makeCnromCart(4);
    const mapper = createMapper(cart);
    expect(mapper).toBeInstanceOf(MapperCnrom);
  });
});
