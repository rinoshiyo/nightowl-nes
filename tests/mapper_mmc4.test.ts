import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import type { Mirroring } from "../src/core/cart.ts";
import { MapperMmc4 } from "../src/core/mappers/mmc4.ts";
import { createMapper } from "../src/core/mappers/mapper.ts";

/**
 * MMC4 テスト用カートリッジ生成。
 * PRG: prgBankCount × 16KB、CHR: chrBankCount × 4KB。
 */
function makeMmc4Cart(prgBankCount = 16, chrBankCount = 32): Cart {
  const prgSize = prgBankCount * 0x4000;
  const chrSize = chrBankCount * 0x1000;
  const prgRom = new Uint8Array(prgSize);
  for (let i = 0; i < prgBankCount; i++) {
    prgRom[i * 0x4000] = i;
  }
  prgRom[prgSize - 4] = 0x00;
  prgRom[prgSize - 3] = 0x80;

  const chrRom = new Uint8Array(chrSize);
  for (let i = 0; i < chrBankCount; i++) {
    chrRom[i * 0x1000] = i;
    chrRom[i * 0x1000 + 1] = 0xdd;
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

describe("MapperMmc4 PRG バンク切替", () => {
  it("初期状態で $8000 はバンク 0", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    expect(mapper.readPrg(0x8000)).toBe(0);
  });

  it("$A000 write で $8000-$BFFF の 16KB バンクが切り替わる", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.writePrg(0xa000, 3);
    expect(mapper.readPrg(0x8000)).toBe(3);
  });

  it("$C000-$FFFF は最終 16KB バンクに固定", () => {
    const mapper = new MapperMmc4(makeMmc4Cart(16));
    expect(mapper.readPrg(0xc000)).toBe(15);
  });

  it("PRG バンク番号は下位 4 bit のみ使用", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.writePrg(0xa000, 0xf2);
    // 0xf2 & 0x0f = 2
    expect(mapper.readPrg(0x8000)).toBe(2);
  });
});

describe("MapperMmc4 CHR latch 機構", () => {
  it("初期状態 (latch=FD) で chrBankFD のバンクが選択される", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    expect(mapper.readChr(0x0000)).toBe(0);
  });

  it("$B000/$C000 で低位テーブルの FD/FE バンクを設定", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.writePrg(0xb000, 5); // FD = 5
    mapper.writePrg(0xc000, 8); // FE = 8

    expect(mapper.readChr(0x0000)).toBe(5); // FD
    mapper.onChrRead(0x0fe8); // FE に切替
    expect(mapper.readChr(0x0000)).toBe(8); // FE
  });

  it("MMC4 の低位 latch は $0FD8-$0FDF 範囲 (MMC2 より広い)", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.writePrg(0xb000, 1); // FD = 1
    mapper.writePrg(0xc000, 2); // FE = 2

    mapper.onChrRead(0x0fe8); // FE に切替
    expect(mapper.readChr(0x0000)).toBe(2);

    // $0FDF もトリガーする (MMC4 では $0FD8-$0FDF が範囲)
    mapper.onChrRead(0x0fdf);
    expect(mapper.readChr(0x0000)).toBe(1); // FD に戻る

    // $0FD9 もトリガーする
    mapper.onChrRead(0x0fef); // FE に切替
    mapper.onChrRead(0x0fd9);
    expect(mapper.readChr(0x0000)).toBe(1); // FD に戻る
  });

  it("高位テーブル ($1000-$1FFF) も独立した latch を持つ", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.writePrg(0xd000, 10); // FD = 10
    mapper.writePrg(0xe000, 20); // FE = 20

    expect(mapper.readChr(0x1000)).toBe(10); // FD
    mapper.onChrRead(0x1fe8); // FE
    expect(mapper.readChr(0x1000)).toBe(20);
    mapper.onChrRead(0x1fdf); // FD
    expect(mapper.readChr(0x1000)).toBe(10);
  });

  it("低位と高位の latch は独立 (互いに影響しない)", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.writePrg(0xb000, 1); // 低位 FD
    mapper.writePrg(0xc000, 2); // 低位 FE
    mapper.writePrg(0xd000, 3); // 高位 FD
    mapper.writePrg(0xe000, 4); // 高位 FE

    mapper.onChrRead(0x0fe8); // 低位 → FE
    expect(mapper.readChr(0x0000)).toBe(2);
    expect(mapper.readChr(0x1000)).toBe(3); // 高位はまだ FD
  });

  it("CHR バンク番号は下位 5 bit のみ使用", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.writePrg(0xb000, 0xff); // 0xff & 0x1f = 31
    expect(mapper.readChr(0x0000)).toBe(31);
  });
});

