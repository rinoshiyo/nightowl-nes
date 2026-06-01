import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperDxrom } from "../src/core/mappers/dxrom.ts";
import { createMapper } from "../src/core/mappers/mapper.ts";

function makeDxromCart(prgBankCount8k: number, chrBankCount1k: number): Cart {
  const prgSize = prgBankCount8k * 0x2000;
  const chrSize = chrBankCount1k * 0x0400;
  const prgRom = new Uint8Array(prgSize);
  const chrRom = new Uint8Array(chrSize);

  for (let bank = 0; bank < prgBankCount8k; bank++) {
    const offset = bank * 0x2000;
    prgRom[offset] = bank;
    prgRom[offset + 1] = 0xaa;
    prgRom[offset + 0x1fff] = bank | 0xf0;
  }

  for (let bank = 0; bank < chrBankCount1k; bank++) {
    const offset = bank * 0x0400;
    chrRom[offset] = bank;
    chrRom[offset + 1] = 0xbb;
    chrRom[offset + 0x03ff] = bank | 0xc0;
  }

  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: chrSize,
      mapper: 206,
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

function makeDxromChrRamCart(prgBankCount8k: number): Cart {
  const prgSize = prgBankCount8k * 0x2000;
  const prgRom = new Uint8Array(prgSize);

  for (let bank = 0; bank < prgBankCount8k; bank++) {
    const offset = bank * 0x2000;
    prgRom[offset] = bank;
  }

  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: 0,
      mapper: 206,
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

describe("MapperDxrom PRG bank switching", () => {
  it("初期状態で R6=0 が $8000-$9FFF に、最終バンクが $E000-$FFFF に選択されている", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    expect(mapper.readPrg(0x8000)).toBe(0);
    expect(mapper.readPrg(0xe000)).toBe(7);
  });

  it("R6 ($8000 select=6) で $8000-$9FFF の PRG バンクが切り替わる", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrg(0x8000, 6);
    mapper.writePrg(0x8001, 3);
    expect(mapper.readPrg(0x8000)).toBe(3);
  });

  it("R7 ($8000 select=7) で $A000-$BFFF の PRG バンクが切り替わる", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrg(0x8000, 7);
    mapper.writePrg(0x8001, 5);
    expect(mapper.readPrg(0xa000)).toBe(5);
  });

  it("$C000-$DFFF は固定バンク (最後から2番目)", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    expect(mapper.readPrg(0xc000)).toBe(6);
  });

  it("$E000-$FFFF は固定バンク (最終)", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    expect(mapper.readPrg(0xe000)).toBe(7);
    expect(mapper.readPrg(0xffff)).toBe(7 | 0xf0);
  });

  it("$A000 以降への write は無視される", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrg(0xa000, 6);
    mapper.writePrg(0xa001, 5);
    expect(mapper.readPrg(0x8000)).toBe(0);
  });
});

describe("MapperDxrom CHR bank switching", () => {
  it("R0 で $0000-$07FF (2KB) の CHR バンクが切り替わる", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrg(0x8000, 0);
    mapper.writePrg(0x8001, 4);
    expect(mapper.readChr(0x0000)).toBe(4);
    expect(mapper.readChr(0x0400)).toBe(5);
  });

  it("R1 で $0800-$0FFF (2KB) の CHR バンクが切り替わる", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrg(0x8000, 1);
    mapper.writePrg(0x8001, 6);
    expect(mapper.readChr(0x0800)).toBe(6);
    expect(mapper.readChr(0x0c00)).toBe(7);
  });

  it("R2 で $1000-$13FF (1KB) の CHR バンクが切り替わる", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrg(0x8000, 2);
    mapper.writePrg(0x8001, 10);
    expect(mapper.readChr(0x1000)).toBe(10);
  });

  it("R3 で $1400-$17FF (1KB) の CHR バンクが切り替わる", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrg(0x8000, 3);
    mapper.writePrg(0x8001, 11);
    expect(mapper.readChr(0x1400)).toBe(11);
  });

  it("R4 で $1800-$1BFF (1KB) の CHR バンクが切り替わる", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrg(0x8000, 4);
    mapper.writePrg(0x8001, 12);
    expect(mapper.readChr(0x1800)).toBe(12);
  });

  it("R5 で $1C00-$1FFF (1KB) の CHR バンクが切り替わる", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrg(0x8000, 5);
    mapper.writePrg(0x8001, 13);
    expect(mapper.readChr(0x1c00)).toBe(13);
  });

  it("R0 の 2KB バンクは下位ビットが無視される", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrg(0x8000, 0);
    mapper.writePrg(0x8001, 5);
    expect(mapper.readChr(0x0000)).toBe(4);
    expect(mapper.readChr(0x0400)).toBe(5);
  });

  it("CHR ROM は読み取り専用", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    const original = mapper.readChr(0x0000);
    mapper.writeChr(0x0000, 0xff);
    expect(mapper.readChr(0x0000)).toBe(original);
  });
});

