/**
 * PPU スプライト描画テスト。
 *
 * OAM DMA / スプライト評価 / 8×8 描画 / flip / priority / sprite 0 hit / overflow。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Ppu, SCREEN_W } from "../src/core/ppu.ts";

/** テスト用ヘルパー: PPU を指定ドット・スキャンラインまで進める */
function tickTo(ppu: Ppu, targetScanline: number, targetDot: number): void {
  while (ppu.scanline !== targetScanline || ppu.dot !== targetDot) {
    ppu.tick();
  }
}

/** OAM にスプライトエントリを設定 */
function setSprite(
  ppu: Ppu,
  index: number,
  y: number,
  tile: number,
  attr: number,
  x: number,
): void {
  ppu.oam[index * 4] = y;
  ppu.oam[index * 4 + 1] = tile;
  ppu.oam[index * 4 + 2] = attr;
  ppu.oam[index * 4 + 3] = x;
}

/** CHR RAM にタイルパターンを書き込む */
function writeTile(
  ppu: Ppu,
  tileIndex: number,
  ptBase: number,
  loPlane: Uint8Array,
  hiPlane: Uint8Array,
): void {
  const addr = ptBase + tileIndex * 16;
  for (let i = 0; i < 8; i++) {
    ppu.chrRam[addr + i] = loPlane[i] ?? 0;
    ppu.chrRam[addr + 8 + i] = hiPlane[i] ?? 0;
  }
}

