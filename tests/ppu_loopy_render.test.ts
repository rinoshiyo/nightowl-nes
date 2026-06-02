import { describe, expect, it } from "vitest";
import { Ppu, SCREEN_W } from "../src/core/ppu.ts";

/**
 * loopy レジスタ経由のスクロール描画テスト。
 * $2005/$2006 経由で loopy t を設定し、t → v コピー後に描画を検証。
 */

function applyScroll(ppu: Ppu): void {
  ppu.v = ppu.t;
}

function renderScanline0(ppu: Ppu): void {
  ppu.scanline = 0;
  ppu.dot = 0;
  for (let i = 0; i < 341; i++) {
    ppu.tick();
  }
}

function setupBasicBg(ppu: Ppu): void {
  ppu.write(0, 0x00);
  ppu.mask = 0x0a;
  ppu.mirroring = "vertical";
  ppu.palette[0] = 0x0F;
  ppu.palette[1] = 0x30;
}

describe("loopy fine X scroll 描画", () => {
  it("$2005 で fine X=0 設定、タイル境界ジャストの描画", () => {
    const ppu = new Ppu();
    setupBasicBg(ppu);

    ppu.write(5, 0x00);
    ppu.write(5, 0x00);
    applyScroll(ppu);

    ppu.chrRam[0] = 0xFF;
    ppu.chrRam[8] = 0x00;
    ppu.vram[0] = 0;

    renderScanline0(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x30);
    }
  });

  it("$2005 で fine X=4 設定、タイル内 4px シフト", () => {
    const ppu = new Ppu();
    setupBasicBg(ppu);

    ppu.write(5, 4);
    ppu.write(5, 0);
    applyScroll(ppu);

    // タイル 0: lo=0xFF (全ビット) → color idx 1 → palette[1]=0x30
    ppu.chrRam[0] = 0xFF;
    ppu.chrRam[8] = 0x00;
    // タイル 1: lo=0x00 → color idx 0 → palette[0]=0x0F (背景色)
    ppu.chrRam[16] = 0x00;
    ppu.chrRam[24] = 0x00;
    ppu.vram[0] = 0;
    ppu.vram[1] = 1;

    renderScanline0(ppu);

    // fine X=4: タイル 0 の bit 3-0 (4px) → 0x30
    for (let x = 0; x < 4; x++) {
      expect(ppu.framebuffer[x]).toBe(0x30);
    }
    // タイル 1 (全透明) → 0x0F
    for (let x = 4; x < 12; x++) {
      expect(ppu.framebuffer[x]).toBe(0x0F);
    }
  });

  it("$2005 で fine X=7、タイルの最後 1px のみ表示", () => {
    const ppu = new Ppu();
    setupBasicBg(ppu);

    ppu.write(5, 7);
    ppu.write(5, 0);
    applyScroll(ppu);

    // タイル 0: lo=0xFF → color idx 1 → palette[1]=0x30
    ppu.chrRam[0] = 0xFF;
    ppu.chrRam[8] = 0x00;
    // タイル 1: lo=0x00 → 背景色
    ppu.chrRam[16] = 0x00;
    ppu.chrRam[24] = 0x00;
    ppu.vram[0] = 0;
    ppu.vram[1] = 1;

    renderScanline0(ppu);

    // fine X=7: タイル 0 の bit 0 のみ (1px) → 0x30
    expect(ppu.framebuffer[0]).toBe(0x30);
    // タイル 1 (全透明) → 0x0F
    for (let x = 1; x < 9; x++) {
      expect(ppu.framebuffer[x]).toBe(0x0F);
    }
  });
});

describe("loopy PPUSCROLL + PPUADDR 組み合わせ", () => {
  it("$2005 1st → $2005 2nd (通常シーケンス) で t が正しく設定される", () => {
    const ppu = new Ppu();
    setupBasicBg(ppu);

    ppu.write(5, 0x28);
    ppu.write(5, 0x10);
    applyScroll(ppu);

    expect(ppu.x).toBe(0);
    expect(Ppu.coarseX(ppu.v)).toBe(5);
    expect(Ppu.coarseY(ppu.v)).toBe(2);
    expect(Ppu.fineY(ppu.v)).toBe(0);
  });

  it("$2002 read で w リセット後の $2005 二回書き込みが正しく動作", () => {
    const ppu = new Ppu();
    setupBasicBg(ppu);

    ppu.write(5, 0xFF);
    ppu.read(2);

    ppu.write(5, 16);
    ppu.write(5, 8);
    applyScroll(ppu);

    expect(ppu.x).toBe(0);
    expect(Ppu.coarseX(ppu.v)).toBe(2);
    expect(Ppu.coarseY(ppu.v)).toBe(1);
    expect(Ppu.fineY(ppu.v)).toBe(0);

    ppu.chrRam[0] = 0x00;
    ppu.chrRam[8] = 0x00;
    const tileIdx = 7;
    ppu.vram[1 * 32 + 2] = tileIdx;
    ppu.chrRam[tileIdx * 16] = 0xFF;
    ppu.chrRam[tileIdx * 16 + 8] = 0x00;
    ppu.palette[1] = 0x20;

    renderScanline0(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x20);
    }
  });
});

