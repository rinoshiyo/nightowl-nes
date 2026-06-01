import { describe, expect, it } from "vitest";
import { Ppu } from "../src/core/ppu.ts";

/**
 * loopy t の値を v にコピーし、描画可能状態にする。
 * 実機では pre-render scanline で vert(v)=vert(t)、
 * visible scanline 開始時に hori(v)=hori(t) が行われる。
 */
function applyScroll(ppu: Ppu): void {
  ppu.v = ppu.t;
}

/**
 * 1 スキャンライン (scanline 0) を描画するヘルパー。
 * scanline=0, dot=0 から開始し 341 dot 進める。
 */
function renderScanline0(ppu: Ppu): void {
  ppu.scanline = 0;
  ppu.dot = 0;
  for (let i = 0; i < 341; i++) {
    ppu.tick();
  }
}

describe("PPU ネームテーブルミラーリング", () => {
  it("垂直ミラー: $2000 と $2800 が同一物理ページ", () => {
    const ppu = new Ppu();
    ppu.mirroring = "vertical";
    ppu.vram[0] = 0xAA;
    expect(ppu.ppuRead(0x2000)).toBe(0xAA);
    expect(ppu.ppuRead(0x2800)).toBe(0xAA);
  });

  it("垂直ミラー: $2400 と $2C00 が同一物理ページ", () => {
    const ppu = new Ppu();
    ppu.mirroring = "vertical";
    ppu.vram[0x400] = 0xBB;
    expect(ppu.ppuRead(0x2400)).toBe(0xBB);
    expect(ppu.ppuRead(0x2C00)).toBe(0xBB);
  });

  it("垂直ミラー: $2000 と $2400 は別物理ページ", () => {
    const ppu = new Ppu();
    ppu.mirroring = "vertical";
    ppu.vram[0] = 0x11;
    ppu.vram[0x400] = 0x22;
    expect(ppu.ppuRead(0x2000)).toBe(0x11);
    expect(ppu.ppuRead(0x2400)).toBe(0x22);
  });

  it("水平ミラー: $2000 と $2400 が同一物理ページ", () => {
    const ppu = new Ppu();
    ppu.mirroring = "horizontal";
    ppu.vram[0] = 0xCC;
    expect(ppu.ppuRead(0x2000)).toBe(0xCC);
    expect(ppu.ppuRead(0x2400)).toBe(0xCC);
  });

  it("水平ミラー: $2800 と $2C00 が同一物理ページ", () => {
    const ppu = new Ppu();
    ppu.mirroring = "horizontal";
    ppu.vram[0x400] = 0xDD;
    expect(ppu.ppuRead(0x2800)).toBe(0xDD);
    expect(ppu.ppuRead(0x2C00)).toBe(0xDD);
  });

  it("水平ミラー: $2000 と $2800 は別物理ページ", () => {
    const ppu = new Ppu();
    ppu.mirroring = "horizontal";
    ppu.vram[0] = 0x33;
    ppu.vram[0x400] = 0x44;
    expect(ppu.ppuRead(0x2000)).toBe(0x33);
    expect(ppu.ppuRead(0x2800)).toBe(0x44);
  });
});

describe("PPU ミラーリング write 経由検証", () => {
  it("垂直ミラー: PPUDATA で $2000 に書いた値が $2800 から読める", () => {
    const ppu = new Ppu();
    ppu.mirroring = "vertical";

    ppu.write(6, 0x20);
    ppu.write(6, 0x00);
    ppu.write(7, 0x42);

    expect(ppu.ppuRead(0x2000)).toBe(0x42);
    expect(ppu.ppuRead(0x2800)).toBe(0x42);
  });

  it("水平ミラー: PPUDATA で $2400 に書いた値が $2000 から読める", () => {
    const ppu = new Ppu();
    ppu.mirroring = "horizontal";

    ppu.write(6, 0x24);
    ppu.write(6, 0x10);
    ppu.write(7, 0x55);

    expect(ppu.ppuRead(0x2010)).toBe(0x55);
    expect(ppu.ppuRead(0x2410)).toBe(0x55);
  });

  it("水平ミラー: $2800 への write が $2000 に影響しない", () => {
    const ppu = new Ppu();
    ppu.mirroring = "horizontal";

    ppu.write(6, 0x20);
    ppu.write(6, 0x00);
    ppu.write(7, 0xAA);

    ppu.write(6, 0x28);
    ppu.write(6, 0x00);
    ppu.write(7, 0xBB);

    expect(ppu.ppuRead(0x2000)).toBe(0xAA);
    expect(ppu.ppuRead(0x2800)).toBe(0xBB);
  });
});

