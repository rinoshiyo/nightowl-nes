import { describe, expect, it, vi } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import type { Mirroring } from "../src/core/cart.ts";
import { MapperAxrom } from "../src/core/mappers/axrom.ts";

function makeAxromCart(bankCount: number): Cart {
  const prgSize = bankCount * 0x8000;
  const prgRom = new Uint8Array(prgSize);
  for (let bank = 0; bank < bankCount; bank++) {
    const offset = bank * 0x8000;
    prgRom[offset] = bank;
    prgRom[offset + 1] = 0xaa;
    prgRom[offset + 0x3fff] = bank | 0xc0;
    prgRom[offset + 0x4000] = bank | 0x80;
    prgRom[offset + 0x7fff] = bank | 0xf0;
  }
  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: 0,
      mapper: 7,
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

describe("MapperAxrom PRG バンク切替", () => {
  it("初期状態でバンク 0 が $8000-$FFFF にマップ", () => {
    const mapper = new MapperAxrom(makeAxromCart(8));
    expect(mapper.readPrg(0x8000)).toBe(0);
    expect(mapper.readPrg(0x8001)).toBe(0xaa);
    expect(mapper.readPrg(0xbfff)).toBe(0 | 0xc0);
    expect(mapper.readPrg(0xc000)).toBe(0 | 0x80);
    expect(mapper.readPrg(0xffff)).toBe(0 | 0xf0);
  });

  it("$8000-$FFFF write の下位 3 bit でバンク切替", () => {
    const mapper = new MapperAxrom(makeAxromCart(8));
    mapper.writePrg(0x8000, 3);
    expect(mapper.readPrg(0x8000)).toBe(3);
    expect(mapper.readPrg(0x8001)).toBe(0xaa);
    expect(mapper.readPrg(0xffff)).toBe(3 | 0xf0);
  });

  it("32KB 全域が同一バンクにマップされる", () => {
    const mapper = new MapperAxrom(makeAxromCart(8));
    mapper.writePrg(0x8000, 5);
    expect(mapper.readPrg(0x8000)).toBe(5);
    expect(mapper.readPrg(0xbfff)).toBe(5 | 0xc0);
    expect(mapper.readPrg(0xc000)).toBe(5 | 0x80);
    expect(mapper.readPrg(0xffff)).toBe(5 | 0xf0);
  });

  it("バンク番号は bankCount でマスクされる", () => {
    const mapper = new MapperAxrom(makeAxromCart(4));
    mapper.writePrg(0x8000, 7);
    expect(mapper.readPrg(0x8000)).toBe(3);
  });

  it("複数回のバンク切替が正しく動作", () => {
    const mapper = new MapperAxrom(makeAxromCart(8));
    mapper.writePrg(0x8000, 2);
    expect(mapper.readPrg(0x8000)).toBe(2);
    mapper.writePrg(0x9000, 6);
    expect(mapper.readPrg(0x8000)).toBe(6);
    mapper.writePrg(0xa000, 0);
    expect(mapper.readPrg(0x8000)).toBe(0);
  });

  it("write アドレスに関わらずバンク切替が発生する", () => {
    const mapper = new MapperAxrom(makeAxromCart(8));
    mapper.writePrg(0xffff, 4);
    expect(mapper.readPrg(0x8000)).toBe(4);
  });
});

describe("MapperAxrom ミラーリング切替", () => {
  it("bit 4 = 0 で single-lower を通知", () => {
    const mapper = new MapperAxrom(makeAxromCart(4));
    const cb = vi.fn<(m: Mirroring) => void>();
    mapper.onMirroringChange = cb;

    mapper.writePrg(0x8000, 0x00);
    expect(cb).toHaveBeenCalledWith("single-lower");
  });

  it("bit 4 = 1 で single-upper を通知", () => {
    const mapper = new MapperAxrom(makeAxromCart(4));
    const cb = vi.fn<(m: Mirroring) => void>();
    mapper.onMirroringChange = cb;

    mapper.writePrg(0x8000, 0x10);
    expect(cb).toHaveBeenCalledWith("single-upper");
  });

  it("バンク切替とミラーリング切替を同時に処理", () => {
    const mapper = new MapperAxrom(makeAxromCart(8));
    const cb = vi.fn<(m: Mirroring) => void>();
    mapper.onMirroringChange = cb;

    mapper.writePrg(0x8000, 0x13);
    expect(mapper.readPrg(0x8000)).toBe(3);
    expect(cb).toHaveBeenCalledWith("single-upper");
  });

  it("onMirroringChange が null でもエラーにならない", () => {
    const mapper = new MapperAxrom(makeAxromCart(4));
    mapper.onMirroringChange = null;
    expect(() => mapper.writePrg(0x8000, 0x10)).not.toThrow();
  });
});

describe("MapperAxrom CHR RAM", () => {
  it("CHR RAM 8KB が read/write できる", () => {
    const mapper = new MapperAxrom(makeAxromCart(4));
    expect(mapper.readChr(0x0000)).toBe(0);
    mapper.writeChr(0x0000, 0x42);
    expect(mapper.readChr(0x0000)).toBe(0x42);
    mapper.writeChr(0x1fff, 0xef);
    expect(mapper.readChr(0x1fff)).toBe(0xef);
  });

  it("CHR アドレスは $1FFF でマスクされる", () => {
    const mapper = new MapperAxrom(makeAxromCart(4));
    mapper.writeChr(0x2000, 0xab);
    expect(mapper.readChr(0x0000)).toBe(0xab);
  });

  it("CHR RAM の全域に書き込みできる", () => {
    const mapper = new MapperAxrom(makeAxromCart(4));
    for (let addr = 0; addr < 0x2000; addr += 0x400) {
      mapper.writeChr(addr, addr & 0xff);
    }
    for (let addr = 0; addr < 0x2000; addr += 0x400) {
      expect(mapper.readChr(addr)).toBe(addr & 0xff);
    }
  });
});

describe("MapperAxrom reset", () => {
  it("reset でバンク 0 に戻る", () => {
    const mapper = new MapperAxrom(makeAxromCart(8));
    mapper.writePrg(0x8000, 5);
    expect(mapper.readPrg(0x8000)).toBe(5);
    mapper.reset();
    expect(mapper.readPrg(0x8000)).toBe(0);
  });

  it("reset で single-lower ミラーリングを通知", () => {
    const mapper = new MapperAxrom(makeAxromCart(4));
    const cb = vi.fn<(m: Mirroring) => void>();
    mapper.onMirroringChange = cb;

    mapper.writePrg(0x8000, 0x10);
    cb.mockClear();

    mapper.reset();
    expect(cb).toHaveBeenCalledWith("single-lower");
  });
});

describe("MapperAxrom PRG RAM / IRQ", () => {
  it("PRG RAM は無効 (常に 0 を返す)", () => {
    const mapper = new MapperAxrom(makeAxromCart(4));
    expect(mapper.readPrgRam(0x6000)).toBe(0);
    mapper.writePrgRam(0x6000, 0xff);
    expect(mapper.readPrgRam(0x6000)).toBe(0);
  });

  it("getPrgRam は null を返す", () => {
    const mapper = new MapperAxrom(makeAxromCart(4));
    expect(mapper.getPrgRam()).toBeNull();
  });

  it("IRQ は常に false", () => {
    const mapper = new MapperAxrom(makeAxromCart(4));
    expect(mapper.irqPending).toBe(false);
    mapper.clockIrqCounter();
    expect(mapper.irqPending).toBe(false);
  });
});

describe("MapperAxrom 初期状態", () => {
  it("初期状態でバンク 0 が選択されている", () => {
    const mapper = new MapperAxrom(makeAxromCart(8));
    expect(mapper.readPrg(0x8000)).toBe(0);
    expect(mapper.readPrg(0xc000)).toBe(0 | 0x80);
  });

  it("初期状態で reset すると single-lower が通知される", () => {
    const mapper = new MapperAxrom(makeAxromCart(4));
    const cb = vi.fn<(m: Mirroring) => void>();
    mapper.onMirroringChange = cb;
    mapper.reset();
    expect(cb).toHaveBeenCalledWith("single-lower");
  });

  it("初期状態は irqPending = false", () => {
    const mapper = new MapperAxrom(makeAxromCart(4));
    expect(mapper.irqPending).toBe(false);
  });
});

describe("MapperAxrom エッジケース", () => {
  it("1 バンク構成で正しく動作", () => {
    const mapper = new MapperAxrom(makeAxromCart(1));
    expect(mapper.readPrg(0x8000)).toBe(0);
    expect(mapper.readPrg(0xffff)).toBe(0 | 0xf0);
    mapper.writePrg(0x8000, 1);
    expect(mapper.readPrg(0x8000)).toBe(0);
  });

  it("2 バンク構成で正しく動作", () => {
    const mapper = new MapperAxrom(makeAxromCart(2));
    expect(mapper.readPrg(0x8000)).toBe(0);
    mapper.writePrg(0x8000, 1);
    expect(mapper.readPrg(0x8000)).toBe(1);
    expect(mapper.readPrg(0xffff)).toBe(1 | 0xf0);
  });

  it("bit 4 以外の上位ビットはバンク選択に影響しない", () => {
    const mapper = new MapperAxrom(makeAxromCart(8));
    mapper.writePrg(0x8000, 0xe5);
    expect(mapper.readPrg(0x8000)).toBe(5);
  });
});
