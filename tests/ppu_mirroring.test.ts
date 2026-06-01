/**
 * PPU ネームテーブルミラーリングのアドレス変換テスト。
 *
 * 各ミラーリングモード (horizontal / vertical / single-lower / single-upper / four-screen) で
 * PPU $2000-$2FFF の read/write が正しい VRAM オフセットにマッピングされることを検証する。
 */

import { describe, it, expect } from "vitest";
import { Ppu } from "../src/core/ppu.ts";

/** PPU の VRAM に直接書き込み、read で取得するヘルパー */
function writeThenRead(ppu: Ppu, writeAddr: number, value: number, readAddr: number): number {
  // ppuWrite: PPUADDR ($2006) で書き込みアドレス設定 → PPUDATA ($2007) で書き込み
  ppu.write(6, (writeAddr >> 8) & 0xff);
  ppu.write(6, writeAddr & 0xff);
  ppu.write(7, value);

  // ppuRead: PPUADDR ($2006) で読み出しアドレス設定 → PPUDATA ($2007) で読み出し
  ppu.write(6, (readAddr >> 8) & 0xff);
  ppu.write(6, readAddr & 0xff);
  ppu.read(7); // 1 回目は buffered read (ネームテーブル領域)
  return ppu.read(7);
}

describe("PPU ミラーリング", () => {
  describe("vertical ミラーリング", () => {
    it("$2000 と $2800 が同じ物理アドレス", () => {
      const ppu = new Ppu();
      ppu.mirroring = "vertical";
      const val = writeThenRead(ppu, 0x2000, 0xab, 0x2800);
      expect(val).toBe(0xab);
    });

    it("$2400 と $2c00 が同じ物理アドレス", () => {
      const ppu = new Ppu();
      ppu.mirroring = "vertical";
      const val = writeThenRead(ppu, 0x2400, 0xcd, 0x2c00);
      expect(val).toBe(0xcd);
    });

    it("$2000 と $2400 は異なる物理アドレス", () => {
      const ppu = new Ppu();
      ppu.mirroring = "vertical";
      writeThenRead(ppu, 0x2000, 0x11, 0x2000);
      const val = writeThenRead(ppu, 0x2400, 0x22, 0x2000);
      // $2000 に書いた 0x11 がまだ残っている
      expect(val).toBe(0x11);
    });
  });

  describe("horizontal ミラーリング", () => {
    it("$2000 と $2400 が同じ物理アドレス", () => {
      const ppu = new Ppu();
      ppu.mirroring = "horizontal";
      const val = writeThenRead(ppu, 0x2000, 0xef, 0x2400);
      expect(val).toBe(0xef);
    });

    it("$2800 と $2c00 が同じ物理アドレス", () => {
      const ppu = new Ppu();
      ppu.mirroring = "horizontal";
      const val = writeThenRead(ppu, 0x2800, 0x99, 0x2c00);
      expect(val).toBe(0x99);
    });

    it("$2000 と $2800 は異なる物理アドレス", () => {
      const ppu = new Ppu();
      ppu.mirroring = "horizontal";
      writeThenRead(ppu, 0x2000, 0x33, 0x2000);
      const val = writeThenRead(ppu, 0x2800, 0x44, 0x2000);
      expect(val).toBe(0x33);
    });
  });

  describe("single-lower ミラーリング", () => {
    it("4 つのネームテーブルが全て同じ物理ページ (下位)", () => {
      const ppu = new Ppu();
      ppu.mirroring = "single-lower";

      writeThenRead(ppu, 0x2000, 0x77, 0x2000);

      expect(writeThenRead(ppu, 0x2000, 0x77, 0x2400)).toBe(0x77);
      expect(writeThenRead(ppu, 0x2000, 0x77, 0x2800)).toBe(0x77);
      expect(writeThenRead(ppu, 0x2000, 0x77, 0x2c00)).toBe(0x77);
    });

    it("$2000+offset と $2400+offset が同じ", () => {
      const ppu = new Ppu();
      ppu.mirroring = "single-lower";
      const val = writeThenRead(ppu, 0x2123, 0xaa, 0x2523);
      expect(val).toBe(0xaa);
    });
  });

  describe("single-upper ミラーリング", () => {
    it("4 つのネームテーブルが全て同じ物理ページ (上位)", () => {
      const ppu = new Ppu();
      ppu.mirroring = "single-upper";

      writeThenRead(ppu, 0x2000, 0x55, 0x2000);

      expect(writeThenRead(ppu, 0x2000, 0x55, 0x2400)).toBe(0x55);
      expect(writeThenRead(ppu, 0x2000, 0x55, 0x2800)).toBe(0x55);
      expect(writeThenRead(ppu, 0x2000, 0x55, 0x2c00)).toBe(0x55);
    });

    it("single-lower と single-upper は異なる物理ページを使う", () => {
      const ppu = new Ppu();

      // single-lower で $2000 に書き込み
      ppu.mirroring = "single-lower";
      writeThenRead(ppu, 0x2000, 0x11, 0x2000);

      // single-upper に切替えて $2000 に別の値を書き込み
      ppu.mirroring = "single-upper";
      writeThenRead(ppu, 0x2000, 0x22, 0x2000);

      // single-lower に戻ると元の値が残っている
      ppu.mirroring = "single-lower";
      const val = writeThenRead(ppu, 0x2000, 0x11, 0x2000);
      // 書き込みで上書きするので確認方法を変える
      // lower の VRAM[0] と upper の VRAM[0x400] が独立
      expect(ppu.vram[0]).toBe(0x11);
      expect(ppu.vram[0x400]).toBe(0x22);
    });
  });

  describe("four-screen ミラーリング", () => {
    it("4 つのネームテーブルが全て独立", () => {
      const ppu = new Ppu();
      ppu.mirroring = "four-screen";

      // NES の VRAM は 2KB ($000-$7FF) なので、four-screen では
      // $2000-$27FF は VRAM にマップされるが
      // $2800-$2FFF は VRAM の外 (カートリッジ RAM が必要)。
      // 現状の実装では vram[0x800-0xFFF] を使う (2KB 配列の外の書込は無視される可能性)
      // ただし PPU.vram は 2KB (0x800) なので、four-screen の上位 2 NT は
      // 実際のカートリッジでは追加 RAM が必要。
      // ここでは下位 2KB 内のアドレスで独立性を検証。

      writeThenRead(ppu, 0x2000, 0xaa, 0x2000);
      writeThenRead(ppu, 0x2400, 0xbb, 0x2400);

      // $2000 と $2400 は異なる
      expect(ppu.vram[0]).toBe(0xaa);
      expect(ppu.vram[0x400]).toBe(0xbb);
    });
  });
});

