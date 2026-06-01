/**
 * MMC2/MMC4 エッジケーステスト。
 *
 * バンク境界・ラップアラウンド・PRG 固定領域の正確性を検証。
 */

import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperMmc2 } from "../src/core/mappers/mmc2.ts";
import { MapperMmc4 } from "../src/core/mappers/mmc4.ts";

function makeMmc2Cart(prgBankCount = 16, chrBankCount = 32): Cart {
  const prgSize = prgBankCount * 0x2000;
  const chrSize = chrBankCount * 0x1000;
  const prgRom = new Uint8Array(prgSize);
  for (let i = 0; i < prgBankCount; i++) {
    prgRom[i * 0x2000] = i;
    prgRom[i * 0x2000 + 0x1fff] = (i ^ 0xff) & 0xff;
  }
  prgRom[prgSize - 4] = 0x00;
  prgRom[prgSize - 3] = 0x80;

  const chrRom = new Uint8Array(chrSize);
  for (let i = 0; i < chrBankCount; i++) {
    chrRom[i * 0x1000] = i;
    chrRom[i * 0x1000 + 0xfff] = (i ^ 0xaa) & 0xff;
  }

  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: chrSize,
      mapper: 9,
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

function makeMmc4Cart(prgBankCount = 16, chrBankCount = 32): Cart {
  const prgSize = prgBankCount * 0x4000;
  const chrSize = chrBankCount * 0x1000;
  const prgRom = new Uint8Array(prgSize);
  for (let i = 0; i < prgBankCount; i++) {
    prgRom[i * 0x4000] = i;
    prgRom[i * 0x4000 + 0x3fff] = (i ^ 0xff) & 0xff;
  }
  prgRom[prgSize - 4] = 0x00;
  prgRom[prgSize - 3] = 0x80;

  const chrRom = new Uint8Array(chrSize);
  for (let i = 0; i < chrBankCount; i++) {
    chrRom[i * 0x1000] = i;
    chrRom[i * 0x1000 + 0xfff] = (i ^ 0xaa) & 0xff;
  }

  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: chrSize,
      mapper: 10,
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

describe("MMC2 PRG バンク境界", () => {
  it("switchable バンク ($8000-$9FFF) の末尾バイトが正しい", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.writePrg(0xa000, 3);
    expect(mapper.readPrg(0x8000)).toBe(3);
    expect(mapper.readPrg(0x9fff)).toBe((3 ^ 0xff) & 0xff);
  });

  it("固定バンク ($A000-$FFFF) の各境界が正しい", () => {
    const mapper = new MapperMmc2(makeMmc2Cart(16));
    // 最後の 3 バンク: 13, 14, 15
    expect(mapper.readPrg(0xa000)).toBe(13);
    expect(mapper.readPrg(0xbfff)).toBe((13 ^ 0xff) & 0xff);
    expect(mapper.readPrg(0xc000)).toBe(14);
    expect(mapper.readPrg(0xdfff)).toBe((14 ^ 0xff) & 0xff);
    expect(mapper.readPrg(0xe000)).toBe(15);
  });

  it("PRG バンク番号がバンク数を超えるとラップする", () => {
    // 8 バンクの ROM で bank 15 を選択 → 15 % 8 = 7
    const mapper = new MapperMmc2(makeMmc2Cart(8));
    mapper.writePrg(0xa000, 15);
    expect(mapper.readPrg(0x8000)).toBe(7);
  });
});

describe("MMC2 CHR バンク境界", () => {
  it("CHR バンクの末尾バイト ($0FFF / $1FFF) が正しい", () => {
    const mapper = new MapperMmc2(makeMmc2Cart(16, 16));
    mapper.writePrg(0xb000, 5);  // 低位 FD = 5
    mapper.writePrg(0xd000, 10); // 高位 FD = 10
    expect(mapper.readChr(0x0fff)).toBe((5 ^ 0xaa) & 0xff);
    expect(mapper.readChr(0x1fff)).toBe((10 ^ 0xaa) & 0xff);
  });

  it("CHR バンク番号がバンク数を超えるとラップする", () => {
    // 8 バンクの CHR ROM で bank 31 を選択 → 31 % 8 = 7
    const mapper = new MapperMmc2(makeMmc2Cart(16, 8));
    mapper.writePrg(0xb000, 31);
    expect(mapper.readChr(0x0000)).toBe(7);
  });
});

describe("MMC4 PRG バンク境界", () => {
  it("switchable バンク ($8000-$BFFF) の末尾バイトが正しい", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.writePrg(0xa000, 5);
    expect(mapper.readPrg(0x8000)).toBe(5);
    expect(mapper.readPrg(0xbfff)).toBe((5 ^ 0xff) & 0xff);
  });

  it("固定バンク ($C000-$FFFF) の末尾バイトが正しい", () => {
    const mapper = new MapperMmc4(makeMmc4Cart(16));
    expect(mapper.readPrg(0xc000)).toBe(15);
    expect(mapper.readPrg(0xffff)).toBe((15 ^ 0xff) & 0xff);
  });

  it("PRG バンク番号がバンク数を超えるとラップする", () => {
    const mapper = new MapperMmc4(makeMmc4Cart(4));
    mapper.writePrg(0xa000, 15);
    expect(mapper.readPrg(0x8000)).toBe(3); // 15 % 4 = 3
  });
});

describe("MMC4 CHR バンク境界", () => {
  it("CHR バンク番号がバンク数を超えるとラップする", () => {
    const mapper = new MapperMmc4(makeMmc4Cart(16, 8));
    mapper.writePrg(0xb000, 31);
    expect(mapper.readChr(0x0000)).toBe(7); // 31 % 8 = 7
  });
});

describe("MMC2 $8000-$9FFF write は無視", () => {
  it("$8000-$9FFF への write で PRG バンクは変わらない", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.writePrg(0xa000, 3);
    expect(mapper.readPrg(0x8000)).toBe(3);
    mapper.writePrg(0x8000, 7);
    expect(mapper.readPrg(0x8000)).toBe(3); // 変わらない
  });
});

describe("MMC4 $8000-$9FFF write は無視", () => {
  it("$8000-$9FFF への write で PRG バンクは変わらない", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.writePrg(0xa000, 3);
    expect(mapper.readPrg(0x8000)).toBe(3);
    mapper.writePrg(0x8000, 7);
    expect(mapper.readPrg(0x8000)).toBe(3);
  });
});
