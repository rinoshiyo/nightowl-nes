import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import type { Mirroring } from "../src/core/cart.ts";
import { MapperCodemasters } from "../src/core/mappers/codemasters.ts";
import { createMapper } from "../src/core/mappers/mapper.ts";

function makeCodemastersCart(prgBankCount: number): Cart {
  const prgSize = prgBankCount * 0x4000;
  const prgRom = new Uint8Array(prgSize);

  for (let bank = 0; bank < prgBankCount; bank++) {
    const offset = bank * 0x4000;
    prgRom[offset] = bank;
    prgRom[offset + 1] = 0xaa;
    prgRom[offset + 0x3fff] = bank | 0xf0;
  }

  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: 0,
      mapper: 71,
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

describe("MapperCodemasters PRG bank switching", () => {
  it("初期状態でバンク 0 が $8000-$BFFF に選択されている", () => {
    const mapper = new MapperCodemasters(makeCodemastersCart(8));
    expect(mapper.readPrg(0x8000)).toBe(0);
    expect(mapper.readPrg(0x8001)).toBe(0xaa);
  });

  it("最終バンクが $C000-$FFFF に固定されている", () => {
    const mapper = new MapperCodemasters(makeCodemastersCart(8));
    expect(mapper.readPrg(0xc000)).toBe(7);
    expect(mapper.readPrg(0xffff)).toBe(7 | 0xf0);
  });

  it("$C000-$FFFF への write で PRG バンクが切り替わる", () => {
    const mapper = new MapperCodemasters(makeCodemastersCart(8));
    mapper.writePrg(0xc000, 3);
    expect(mapper.readPrg(0x8000)).toBe(3);
    expect(mapper.readPrg(0xbfff)).toBe(3 | 0xf0);
  });

  it("$C000-$FFFF が固定バンクのまま変わらない", () => {
    const mapper = new MapperCodemasters(makeCodemastersCart(8));
    mapper.writePrg(0xc000, 2);
    expect(mapper.readPrg(0xc000)).toBe(7);
  });

  it("バンク番号はバンク数でマスクされる", () => {
    const mapper = new MapperCodemasters(makeCodemastersCart(4));
    mapper.writePrg(0xc000, 5);
    expect(mapper.readPrg(0x8000)).toBe(1);
  });

  it("$8000-$BFFF への write では PRG バンク切替は発生しない", () => {
    const mapper = new MapperCodemasters(makeCodemastersCart(8));
    mapper.writePrg(0x8000, 3);
    expect(mapper.readPrg(0x8000)).toBe(0);
  });
});

describe("MapperCodemasters BF9097 ミラーリング", () => {
  it("$9000 write bit 4 = 0 で single-lower", () => {
    const mirrorChanges: Mirroring[] = [];
    const mapper = new MapperCodemasters(makeCodemastersCart(8));
    mapper.onMirroringChange = (m) => { mirrorChanges.push(m); };
    mapper.writePrg(0x9000, 0x00);
    expect(mirrorChanges).toEqual(["single-lower"]);
  });

  it("$9000 write bit 4 = 1 で single-upper", () => {
    const mirrorChanges: Mirroring[] = [];
    const mapper = new MapperCodemasters(makeCodemastersCart(8));
    mapper.onMirroringChange = (m) => { mirrorChanges.push(m); };
    mapper.writePrg(0x9000, 0x10);
    expect(mirrorChanges).toEqual(["single-upper"]);
  });

  it("$9FFF アドレスでもミラーリング制御が動作する", () => {
    const mirrorChanges: Mirroring[] = [];
    const mapper = new MapperCodemasters(makeCodemastersCart(8));
    mapper.onMirroringChange = (m) => { mirrorChanges.push(m); };
    mapper.writePrg(0x9fff, 0x10);
    expect(mirrorChanges).toEqual(["single-upper"]);
  });
});

describe("MapperCodemasters CHR RAM", () => {
  it("CHR RAM に書き込み・読み出しができる", () => {
    const mapper = new MapperCodemasters(makeCodemastersCart(8));
    mapper.writeChr(0x0000, 0x42);
    expect(mapper.readChr(0x0000)).toBe(0x42);
  });

  it("CHR RAM は 8KB 範囲内でラップする", () => {
    const mapper = new MapperCodemasters(makeCodemastersCart(8));
    mapper.writeChr(0x1fff, 0xab);
    expect(mapper.readChr(0x1fff)).toBe(0xab);
  });
});

describe("MapperCodemasters reset", () => {
  it("reset でバンク 0 に戻りミラーリングが single-lower になる", () => {
    const mirrorChanges: Mirroring[] = [];
    const mapper = new MapperCodemasters(makeCodemastersCart(8));
    mapper.onMirroringChange = (m) => { mirrorChanges.push(m); };
    mapper.writePrg(0xc000, 3);
    mapper.writePrg(0x9000, 0x10);
    mirrorChanges.length = 0;

    mapper.reset();
    expect(mapper.readPrg(0x8000)).toBe(0);
    expect(mirrorChanges).toEqual(["single-lower"]);
  });
});

describe("MapperCodemasters serialize/deserialize", () => {
  it("状態の保存・復元が正しく動作", () => {
    const mapper = new MapperCodemasters(makeCodemastersCart(8));
    mapper.writePrg(0xc000, 3);
    mapper.writePrg(0x9000, 0x10);
    mapper.writeChr(0x0100, 0x42);
    const state = mapper.serializeMapper();

    const mirrorChanges: Mirroring[] = [];
    const mapper2 = new MapperCodemasters(makeCodemastersCart(8));
    mapper2.onMirroringChange = (m) => { mirrorChanges.push(m); };
    mapper2.deserializeMapper(state);

    expect(mapper2.readPrg(0x8000)).toBe(3);
    expect(mapper2.readChr(0x0100)).toBe(0x42);
    expect(mirrorChanges).toEqual(["single-upper"]);
  });
});

describe("MapperCodemasters createMapper 統合", () => {
  it("createMapper で mapper 71 が MapperCodemasters にマッピングされる", () => {
    const cart = makeCodemastersCart(8);
    const mapper = createMapper(cart);
    expect(mapper).toBeInstanceOf(MapperCodemasters);
  });

  it("mapperId() が 71 を返す", () => {
    const mapper = new MapperCodemasters(makeCodemastersCart(8));
    expect(mapper.mapperId()).toBe(71);
  });
});