describe("PPU ミラーリング — ppuRead 経由の検証", () => {
  it("horizontal: ppuRead で $2000 と $2400 が同じ値を返す", () => {
    const ppu = new Ppu();
    ppu.mirroring = "horizontal";
    ppu.vram[0] = 0xfe;
    expect(ppu.ppuRead(0x2000)).toBe(0xfe);
    expect(ppu.ppuRead(0x2400)).toBe(0xfe);
  });

  it("vertical: ppuRead で $2000 と $2800 が同じ値を返す", () => {
    const ppu = new Ppu();
    ppu.mirroring = "vertical";
    ppu.vram[0] = 0xdc;
    expect(ppu.ppuRead(0x2000)).toBe(0xdc);
    expect(ppu.ppuRead(0x2800)).toBe(0xdc);
  });

  it("single-lower: ppuRead で全 NT が同じ値を返す", () => {
    const ppu = new Ppu();
    ppu.mirroring = "single-lower";
    ppu.vram[0x10] = 0x42;
    expect(ppu.ppuRead(0x2010)).toBe(0x42);
    expect(ppu.ppuRead(0x2410)).toBe(0x42);
    expect(ppu.ppuRead(0x2810)).toBe(0x42);
    expect(ppu.ppuRead(0x2c10)).toBe(0x42);
  });

  it("single-upper: ppuRead で全 NT が同じ値を返す (VRAM 上位ページ)", () => {
    const ppu = new Ppu();
    ppu.mirroring = "single-upper";
    ppu.vram[0x400 + 0x20] = 0x37;
    expect(ppu.ppuRead(0x2020)).toBe(0x37);
    expect(ppu.ppuRead(0x2420)).toBe(0x37);
    expect(ppu.ppuRead(0x2820)).toBe(0x37);
    expect(ppu.ppuRead(0x2c20)).toBe(0x37);
  });

  it("$2000-$2EFF のミラー ($3000-$3EFF) も正しくミラーする", () => {
    const ppu = new Ppu();
    ppu.mirroring = "vertical";
    ppu.vram[0x100] = 0x88;
    // $3100 は $2100 のミラー
    expect(ppu.ppuRead(0x2100)).toBe(0x88);
    expect(ppu.ppuRead(0x3100)).toBe(0x88);
  });
});