describe("PPU X スクロール", () => {
  function setupScrollTest(ppu: Ppu): void {
    ppu.write(0, 0x00);
    ppu.mask = 0x08;
    ppu.mirroring = "vertical";
    ppu.palette[0] = 0x0F;
    ppu.palette[1] = 0x01;
  }

  it("scrollX=0 のとき最初のタイルが画面左端に表示される", () => {
    const ppu = new Ppu();
    setupScrollTest(ppu);
    ppu.scrollX = 0;
    applyScroll(ppu);

    ppu.chrRam[0] = 0xFF;
    ppu.chrRam[8] = 0x00;
    ppu.vram[0] = 0;

    renderScanline0(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x01);
    }
  });

  it("scrollX=8 でタイル 1 が画面左端に来る", () => {
    const ppu = new Ppu();
    setupScrollTest(ppu);
    ppu.scrollX = 8;
    applyScroll(ppu);

    ppu.chrRam[0] = 0x00;
    ppu.chrRam[8] = 0x00;
    ppu.chrRam[16] = 0xFF;
    ppu.chrRam[24] = 0x00;
    ppu.vram[0] = 0;
    ppu.vram[1] = 1;

    renderScanline0(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x01);
    }
  });

  it("fine X スクロール (scrollX=3) でタイル境界が 3px シフトする", () => {
    const ppu = new Ppu();
    setupScrollTest(ppu);
    ppu.scrollX = 3;
    applyScroll(ppu);

    ppu.chrRam[0] = 0xFF;
    ppu.chrRam[8] = 0x00;
    ppu.chrRam[16] = 0x00;
    ppu.chrRam[24] = 0x00;
    ppu.vram[0] = 0;
    ppu.vram[1] = 1;
    ppu.palette[0] = 0x0F;
    ppu.palette[1] = 0x21;

    renderScanline0(ppu);

    for (let x = 0; x < 5; x++) {
      expect(ppu.framebuffer[x]).toBe(0x21);
    }
    for (let x = 5; x < 13; x++) {
      expect(ppu.framebuffer[x]).toBe(0x0F);
    }
  });

  it("X スクロールが 256px 境界で隣の NT に wrap する (垂直ミラー)", () => {
    const ppu = new Ppu();
    setupScrollTest(ppu);
    ppu.scrollX = 248;
    applyScroll(ppu);

    ppu.chrRam[0] = 0xFF;
    ppu.chrRam[8] = 0x00;
    ppu.vram[31] = 0;
    ppu.vram[0x400] = 0;
    ppu.palette[1] = 0x15;

    renderScanline0(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x15);
    }
    for (let x = 8; x < 16; x++) {
      expect(ppu.framebuffer[x]).toBe(0x15);
    }
  });
});

