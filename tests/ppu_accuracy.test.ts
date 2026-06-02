/**
 * PPU サイクル精度テスト。
 * 奇数フレームスキップ、左端クリッピング、スプライト 0 hit タイミング、
 * open bus decay を検証。
 */

import { describe, expect, it } from "vitest";
import { Ppu, SCREEN_W } from "../src/core/ppu.ts";

function advanceTo(ppu: Ppu, scanline: number, dot: number): void {
  const target = scanline * 341 + dot;
  const current = ppu.scanline * 341 + ppu.dot;
  const ticks = target > current ? target - current : (262 * 341 - current) + target;
  for (let i = 0; i < ticks; i++) {
    ppu.tick();
  }
}

function tickOneScanline(ppu: Ppu): void {
  for (let i = 0; i < 341; i++) {
    ppu.tick();
  }
}

describe("奇数フレームスキップ", () => {
  it("偶数フレームは 341×262 = 89342 dot", () => {
    const ppu = new Ppu();
    ppu.mask = 0x08;
    let dotCount = 0;
    while (!ppu.frameComplete) {
      ppu.tick();
      dotCount++;
    }
    expect(dotCount).toBe(89342);
    expect(ppu.oddFrame).toBe(true);
  });

  it("奇数フレーム (BG有効) は 89341 dot (1 dot 短い)", () => {
    const ppu = new Ppu();
    ppu.mask = 0x08;
    // 偶数フレームを完了
    while (!ppu.frameComplete) ppu.tick();
    ppu.frameComplete = false;
    expect(ppu.oddFrame).toBe(true);

    let dotCount = 0;
    while (!ppu.frameComplete) {
      ppu.tick();
      dotCount++;
    }
    expect(dotCount).toBe(89341);
  });

  it("BG無効時は奇数フレームでもスキップしない (89342 dot)", () => {
    const ppu = new Ppu();
    ppu.mask = 0x00;
    // 偶数フレーム
    while (!ppu.frameComplete) ppu.tick();
    ppu.frameComplete = false;

    // 奇数フレーム (BG無効)
    let dotCount = 0;
    while (!ppu.frameComplete) {
      ppu.tick();
      dotCount++;
    }
    expect(dotCount).toBe(89342);
  });

  it("oddFrame フラグがフレームごとにトグルする", () => {
    const ppu = new Ppu();
    ppu.mask = 0x08;
    expect(ppu.oddFrame).toBe(false);

    while (!ppu.frameComplete) ppu.tick();
    expect(ppu.oddFrame).toBe(true);

    ppu.frameComplete = false;
    while (!ppu.frameComplete) ppu.tick();
    expect(ppu.oddFrame).toBe(false);
  });
});

describe("背景左端 8px クリッピング ($2001 bit1)", () => {
  function setupBg(ppu: Ppu): void {
    ppu.chrRam[0] = 0xff;
    ppu.chrRam[8] = 0x00;
    ppu.vram[0] = 0;
    ppu.palette[0] = 0x0f;
    ppu.palette[1] = 0x20;
  }

  it("bit1=0: 左端 8px は背景色 (palette[0]) になる", () => {
    const ppu = new Ppu();
    ppu.mask = 0x08;
    setupBg(ppu);

    tickOneScanline(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x0f);
    }
  });

  it("bit1=1: 左端 8px も背景タイルが描画される", () => {
    const ppu = new Ppu();
    ppu.mask = 0x0a;
    setupBg(ppu);

    tickOneScanline(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[x]).toBe(0x20);
    }
  });
});

describe("スプライト左端 8px クリッピング ($2001 bit2)", () => {
  function setupSprite(ppu: Ppu): void {
    ppu.oam.fill(0xff);
    ppu.oam[0] = 0;
    ppu.oam[1] = 1;
    ppu.oam[2] = 0;
    ppu.oam[3] = 0;
    ppu.chrRam[16] = 0xff;
    ppu.chrRam[24] = 0x00;
    ppu.palette[0] = 0x0f;
    ppu.palette[0x11] = 0x30;
  }

  it("bit2=0: 左端 8px でスプライトは描画されない", () => {
    const ppu = new Ppu();
    ppu.mask = 0x18;
    setupSprite(ppu);

    advanceTo(ppu, 1, 0);
    tickOneScanline(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[SCREEN_W + x]).toBe(0x0f);
    }
  });

  it("bit2=1: 左端 8px でもスプライトが描画される", () => {
    const ppu = new Ppu();
    ppu.mask = 0x1c;
    setupSprite(ppu);

    advanceTo(ppu, 1, 0);
    tickOneScanline(ppu);

    for (let x = 0; x < 8; x++) {
      expect(ppu.framebuffer[SCREEN_W + x]).toBe(0x30);
    }
  });
});