describe("MapperDxrom CHR RAM mode", () => {
  it("chrRomSize=0 のとき CHR RAM として動作", () => {
    const mapper = new MapperDxrom(makeDxromChrRamCart(8));
    mapper.writeChr(0x0000, 0x42);
    expect(mapper.readChr(0x0000)).toBe(0x42);
    mapper.writeChr(0x1fff, 0xab);
    expect(mapper.readChr(0x1fff)).toBe(0xab);
  });
});

describe("MapperDxrom bankSelect 連続操作", () => {
  it("bankSelect を変えずに bankData を複数回書くと最後の値が有効", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrg(0x8000, 6);
    mapper.writePrg(0x8001, 2);
    mapper.writePrg(0x8001, 5);
    expect(mapper.readPrg(0x8000)).toBe(5);
  });

  it("R6 と R7 を独立に設定できる", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrg(0x8000, 6);
    mapper.writePrg(0x8001, 2);
    mapper.writePrg(0x8000, 7);
    mapper.writePrg(0x8001, 4);
    expect(mapper.readPrg(0x8000)).toBe(2);
    expect(mapper.readPrg(0xa000)).toBe(4);
  });

  it("PRG バンク値はバンク数を超える値でラップする", () => {
    const mapper = new MapperDxrom(makeDxromCart(4, 32));
    mapper.writePrg(0x8000, 6);
    mapper.writePrg(0x8001, 5);
    expect(mapper.readPrg(0x8000)).toBe(1);
  });
});

describe("MapperDxrom IRQ は非対応", () => {
  it("irqPending は常に false", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.clockIrqCounter();
    expect(mapper.irqPending).toBe(false);
  });
});

describe("MapperDxrom PRG RAM", () => {
  it("PRG RAM ($6000-$7FFF) に読み書きできる", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrgRam(0x6000, 0x42);
    expect(mapper.readPrgRam(0x6000)).toBe(0x42);
    mapper.writePrgRam(0x7fff, 0xab);
    expect(mapper.readPrgRam(0x7fff)).toBe(0xab);
  });

  it("getPrgRam で PRG RAM バッファを取得できる", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrgRam(0x6000, 0x42);
    const ram = mapper.getPrgRam();
    expect(ram).not.toBeNull();
    expect(ram![0]).toBe(0x42);
  });
});

describe("MapperDxrom reset", () => {
  it("reset で全レジスタが 0 に戻る", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrg(0x8000, 6);
    mapper.writePrg(0x8001, 3);
    mapper.reset();
    expect(mapper.readPrg(0x8000)).toBe(0);
  });
});

describe("MapperDxrom serialize/deserialize", () => {
  it("状態の保存・復元が正しく動作", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    mapper.writePrg(0x8000, 6);
    mapper.writePrg(0x8001, 3);
    mapper.writePrg(0x8000, 2);
    mapper.writePrg(0x8001, 10);
    const state = mapper.serializeMapper();

    const mapper2 = new MapperDxrom(makeDxromCart(8, 32));
    mapper2.deserializeMapper(state);
    expect(mapper2.readPrg(0x8000)).toBe(3);
    expect(mapper2.readChr(0x1000)).toBe(10);
  });
});

describe("MapperDxrom createMapper 統合", () => {
  it("createMapper で mapper 206 が MapperDxrom にマッピングされる", () => {
    const cart = makeDxromCart(8, 32);
    const mapper = createMapper(cart);
    expect(mapper).toBeInstanceOf(MapperDxrom);
  });

  it("mapperId() が 206 を返す", () => {
    const mapper = new MapperDxrom(makeDxromCart(8, 32));
    expect(mapper.mapperId()).toBe(206);
  });
});