describe("PPU Y スクロール", () => {
  it("scrollY=8 で 2 行目のタイルが画面最上段に表示される", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.mask = 0x08;
    ppu.mirroring = "vertical";
    ppu.scrollX = 0;
    ppu.scrollY = 8;
    applyScroll(ppu);

    ppu.chrRam[0] = 0x00;
    ppu.chrRam[8] = 0x00;
    ppu.chrRam[16] = 0xFF;
    ppu.chrRam[24] = 0x00;
    ppu.vram[32] = 1;
    ppu.palette[0] = 0x0F;
    ppu.palette[1] = 0x22;

    renderScanline0(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x22);
    }
  });

  it("scrollY で fineY が正しく反映される", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.mask = 0x08;
    ppu.mirroring = "vertical";
    ppu.scrollX = 0;
    ppu.scrollY = 2;
    applyScroll(ppu);

    ppu.chrRam[2] = 0xFF;
    ppu.chrRam[10] = 0x00;
    ppu.vram[0] = 0;
    ppu.palette[0] = 0x0F;
    ppu.palette[1] = 0x33;

    renderScanline0(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x33);
    }
  });

  it("scrollY=240 で垂直方向の NT 切替が起きる", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.mask = 0x08;
    ppu.mirroring = "horizontal";
    ppu.scrollX = 0;
    ppu.scrollY = 240;
    applyScroll(ppu);

    ppu.chrRam[16] = 0xFF;
    ppu.chrRam[24] = 0x00;
    ppu.vram[0x400] = 1;
    ppu.palette[0] = 0x0F;
    ppu.palette[1] = 0x30;

    renderScanline0(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x30);
    }
  });
});

describe("PPU X+Y 複合スクロール", () => {
  it("scrollX=128, scrollY=16 で正しいタイルが描画される", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.mask = 0x08;
    ppu.mirroring = "vertical";
    ppu.scrollX = 128;
    ppu.scrollY = 16;
    applyScroll(ppu);

    const tileCol = 16;
    const tileRow = 2;
    const tileIdx = 5;
    ppu.vram[tileRow * 32 + tileCol] = tileIdx;
    ppu.chrRam[tileIdx * 16] = 0xFF;
    ppu.chrRam[tileIdx * 16 + 8] = 0x00;
    ppu.palette[0] = 0x0F;
    ppu.palette[1] = 0x19;

    renderScanline0(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x19);
    }
  });

  it("scrollX=255 で画面右端が正しく隣 NT から描画される", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.mask = 0x08;
    ppu.mirroring = "vertical";
    ppu.scrollX = 255;
    ppu.scrollY = 0;
    applyScroll(ppu);

    ppu.chrRam[0] = 0xFF;
    ppu.chrRam[8] = 0xFF;

    ppu.vram[31] = 0;
    ppu.vram[0x400] = 0;
    ppu.palette[0] = 0x0F;
    ppu.palette[3] = 0x2A;

    renderScanline0(ppu);

    expect(ppu.framebuffer[0]).toBe(0x2A);

    expect(ppu.framebuffer[1]).toBe(0x2A);
  });

  it("scrollY=232 + scanline=7 でタイル行29→0への wrap が起きる", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.mask = 0x08;
    ppu.mirroring = "horizontal";
    ppu.scrollX = 0;
    ppu.scrollY = 232;
    applyScroll(ppu);

    const tileIdx = 3;
    ppu.vram[29 * 32] = tileIdx;
    ppu.chrRam[tileIdx * 16] = 0xFF;
    ppu.chrRam[tileIdx * 16 + 8] = 0x00;
    ppu.palette[0] = 0x0F;
    ppu.palette[1] = 0x31;

    renderScanline0(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x31);
    }
  });
});

describe("PPU PPUCTRL ベース NT 選択", () => {
  it("PPUCTRL bit0-1 = 1 で NT $2400 がベースになる", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x01);
    ppu.mask = 0x08;
    ppu.mirroring = "vertical";
    ppu.scrollX = 0;
    ppu.scrollY = 0;
    applyScroll(ppu);

    ppu.chrRam[16] = 0xFF;
    ppu.chrRam[24] = 0x00;
    ppu.vram[0x400] = 1;
    ppu.palette[0] = 0x0F;
    ppu.palette[1] = 0x25;

    renderScanline0(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x25);
    }
  });

  it("PPUCTRL bit0-1 = 2 で NT $2800 がベースになる", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x02);
    ppu.mask = 0x08;
    ppu.mirroring = "vertical";
    ppu.scrollX = 0;
    ppu.scrollY = 0;
    applyScroll(ppu);

    ppu.chrRam[16] = 0xFF;
    ppu.chrRam[24] = 0x00;
    ppu.vram[0] = 1;
    ppu.palette[0] = 0x0F;
    ppu.palette[1] = 0x26;

    renderScanline0(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x26);
    }
  });
});