describe("PPU スプライト描画", () => {
  let ppu: Ppu;

  beforeEach(() => {
    ppu = new Ppu();
    ppu.oam.fill(0xff);
    ppu.mask = 0x18;
    ppu.palette[0] = 0x0f;
  });

  describe("スプライト評価", () => {
    it("スキャンラインに重なるスプライトを最大 8 個選出する", () => {
      for (let i = 0; i < 8; i++) {
        setSprite(ppu, i, 0, 1, 0, i * 10);
      }
      ppu.palette[0x11] = 0x30;
      writeTile(ppu, 1, 0, new Uint8Array(8).fill(0xff), new Uint8Array(8));

      tickTo(ppu, 0, SCREEN_W + 1);

      let spritePixels = 0;
      for (let x = 0; x < SCREEN_W; x++) {
        if ((ppu.framebuffer[x] ?? 0) !== 0x0f) spritePixels++;
      }
      expect(spritePixels).toBeGreaterThan(0);
    });

    it("9 個目のスプライトで sprite overflow ($2002 bit5) がセットされる", () => {
      for (let i = 0; i < 9; i++) {
        setSprite(ppu, i, 0, 1, 0, i * 10);
      }
      writeTile(ppu, 1, 0, new Uint8Array(8).fill(0xff), new Uint8Array(8));

      tickTo(ppu, 1, 0);
      expect(ppu.status & 0x20).toBe(0x20);
    });

    it("8 個以下なら sprite overflow はセットされない", () => {
      for (let i = 0; i < 8; i++) {
        setSprite(ppu, i, 0, 1, 0, i * 10);
      }

      tickTo(ppu, 1, 0);
      expect(ppu.status & 0x20).toBe(0);
    });
  });

  describe("8×8 描画", () => {
    it("スプライトのタイルパターンが正しく描画される", () => {
      setSprite(ppu, 0, 0, 1, 0, 0);
      ppu.palette[0x11] = 0x30;
      writeTile(
        ppu,
        1,
        0,
        new Uint8Array([0x80, 0, 0, 0, 0, 0, 0, 0]),
        new Uint8Array(8),
      );

      tickTo(ppu, 1, 0);

      expect(ppu.framebuffer[0]).toBe(0x30);
      expect(ppu.framebuffer[1]).toBe(0x0f);
    });

    it("PPUCTRL bit3 でスプライトパターンテーブルベースが切り替わる", () => {
      ppu.ctrl = 0x08;
      setSprite(ppu, 0, 0, 1, 0, 0);
      ppu.palette[0x11] = 0x30;
      writeTile(
        ppu,
        1,
        0x1000,
        new Uint8Array(8).fill(0xff),
        new Uint8Array(8),
      );

      tickTo(ppu, 1, 0);

      expect(ppu.framebuffer[0]).toBe(0x30);
    });

    it("透明ピクセル (カラーインデックス 0) は描画しない", () => {
      setSprite(ppu, 0, 0, 1, 0, 0);
      ppu.palette[0x11] = 0x30;
      writeTile(
        ppu,
        1,
        0,
        new Uint8Array([0x80, 0, 0, 0, 0, 0, 0, 0]),
        new Uint8Array(8),
      );

      tickTo(ppu, 1, 0);

      expect(ppu.framebuffer[0]).toBe(0x30);
      expect(ppu.framebuffer[1]).toBe(0x0f);
    });

    it("パレット番号が attribute bit0-1 で選択される", () => {
      setSprite(ppu, 0, 0, 1, 0x02, 0);
      ppu.palette[0x19] = 0x25;
      writeTile(
        ppu,
        1,
        0,
        new Uint8Array([0x80, 0, 0, 0, 0, 0, 0, 0]),
        new Uint8Array(8),
      );

      tickTo(ppu, 1, 0);

      expect(ppu.framebuffer[0]).toBe(0x25);
    });
  });

  describe("flip", () => {
    it("X flip (attribute bit6) で水平反転する", () => {
      setSprite(ppu, 0, 0, 1, 0x40, 0);
      ppu.palette[0x11] = 0x30;
      writeTile(
        ppu,
        1,
        0,
        new Uint8Array([0x80, 0, 0, 0, 0, 0, 0, 0]),
        new Uint8Array(8),
      );

      tickTo(ppu, 1, 0);

      expect(ppu.framebuffer[0]).toBe(0x0f);
      expect(ppu.framebuffer[7]).toBe(0x30);
    });

    it("Y flip (attribute bit7) で垂直反転する", () => {
      setSprite(ppu, 0, 0, 1, 0x80, 0);
      ppu.palette[0x11] = 0x30;
      writeTile(
        ppu,
        1,
        0,
        new Uint8Array([0x80, 0, 0, 0, 0, 0, 0, 0xff]),
        new Uint8Array(8),
      );

      tickTo(ppu, 1, 0);

      expect(ppu.framebuffer[0]).toBe(0x30);
      for (let i = 1; i < 8; i++) {
        expect(ppu.framebuffer[i]).toBe(0x30);
      }
    });
  });

  describe("priority", () => {
    it("priority=0 (前面) ならスプライトが背景の上に描画される", () => {
      setSprite(ppu, 0, 0, 1, 0x00, 0);
      ppu.palette[0x11] = 0x30;
      ppu.palette[1] = 0x15;
      writeTile(
        ppu,
        1,
        0,
        new Uint8Array(8).fill(0xff),
        new Uint8Array(8),
      );

      ppu.vram[0] = 1;
      writeTile(ppu, 1, 0x1000, new Uint8Array(8).fill(0xff), new Uint8Array(8));
      ppu.ctrl = 0x10;

      tickTo(ppu, 1, 0);

      expect(ppu.framebuffer[0]).toBe(0x30);
    });

    it("priority=1 (背面) で背景が不透明ならスプライトは見えない", () => {
      ppu.ctrl = 0x10;
      ppu.palette[1] = 0x15;
      ppu.vram[0] = 2;
      writeTile(ppu, 2, 0x1000, new Uint8Array(8).fill(0xff), new Uint8Array(8));

      setSprite(ppu, 0, 0, 1, 0x20, 0);
      ppu.palette[0x11] = 0x30;
      writeTile(
        ppu,
        1,
        0,
        new Uint8Array(8).fill(0xff),
        new Uint8Array(8),
      );

      tickTo(ppu, 1, 0);

      expect(ppu.framebuffer[0]).toBe(0x15);
    });

    it("priority=1 (背面) で背景が透明ならスプライトが見える", () => {
      setSprite(ppu, 0, 0, 1, 0x20, 0);
      ppu.palette[0x11] = 0x30;
      writeTile(
        ppu,
        1,
        0,
        new Uint8Array(8).fill(0xff),
        new Uint8Array(8),
      );

      tickTo(ppu, 1, 0);

      expect(ppu.framebuffer[0]).toBe(0x30);
    });

    it("OAM インデックスが小さいスプライトが優先される", () => {
      setSprite(ppu, 0, 0, 1, 0, 0);
      setSprite(ppu, 1, 0, 2, 0, 0);
      ppu.palette[0x11] = 0x30;
      ppu.palette[0x12] = 0x25;
      writeTile(ppu, 1, 0, new Uint8Array(8).fill(0xff), new Uint8Array(8));
      writeTile(ppu, 2, 0, new Uint8Array(8).fill(0xff), new Uint8Array(8).fill(0xff));

      tickTo(ppu, 1, 0);

      expect(ppu.framebuffer[0]).toBe(0x30);
    });
  });

  describe("sprite 0 hit", () => {
    it("sprite 0 の非透明ピクセルが背景の非透明ピクセルと重なったとき bit6 がセットされる", () => {
      ppu.ctrl = 0x10;
      ppu.palette[1] = 0x15;
      ppu.vram[0] = 2;
      writeTile(ppu, 2, 0x1000, new Uint8Array(8).fill(0xff), new Uint8Array(8));

      setSprite(ppu, 0, 0, 1, 0, 0);
      ppu.palette[0x11] = 0x30;
      writeTile(ppu, 1, 0, new Uint8Array(8).fill(0xff), new Uint8Array(8));

      tickTo(ppu, 1, 0);

      expect(ppu.status & 0x40).toBe(0x40);
    });

    it("背景が透明なら sprite 0 hit は発生しない", () => {
      setSprite(ppu, 0, 0, 1, 0, 0);
      ppu.palette[0x11] = 0x30;
      writeTile(ppu, 1, 0, new Uint8Array(8).fill(0xff), new Uint8Array(8));

      tickTo(ppu, 1, 0);

      expect(ppu.status & 0x40).toBe(0);
    });

    it("X=255 では sprite 0 hit は発生しない", () => {
      ppu.ctrl = 0x10;
      ppu.palette[1] = 0x15;

      for (let nt = 0; nt < 32; nt++) {
        ppu.vram[nt] = 2;
      }
      writeTile(ppu, 2, 0x1000, new Uint8Array(8).fill(0xff), new Uint8Array(8));

      setSprite(ppu, 0, 0, 1, 0, 248);
      ppu.palette[0x11] = 0x30;
      writeTile(ppu, 1, 0, new Uint8Array([0x01, 0, 0, 0, 0, 0, 0, 0]), new Uint8Array(8));

      tickTo(ppu, 1, 0);

      expect(ppu.status & 0x40).toBe(0);
    });

    it("背景描画が無効のとき sprite 0 hit は発生しない", () => {
      ppu.mask = 0x10;
      setSprite(ppu, 0, 0, 1, 0, 0);
      ppu.palette[0x11] = 0x30;
      writeTile(ppu, 1, 0, new Uint8Array(8).fill(0xff), new Uint8Array(8));

      tickTo(ppu, 1, 0);

      expect(ppu.status & 0x40).toBe(0);
    });

    it("スプライト描画が無効のとき sprite 0 hit は発生しない", () => {
      ppu.ctrl = 0x10;
      ppu.mask = 0x08;
      ppu.palette[1] = 0x15;
      ppu.vram[0] = 2;
      writeTile(ppu, 2, 0x1000, new Uint8Array(8).fill(0xff), new Uint8Array(8));

      setSprite(ppu, 0, 0, 1, 0, 0);
      ppu.palette[0x11] = 0x30;
      writeTile(ppu, 1, 0, new Uint8Array(8).fill(0xff), new Uint8Array(8));

      tickTo(ppu, 1, 0);

      expect(ppu.status & 0x40).toBe(0);
    });

    it("pre-render line で sprite 0 hit がクリアされる", () => {
      ppu.status |= 0x40;

      tickTo(ppu, 261, 2);

      expect(ppu.status & 0x40).toBe(0);
    });
  });

  describe("sprite overflow", () => {
    it("pre-render line で sprite overflow がクリアされる", () => {
      ppu.status |= 0x20;

      tickTo(ppu, 261, 2);

      expect(ppu.status & 0x20).toBe(0);
    });
  });

  describe("PPUMASK 制御", () => {
    it("PPUMASK bit4=0 のときスプライトは描画されない", () => {
      ppu.mask = 0x08;
      setSprite(ppu, 0, 0, 1, 0, 0);
      ppu.palette[0x11] = 0x30;
      writeTile(ppu, 1, 0, new Uint8Array(8).fill(0xff), new Uint8Array(8));

      tickTo(ppu, 1, 0);

      expect(ppu.framebuffer[0]).toBe(0x0f);
    });
  });
});

