/**
 * PPU エッジケーステスト。
 * open bus (IO latch)、パレットミラーリング、$2007 read バッファ動作を検証。
 */

import { describe, it, expect } from "bun:test";
import { Ppu } from "../src/core/ppu.ts";

describe("PPU IO latch (open bus)", () => {
  it("write 後の latch は書き込み値を保持", () => {
    const ppu = new Ppu();
    ppu.write(0, 0xab);
    expect(ppu.ioLatch).toBe(0xab);
  });

  it("write-only レジスタ ($2000) の read は latch 値", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x55);
    expect(ppu.read(0)).toBe(0x55);
  });

  it("write-only レジスタ ($2001) の read は latch 値", () => {
    const ppu = new Ppu();
    ppu.write(1, 0x3c);
    expect(ppu.read(1)).toBe(0x3c);
  });

  it("write-only レジスタ ($2003) の read は latch 値", () => {
    const ppu = new Ppu();
    ppu.write(3, 0x77);
    expect(ppu.read(3)).toBe(0x77);
  });

  it("write-only レジスタ ($2005) の read は latch 値", () => {
    const ppu = new Ppu();
    ppu.write(5, 0x88);
    expect(ppu.read(5)).toBe(0x88);
  });

  it("write-only レジスタ ($2006) の read は latch 値", () => {
    const ppu = new Ppu();
    ppu.write(6, 0x22);
    expect(ppu.read(6)).toBe(0x22);
  });

  it("$2002 read は bit 7-5 がステータス、bit 4-0 が open bus", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x1f);
    ppu.status = 0xe0;
    const val = ppu.read(2);
    expect(val & 0xe0).toBe(0xe0);
    expect(val & 0x1f).toBe(0x1f);
  });

  it("$2002 read: ステータスが 0 の時は bit 4-0 に latch が残る", () => {
    const ppu = new Ppu();
    ppu.write(1, 0x15);
    ppu.status = 0x00;
    const val = ppu.read(2);
    expect(val).toBe(0x15);
  });

  it("read は latch を更新する", () => {
    const ppu = new Ppu();
    ppu.write(0, 0xff);
    ppu.status = 0x80;
    // $2002 read → val = 0x80 | (0xff & 0x1f) = 0x9f
    const val = ppu.read(2);
    expect(val).toBe(0x9f);
    expect(ppu.ioLatch).toBe(0x9f);
  });

  it("連続 read で latch が前回の read 値を保持", () => {
    const ppu = new Ppu();
    ppu.write(0, 0xab);
    // read(0) → latch = 0xab
    expect(ppu.read(0)).toBe(0xab);
    // read(1) → also write-only → latch を返す = 0xab
    expect(ppu.read(1)).toBe(0xab);
  });

  it("reset で latch がクリアされる", () => {
    const ppu = new Ppu();
    ppu.write(0, 0xff);
    ppu.reset();
    expect(ppu.ioLatch).toBe(0);
  });
});

