import { describe, expect, it } from "vitest";
import { Ppu } from "../src/core/ppu.ts";

describe("loopy レジスタ bit field ヘルパー", () => {
  it("coarseX は bit 0-4 を取得する", () => {
    expect(Ppu.coarseX(0b000_00_00000_11010)).toBe(0b11010);
    expect(Ppu.coarseX(0b111_11_11111_00000)).toBe(0);
  });

  it("coarseY は bit 5-9 を取得する", () => {
    expect(Ppu.coarseY(0b000_00_10101_00000)).toBe(0b10101);
    expect(Ppu.coarseY(0b111_11_00000_11111)).toBe(0);
  });

  it("ntSelect は bit 10-11 を取得する", () => {
    expect(Ppu.ntSelect(0b000_01_00000_00000)).toBe(1);
    expect(Ppu.ntSelect(0b000_10_00000_00000)).toBe(2);
    expect(Ppu.ntSelect(0b000_11_00000_00000)).toBe(3);
  });

  it("fineY は bit 12-14 を取得する", () => {
    expect(Ppu.fineY(0b101_00_00000_00000)).toBe(5);
    expect(Ppu.fineY(0b111_00_00000_00000)).toBe(7);
  });

  it("setCoarseX は bit 0-4 のみ変更する", () => {
    const reg = 0b101_11_10101_00000;
    const result = Ppu.setCoarseX(reg, 0b11111);
    expect(Ppu.coarseX(result)).toBe(0b11111);
    expect(Ppu.coarseY(result)).toBe(0b10101);
    expect(Ppu.fineY(result)).toBe(5);
  });

  it("setCoarseY は bit 5-9 のみ変更する", () => {
    const reg = 0b101_00_00000_11010;
    const result = Ppu.setCoarseY(reg, 29);
    expect(Ppu.coarseY(result)).toBe(29);
    expect(Ppu.coarseX(result)).toBe(0b11010);
    expect(Ppu.fineY(result)).toBe(5);
  });

  it("setFineY は bit 12-14 のみ変更する", () => {
    const reg = 0b000_11_10101_11010;
    const result = Ppu.setFineY(reg, 7);
    expect(Ppu.fineY(result)).toBe(7);
    expect(Ppu.ntSelect(result)).toBe(3);
    expect(Ppu.coarseY(result)).toBe(0b10101);
  });
});

describe("$2005 PPUSCROLL loopy 更新", () => {
  it("1st write で fine X → x, coarse X → t", () => {
    const ppu = new Ppu();
    ppu.write(5, 0b01101_011);
    expect(ppu.x).toBe(0b011);
    expect(Ppu.coarseX(ppu.t)).toBe(0b01101);
    expect(ppu.w).toBe(true);
  });

  it("2nd write で fine Y → t[12:14], coarse Y → t[5:9]", () => {
    const ppu = new Ppu();
    ppu.write(5, 0x00);
    ppu.write(5, 0b11001_101);
    expect(Ppu.fineY(ppu.t)).toBe(0b101);
    expect(Ppu.coarseY(ppu.t)).toBe(0b11001);
    expect(ppu.w).toBe(false);
  });

  it("$2005 は w toggle を共有する", () => {
    const ppu = new Ppu();
    expect(ppu.w).toBe(false);
    ppu.write(5, 0x10);
    expect(ppu.w).toBe(true);
    ppu.write(5, 0x20);
    expect(ppu.w).toBe(false);
    ppu.write(5, 0x30);
    expect(ppu.w).toBe(true);
  });
});

describe("$2006 PPUADDR loopy 更新", () => {
  it("1st write で hi byte を t の bit 8-13 に設定 (bit 14 クリア)", () => {
    const ppu = new Ppu();
    ppu.t = 0x7fff;
    ppu.write(6, 0x21);
    expect(ppu.t & 0xff00).toBe(0x2100);
    expect(ppu.w).toBe(true);
  });

  it("2nd write で lo byte を t に設定し t → v コピー", () => {
    const ppu = new Ppu();
    ppu.write(6, 0x21);
    ppu.write(6, 0x08);
    expect(ppu.t).toBe(0x2108);
    expect(ppu.v).toBe(0x2108);
    expect(ppu.w).toBe(false);
  });

  it("$2006 hi write は bit 14 (fine Y MSB) をクリアする", () => {
    const ppu = new Ppu();
    ppu.t = 0x7000;
    ppu.write(6, 0x00);
    expect(ppu.t & 0x4000).toBe(0);
  });
});