describe("MapperMmc4 ミラーリング", () => {
  it("$F000 bit 0 = 0 で vertical", () => {
    let mirroring: Mirroring = "horizontal";
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.onMirroringChange = (m) => { mirroring = m; };

    mapper.writePrg(0xf000, 0);
    expect(mirroring).toBe("vertical");
  });

  it("$F000 bit 0 = 1 で horizontal", () => {
    let mirroring: Mirroring = "vertical";
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.onMirroringChange = (m) => { mirroring = m; };

    mapper.writePrg(0xf000, 1);
    expect(mirroring).toBe("horizontal");
  });
});

describe("MapperMmc4 PRG RAM", () => {
  it("$6000-$7FFF に PRG RAM がある", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.writePrgRam(0x6000, 0x42);
    expect(mapper.readPrgRam(0x6000)).toBe(0x42);
  });

  it("PRG RAM は 8KB でミラー", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.writePrgRam(0x6000, 0xab);
    expect(mapper.readPrgRam(0x6000)).toBe(0xab);
  });

  it("getPrgRam / setPrgRam でバッテリーセーブ/ロードが可能", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.writePrgRam(0x6000, 0x11);
    mapper.writePrgRam(0x7fff, 0x22);

    const ram = mapper.getPrgRam();
    expect(ram).not.toBeNull();
    expect(ram![0]).toBe(0x11);
    expect(ram![0x1fff]).toBe(0x22);

    const mapper2 = new MapperMmc4(makeMmc4Cart());
    mapper2.setPrgRam(ram!);
    expect(mapper2.readPrgRam(0x6000)).toBe(0x11);
    expect(mapper2.readPrgRam(0x7fff)).toBe(0x22);
  });
});

describe("MapperMmc4 ステートセーブ/ロード", () => {
  it("serialize/deserialize で latch 状態と PRG RAM が復元される", () => {
    const cart = makeMmc4Cart();
    const mapper = new MapperMmc4(cart);
    mapper.writePrg(0xa000, 7);
    mapper.writePrg(0xb000, 3);
    mapper.writePrg(0xc000, 12);
    mapper.writePrg(0xd000, 5);
    mapper.writePrg(0xe000, 18);
    mapper.writePrg(0xf000, 1);
    mapper.onChrRead(0x0fe8); // 低位 → FE
    mapper.writePrgRam(0x6000, 0xaa);

    const state = mapper.serializeMapper();
    const mapper2 = new MapperMmc4(cart);
    mapper2.deserializeMapper(state);

    expect(mapper2.readPrg(0x8000)).toBe(7);
    expect(mapper2.readChr(0x0000)).toBe(12); // 低位 FE
    expect(mapper2.readChr(0x1000)).toBe(5); // 高位 FD
    expect(mapper2.readPrgRam(0x6000)).toBe(0xaa);
  });
});

describe("MapperMmc4 createMapper 統合", () => {
  it("createMapper で mapper 10 が MapperMmc4 にマッピングされる", () => {
    const cart = makeMmc4Cart();
    const mapper = createMapper(cart);
    expect(mapper).toBeInstanceOf(MapperMmc4);
    expect(mapper.mapperId()).toBe(10);
  });
});

describe("MapperMmc4 エッジケース", () => {
  it("CHR ROM は書き込み不可", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    const before = mapper.readChr(0x0000);
    mapper.writeChr(0x0000, 0xff);
    expect(mapper.readChr(0x0000)).toBe(before);
  });

  it("reset で初期状態に戻る", () => {
    const mapper = new MapperMmc4(makeMmc4Cart());
    mapper.writePrg(0xa000, 5);
    mapper.writePrg(0xb000, 10);
    mapper.onChrRead(0x0fe8);

    mapper.reset();
    expect(mapper.readPrg(0x8000)).toBe(0);
    expect(mapper.readChr(0x0000)).toBe(0); // latch FD, bank 0
  });
});
