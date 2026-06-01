import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import type { Mirroring } from "../src/core/cart.ts";
import { MapperMmc2 } from "../src/core/mappers/mmc2.ts";
import { createMapper } from "../src/core/mappers/mapper.ts";

/**
 * MMC2 テスト用カートリッジ生成。
 * PRG: prgBankCount × 8KB、CHR: chrBankCount × 4KB。
 * 各 CHR バンクの先頭バイトにバンク番号を刻印。
 */
function makeMmc2Cart(prgBankCount = 16, chrBankCount = 32): Cart {
  const prgSize = prgBankCount * 0x2000;
  const chrSize = chrBankCount * 0x1000;
  const prgRom = new Uint8Array(prgSize);
  // 各 PRG バンクの先頭にバンク番号を刻印
  for (let i = 0; i < prgBankCount; i++) {
    prgRom[i * 0x2000] = i;
  }
  // リセットベクタ ($FFFC-$FFFD)
  prgRom[prgSize - 4] = 0x00;
  prgRom[prgSize - 3] = 0x80;

  const chrRom = new Uint8Array(chrSize);
  for (let i = 0; i < chrBankCount; i++) {
    chrRom[i * 0x1000] = i;
    chrRom[i * 0x1000 + 1] = 0xcc;
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

describe("MapperMmc2 PRG バンク切替", () => {
  it("初期状態で $8000 はバンク 0", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    expect(mapper.readPrg(0x8000)).toBe(0);
  });

  it("$A000 write で $8000-$9FFF のバンクが切り替わる", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.writePrg(0xa000, 5);
    expect(mapper.readPrg(0x8000)).toBe(5);
  });

  it("$A000-$FFFF は最後の 3 バンクに固定", () => {
    const mapper = new MapperMmc2(makeMmc2Cart(16));
    // バンク 13 ($A000), 14 ($C000), 15 ($E000)
    expect(mapper.readPrg(0xa000)).toBe(13);
    expect(mapper.readPrg(0xc000)).toBe(14);
    expect(mapper.readPrg(0xe000)).toBe(15);
  });

  it("PRG バンク番号は下位 4 bit のみ使用", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.writePrg(0xa000, 0xff);
    // 0xff & 0x0f = 15
    expect(mapper.readPrg(0x8000)).toBe(15);
  });
});

describe("MapperMmc2 CHR latch 機構", () => {
  it("初期状態 (latch=FD) で chrBankFD のバンクが選択される", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    // FD バンク[0] のデフォルトは 0
    expect(mapper.readChr(0x0000)).toBe(0);
  });

  it("$B000 で低位テーブルの FD バンクを設定", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.writePrg(0xb000, 3);
    // latch はまだ FD → バンク 3
    expect(mapper.readChr(0x0000)).toBe(3);
  });

  it("$C000 で低位テーブルの FE バンクを設定、latch 切替で有効化", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.writePrg(0xc000, 7);
    // latch はまだ FD → FE バンクは見えない
    expect(mapper.readChr(0x0000)).toBe(0);
    // latch を FE に切替
    mapper.onChrRead(0x0fe8);
    // FE バンク 7 が見える
    expect(mapper.readChr(0x0000)).toBe(7);
  });

  it("$0FD8 fetch で低位 latch が FD に戻る", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.writePrg(0xb000, 2); // FD バンク = 2
    mapper.writePrg(0xc000, 5); // FE バンク = 5

    mapper.onChrRead(0x0fe8); // → FE
    expect(mapper.readChr(0x0000)).toBe(5);

    mapper.onChrRead(0x0fd8); // → FD
    expect(mapper.readChr(0x0000)).toBe(2);
  });

  it("高位テーブル ($1000-$1FFF) も独立した latch を持つ", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.writePrg(0xd000, 10); // FD バンク[1] = 10
    mapper.writePrg(0xe000, 20); // FE バンク[1] = 20

    // 初期は FD
    expect(mapper.readChr(0x1000)).toBe(10);

    // 高位 latch を FE に
    mapper.onChrRead(0x1fe8);
    expect(mapper.readChr(0x1000)).toBe(20);

    // FD に戻す
    mapper.onChrRead(0x1fd8);
    expect(mapper.readChr(0x1000)).toBe(10);
  });

  it("低位と高位の latch は独立 (互いに影響しない)", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.writePrg(0xb000, 1); // 低位 FD = 1
    mapper.writePrg(0xc000, 2); // 低位 FE = 2
    mapper.writePrg(0xd000, 3); // 高位 FD = 3
    mapper.writePrg(0xe000, 4); // 高位 FE = 4

    // 低位を FE に切替
    mapper.onChrRead(0x0fe8);
    expect(mapper.readChr(0x0000)).toBe(2); // 低位 FE
    expect(mapper.readChr(0x1000)).toBe(3); // 高位はまだ FD
  });

  it("MMC2 の低位 latch トリガーは $0FD8 / $0FE8 のみ (1 アドレス)", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.writePrg(0xb000, 1); // FD = 1
    mapper.writePrg(0xc000, 2); // FE = 2

    // $0FD9 は MMC2 ではトリガーしない
    mapper.onChrRead(0x0fe8); // FE に切替
    mapper.onChrRead(0x0fd9); // $0FD9 はトリガーしない (MMC2)
    expect(mapper.readChr(0x0000)).toBe(2); // まだ FE
  });

  it("高位 latch トリガーは $1FD8-$1FDF / $1FE8-$1FEF (範囲)", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.writePrg(0xd000, 1); // FD = 1
    mapper.writePrg(0xe000, 2); // FE = 2

    mapper.onChrRead(0x1fef); // $1FEF → FE
    expect(mapper.readChr(0x1000)).toBe(2);

    mapper.onChrRead(0x1fdf); // $1FDF → FD
    expect(mapper.readChr(0x1000)).toBe(1);
  });

  it("CHR バンク番号は下位 5 bit のみ使用", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.writePrg(0xb000, 0xff); // 0xff & 0x1f = 31
    expect(mapper.readChr(0x0000)).toBe(31);
  });
});

