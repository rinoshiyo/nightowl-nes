import { describe, expect, it } from "vitest";
import { Ppu } from "../src/core/ppu.ts";

describe("PPU 背景レンダリング", () => {
  /**
   * CHR RAM にタイルパターンを配置し、
   * ネームテーブルとアトリビュートとパレットを設定した上で
   * 1 スキャンライン分を描画してフレームバッファを検証する。
   */
  function setupBgTile(ppu: Ppu): void {
    ppu.ctrl = 0;
    ppu.mask = 0x08;

    ppu.chrRam[0] = 0b11001100;
    ppu.chrRam[8] = 0b10101010;

    ppu.vram[0] = 0;

    ppu.vram[0x03c0] = 0x00;

    ppu.palette[0] = 0x0f;
    ppu.palette[1] = 0x01;
    ppu.palette[2] = 0x02;
    ppu.palette[3] = 0x03;
  }

  it("背景タイルの 2bpp パターンが正しくデコードされる", () => {
    const ppu = new Ppu();
    setupBgTile(ppu);

    for (let dot = 0; dot < 341; dot++) {
      ppu.tick();
    }

    const expected = [
      /* bit7: lo=1, hi=1 → 3 */ 0x03,
      /* bit6: lo=1, hi=0 → 1 */ 0x01,
      /* bit5: lo=0, hi=1 → 2 */ 0x02,
      /* bit4: lo=0, hi=0 → 0 */ 0x0f,
      /* bit3: lo=1, hi=1 → 3 */ 0x03,
      /* bit2: lo=1, hi=0 → 1 */ 0x01,
      /* bit1: lo=0, hi=1 → 2 */ 0x02,
      /* bit0: lo=0, hi=0 → 0 */ 0x0f,
    ];

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(expected[x]);
    }
  });

  it("mask bit3 が 0 のとき背景は無効で背景色 (palette[0]) になる", () => {
    const ppu = new Ppu();
    setupBgTile(ppu);
    ppu.mask = 0x00;

    for (let dot = 0; dot < 341; dot++) {
      ppu.tick();
    }

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(ppu.palette[0]);
    }
  });

  it("カラーインデックス 0 のピクセルは常に palette[0] (背景色) を参照", () => {
    const ppu = new Ppu();
    ppu.ctrl = 0;
    ppu.mask = 0x08;

    ppu.chrRam[0] = 0x00;
    ppu.chrRam[8] = 0x00;
    ppu.vram[0] = 0;
    ppu.palette[0] = 0x30;

    for (let dot = 0; dot < 341; dot++) {
      ppu.tick();
    }

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x30);
    }
  });

  it("アトリビュートテーブルのパレット番号が反映される", () => {
    const ppu = new Ppu();
    ppu.ctrl = 0;
    ppu.mask = 0x08;

    ppu.chrRam[0] = 0xff;
    ppu.chrRam[8] = 0x00;
    ppu.vram[0] = 0;

    ppu.vram[0x03c0] = 0x01;

    ppu.palette[0] = 0x0f;
    ppu.palette[4 + 1] = 0x11;

    for (let dot = 0; dot < 341; dot++) {
      ppu.tick();
    }

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x11);
    }
  });

  it("PPUCTRL bit4 でパターンテーブル $1000 を選択できる", () => {
    const ppu = new Ppu();
    ppu.ctrl = 0x10;
    ppu.mask = 0x08;

    ppu.chrRam[0x1000] = 0xff;
    ppu.chrRam[0x1008] = 0x00;
    ppu.vram[0] = 0;
    ppu.vram[0x03c0] = 0x00;
    ppu.palette[0] = 0x0f;
    ppu.palette[1] = 0x15;

    for (let dot = 0; dot < 341; dot++) {
      ppu.tick();
    }

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x15);
    }
  });
});

describe("PPU ppuRead", () => {
  it("CHR RAM 空間 ($0000-$1FFF) を読める", () => {
    const ppu = new Ppu();
    ppu.chrRam[0x0100] = 0xab;
    expect(ppu.ppuRead(0x0100)).toBe(0xab);
  });

  it("VRAM 空間 ($2000-$2FFF) を読める", () => {
    const ppu = new Ppu();
    ppu.vram[0] = 0x42;
    expect(ppu.ppuRead(0x2000)).toBe(0x42);
  });

  it("パレット空間 ($3F00-$3F1F) を読める", () => {
    const ppu = new Ppu();
    ppu.palette[0] = 0x0f;
    expect(ppu.ppuRead(0x3f00)).toBe(0x0f);
  });
});