describe("loopy スクロール split scroll シナリオ", () => {
  it("scanline 途中で hori(v)=hori(t) が水平位置をリセットする", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.mask = 0x1e;
    ppu.mirroring = "vertical";
    ppu.palette[0] = 0x0F;
    ppu.palette[1] = 0x30;

    ppu.write(5, 0);
    ppu.write(5, 0);
    applyScroll(ppu);

    ppu.t = Ppu.setCoarseX(ppu.t, 5);

    ppu.chrRam[0] = 0xFF;
    ppu.chrRam[8] = 0x00;
    ppu.vram[0] = 0;
    ppu.vram[5] = 0;

    ppu.scanline = 0;
    ppu.dot = 0;
    for (let i = 0; i < 341; i++) ppu.tick();

    expect(Ppu.coarseX(ppu.v)).toBe(5);
  });

  it("レンダリング有効時、各 visible scanline の dot 257 で hori(v)=hori(t)", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.mask = 0x1e;
    ppu.mirroring = "vertical";

    ppu.t = Ppu.setCoarseX(0, 10) | 0x0400;
    ppu.v = 0;

    ppu.scanline = 5;
    ppu.dot = 257;
    ppu.tick();

    expect(Ppu.coarseX(ppu.v)).toBe(10);
    expect(Ppu.ntSelect(ppu.v) & 1).toBe(1);
  });
});

describe("loopy 複数スキャンライン Y 進行", () => {
  it("2 スキャンライン描画で fine Y が 0→1→2 と進む", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.mask = 0x1e;
    ppu.mirroring = "vertical";
    ppu.palette[0] = 0x0F;

    ppu.v = 0;
    ppu.t = 0;

    ppu.scanline = 0;
    ppu.dot = 0;
    for (let i = 0; i < 341; i++) ppu.tick();
    expect(Ppu.fineY(ppu.v)).toBe(1);

    ppu.scanline = 1;
    ppu.dot = 0;
    for (let i = 0; i < 341; i++) ppu.tick();
    expect(Ppu.fineY(ppu.v)).toBe(2);
  });

  it("8 スキャンライン描画で coarse Y が 1 進む", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.mask = 0x1e;
    ppu.mirroring = "vertical";
    ppu.palette[0] = 0x0F;

    ppu.v = 0;
    ppu.t = 0;

    for (let sl = 0; sl < 8; sl++) {
      ppu.scanline = sl;
      ppu.dot = 0;
      for (let d = 0; d < 341; d++) ppu.tick();
    }

    expect(Ppu.fineY(ppu.v)).toBe(0);
    expect(Ppu.coarseY(ppu.v)).toBe(1);
  });
});

describe("loopy スプライト描画との互換", () => {
  it("loopy スクロール後もスプライトが正しく描画される", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.mask = 0x1e;
    ppu.mirroring = "vertical";
    ppu.palette[0] = 0x0F;
    ppu.palette[0x11] = 0x26;

    ppu.scrollX = 16;
    ppu.scrollY = 0;
    applyScroll(ppu);

    ppu.oam[0] = 0;
    ppu.oam[1] = 0;
    ppu.oam[2] = 0x00;
    ppu.oam[3] = 4;

    ppu.chrRam[0] = 0x00;
    ppu.chrRam[8] = 0x00;

    const sprTile = 0;
    const ptBase = 0;
    ppu.chrRam[ptBase + sprTile * 16] = 0xFF;
    ppu.chrRam[ptBase + sprTile * 16 + 8] = 0x00;

    ppu.scanline = 1;
    ppu.dot = 0;
    for (let i = 0; i < 341; i++) ppu.tick();

    expect(ppu.framebuffer[SCREEN_W + 4]).toBe(0x26);
  });
});