describe("MapperMmc2 ミラーリング", () => {
  it("$F000 bit 0 = 0 で vertical", () => {
    let mirroring: Mirroring = "horizontal";
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.onMirroringChange = (m) => { mirroring = m; };

    mapper.writePrg(0xf000, 0);
    expect(mirroring).toBe("vertical");
  });

  it("$F000 bit 0 = 1 で horizontal", () => {
    let mirroring: Mirroring = "vertical";
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.onMirroringChange = (m) => { mirroring = m; };

    mapper.writePrg(0xf000, 1);
    expect(mirroring).toBe("horizontal");
  });
});

describe("MapperMmc2 ステートセーブ/ロード", () => {
  it("serialize/deserialize で latch 状態が復元される", () => {
    const cart = makeMmc2Cart();
    const mapper = new MapperMmc2(cart);
    mapper.writePrg(0xa000, 3);
    mapper.writePrg(0xb000, 5);
    mapper.writePrg(0xc000, 10);
    mapper.writePrg(0xd000, 15);
    mapper.writePrg(0xe000, 20);
    mapper.writePrg(0xf000, 1); // horizontal
    mapper.onChrRead(0x0fe8); // 低位 → FE
    mapper.onChrRead(0x1fd8); // 高位 → FD

    const state = mapper.serializeMapper();
    const mapper2 = new MapperMmc2(cart);
    mapper2.deserializeMapper(state);

    expect(mapper2.readPrg(0x8000)).toBe(3);
    expect(mapper2.readChr(0x0000)).toBe(10); // 低位 FE
    expect(mapper2.readChr(0x1000)).toBe(15); // 高位 FD
  });
});

describe("MapperMmc2 createMapper 統合", () => {
  it("createMapper で mapper 9 が MapperMmc2 にマッピングされる", () => {
    const cart = makeMmc2Cart();
    const mapper = createMapper(cart);
    expect(mapper).toBeInstanceOf(MapperMmc2);
    expect(mapper.mapperId()).toBe(9);
  });
});

describe("MapperMmc2 エッジケース", () => {
  it("PRG RAM は非搭載 (null)", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    expect(mapper.getPrgRam()).toBeNull();
  });

  it("CHR ROM は書き込み不可", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    const before = mapper.readChr(0x0000);
    mapper.writeChr(0x0000, 0xff);
    expect(mapper.readChr(0x0000)).toBe(before);
  });

  it("reset で初期状態に戻る", () => {
    const mapper = new MapperMmc2(makeMmc2Cart());
    mapper.writePrg(0xa000, 5);
    mapper.writePrg(0xb000, 10);
    mapper.onChrRead(0x0fe8);

    mapper.reset();
    expect(mapper.readPrg(0x8000)).toBe(0); // バンク 0
    expect(mapper.readChr(0x0000)).toBe(0); // latch FD, bank 0
  });
});