describe("パレットミラーリング", () => {
  it("$3F10 → $3F00 にミラー", () => {
    expect(Ppu.mirrorPalette(0x3f10)).toBe(0x00);
  });

  it("$3F14 → $3F04 にミラー", () => {
    expect(Ppu.mirrorPalette(0x3f14)).toBe(0x04);
  });

  it("$3F18 → $3F08 にミラー", () => {
    expect(Ppu.mirrorPalette(0x3f18)).toBe(0x08);
  });

  it("$3F1C → $3F0C にミラー", () => {
    expect(Ppu.mirrorPalette(0x3f1c)).toBe(0x0c);
  });

  it("$3F11 はミラーされない (スプライトパレット1 色1)", () => {
    expect(Ppu.mirrorPalette(0x3f11)).toBe(0x11);
  });

  it("$3F01 はミラーされない (背景パレット0 色1)", () => {
    expect(Ppu.mirrorPalette(0x3f01)).toBe(0x01);
  });

  it("writeVram 経由で $3F10 に書くと $3F00 にもミラーされる", () => {
    const ppu = new Ppu();
    // $2006 で $3F10 に VRAM アドレスをセット
    ppu.write(6, 0x3f);
    ppu.write(6, 0x10);
    // $2007 で 値を書く
    ppu.write(7, 0x2a);
    expect(ppu.palette[0x00]).toBe(0x2a);
    expect(ppu.palette[0x10]).toBe(0x2a);
  });

  it("writeVram 経由で $3F00 に書くと $3F10 にもミラーされる", () => {
    const ppu = new Ppu();
    ppu.write(6, 0x3f);
    ppu.write(6, 0x00);
    ppu.write(7, 0x15);
    expect(ppu.palette[0x00]).toBe(0x15);
    expect(ppu.palette[0x10]).toBe(0x15);
  });

  it("$3F04 に書くと $3F14 にもミラーされる", () => {
    const ppu = new Ppu();
    ppu.write(6, 0x3f);
    ppu.write(6, 0x04);
    ppu.write(7, 0x30);
    expect(ppu.palette[0x04]).toBe(0x30);
    expect(ppu.palette[0x14]).toBe(0x30);
  });

  it("ppuRead でパレットミラーが反映される", () => {
    const ppu = new Ppu();
    ppu.palette[0x00] = 0x0f;
    // ppuRead($3F10) → mirrorPalette → index 0 → 0x0f
    expect(ppu.ppuRead(0x3f10)).toBe(0x0f);
    expect(ppu.ppuRead(0x3f14)).toBe(ppu.palette[0x04]);
    expect(ppu.ppuRead(0x3f18)).toBe(ppu.palette[0x08]);
    expect(ppu.ppuRead(0x3f1c)).toBe(ppu.palette[0x0c]);
  });

  it("パレットアドレスは $3F20 以上で折り返す ($3FFF まで)", () => {
    const ppu = new Ppu();
    ppu.palette[0x01] = 0x22;
    // $3F21 → addr & 0x1f = 0x01
    expect(ppu.ppuRead(0x3f21)).toBe(0x22);
    // $3F60 → addr & 0x1f = 0x00 → mirrorPalette(0x3f60) = 0
    ppu.palette[0x00] = 0x33;
    expect(ppu.ppuRead(0x3f60)).toBe(0x33);
  });
});

describe("$2002 PPUSTATUS read 副作用", () => {
  it("vblank フラグが read 後にクリアされる", () => {
    const ppu = new Ppu();
    ppu.status = 0x80;
    ppu.read(2);
    expect(ppu.status & 0x80).toBe(0);
  });

  it("write toggle (w) が read 後にリセットされる", () => {
    const ppu = new Ppu();
    ppu.write(5, 0x10); // 1st write → w = true
    expect(ppu.w).toBe(true);
    ppu.read(2); // w をリセット
    expect(ppu.w).toBe(false);
  });

  it("sprite 0 hit と sprite overflow は read でクリアされない", () => {
    const ppu = new Ppu();
    ppu.status = 0x60; // bit 6 (sprite 0 hit) + bit 5 (sprite overflow)
    ppu.read(2);
    // bit 6, 5 は保持される (vblank bit 7 のみクリア)
    expect(ppu.status & 0x60).toBe(0x60);
  });
});

