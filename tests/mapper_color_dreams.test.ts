import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperColorDreams } from "../src/core/mappers/color-dreams.ts";
import { createMapper } from "../src/core/mappers/mapper.ts";

function makeColorDreamsCart(prgBankCount: number, chrBankCount: number): Cart {
  const prgSize = prgBankCount * 0x8000;
  const chrSize = chrBankCount * 0x2000;
  const prgRom = new Uint8Array(prgSize);
  const chrRom = new Uint8Array(chrSize);

  for (let bank = 0; bank < prgBankCount; bank++) {
    const offset = bank * 0x8000;
    prgRom[offset] = bank;
    prgRom[offset + 1] = 0xaa;
    prgRom[offset + 0x7fff] = bank | 0xf0;
  }

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
      mapper: 11,
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

describe("MapperColorDreams PRG bank switching", () => {
  it("初期状態でバンク 0 が選択されている", () => {
    const mapper = new MapperColorDreams(makeColorDreamsCart(4, 4));
    expect(mapper.readPrg(0x8000)).toBe(0);
    expect(mapper.readPrg(0x8001)).toBe(0xaa);
  });

  it("bit 0-1 で PRG バンクが切り替わる", () => {
    const mapper = new MapperColorDreams(makeColorDreamsCart(4, 4));
    mapper.writePrg(0x8000, 0x02);
    expect(mapper.readPrg(0x8000)).toBe(2);
    expect(mapper.readPrg(0xffff)).toBe(2 | 0xf0);
  });

  it("PRG バンク番号はバンク数でマスクされる", () => {
    const mapper = new MapperColorDreams(makeColorDreamsCart(2, 4));
    mapper.writePrg(0x8000, 0x03);
    expect(mapper.readPrg(0x8000)).toBe(1);
  });

  it("32KB 全域 ($8000-$FFFF) が切り替わる", () => {
    const mapper = new MapperColorDreams(makeColorDreamsCart(4, 4));
    mapper.writePrg(0x8000, 0x01);
    expect(mapper.readPrg(0x8000)).toBe(1);
    expect(mapper.readPrg(0xc000)).toBe(mapper.readPrg(0xc000));
  });
});

describe("MapperColorDreams CHR bank switching", () => {
  it("初期状態でバンク 0 が選択されている", () => {
    const mapper = new MapperColorDreams(makeColorDreamsCart(4, 4));
    expect(mapper.readChr(0x0000)).toBe(0);
    expect(mapper.readChr(0x0001)).toBe(0xbb);
  });

  it("bit 4-7 で CHR バンクが切り替わる", () => {
    const mapper = new MapperColorDreams(makeColorDreamsCart(4, 4));
    mapper.writePrg(0x8000, 0x20);
    expect(mapper.readChr(0x0000)).toBe(2);
    expect(mapper.readChr(0x1fff)).toBe(2 | 0xf0);
  });

  it("CHR バンク番号はバンク数でマスクされる", () => {
    const mapper = new MapperColorDreams(makeColorDreamsCart(4, 2));
    mapper.writePrg(0x8000, 0x30);
    expect(mapper.readChr(0x0000)).toBe(1);
  });

  it("PRG と CHR を同時に切替", () => {
    const mapper = new MapperColorDreams(makeColorDreamsCart(4, 4));
    mapper.writePrg(0x8000, 0x31);
    expect(mapper.readPrg(0x8000)).toBe(1);
    expect(mapper.readChr(0x0000)).toBe(3);
  });

  it("CHR ROM は読み取り専用", () => {
    const mapper = new MapperColorDreams(makeColorDreamsCart(4, 4));
    const original = mapper.readChr(0x0000);
    mapper.writeChr(0x0000, 0xff);
    expect(mapper.readChr(0x0000)).toBe(original);
  });
});

describe("MapperColorDreams reset", () => {
  it("reset でバンク 0 に戻る", () => {
    const mapper = new MapperColorDreams(makeColorDreamsCart(4, 4));
    mapper.writePrg(0x8000, 0x32);
    mapper.reset();
    expect(mapper.readPrg(0x8000)).toBe(0);
    expect(mapper.readChr(0x0000)).toBe(0);
  });
});

describe("MapperColorDreams serialize/deserialize", () => {
  it("状態の保存・復元が正しく動作", () => {
    const mapper = new MapperColorDreams(makeColorDreamsCart(4, 4));
    mapper.writePrg(0x8000, 0x21);
    const state = mapper.serializeMapper();

    const mapper2 = new MapperColorDreams(makeColorDreamsCart(4, 4));
    mapper2.deserializeMapper(state);
    expect(mapper2.readPrg(0x8000)).toBe(1);
    expect(mapper2.readChr(0x0000)).toBe(2);
  });
});

describe("MapperColorDreams createMapper 統合", () => {
  it("createMapper で mapper 11 が MapperColorDreams にマッピングされる", () => {
    const cart = makeColorDreamsCart(4, 4);
    const mapper = createMapper(cart);
    expect(mapper).toBeInstanceOf(MapperColorDreams);
  });

  it("mapperId() が 11 を返す", () => {
    const mapper = new MapperColorDreams(makeColorDreamsCart(4, 4));
    expect(mapper.mapperId()).toBe(11);
  });
});
