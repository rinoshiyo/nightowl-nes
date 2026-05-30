import { describe, expect, it } from "vitest";

import { Ppu } from "../src/core/ppu.ts";

describe("PPUSTATUS ($2002)", () => {
  it("vblank フラグを読める", () => {
    const ppu = new Ppu();
    ppu.status = 0x80;
    expect(ppu.read(2)).toBe(0x80);
  });

  it("read 後に vblank がクリアされる", () => {
    const ppu = new Ppu();
    ppu.status = 0x80;
    ppu.read(2);
    expect(ppu.status & 0x80).toBe(0);
  });

  it("read 後に write toggle がリセットされる", () => {
    const ppu = new Ppu();
    ppu.write(5, 0x10);
    expect(ppu.scrollX).toBe(0x10);
    ppu.read(2);
    ppu.write(5, 0x20);
    expect(ppu.scrollX).toBe(0x20);
  });
});

describe("OAMDATA ($2004)", () => {
  it("OAMADDR 位置から read できる", () => {
    const ppu = new Ppu();
    ppu.oam[0x10] = 0xab;
    ppu.write(3, 0x10);
    expect(ppu.read(4)).toBe(0xab);
  });

  it("write 時に oamAddr がインクリメントされる", () => {
    const ppu = new Ppu();
    ppu.write(3, 0x00);
    ppu.write(4, 0x11);
    ppu.write(4, 0x22);
    expect(ppu.oam[0]).toBe(0x11);
    expect(ppu.oam[1]).toBe(0x22);
    expect(ppu.oamAddr).toBe(2);
  });

  it("oamAddr は 0xFF でラップアラウンドする", () => {
    const ppu = new Ppu();
    ppu.write(3, 0xff);
    ppu.write(4, 0xcc);
    expect(ppu.oam[0xff]).toBe(0xcc);
    expect(ppu.oamAddr).toBe(0);
  });
});

describe("PPUSCROLL ($2005) ダブルライト", () => {
  it("1st write = scrollX, 2nd write = scrollY", () => {
    const ppu = new Ppu();
    ppu.write(5, 0x10);
    ppu.write(5, 0x20);
    expect(ppu.scrollX).toBe(0x10);
    expect(ppu.scrollY).toBe(0x20);
  });

  it("3rd write は再び scrollX になる (toggle)", () => {
    const ppu = new Ppu();
    ppu.write(5, 0x10);
    ppu.write(5, 0x20);
    ppu.write(5, 0x30);
    expect(ppu.scrollX).toBe(0x30);
  });
});

describe("PPUADDR ($2006) ダブルライト", () => {
  it("hi → lo で vramAddr を組み立てる", () => {
    const ppu = new Ppu();
    ppu.write(6, 0x21);
    ppu.write(6, 0x08);
    expect(ppu.vramAddr).toBe(0x2108);
  });

  it("上位 2bit はマスクされる (14bit address)", () => {
    const ppu = new Ppu();
    ppu.write(6, 0xff);
    ppu.write(6, 0xff);
    expect(ppu.vramAddr).toBe(0x3fff);
  });
});

describe("PPUDATA ($2007) read/write", () => {
  it("VRAM に書き込み・読み出しできる (バッファリング)", () => {
    const ppu = new Ppu();
    ppu.write(6, 0x20);
    ppu.write(6, 0x00);
    ppu.write(7, 0x42);

    ppu.write(6, 0x20);
    ppu.write(6, 0x00);
    ppu.read(7);
    expect(ppu.read(7)).toBe(0x42);
  });

  it("read 後に vramAddr がインクリメントされる (increment=1)", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);

    ppu.write(6, 0x20);
    ppu.write(6, 0x00);
    ppu.write(7, 0xaa);
    ppu.write(7, 0xbb);
    ppu.write(7, 0xcc);

    ppu.write(6, 0x20);
    ppu.write(6, 0x01);
    ppu.read(7);
    expect(ppu.read(7)).toBe(0xbb);
  });

  it("PPUCTRL bit2=1 で increment=32", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x04);

    ppu.write(6, 0x20);
    ppu.write(6, 0x00);
    ppu.write(7, 0xaa);
    ppu.write(7, 0xbb);

    expect(ppu.vramAddr).toBe(0x2040);
  });

  it("パレット ($3F00+) は即時読み出し (バッファ遅延なし)", () => {
    const ppu = new Ppu();
    ppu.write(6, 0x3f);
    ppu.write(6, 0x00);
    ppu.write(7, 0x15);

    ppu.write(6, 0x3f);
    ppu.write(6, 0x00);
    expect(ppu.read(7)).toBe(0x15);
  });

  it("パレットミラー ($3F10 = $3F00)", () => {
    const ppu = new Ppu();
    ppu.write(6, 0x3f);
    ppu.write(6, 0x10);
    ppu.write(7, 0x30);

    ppu.write(6, 0x3f);
    ppu.write(6, 0x00);
    expect(ppu.read(7)).toBe(0x30);
  });
});

describe("PPUCTRL ($2000) / PPUMASK ($2001)", () => {
  it("CTRL は write のみで値が保持される", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x90);
    expect(ppu.ctrl).toBe(0x90);
  });

  it("MASK は write のみで値が保持される", () => {
    const ppu = new Ppu();
    ppu.write(1, 0x1e);
    expect(ppu.mask).toBe(0x1e);
  });

  it("CTRL/MASK の read は 0 を返す (write only)", () => {
    const ppu = new Ppu();
    ppu.write(0, 0xff);
    expect(ppu.read(0)).toBe(0);
  });
});