describe("$2007 read バッファ", () => {
  it("CHR 領域は 1 read 遅延 (バッファ経由)", () => {
    const ppu = new Ppu();
    // CHR RAM に値をセット
    ppu.chrRam[0x0000] = 0xaa;
    ppu.chrRam[0x0001] = 0xbb;
    // VRAM アドレスを $0000 にセット (ctrl bit2=0 → +1 increment)
    ppu.write(0, 0x00);
    ppu.write(6, 0x00);
    ppu.write(6, 0x00);
    // 1 回目の read → バッファが空なので古い値 (0)、バッファに $0000 の値
    const first = ppu.read(7);
    expect(first).toBe(0);
    // 2 回目の read → バッファから $0000 の値 (0xaa)
    const second = ppu.read(7);
    expect(second).toBe(0xaa);
    // 3 回目 → $0001 の値 (0xbb)
    const third = ppu.read(7);
    expect(third).toBe(0xbb);
  });

  it("ネームテーブル領域も 1 read 遅延", () => {
    const ppu = new Ppu();
    ppu.vram[0x000] = 0x11;
    ppu.vram[0x001] = 0x22;
    ppu.write(0, 0x00);
    ppu.write(6, 0x20);
    ppu.write(6, 0x00);
    // 1 回目: バッファ初期値
    const first = ppu.read(7);
    expect(first).toBe(0);
    // 2 回目: vram[0] の値
    const second = ppu.read(7);
    expect(second).toBe(0x11);
  });

  it("パレット領域は即値返却 (遅延なし)", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.write(6, 0x3f);
    ppu.write(6, 0x00);
    ppu.write(7, 0x0f);
    // アドレスを戻して read
    ppu.write(6, 0x3f);
    ppu.write(6, 0x00);
    const val = ppu.read(7);
    expect(val).toBe(0x0f);
  });

  it("パレット read 時にバッファにネームテーブルの値が入る", () => {
    const ppu = new Ppu();
    // ネームテーブル $2F00 に値を入れる (ミラー先)
    // $3F00 をパレット read すると、裏のネームテーブルアドレスの値がバッファに入る
    // $3F00 のネームテーブルミラー先は $2F00 (= vram offset)
    ppu.vram[ppu["mirrorNametable"](0x3f00)] = 0x42;
    ppu.palette[0x00] = 0x0f;
    ppu.write(0, 0x00);
    ppu.write(6, 0x3f);
    ppu.write(6, 0x00);
    // パレット read → 即値 0x0f、バッファに NT の値
    const palVal = ppu.read(7);
    expect(palVal).toBe(0x0f);
    // 次に CHR/NT 領域を read するとバッファの値が返る
    // まず v を CHR 領域に設定
    ppu.write(6, 0x00);
    ppu.write(6, 0x00);
    ppu.chrRam[0x0000] = 0x99;
    const buffered = ppu.read(7);
    expect(buffered).toBe(0x42);
  });

  it("$2007 read で VRAM アドレスが +1 インクリメントされる (ctrl bit2=0)", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.write(6, 0x20);
    ppu.write(6, 0x00);
    ppu.read(7);
    // v は $2001 になっているはず
    expect(ppu.v).toBe(0x2001);
  });

  it("$2007 read で VRAM アドレスが +32 インクリメントされる (ctrl bit2=1)", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x04);
    ppu.write(6, 0x20);
    ppu.write(6, 0x00);
    ppu.read(7);
    expect(ppu.v).toBe(0x2020);
  });

  it("$2007 write で VRAM アドレスが +1 インクリメントされる", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.write(6, 0x20);
    ppu.write(6, 0x00);
    ppu.write(7, 0x55);
    expect(ppu.v).toBe(0x2001);
    expect(ppu.vram[0]).toBe(0x55);
  });

  it("$2007 write で VRAM アドレスが +32 インクリメントされる", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x04);
    ppu.write(6, 0x20);
    ppu.write(6, 0x00);
    ppu.write(7, 0x77);
    expect(ppu.v).toBe(0x2020);
  });
});

describe("$2004 OAMDATA", () => {
  it("read は oamAddr の OAM データを返す", () => {
    const ppu = new Ppu();
    ppu.oam[0x10] = 0xab;
    ppu.write(3, 0x10);
    expect(ppu.read(4)).toBe(0xab);
  });

  it("write で OAM に書き込み、oamAddr が +1 される", () => {
    const ppu = new Ppu();
    ppu.write(3, 0x00);
    ppu.write(4, 0x11);
    ppu.write(4, 0x22);
    expect(ppu.oam[0x00]).toBe(0x11);
    expect(ppu.oam[0x01]).toBe(0x22);
    expect(ppu.oamAddr).toBe(0x02);
  });

  it("oamAddr は $FF で wrap around して $00 になる", () => {
    const ppu = new Ppu();
    ppu.write(3, 0xff);
    ppu.write(4, 0xee);
    expect(ppu.oam[0xff]).toBe(0xee);
    expect(ppu.oamAddr).toBe(0x00);
  });
});
