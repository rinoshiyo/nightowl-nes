/**
 * Mapper 18 (Jaleco SS8806) エッジケーステスト。
 * バンク境界・ラップアラウンド・IRQ カウンタ幅境界値。
 */

import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import type { Mirroring } from "../src/core/cart.ts";
import { MapperJalecoSs8806 } from "../src/core/mappers/jaleco-ss8806.ts";

function makeCart(opts: {
  prgSize?: number;
  chrSize?: number;
} = {}): Cart {
  const prgSize = opts.prgSize ?? 0x40000;
  const chrSize = opts.chrSize ?? 0x40000;
  const prgRom = new Uint8Array(prgSize);
  for (let i = 0; i < prgSize; i++) prgRom[i] = i & 0xff;
  const chrRom = new Uint8Array(chrSize);
  for (let i = 0; i < chrSize; i++) chrRom[i] = (i + 0x80) & 0xff;
  return {
    header: {
      prgRomSize: prgSize, chrRomSize: chrSize, mapper: 18,
      mirroring: "vertical", hasBattery: false, hasTrainer: false, fourScreen: false,
    },
    prgRom, chrRom, trainer: null,
  };
}

describe("MapperJalecoSs8806 エッジケース", () => {
  describe("PRG バンク境界", () => {
    it("3 ウィンドウの境界が正しい", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0x8000, 1); mapper.writePrg(0x8001, 0); // PRG0 = 1
      mapper.writePrg(0x8002, 2); mapper.writePrg(0x8003, 0); // PRG1 = 2
      mapper.writePrg(0x9000, 3); mapper.writePrg(0x9001, 0); // PRG2 = 3

      expect(mapper.readPrg(0x9fff)).toBe((1 * 0x2000 + 0x1fff) & 0xff);
      expect(mapper.readPrg(0xa000)).toBe((2 * 0x2000) & 0xff);
      expect(mapper.readPrg(0xbfff)).toBe((2 * 0x2000 + 0x1fff) & 0xff);
      expect(mapper.readPrg(0xc000)).toBe((3 * 0x2000) & 0xff);
      expect(mapper.readPrg(0xdfff)).toBe((3 * 0x2000 + 0x1fff) & 0xff);
    });

    it("$E000 境界: PRG2 末尾→最終バンク先頭", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0x9000, 5); mapper.writePrg(0x9001, 0);

      expect(mapper.readPrg(0xdfff)).toBe((5 * 0x2000 + 0x1fff) & 0xff);
      const lastBank = 31;
      expect(mapper.readPrg(0xe000)).toBe((lastBank * 0x2000) & 0xff);
    });

    it("PRG バンク最大値 (6bit = 63)", () => {
      const mapper = new MapperJalecoSs8806(makeCart({ prgSize: 0x80000 })); // 512KB = 64 バンク
      mapper.writePrg(0x8000, 0x0f); // low = 0xF
      mapper.writePrg(0x8001, 0x03); // high = 0x3 → bank = 0x3F = 63
      expect(mapper.readPrg(0x8000)).toBe((63 * 0x2000) & 0xff);
    });

    it("最小 PRG (16KB = 2 バンク)", () => {
      const mapper = new MapperJalecoSs8806(makeCart({ prgSize: 0x4000 }));
      mapper.writePrg(0x8000, 5); mapper.writePrg(0x8001, 0); // 5 % 2 = 1
      expect(mapper.readPrg(0x8000)).toBe((1 * 0x2000) & 0xff);
      expect(mapper.readPrg(0xe000)).toBe((1 * 0x2000) & 0xff); // 最終バンク = 1
    });
  });

  describe("CHR バンク境界", () => {
    it("隣接スロットへの漏れ防止", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xa000, 0x0a); mapper.writePrg(0xa001, 0x00); // slot 0 = 10
      mapper.writePrg(0xa002, 0x04); mapper.writePrg(0xa003, 0x01); // slot 1 = 20

      expect(mapper.readChr(0x03ff)).toBe((10 * 0x400 + 0x3ff + 0x80) & 0xff);
      expect(mapper.readChr(0x0400)).toBe((20 * 0x400 + 0x80) & 0xff);
    });

    it("CHR バンク最大値 (8bit = 255)", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xa000, 0x0f);
      mapper.writePrg(0xa001, 0x0f); // bank = 0xFF = 255
      expect(mapper.readChr(0x0000)).toBe((255 * 0x400 + 0x80) & 0xff);
    });
  });

  describe("IRQ カウンタ境界値", () => {
    it("4bit 幅: カウンタ値 0x0F (最大)", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xe000, 0x0f);
      mapper.writePrg(0xe001, 0x0f);
      mapper.writePrg(0xe002, 0x0f);
      mapper.writePrg(0xe003, 0x0f); // latch = 0xFFFF
      mapper.writePrg(0xf001, 0x09); // C=1, F=1 (4bit)
      mapper.writePrg(0xf000, 0);

      // 4bit 幅 → 下位 4bit = 0xF = 15
      for (let i = 0; i < 14; i++) mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(false);
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("カウンタ値 0 では発火しない", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xe000, 0);
      mapper.writePrg(0xe001, 0);
      mapper.writePrg(0xe002, 0);
      mapper.writePrg(0xe003, 0);
      mapper.writePrg(0xf001, 1);
      mapper.writePrg(0xf000, 0);

      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(false);
    });

    it("$F001 書込で pending クリア", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xe000, 1);
      mapper.writePrg(0xe001, 0);
      mapper.writePrg(0xe002, 0);
      mapper.writePrg(0xe003, 0);
      mapper.writePrg(0xf001, 1);
      mapper.writePrg(0xf000, 0);

      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);

      // $F001 書込で pending クリア
      mapper.writePrg(0xf001, 0);
      expect(mapper.irqPending).toBe(false);
    });

    it("IRQ 再発火: ack + リロード", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xe000, 2);
      mapper.writePrg(0xe001, 0);
      mapper.writePrg(0xe002, 0);
      mapper.writePrg(0xe003, 0);
      mapper.writePrg(0xf001, 1);
      mapper.writePrg(0xf000, 0);

      mapper.cpuCycleTick!();
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);

      // ack + reload
      mapper.writePrg(0xf000, 0);
      expect(mapper.irqPending).toBe(false);

      mapper.cpuCycleTick!();
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("幅切替: 16bit → 8bit → 4bit", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xe000, 0x05);
      mapper.writePrg(0xe001, 0x01);
      mapper.writePrg(0xe002, 0x01);
      mapper.writePrg(0xe003, 0x01); // latch = 0x1115

      // 16bit 幅
      mapper.writePrg(0xf001, 0x01); // C=1
      mapper.writePrg(0xf000, 0);
      // → counter = 0x1115

      // 8bit に切替
      mapper.writePrg(0xf001, 0x03); // C=1, T=1
      mapper.writePrg(0xf000, 0);
      // → counter = 0x1115, mask = 0xFF → 有効部分 = 0x15

      for (let i = 0; i < 0x15; i++) mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });
  });

  describe("ミラーリング詳細", () => {
    it("レジスタアドレスマスクが正しい ($F002)", () => {
      let mirror: Mirroring | null = null;
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.onMirroringChange = (m) => { mirror = m; };

      // $F002 は addr & 0xF003 でデコード
      mapper.writePrg(0xf002, 1);
      expect(mirror).toBe("vertical");

      mapper.writePrg(0xf002, 0);
      expect(mirror).toBe("horizontal");
    });

    it("上位ビットは無視される", () => {
      let mirror: Mirroring | null = null;
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.onMirroringChange = (m) => { mirror = m; };

      mapper.writePrg(0xf002, 0xfe); // 0xFE & 0x03 = 2
      expect(mirror).toBe("single-lower");
    });
  });

  describe("PRG RAM", () => {
    it("アドレスマスクが正しい", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrgRam(0x6123, 0xef);
      expect(mapper.readPrgRam(0x6123)).toBe(0xef);
    });
  });
});
