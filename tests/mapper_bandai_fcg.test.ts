import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import type { Mirroring } from "../src/core/cart.ts";
import { MapperBandaiFcg } from "../src/core/mappers/bandai-fcg.ts";
import { createMapper } from "../src/core/mappers/mapper.ts";

/** テスト用 Cart を生成 */
function makeCart(opts: {
  prgSize?: number;
  chrSize?: number;
  mirroring?: Mirroring;
} = {}): Cart {
  const prgSize = opts.prgSize ?? 0x40000; // 256KB (16 × 16KB)
  const chrSize = opts.chrSize ?? 0x20000; // 128KB (128 × 1KB)

  const prgRom = new Uint8Array(prgSize);
  for (let i = 0; i < prgSize; i++) {
    prgRom[i] = i & 0xff;
  }

  const chrRom = new Uint8Array(chrSize);
  for (let i = 0; i < chrSize; i++) {
    chrRom[i] = (i + 0x80) & 0xff;
  }

  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: chrSize,
      mapper: 16,
      mirroring: opts.mirroring ?? "vertical",
      hasBattery: false,
      hasTrainer: false,
      fourScreen: false,
    },
    prgRom,
    chrRom,
    trainer: null,
  };
}

describe("MapperBandaiFcg", () => {
  describe("createMapper", () => {
    it("mapper 16 で MapperBandaiFcg が生成される", () => {
      const mapper = createMapper(makeCart());
      expect(mapper.mapperId()).toBe(16);
    });
  });

  describe("初期状態", () => {
    it("irqPending が false", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      expect(mapper.irqPending).toBe(false);
    });

    it("$8000 はバンク 0", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      expect(mapper.readPrg(0x8000)).toBe(0);
    });

    it("$C000 は最終バンク固定", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      // 256KB = 16 × 16KB → 最終バンク 15
      const lastBank = 15;
      expect(mapper.readPrg(0xc000)).toBe((lastBank * 0x4000) & 0xff);
    });
  });

  describe("PRG バンク切替 (reg $8)", () => {
    it("$8000-$BFFF のバンクを切替可能", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      // レジスタ $8: PRG バンク選択 (下位 4bit)
      mapper.writePrg(0x8008, 3);
      expect(mapper.readPrg(0x8000)).toBe((3 * 0x4000) & 0xff);
    });

    it("バンク番号が PRG バンク数で modulo される", () => {
      const mapper = new MapperBandaiFcg(makeCart({ prgSize: 0x10000 })); // 64KB = 4 バンク
      mapper.writePrg(0x8008, 5); // 5 % 4 = 1
      expect(mapper.readPrg(0x8000)).toBe((1 * 0x4000) & 0xff);
    });

    it("$C000-$FFFF は常に最終バンク", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x8008, 5);
      // $C000 は最終バンクのまま
      const lastBank = 15;
      expect(mapper.readPrg(0xc000)).toBe((lastBank * 0x4000) & 0xff);
    });

    it("バンクの末尾アドレス ($BFFF) が正しい", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x8008, 2);
      expect(mapper.readPrg(0xbfff)).toBe((2 * 0x4000 + 0x3fff) & 0xff);
    });

    it("下位 4bit のみ使用される", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x8008, 0xf3); // PRG = 0x03
      expect(mapper.readPrg(0x8000)).toBe((3 * 0x4000) & 0xff);
    });
  });

  describe("CHR バンク切替 (reg $0-$7)", () => {
    it("各 1KB スロットを個別に切替可能", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      for (let slot = 0; slot < 8; slot++) {
        mapper.writePrg(0x8000 + slot, slot + 10);
      }
      for (let slot = 0; slot < 8; slot++) {
        const bank = (slot + 10) % (0x20000 / 0x400);
        const expected = (bank * 0x400 + 0x80) & 0xff;
        expect(mapper.readChr(slot * 0x400)).toBe(expected);
      }
    });

    it("CHR バンク番号が CHR バンク数で modulo される", () => {
      const mapper = new MapperBandaiFcg(makeCart({ chrSize: 0x8000 })); // 32KB = 32 バンク
      mapper.writePrg(0x8000, 35); // 35 % 32 = 3
      expect(mapper.readChr(0x0000)).toBe((3 * 0x400 + 0x80) & 0xff);
    });

    it("CHR RAM 時はフラットアクセス", () => {
      const mapper = new MapperBandaiFcg(makeCart({ chrSize: 0 }));
      mapper.writeChr(0x0100, 0xab);
      expect(mapper.readChr(0x0100)).toBe(0xab);
    });
  });

  describe("ミラーリング (reg $9)", () => {
    it("0 = vertical", () => {
      let result: Mirroring | null = null;
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.onMirroringChange = (m) => { result = m; };
      mapper.writePrg(0x8009, 0);
      expect(result).toBe("vertical");
    });

    it("1 = horizontal", () => {
      let result: Mirroring | null = null;
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.onMirroringChange = (m) => { result = m; };
      mapper.writePrg(0x8009, 1);
      expect(result).toBe("horizontal");
    });

    it("2 = single-lower", () => {
      let result: Mirroring | null = null;
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.onMirroringChange = (m) => { result = m; };
      mapper.writePrg(0x8009, 2);
      expect(result).toBe("single-lower");
    });

    it("3 = single-upper", () => {
      let result: Mirroring | null = null;
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.onMirroringChange = (m) => { result = m; };
      mapper.writePrg(0x8009, 3);
      expect(result).toBe("single-upper");
    });

    it("上位ビットは無視される", () => {
      let result: Mirroring | null = null;
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.onMirroringChange = (m) => { result = m; };
      mapper.writePrg(0x8009, 0xfd); // 0xFD & 0x03 = 1
      expect(result).toBe("horizontal");
    });
  });

  describe("IRQ カウンタ", () => {
    it("カウンタ値を 16bit リトルエンディアンで設定", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      // $B = 下位 8bit, $C = 上位 8bit
      mapper.writePrg(0x800b, 0x34);  // latch low = 0x34
      mapper.writePrg(0x800c, 0x12);  // latch high = 0x12
      // → latch = 0x1234

      // $A: IRQ enable + カウンタにラッチをコピー
      mapper.writePrg(0x800a, 1);

      // 0x1234 = 4660 cycles でカウントダウン
      for (let i = 0; i < 4659; i++) {
        mapper.cpuCycleTick!();
        expect(mapper.irqPending).toBe(false);
      }
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("$A 書込で pending クリア", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x800b, 3);
      mapper.writePrg(0x800c, 0);
      mapper.writePrg(0x800a, 1); // enable

      for (let i = 0; i < 3; i++) mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);

      // $A 書込で acknowledge
      mapper.writePrg(0x800a, 0); // disable + clear
      expect(mapper.irqPending).toBe(false);
    });

    it("IRQ 無効時はカウントしない", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x800b, 1);
      mapper.writePrg(0x800c, 0);
      mapper.writePrg(0x800a, 0); // disabled

      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(false);
    });

    it("ラッチ→カウンタコピー ($A 書込時)", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x800b, 5);
      mapper.writePrg(0x800c, 0);

      // enable 時にラッチ→カウンタ
      mapper.writePrg(0x800a, 1);

      for (let i = 0; i < 5; i++) mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("clockIrqCounter は何もしない (CPU cycle ベース)", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x800b, 1);
      mapper.writePrg(0x800c, 0);
      mapper.writePrg(0x800a, 1);

      mapper.clockIrqCounter();
      expect(mapper.irqPending).toBe(false);

      // cpuCycleTick で IRQ 発生
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });
  });

  describe("PRG RAM ($6000-$7FFF)", () => {
    it("read/write が動作する", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrgRam(0x6000, 0xab);
      expect(mapper.readPrgRam(0x6000)).toBe(0xab);
    });

    it("8KB 空間全体が使える", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrgRam(0x7fff, 0xcd);
      expect(mapper.readPrgRam(0x7fff)).toBe(0xcd);
    });
  });

  describe("ステートセーブ/ロード", () => {
    it("全状態が復元される", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x8008, 5);
      mapper.writePrg(0x8000, 10);
      mapper.writePrg(0x800b, 0x34);
      mapper.writePrg(0x800c, 0x12);
      mapper.writePrgRam(0x6000, 0xab);

      const state = mapper.serializeMapper();
      const mapper2 = new MapperBandaiFcg(makeCart());
      mapper2.deserializeMapper(state);

      expect(mapper2.readPrg(0x8000)).toBe(mapper.readPrg(0x8000));
      expect(mapper2.readChr(0x0000)).toBe(mapper.readChr(0x0000));
      expect(mapper2.readPrgRam(0x6000)).toBe(0xab);
    });
  });

  describe("reset()", () => {
    it("全レジスタが初期化される", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      mapper.writePrg(0x8008, 5);
      mapper.writePrg(0x8000, 10);
      mapper.writePrg(0x800a, 1);

      mapper.reset();

      expect(mapper.readPrg(0x8000)).toBe(0);
      expect(mapper.irqPending).toBe(false);
    });
  });

  describe("エッジケース", () => {
    it("アドレスマスクが正しく動作する ($x008 = PRG バンク)", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      // $9008 も $8008 と同じレジスタ
      mapper.writePrg(0x9008, 3);
      expect(mapper.readPrg(0x8000)).toBe((3 * 0x4000) & 0xff);
    });

    it("$FFFF 読出しは最終バンクの末尾", () => {
      const mapper = new MapperBandaiFcg(makeCart());
      const lastBank = 15;
      expect(mapper.readPrg(0xffff)).toBe((lastBank * 0x4000 + 0x3fff) & 0xff);
    });

    it("小さい PRG ROM (32KB) で末尾バンクが正しい", () => {
      const mapper = new MapperBandaiFcg(makeCart({ prgSize: 0x8000 })); // 2 バンク
      expect(mapper.readPrg(0xc000)).toBe((1 * 0x4000) & 0xff);
    });
  });
});
