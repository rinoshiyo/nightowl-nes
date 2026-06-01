/**
 * MMC2/MMC4 latch 機構の統合テスト。
 *
 * PPU の ppuRead 経由で CHR を読んだ時に latch が切り替わることを検証。
 * (mapper 単体テストでは onChrRead を手動呼出だが、ここでは PPU 経由)
 */

import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { Ppu } from "../src/core/ppu.ts";
import { MapperMmc2 } from "../src/core/mappers/mmc2.ts";
import { MapperMmc4 } from "../src/core/mappers/mmc4.ts";

function makeMmc2Cart(chrBankCount = 32): Cart {
  const chrSize = chrBankCount * 0x1000;
  const chrRom = new Uint8Array(chrSize);
  for (let i = 0; i < chrBankCount; i++) {
    chrRom[i * 0x1000] = i;
  }
  // $FD8 / $FE8 のタイル位置に識別バイトを置く
  for (let b = 0; b < chrBankCount; b++) {
    chrRom[b * 0x1000 + 0xfd8] = 0xfd;
    chrRom[b * 0x1000 + 0xfe8] = 0xfe;
  }

  return {
    header: {
      prgRomSize: 0x20000,
      chrRomSize: chrSize,
      mapper: 9,
      mirroring: "vertical",
      hasBattery: false,
      hasTrainer: false,
      fourScreen: false,
    },
    prgRom: new Uint8Array(0x20000),
    chrRom,
    trainer: null,
  };
}

function makeMmc4Cart(chrBankCount = 32): Cart {
  const chrSize = chrBankCount * 0x1000;
  const chrRom = new Uint8Array(chrSize);
  for (let i = 0; i < chrBankCount; i++) {
    chrRom[i * 0x1000] = i;
  }

  return {
    header: {
      prgRomSize: 0x40000,
      chrRomSize: chrSize,
      mapper: 10,
      mirroring: "vertical",
      hasBattery: false,
      hasTrainer: false,
      fourScreen: false,
    },
    prgRom: new Uint8Array(0x40000),
    chrRom,
    trainer: null,
  };
}

describe("MMC2 latch と PPU ppuRead の統合", () => {
  it("ppuRead 経由で CHR 読み出し時に latch が切り替わる", () => {
    const cart = makeMmc2Cart();
    const mapper = new MapperMmc2(cart);
    const ppu = new Ppu();
    ppu.mapper = mapper;

    mapper.writePrg(0xb000, 1); // 低位 FD = 1
    mapper.writePrg(0xc000, 2); // 低位 FE = 2

    // 初期: latch = FD → バンク 1
    expect(ppu.ppuRead(0x0000)).toBe(1);

    // $0FE8 を読む → read はバンク 1 のデータを返す → その後 latch が FE に変わる
    ppu.ppuRead(0x0fe8);
    // latch が FE に変わったのでバンク 2
    expect(ppu.ppuRead(0x0000)).toBe(2);
  });

  it("readChr → onChrRead の順序: 先にデータを返してから latch を更新", () => {
    const cart = makeMmc2Cart();
    const mapper = new MapperMmc2(cart);
    const ppu = new Ppu();
    ppu.mapper = mapper;

    mapper.writePrg(0xb000, 1); // 低位 FD = 1
    mapper.writePrg(0xc000, 3); // 低位 FE = 3

    // 現在 latch = FD、バンク 1 のデータが $FE8 にある
    // $0FE8 を読むと、バンク 1 の $FE8 オフセットのデータが返る (latch はまだ FD)
    const dataAt0FE8 = ppu.ppuRead(0x0fe8);
    expect(dataAt0FE8).toBe(0xfe); // バンク 1 の $FE8 の値

    // ↑の読み出しで latch が FE に変わったので次はバンク 3
    expect(ppu.ppuRead(0x0000)).toBe(3);
  });
});

describe("MMC4 latch と PPU ppuRead の統合", () => {
  it("ppuRead 経由で latch が切り替わる", () => {
    const cart = makeMmc4Cart();
    const mapper = new MapperMmc4(cart);
    const ppu = new Ppu();
    ppu.mapper = mapper;

    mapper.writePrg(0xb000, 1); // 低位 FD = 1
    mapper.writePrg(0xc000, 2); // 低位 FE = 2

    expect(ppu.ppuRead(0x0000)).toBe(1);

    // $0FE8 読み出しで latch が FE に
    ppu.ppuRead(0x0fe8);
    expect(ppu.ppuRead(0x0000)).toBe(2);
  });

  it("MMC4 の低位テーブルは $0FD8-$0FDF 範囲でトリガー", () => {
    const cart = makeMmc4Cart();
    const mapper = new MapperMmc4(cart);
    const ppu = new Ppu();
    ppu.mapper = mapper;

    mapper.writePrg(0xb000, 1); // FD = 1
    mapper.writePrg(0xc000, 2); // FE = 2

    // $0FEF で FE にトリガー
    ppu.ppuRead(0x0fef);
    expect(ppu.ppuRead(0x0000)).toBe(2);

    // $0FDF で FD にトリガー (MMC4 は範囲)
    ppu.ppuRead(0x0fdf);
    expect(ppu.ppuRead(0x0000)).toBe(1);
  });
});

describe("MMC2 と MMC4 の latch トリガー差異", () => {
  it("MMC2 は低位 $0FD9 でトリガーしない / MMC4 はする", () => {
    // MMC2
    const cart2 = makeMmc2Cart();
    const mapper2 = new MapperMmc2(cart2);
    const ppu2 = new Ppu();
    ppu2.mapper = mapper2;

    mapper2.writePrg(0xb000, 1); // FD = 1
    mapper2.writePrg(0xc000, 2); // FE = 2

    mapper2.onChrRead(0x0fe8); // FE に
    mapper2.onChrRead(0x0fd9); // MMC2: $0FD9 はトリガーしない
    expect(ppu2.ppuRead(0x0000)).toBe(2); // まだ FE

    // MMC4
    const cart4 = makeMmc4Cart();
    const mapper4 = new MapperMmc4(cart4);
    const ppu4 = new Ppu();
    ppu4.mapper = mapper4;

    mapper4.writePrg(0xb000, 1); // FD = 1
    mapper4.writePrg(0xc000, 2); // FE = 2

    mapper4.onChrRead(0x0fe8); // FE に
    mapper4.onChrRead(0x0fd9); // MMC4: $0FD9 でトリガーする
    expect(ppu4.ppuRead(0x0000)).toBe(1); // FD に戻った
  });
});
