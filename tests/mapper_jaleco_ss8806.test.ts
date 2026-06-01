import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import type { Mirroring } from "../src/core/cart.ts";
import { MapperJalecoSs8806 } from "../src/core/mappers/jaleco-ss8806.ts";
import { createMapper } from "../src/core/mappers/mapper.ts";

/** テスト用 Cart を生成 */
function makeCart(opts: {
  prgSize?: number;
  chrSize?: number;
  mirroring?: Mirroring;
} = {}): Cart {
  const prgSize = opts.prgSize ?? 0x40000; // 256KB (32 × 8KB)
  const chrSize = opts.chrSize ?? 0x40000; // 256KB (256 × 1KB)

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
      mapper: 18,
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

describe("MapperJalecoSs8806", () => {
  describe("createMapper", () => {
    it("mapper 18 で MapperJalecoSs8806 が生成される", () => {
      const mapper = createMapper(makeCart());
      expect(mapper.mapperId()).toBe(18);
    });
  });

  describe("初期状態", () => {
    it("irqPending が false", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      expect(mapper.irqPending).toBe(false);
    });

    it("$8000 はバンク 0", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      expect(mapper.readPrg(0x8000)).toBe(0);
    });

    it("$E000 は最終バンク固定", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      // 256KB = 32 × 8KB → 最終バンク 31
      const lastBank = 31;
      expect(mapper.readPrg(0xe000)).toBe((lastBank * 0x2000) & 0xff);
    });
  });

  describe("PRG バンク切替", () => {
    it("$8000-$9FFF をバンク 0 で切替 (4bit ペア)", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      // PRG Select 0: $8000 = low nibble, $8001 = high nibble
      mapper.writePrg(0x8000, 5);  // low = 5
      mapper.writePrg(0x8001, 1);  // high = 1 → bank = 0x15
      expect(mapper.readPrg(0x8000)).toBe((0x15 * 0x2000) & 0xff);
    });

    it("$A000-$BFFF をバンク 1 で切替", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0x8002, 3);  // PRG1 low = 3
      mapper.writePrg(0x8003, 0);  // PRG1 high = 0 → bank = 3
      expect(mapper.readPrg(0xa000)).toBe((3 * 0x2000) & 0xff);
    });

    it("$C000-$DFFF をバンク 2 で切替", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0x9000, 7);  // PRG2 low = 7
      mapper.writePrg(0x9001, 0);  // PRG2 high = 0 → bank = 7
      expect(mapper.readPrg(0xc000)).toBe((7 * 0x2000) & 0xff);
    });

    it("$E000-$FFFF は常に最終バンク", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0x8000, 5);
      mapper.writePrg(0x8001, 1);
      // $E000 は変わらず最終
      const lastBank = 31;
      expect(mapper.readPrg(0xe000)).toBe((lastBank * 0x2000) & 0xff);
    });

    it("PRG バンク番号は 6bit 幅 (上位 nibble の下位 2bit のみ)", () => {
      const mapper = new MapperJalecoSs8806(makeCart({ prgSize: 0x80000 })); // 512KB = 64 バンク
      mapper.writePrg(0x8000, 0x0f); // low = 0xF
      mapper.writePrg(0x8001, 0x0f); // high = 0xF → 実効 0x03 → bank = 0x3F
      expect(mapper.readPrg(0x8000)).toBe((0x3f * 0x2000) & 0xff);
    });

    it("バンク番号が PRG バンク数で modulo される", () => {
      const mapper = new MapperJalecoSs8806(makeCart({ prgSize: 0x10000 })); // 64KB = 8 バンク
      mapper.writePrg(0x8000, 0x0a); // low = 0xA
      mapper.writePrg(0x8001, 0x00); // high = 0 → bank = 10 % 8 = 2
      expect(mapper.readPrg(0x8000)).toBe((2 * 0x2000) & 0xff);
    });

    it("各ウィンドウの末尾アドレスが正しい", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0x8000, 1);
      mapper.writePrg(0x8001, 0);
      expect(mapper.readPrg(0x9fff)).toBe((1 * 0x2000 + 0x1fff) & 0xff);
    });
  });

  describe("CHR バンク切替", () => {
    it("各 1KB スロットを個別に切替可能 (4bit ペア)", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      // CHR Bank 0: $A000 = low, $A001 = high
      mapper.writePrg(0xa000, 0x05); // CHR0 low = 5
      mapper.writePrg(0xa001, 0x02); // CHR0 high = 2 → bank = 0x25

      const bank = 0x25;
      expect(mapper.readChr(0x0000)).toBe((bank * 0x400 + 0x80) & 0xff);
    });

    it("CHR Bank 1 ($0400-$07FF)", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xa002, 0x03);
      mapper.writePrg(0xa003, 0x01); // bank = 0x13
      expect(mapper.readChr(0x0400)).toBe((0x13 * 0x400 + 0x80) & 0xff);
    });

    it("CHR Bank 2 ($0800-$0BFF)", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xb000, 0x07);
      mapper.writePrg(0xb001, 0x00); // bank = 7
      expect(mapper.readChr(0x0800)).toBe((7 * 0x400 + 0x80) & 0xff);
    });

    it("CHR Bank 3 ($0C00-$0FFF)", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xb002, 0x0a);
      mapper.writePrg(0xb003, 0x00); // bank = 0x0A
      expect(mapper.readChr(0x0c00)).toBe((0x0a * 0x400 + 0x80) & 0xff);
    });

    it("CHR Bank 4-7 ($1000-$1FFF)", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      // Bank 4
      mapper.writePrg(0xc000, 0x04);
      mapper.writePrg(0xc001, 0x00);
      expect(mapper.readChr(0x1000)).toBe((4 * 0x400 + 0x80) & 0xff);

      // Bank 5
      mapper.writePrg(0xc002, 0x05);
      mapper.writePrg(0xc003, 0x00);
      expect(mapper.readChr(0x1400)).toBe((5 * 0x400 + 0x80) & 0xff);

      // Bank 6
      mapper.writePrg(0xd000, 0x06);
      mapper.writePrg(0xd001, 0x00);
      expect(mapper.readChr(0x1800)).toBe((6 * 0x400 + 0x80) & 0xff);

      // Bank 7
      mapper.writePrg(0xd002, 0x07);
      mapper.writePrg(0xd003, 0x00);
      expect(mapper.readChr(0x1c00)).toBe((7 * 0x400 + 0x80) & 0xff);
    });

    it("CHR バンク番号は 8bit 幅", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xa000, 0x0f); // low = 0xF
      mapper.writePrg(0xa001, 0x0f); // high = 0xF → bank = 0xFF
      // 256KB = 256 banks → 0xFF % 256 = 255
      expect(mapper.readChr(0x0000)).toBe((255 * 0x400 + 0x80) & 0xff);
    });

    it("CHR RAM 時はフラットアクセス", () => {
      const mapper = new MapperJalecoSs8806(makeCart({ chrSize: 0 }));
      mapper.writeChr(0x0100, 0xab);
      expect(mapper.readChr(0x0100)).toBe(0xab);
    });
  });

  describe("ミラーリング ($F002)", () => {
    it("0 = horizontal", () => {
      let result: Mirroring | null = null;
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.onMirroringChange = (m) => { result = m; };
      mapper.writePrg(0xf002, 0);
      expect(result).toBe("horizontal");
    });

    it("1 = vertical", () => {
      let result: Mirroring | null = null;
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.onMirroringChange = (m) => { result = m; };
      mapper.writePrg(0xf002, 1);
      expect(result).toBe("vertical");
    });

    it("2 = single-lower", () => {
      let result: Mirroring | null = null;
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.onMirroringChange = (m) => { result = m; };
      mapper.writePrg(0xf002, 2);
      expect(result).toBe("single-lower");
    });

    it("3 = single-upper", () => {
      let result: Mirroring | null = null;
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.onMirroringChange = (m) => { result = m; };
      mapper.writePrg(0xf002, 3);
      expect(result).toBe("single-upper");
    });
  });

  describe("IRQ カウンタ", () => {
    it("16bit リロード値を 4bit ずつ設定", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      // リロード値 = 0x1234
      mapper.writePrg(0xe000, 0x04); // bits [3:0] = 4
      mapper.writePrg(0xe001, 0x03); // bits [7:4] = 3
      mapper.writePrg(0xe002, 0x02); // bits [11:8] = 2
      mapper.writePrg(0xe003, 0x01); // bits [15:12] = 1
      // → latch = 0x1234

      // $F001: IRQ enable (bit 0)
      mapper.writePrg(0xf001, 0x01);
      // $F000: リロード値→カウンタ + IRQ ack
      mapper.writePrg(0xf000, 0);

      // 0x1234 = 4660 cycles
      for (let i = 0; i < 4659; i++) {
        mapper.cpuCycleTick!();
        expect(mapper.irqPending).toBe(false);
      }
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("$F000 書込で pending クリア + カウンタリロード", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xe000, 3);
      mapper.writePrg(0xe001, 0);
      mapper.writePrg(0xe002, 0);
      mapper.writePrg(0xe003, 0);
      mapper.writePrg(0xf001, 1); // enable
      mapper.writePrg(0xf000, 0); // reload

      for (let i = 0; i < 3; i++) mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);

      mapper.writePrg(0xf000, 0); // ack + reload
      expect(mapper.irqPending).toBe(false);
    });

    it("IRQ 無効時はカウントしない", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xe000, 1);
      mapper.writePrg(0xe001, 0);
      mapper.writePrg(0xe002, 0);
      mapper.writePrg(0xe003, 0);
      mapper.writePrg(0xf001, 0); // disabled
      mapper.writePrg(0xf000, 0);

      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(false);
    });

    it("8bit カウンタ幅 (T bit)", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      // リロード値の下位 8bit = 0x05, 上位は 0xFF
      mapper.writePrg(0xe000, 0x05);
      mapper.writePrg(0xe001, 0x00);
      mapper.writePrg(0xe002, 0x0f);
      mapper.writePrg(0xe003, 0x0f);

      // T=1: 8bit 幅
      mapper.writePrg(0xf001, 0x03); // C=1, T=1
      mapper.writePrg(0xf000, 0);

      // 8bit カウンタなので下位 8bit (0x05) でカウント
      for (let i = 0; i < 5; i++) mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("12bit カウンタ幅 (E bit)", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xe000, 0x03);
      mapper.writePrg(0xe001, 0x00);
      mapper.writePrg(0xe002, 0x01); // bit 11:8 = 1 → 下位 12bit = 0x103
      mapper.writePrg(0xe003, 0x0f); // bit 15:12 = 0xF (12bit 幅なので無視)

      mapper.writePrg(0xf001, 0x05); // C=1, E=1
      mapper.writePrg(0xf000, 0);

      // 12bit カウンタ = 0x103 = 259
      for (let i = 0; i < 259; i++) mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("4bit カウンタ幅 (F bit)", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xe000, 0x07); // bit 3:0 = 7
      mapper.writePrg(0xe001, 0x0f); // 4bit 幅なので bit 7:4 は無視
      mapper.writePrg(0xe002, 0x0f);
      mapper.writePrg(0xe003, 0x0f);

      mapper.writePrg(0xf001, 0x09); // C=1, F=1
      mapper.writePrg(0xf000, 0);

      for (let i = 0; i < 7; i++) mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("F が E に優先する", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xe000, 0x02);
      mapper.writePrg(0xe001, 0x01);
      mapper.writePrg(0xe002, 0x00);
      mapper.writePrg(0xe003, 0x00);

      // F=1, E=1 → 4bit 幅
      mapper.writePrg(0xf001, 0x0d); // C=1, E=1, F=1
      mapper.writePrg(0xf000, 0);

      // 4bit 幅なので 0x02 でカウント (上位無視)
      for (let i = 0; i < 2; i++) mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("clockIrqCounter は何もしない (CPU cycle ベース)", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xe000, 1);
      mapper.writePrg(0xe001, 0);
      mapper.writePrg(0xe002, 0);
      mapper.writePrg(0xe003, 0);
      mapper.writePrg(0xf001, 1);
      mapper.writePrg(0xf000, 0);

      mapper.clockIrqCounter();
      expect(mapper.irqPending).toBe(false);

      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });
  });

  describe("PRG RAM ($6000-$7FFF)", () => {
    it("read/write が動作する", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrgRam(0x6000, 0xab);
      expect(mapper.readPrgRam(0x6000)).toBe(0xab);
    });

    it("8KB 空間全体が使える", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrgRam(0x7fff, 0xcd);
      expect(mapper.readPrgRam(0x7fff)).toBe(0xcd);
    });
  });

  describe("ステートセーブ/ロード", () => {
    it("全状態が復元される", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0x8000, 5);
      mapper.writePrg(0x8001, 1);
      mapper.writePrg(0xa000, 0x0a);
      mapper.writePrg(0xa001, 0x02);
      mapper.writePrg(0xe000, 0x04);
      mapper.writePrg(0xe001, 0x03);
      mapper.writePrgRam(0x6000, 0xab);

      const state = mapper.serializeMapper();
      const mapper2 = new MapperJalecoSs8806(makeCart());
      mapper2.deserializeMapper(state);

      expect(mapper2.readPrg(0x8000)).toBe(mapper.readPrg(0x8000));
      expect(mapper2.readChr(0x0000)).toBe(mapper.readChr(0x0000));
      expect(mapper2.readPrgRam(0x6000)).toBe(0xab);
    });
  });

  describe("reset()", () => {
    it("全レジスタが初期化される", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0x8000, 5);
      mapper.writePrg(0x8001, 1);
      mapper.writePrg(0xf001, 1);

      mapper.reset();

      expect(mapper.readPrg(0x8000)).toBe(0);
      expect(mapper.irqPending).toBe(false);
    });
  });

  describe("エッジケース", () => {
    it("PRG バンクの部分書き込みが正しくマージされる", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      // low nibble だけ書く → high は 0 のまま
      mapper.writePrg(0x8000, 0x0a); // PRG0 low = 0xA
      expect(mapper.readPrg(0x8000)).toBe((0x0a * 0x2000) & 0xff);

      // high nibble を追加
      mapper.writePrg(0x8001, 0x01); // PRG0 high = 0x01 → bank = 0x1A
      expect(mapper.readPrg(0x8000)).toBe((0x1a * 0x2000) & 0xff);
    });

    it("CHR バンクの部分書き込みが正しくマージされる", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      mapper.writePrg(0xa000, 0x05); // CHR0 low = 5
      expect(mapper.readChr(0x0000)).toBe((5 * 0x400 + 0x80) & 0xff);

      mapper.writePrg(0xa001, 0x03); // CHR0 high = 3 → bank = 0x35
      expect(mapper.readChr(0x0000)).toBe((0x35 * 0x400 + 0x80) & 0xff);
    });

    it("$FFFF 読出しは最終バンクの末尾", () => {
      const mapper = new MapperJalecoSs8806(makeCart());
      const lastBank = 31;
      expect(mapper.readPrg(0xffff)).toBe((lastBank * 0x2000 + 0x1fff) & 0xff);
    });

    it("小さい PRG ROM (32KB) で末尾バンクが正しい", () => {
      const mapper = new MapperJalecoSs8806(makeCart({ prgSize: 0x8000 })); // 4 バンク
      expect(mapper.readPrg(0xe000)).toBe((3 * 0x2000) & 0xff);
    });
  });
});
