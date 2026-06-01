/**
 * Mapper 16 (Bandai FCG) エッジケーステスト。
 * バンク境界・ラップアラウンド・IRQ カウンタ境界値。
 */

import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import type { Mirroring } from "../src/core/cart.ts";
import { MapperBandaiFcg } from "../src/core/mappers/bandai-fcg.ts";

function makeCart(opts: {
  prgSize?: number;
  chrSize?: number;
} = {}): Cart {
  const prgSize = opts.prgSize ?? 0x40000;
  const chrSize = opts.chrSize ?? 0x20000;
  const prgRom = new Uint8Array(prgSize);
  for (let i = 0; i < prgSize; i++) prgRom[i] = i & 0xff;
  const chrRom = new Uint8Array(chrSize);
  for (let i = 0; i < chrSize; i++) chrRom[i] = (i + 0x80) & 0xff;
  return {
    header: {
      prgRomSize: prgSize, chrRomSize: chrSize, mapper: 16,
      mirroring: "vertical", hasBattery: false, hasTrainer: false, fourScreen: false,
    },
    prgRom, chrRom, trainer: null,
  };
}

describe("MapperBandaiFcg エッジケース", () => {
  describe("PRG バンク境界", () => {
    it("$BFFF と $C000 のバンク境界が正しい", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x8008, 3);
      // $BFFF = バンク 3 の末尾
      expect(mapper.readPrg(0xbfff)).toBe((3 * 0x4000 + 0x3fff) & 0xff);
      // $C000 = 最終バンク (15) の先頭
      expect(mapper.readPrg(0xc000)).toBe((15 * 0x4000) & 0xff);
    });

    it("バンク 0 ラップアラウンド (最小 PRG)", () => {
      const mapper = new MapperBandaiFcg(makeCart({ prgSize: 0x4000 })); // 16KB = 1 バンク
      mapper.writePrg(0x8008, 5); // 5 % 1 = 0
      expect(mapper.readPrg(0x8000)).toBe(0);
      expect(mapper.readPrg(0xc000)).toBe(0); // 最終バンク = 0
    });

    it("バンク番号 0x0F (最大 4bit 値)", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x8008, 0x0f);
      expect(mapper.readPrg(0x8000)).toBe((15 * 0x4000) & 0xff);
    });
  });

  describe("CHR バンク境界", () => {
    it("各 1KB スロット境界が隣接スロットに漏れない", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      // スロット 0 と 1 に異なるバンクを設定
      mapper.writePrg(0x8000, 10); // slot 0 = bank 10
      mapper.writePrg(0x8001, 20); // slot 1 = bank 20

      // スロット 0 の末尾
      expect(mapper.readChr(0x03ff)).toBe((10 * 0x400 + 0x3ff + 0x80) & 0xff);
      // スロット 1 の先頭
      expect(mapper.readChr(0x0400)).toBe((20 * 0x400 + 0x80) & 0xff);
    });

    it("スロット 7 の末尾 ($1FFF)", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x8007, 5);
      expect(mapper.readChr(0x1fff)).toBe((5 * 0x400 + 0x3ff + 0x80) & 0xff);
    });
  });

  describe("IRQ カウンタ境界値", () => {
    it("カウンタ値 0 で即座に IRQ (有効化時)", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x800b, 0); // latch low = 0
      mapper.writePrg(0x800c, 0); // latch high = 0
      mapper.writePrg(0x800a, 1); // enable → カウンタ = 0

      // カウンタ 0 のまま tick → デクリメントしない (0 は trigger しない、既に 0 だから)
      mapper.cpuCycleTick!();
      // irqPending は cpuCycleTick 内で counter>0 をチェックするので 0 では発火しない
      expect(mapper.irqPending).toBe(false);
    });

    it("カウンタ値 1 で 1 tick 後に IRQ", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x800b, 1);
      mapper.writePrg(0x800c, 0);
      mapper.writePrg(0x800a, 1);

      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("カウンタ値 0xFFFF (最大値)", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x800b, 0xff);
      mapper.writePrg(0x800c, 0xff);
      mapper.writePrg(0x800a, 1);

      // 65534 ticks → まだ IRQ なし
      for (let i = 0; i < 65534; i++) mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(false);

      // 65535 tick 目で IRQ
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("IRQ 再発火: acknowledge 後に再ロード", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x800b, 2);
      mapper.writePrg(0x800c, 0);

      // 1 回目の IRQ
      mapper.writePrg(0x800a, 1);
      mapper.cpuCycleTick!();
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);

      // acknowledge + 再ロード
      mapper.writePrg(0x800a, 1);
      expect(mapper.irqPending).toBe(false);

      // 2 回目の IRQ
      mapper.cpuCycleTick!();
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("ラッチ変更はカウンタに影響しない (LZ93D50 モード)", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x800b, 5);
      mapper.writePrg(0x800c, 0);
      mapper.writePrg(0x800a, 1); // enable + load

      // 2 tick 消費
      mapper.cpuCycleTick!();
      mapper.cpuCycleTick!();
      // カウンタ = 3

      // ラッチ変更 (カウンタは変わらない)
      mapper.writePrg(0x800b, 100);
      mapper.writePrg(0x800c, 0);

      // 残り 3 tick で IRQ
      mapper.cpuCycleTick!();
      mapper.cpuCycleTick!();
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });
  });

  describe("レジスタアドレスマスク", () => {
    it("$xxxx の下位 4bit でレジスタを選択", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      // $C008 も $8008 と同じ (PRG バンク)
      mapper.writePrg(0xc008, 7);
      expect(mapper.readPrg(0x8000)).toBe((7 * 0x4000) & 0xff);

      // $E009 も $8009 と同じ (ミラーリング)
      let mirror: Mirroring | null = null;
      mapper.onMirroringChange = (m) => { mirror = m; };
      mapper.writePrg(0xe009, 1);
      expect(mirror).toBe("horizontal");
    });
  });
});