describe("$2000 PPUCTRL → loopy t NT bit", () => {
  it("ctrl bit 0-1 が t の bit 10-11 に反映される", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x01);
    expect(Ppu.ntSelect(ppu.t)).toBe(1);
    ppu.write(0, 0x02);
    expect(Ppu.ntSelect(ppu.t)).toBe(2);
    ppu.write(0, 0x03);
    expect(Ppu.ntSelect(ppu.t)).toBe(3);
    ppu.write(0, 0x00);
    expect(Ppu.ntSelect(ppu.t)).toBe(0);
  });

  it("ctrl の他のビットは t の NT bit に影響しない", () => {
    const ppu = new Ppu();
    ppu.t = 0x0400;
    ppu.write(0, 0xFC);
    expect(Ppu.ntSelect(ppu.t)).toBe(0);
    expect(ppu.t & 0x03ff).toBe(0);
  });
});

describe("$2002 PPUSTATUS → loopy w リセット", () => {
  it("$2002 read で w がリセットされる", () => {
    const ppu = new Ppu();
    ppu.write(5, 0x10);
    expect(ppu.w).toBe(true);
    ppu.read(2);
    expect(ppu.w).toBe(false);
  });

  it("$2005/$2006 の途中 write をリセットして最初からやり直せる", () => {
    const ppu = new Ppu();
    ppu.write(6, 0x20);
    expect(ppu.w).toBe(true);
    ppu.read(2);
    expect(ppu.w).toBe(false);
    ppu.write(6, 0x21);
    ppu.write(6, 0x00);
    expect(ppu.v).toBe(0x2100);
  });
});

describe("$2007 PPUDATA loopy v 使用", () => {
  it("PPUDATA read は v をアドレスとして使用する", () => {
    const ppu = new Ppu();
    ppu.write(6, 0x20);
    ppu.write(6, 0x05);
    ppu.vram[ppu.v & 0x7ff] = 0xAB;
    ppu.write(6, 0x20);
    ppu.write(6, 0x05);
    ppu.read(7);
    expect(ppu.read(7)).toBe(0xAB);
  });

  it("PPUDATA write 後に v がインクリメントされる", () => {
    const ppu = new Ppu();
    ppu.write(6, 0x20);
    ppu.write(6, 0x00);
    ppu.write(7, 0xFF);
    expect(ppu.v).toBe(0x2001);
  });

  it("PPUDATA read 後に v がインクリメントされる", () => {
    const ppu = new Ppu();
    ppu.write(6, 0x20);
    ppu.write(6, 0x00);
    ppu.read(7);
    expect(ppu.v).toBe(0x2001);
  });

  it("ctrl bit2=1 で v += 32", () => {
    const ppu = new Ppu();
    ppu.write(0, 0x04);
    ppu.write(6, 0x20);
    ppu.write(6, 0x00);
    ppu.write(7, 0xFF);
    expect(ppu.v).toBe(0x2020);
  });
});

describe("$2005 と $2006 の w toggle 共有", () => {
  it("$2005 1st → $2006 2nd (w を共有)", () => {
    const ppu = new Ppu();
    ppu.write(5, 0x10);
    expect(ppu.w).toBe(true);
    ppu.write(6, 0x00);
    expect(ppu.w).toBe(false);
    expect(ppu.v).toBe(ppu.t);
  });

  it("$2006 1st → $2005 2nd (w を共有)", () => {
    const ppu = new Ppu();
    ppu.write(6, 0x00);
    expect(ppu.w).toBe(true);
    ppu.write(5, 0x20);
    expect(ppu.w).toBe(false);
    expect(Ppu.coarseY(ppu.t)).toBe(4);
    expect(Ppu.fineY(ppu.t)).toBe(0);
  });
});