describe("スプライト 0 hit と左端クリッピング", () => {
  function setupSprite0Hit(ppu: Ppu): void {
    ppu.oam.fill(0xff);
    ppu.oam[0] = 0;
    ppu.oam[1] = 1;
    ppu.oam[2] = 0;
    ppu.oam[3] = 0;
    // BG タイル 0: 全 row で lo=0xff, hi=0x00 → colorIdx 1
    for (let r = 0; r < 8; r++) {
      ppu.chrRam[r] = 0xff;
      ppu.chrRam[8 + r] = 0x00;
    }
    // スプライトタイル 1: 全 row で lo=0xff, hi=0x00 → colorIdx 1
    for (let r = 0; r < 8; r++) {
      ppu.chrRam[16 + r] = 0xff;
      ppu.chrRam[24 + r] = 0x00;
    }
    ppu.vram[0] = 0;
    ppu.palette[0] = 0x0f;
    ppu.palette[1] = 0x20;
    ppu.palette[0x11] = 0x30;
  }

  it("BG+スプライト左端表示有効: 左端でスプライト 0 hit が発生する", () => {
    const ppu = new Ppu();
    ppu.mask = 0x1e;
    setupSprite0Hit(ppu);

    advanceTo(ppu, 1, 0);
    tickOneScanline(ppu);

    expect(ppu.status & 0x40).toBe(0x40);
  });

  it("BG左端クリップ時: 左端でスプライト 0 hit は発生しない", () => {
    const ppu = new Ppu();
    ppu.mask = 0x1c;
    setupSprite0Hit(ppu);

    advanceTo(ppu, 1, 0);
    tickOneScanline(ppu);

    expect(ppu.status & 0x40).toBe(0);
  });

  it("スプライト左端クリップ時: 左端でスプライト 0 hit は発生しない", () => {
    const ppu = new Ppu();
    ppu.mask = 0x1a;
    setupSprite0Hit(ppu);

    advanceTo(ppu, 1, 0);
    tickOneScanline(ppu);

    expect(ppu.status & 0x40).toBe(0);
  });

  it("左端以外 (x>=8) ではクリッピングに関係なくスプライト 0 hit が発生する", () => {
    const ppu = new Ppu();
    ppu.mask = 0x18;
    ppu.oam.fill(0xff);
    ppu.oam[0] = 0;
    ppu.oam[1] = 1;
    ppu.oam[2] = 0;
    ppu.oam[3] = 10;
    for (let r = 0; r < 8; r++) {
      ppu.chrRam[r] = 0xff;
      ppu.chrRam[8 + r] = 0x00;
      ppu.chrRam[16 + r] = 0xff;
      ppu.chrRam[24 + r] = 0x00;
    }
    ppu.vram[0] = 0;
    ppu.vram[1] = 0;
    ppu.palette[0] = 0x0f;
    ppu.palette[1] = 0x20;
    ppu.palette[0x11] = 0x30;

    advanceTo(ppu, 1, 0);
    tickOneScanline(ppu);

    expect(ppu.status & 0x40).toBe(0x40);
  });
});

describe("open bus decay", () => {
  it("IO latch がフレームごとに decay する", () => {
    const ppu = new Ppu();
    ppu.write(0, 0xff);
    expect(ppu.ioLatch).toBe(0xff);

    for (let i = 0; i < 36; i++) {
      ppu.decayOpenBus();
    }

    expect(ppu.ioLatch).toBe(0x00);
  });

  it("各ビットが独立に decay する", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x81);
    expect(ppu.ioLatch).toBe(0x81);

    for (let i = 0; i < 18; i++) {
      ppu.decayOpenBus();
    }
    // まだ 18 フレームなので latch は保持
    expect(ppu.ioLatch).toBe(0x81);

    // 再度 write で bit0 だけリフレッシュ
    ppu.write(0, 0x01);

    for (let i = 0; i < 18; i++) {
      ppu.decayOpenBus();
    }
    // bit7 は 36 フレーム経過で decay、bit0 は 18 フレームなので残る
    expect(ppu.ioLatch).toBe(0x01);
  });

  it("write-only レジスタ read では decay リフレッシュされない", () => {
    const ppu = new Ppu();
    ppu.write(0, 0xff);

    for (let i = 0; i < 35; i++) {
      ppu.decayOpenBus();
    }
    expect(ppu.ioLatch).toBe(0xff);

    // write-only レジスタ ($2000) の read は latch を返すが decay はリフレッシュしない
    ppu.read(0);

    ppu.decayOpenBus();
    // 36 フレーム経過で全ビット decay
    expect(ppu.ioLatch).toBe(0x00);
  });

  it("readable レジスタ ($2004) read で decay がリフレッシュされる", () => {
    const ppu = new Ppu();
    ppu.write(0, 0xff);
    ppu.oam[0] = 0xff;
    ppu.oamAddr = 0;

    for (let i = 0; i < 35; i++) {
      ppu.decayOpenBus();
    }
    expect(ppu.ioLatch).toBe(0xff);

    ppu.read(4);

    for (let i = 0; i < 35; i++) {
      ppu.decayOpenBus();
    }
    expect(ppu.ioLatch).toBe(0xff);
  });

  it("reset で decay カウンタもクリアされる", () => {
    const ppu = new Ppu();
    ppu.write(0, 0xff);
    ppu.reset();

    expect(ppu.ioLatch).toBe(0);
    ppu.decayOpenBus();
    expect(ppu.ioLatch).toBe(0);
  });
});