describe("OAM DMA", () => {
  it("$4014 write で CPU ページから OAM に 256 バイト転送される", async () => {
    const { NesBus } = await import("../src/core/nes-bus.ts");
    const { Ppu } = await import("../src/core/ppu.ts");
    const { Controller } = await import("../src/core/controller.ts");

    const ppu = new Ppu();
    const cart = {
      prgRom: new Uint8Array(0x8000),
      chrRom: new Uint8Array(0x2000),
      mapper: 0,
      mirroring: 0 as const,
      hasBatteryRam: false,
    };
    const controller = new Controller();
    const bus = new NesBus(ppu, cart, controller);

    for (let i = 0; i < 256; i++) {
      bus.write(0x0200 + i, i);
    }

    bus.write(0x4014, 0x02);

    for (let i = 0; i < 256; i++) {
      expect(ppu.oam[i]).toBe(i);
    }
  });

  it("DMA で 513 サイクルが記録される", async () => {
    const { NesBus } = await import("../src/core/nes-bus.ts");
    const { Ppu } = await import("../src/core/ppu.ts");
    const { Controller } = await import("../src/core/controller.ts");

    const ppu = new Ppu();
    const cart = {
      prgRom: new Uint8Array(0x8000),
      chrRom: new Uint8Array(0x2000),
      mapper: 0,
      mirroring: 0 as const,
      hasBatteryRam: false,
    };
    const controller = new Controller();
    const bus = new NesBus(ppu, cart, controller);

    bus.write(0x4014, 0x02);

    expect(bus.dmaCycles).toBe(513);
  });
});