describe("loopy coarse X/Y increment", () => {
  function setupRenderPpu(): Ppu {
    const ppu = new Ppu();
    ppu.write(0, 0x00);
    ppu.mask = 0x18;
    ppu.mirroring = "vertical";
    return ppu;
  }

  it("dot 8 ごとに coarse X が increment される", () => {
    const ppu = setupRenderPpu();
    ppu.v = 0;
    ppu.scanline = 0;
    ppu.dot = 0;

    for (let i = 0; i < 9; i++) ppu.tick();
    expect(Ppu.coarseX(ppu.v)).toBe(1);

    for (let i = 0; i < 8; i++) ppu.tick();
    expect(Ppu.coarseX(ppu.v)).toBe(2);
  });

  it("coarse X = 31 で NT X bit が flip する", () => {
    const ppu = setupRenderPpu();
    ppu.v = Ppu.setCoarseX(0, 31);
    ppu.scanline = 0;
    ppu.dot = 0;

    for (let i = 0; i < 9; i++) ppu.tick();
    expect(Ppu.coarseX(ppu.v)).toBe(0);
    expect(Ppu.ntSelect(ppu.v) & 1).toBe(1);
  });

  it("dot 256 で Y increment が発生する", () => {
    const ppu = setupRenderPpu();
    ppu.v = 0;
    ppu.scanline = 0;
    ppu.dot = 0;

    for (let i = 0; i < 257; i++) ppu.tick();
    expect(Ppu.fineY(ppu.v)).toBe(1);
  });

  it("fine Y = 7 → coarse Y increment + fine Y = 0", () => {
    const ppu = setupRenderPpu();
    ppu.v = Ppu.setFineY(0, 7);
    ppu.scanline = 0;
    ppu.dot = 0;

    for (let i = 0; i < 257; i++) ppu.tick();
    expect(Ppu.fineY(ppu.v)).toBe(0);
    expect(Ppu.coarseY(ppu.v)).toBe(1);
  });

  it("coarse Y = 29 で NT Y bit が flip し coarse Y = 0", () => {
    const ppu = setupRenderPpu();
    ppu.v = Ppu.setFineY(Ppu.setCoarseY(0, 29), 7);
    ppu.scanline = 0;
    ppu.dot = 0;

    for (let i = 0; i < 257; i++) ppu.tick();
    expect(Ppu.fineY(ppu.v)).toBe(0);
    expect(Ppu.coarseY(ppu.v)).toBe(0);
    expect((Ppu.ntSelect(ppu.v) >> 1) & 1).toBe(1);
  });

  it("dot 257 で hori(v) = hori(t) が発生する", () => {
    const ppu = setupRenderPpu();
    ppu.t = Ppu.setCoarseX(0, 15) | 0x0400;
    ppu.v = 0;
    ppu.scanline = 0;
    ppu.dot = 0;

    for (let i = 0; i < 258; i++) ppu.tick();
    expect(Ppu.coarseX(ppu.v)).toBe(15);
    expect(Ppu.ntSelect(ppu.v) & 1).toBe(1);
  });
});

describe("loopy pre-render scanline", () => {
  it("dot 280-304 で vert(v) = vert(t) が発生する", () => {
    const ppu = new Ppu();
    ppu.mask = 0x18;
    ppu.t = Ppu.setFineY(Ppu.setCoarseY(0, 20), 5) | 0x0800;
    ppu.v = 0;
    ppu.scanline = 261;
    ppu.dot = 280;

    ppu.tick();
    expect(Ppu.coarseY(ppu.v)).toBe(20);
    expect(Ppu.fineY(ppu.v)).toBe(5);
    expect((Ppu.ntSelect(ppu.v) >> 1) & 1).toBe(1);
  });

  it("レンダリング無効時は vert(v) = vert(t) が発生しない", () => {
    const ppu = new Ppu();
    ppu.mask = 0x00;
    ppu.t = Ppu.setCoarseY(0, 20) | 0x0800;
    ppu.v = 0;
    ppu.scanline = 261;
    ppu.dot = 280;

    ppu.tick();
    expect(Ppu.coarseY(ppu.v)).toBe(0);
  });
});
