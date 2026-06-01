import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import type { Mirroring } from "../src/core/cart.ts";
import { MapperSunsoftFme7 } from "../src/core/mappers/sunsoft-fme7.ts";
import { createMapper } from "../src/core/mappers/mapper.ts";

/** テスト用 Cart を生成 */
function makeCart(opts: {
  prgSize?: number;
  chrSize?: number;
  mirroring?: Mirroring;
} = {}): Cart {
  const prgSize = opts.prgSize ?? 0x40000; // 256KB (32 × 8KB)
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
      mapper: 69,
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

/** CHR RAM 用 Cart */
function makeCartChrRam(opts: { prgSize?: number } = {}): Cart {
  const prgSize = opts.prgSize ?? 0x40000;

  const prgRom = new Uint8Array(prgSize);
  for (let i = 0; i < prgSize; i++) {
    prgRom[i] = i & 0xff;
  }

  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: 0,
      mapper: 69,
      mirroring: "vertical",
      hasBattery: false,
      hasTrainer: false,
      fourScreen: false,
    },
    prgRom,
    chrRom: new Uint8Array(0),
    trainer: null,
  };
}

/** コマンド + パラメータ書き込みのヘルパー */
function writeCommand(mapper: MapperSunsoftFme7, cmd: number, param: number): void {
  mapper.writePrg(0x8000, cmd);
  mapper.writePrg(0xa000, param);
}

describe("MapperSunsoftFme7", () => {
  describe("createMapper", () => {
    it("mapper 69 で MapperSunsoftFme7 が生成される", () => {
      const mapper = createMapper(makeCart());
      expect(mapper.mapperId()).toBe(69);
    });
  });

  describe("コマンド/パラメータレジスタ方式", () => {
    it("$8000 でコマンドを選び $A000 でパラメータを書く", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperSunsoftFme7(cart);

      // コマンド 9 = PRG bank 1 ($8000-$9FFF) をバンク 5 に設定
      writeCommand(mapper, 9, 5);

      // bank 5 のデータが読めることを確認
      const expected = cart.prgRom[5 * 0x2000]!;
      expect(mapper.readPrg(0x8000)).toBe(expected);
    });
  });

  describe("PRG バンク切替", () => {
    it("初期状態で $E000-$FFFF は最終バンク固定", () => {
      const cart = makeCart({ prgSize: 0x40000 }); // 32 × 8KB
      const mapper = new MapperSunsoftFme7(cart);

      const lastBankOffset = 31 * 0x2000;
      expect(mapper.readPrg(0xe000)).toBe(cart.prgRom[lastBankOffset]!);
      expect(mapper.readPrg(0xffff)).toBe(cart.prgRom[lastBankOffset + 0x1fff]!);
    });

    it("$E000-$FFFF は常に最終バンク固定 (変更不可)", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperSunsoftFme7(cart);

      // コマンド 11 は $C000-$DFFF のバンク。$E000 には影響しない
      writeCommand(mapper, 11, 3);

      const lastBankOffset = 31 * 0x2000;
      expect(mapper.readPrg(0xe000)).toBe(cart.prgRom[lastBankOffset]!);
    });

    it("コマンド 9 で $8000-$9FFF のバンクを切替", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperSunsoftFme7(cart);

      writeCommand(mapper, 9, 10);
      expect(mapper.readPrg(0x8000)).toBe(cart.prgRom[10 * 0x2000]!);
    });

    it("コマンド 10 で $A000-$BFFF のバンクを切替", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperSunsoftFme7(cart);

      writeCommand(mapper, 10, 7);
      expect(mapper.readPrg(0xa000)).toBe(cart.prgRom[7 * 0x2000]!);
    });

    it("コマンド 11 で $C000-$DFFF のバンクを切替", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperSunsoftFme7(cart);

      writeCommand(mapper, 11, 15);
      expect(mapper.readPrg(0xc000)).toBe(cart.prgRom[15 * 0x2000]!);
    });

    it("PRG バンクは 6bit マスク (0-63) を適用", () => {
      const cart = makeCart({ prgSize: 0x40000 }); // 32 banks
      const mapper = new MapperSunsoftFme7(cart);

      writeCommand(mapper, 9, 0xff); // 0xff & 0x3f = 63, 63 % 32 = 31
      const expectedBank = 63 % 32;
      expect(mapper.readPrg(0x8000)).toBe(cart.prgRom[expectedBank * 0x2000]!);
    });
  });

  describe("$6000-$7FFF PRG ROM/RAM 切替", () => {
    it("コマンド 8 の bit7=1, bit6=1 で PRG RAM として動作", () => {
      const cart = makeCart();
      const mapper = new MapperSunsoftFme7(cart);

      // bit7 (enable) + bit6 (RAM select) = 0xc0
      writeCommand(mapper, 8, 0xc0);

      mapper.writePrgRam(0x6000, 0x42);
      expect(mapper.readPrgRam(0x6000)).toBe(0x42);
    });

    it("コマンド 8 の bit7=1, bit6=0 で PRG ROM を読む", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperSunsoftFme7(cart);

      // bit7=1, bit6=0, bank=5 → ROM bank 5 を $6000 にマップ
      writeCommand(mapper, 8, 0x80 | 5);

      expect(mapper.readPrgRam(0x6000)).toBe(cart.prgRom[5 * 0x2000]!);
    });

    it("コマンド 8 の bit7=0 で $6000 は無効 (0 を返す)", () => {
      const cart = makeCart();
      const mapper = new MapperSunsoftFme7(cart);

      writeCommand(mapper, 8, 0x00);
      expect(mapper.readPrgRam(0x6000)).toBe(0);
    });

    it("RAM モード時のみ書き込み可", () => {
      const cart = makeCart();
      const mapper = new MapperSunsoftFme7(cart);

      // ROM モード: 書き込みは無視される
      writeCommand(mapper, 8, 0x80 | 5);
      mapper.writePrgRam(0x6000, 0xff);

      // RAM モードに切り替え
      writeCommand(mapper, 8, 0xc0);
      // ROM モードで書いた値は保存されていない (RAM は別領域)
      expect(mapper.readPrgRam(0x6000)).toBe(0);
    });
  });

  describe("CHR バンク切替", () => {
    it("コマンド 0-7 で 1KB 単位の CHR バンクを設定", () => {
      const cart = makeCart({ chrSize: 0x20000 }); // 128 × 1KB
      const mapper = new MapperSunsoftFme7(cart);

      for (let slot = 0; slot < 8; slot++) {
        writeCommand(mapper, slot, slot + 10);
      }

      // スロット 0 → bank 10 の CHR データ
      const expectedAddr = 10 * 0x0400;
      expect(mapper.readChr(0x0000)).toBe(cart.chrRom[expectedAddr]!);

      // スロット 3 → bank 13 の CHR データ
      const expectedAddr3 = 13 * 0x0400;
      expect(mapper.readChr(0x0c00)).toBe(cart.chrRom[expectedAddr3]!);
    });

    it("CHR RAM の場合はフラットアクセス", () => {
      const mapper = new MapperSunsoftFme7(makeCartChrRam());

      mapper.writeChr(0x0000, 0xab);
      expect(mapper.readChr(0x0000)).toBe(0xab);
    });
  });

  describe("ミラーリング制御", () => {
    it("コマンド 12 の値 0 で vertical", () => {
      const mapper = new MapperSunsoftFme7(makeCart());
      let lastMirror: Mirroring | null = null;
      mapper.onMirroringChange = (m) => { lastMirror = m; };

      writeCommand(mapper, 12, 0);
      expect(lastMirror).toBe("vertical");
    });

    it("コマンド 12 の値 1 で horizontal", () => {
      const mapper = new MapperSunsoftFme7(makeCart());
      let lastMirror: Mirroring | null = null;
      mapper.onMirroringChange = (m) => { lastMirror = m; };

      writeCommand(mapper, 12, 1);
      expect(lastMirror).toBe("horizontal");
    });

    it("コマンド 12 の値 2 で single-lower", () => {
      const mapper = new MapperSunsoftFme7(makeCart());
      let lastMirror: Mirroring | null = null;
      mapper.onMirroringChange = (m) => { lastMirror = m; };

      writeCommand(mapper, 12, 2);
      expect(lastMirror).toBe("single-lower");
    });

    it("コマンド 12 の値 3 で single-upper", () => {
      const mapper = new MapperSunsoftFme7(makeCart());
      let lastMirror: Mirroring | null = null;
      mapper.onMirroringChange = (m) => { lastMirror = m; };

      writeCommand(mapper, 12, 3);
      expect(lastMirror).toBe("single-upper");
    });
  });

  describe("IRQ カウンタ", () => {
    it("カウントダウンして 0→FFFF で IRQ 発火", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      // IRQ 有効 + カウンタ有効 (コマンド 13 = 0x81)
      writeCommand(mapper, 13, 0x81);
      // カウンタ = 3 に設定
      writeCommand(mapper, 14, 3);  // 下位
      writeCommand(mapper, 15, 0);  // 上位

      expect(mapper.irqPending).toBe(false);

      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(false); // 2
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(false); // 1
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(false); // 0
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);  // 0→FFFF で発火
    });

    it("irqEnabled=false 時はカウントダウンしても発火しない", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      // カウンタ有効だが IRQ 無効 (コマンド 13 = 0x80)
      writeCommand(mapper, 13, 0x80);
      writeCommand(mapper, 14, 1);
      writeCommand(mapper, 15, 0);

      mapper.cpuCycleTick!();
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(false);
    });

    it("irqCounterEnabled=false 時はカウントダウンしない", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      // IRQ 有効だがカウンタ無効 (コマンド 13 = 0x01)
      writeCommand(mapper, 13, 0x01);
      writeCommand(mapper, 14, 1);
      writeCommand(mapper, 15, 0);

      mapper.cpuCycleTick!();
      mapper.cpuCycleTick!();
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(false);
    });

    it("IRQ 無効化で irqPending がクリアされる", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      writeCommand(mapper, 13, 0x81);
      writeCommand(mapper, 14, 1);
      writeCommand(mapper, 15, 0);

      mapper.cpuCycleTick!();
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);

      // IRQ 無効化
      writeCommand(mapper, 13, 0x00);
      expect(mapper.irqPending).toBe(false);
    });

    it("16bit カウンタが正しくラップアラウンドする", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      writeCommand(mapper, 13, 0x81);
      writeCommand(mapper, 14, 0);  // 下位 = 0
      writeCommand(mapper, 15, 1);  // 上位 = 1 → カウンタ = 0x0100

      // 256 + 1 tick でラップアラウンド
      for (let i = 0; i < 256; i++) {
        mapper.cpuCycleTick!();
      }
      expect(mapper.irqPending).toBe(false); // カウンタ = 0 まだ

      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true); // 0→FFFF で発火
    });
  });

  describe("Sunsoft 5B 拡張音源", () => {
    /** 拡張音源レジスタ書き込みヘルパー */
    function writeAudio(mapper: MapperSunsoftFme7, reg: number, value: number): void {
      mapper.writePrg(0xc000, reg);
      mapper.writePrg(0xe000, value);
    }

    it("audioOutput は初期状態で 0", () => {
      const mapper = new MapperSunsoftFme7(makeCart());
      expect(mapper.audioOutput!()).toBe(0);
    });

    it("トーン有効 + 音量設定で発音する", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      // ch A トーン周期 = 100
      writeAudio(mapper, 0x00, 100); // 下位
      writeAudio(mapper, 0x01, 0);   // 上位
      // ミキサー: ch A トーン有効、ノイズ無効
      writeAudio(mapper, 0x07, 0x38); // tone: A=on, B=off, C=off / noise: all off
      // ch A 音量 = 15
      writeAudio(mapper, 0x08, 15);

      // 十分な tick で音声出力が変化する
      let hasNonZero = false;
      for (let i = 0; i < 5000; i++) {
        mapper.cpuCycleTick!();
        if (mapper.audioOutput!() !== 0) {
          hasNonZero = true;
          break;
        }
      }
      expect(hasNonZero).toBe(true);
    });

    it("ノイズのみ有効で発音する", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      // ノイズ周期 = 5
      writeAudio(mapper, 0x06, 5);
      // ミキサー: トーン全無効、ch A ノイズ有効
      writeAudio(mapper, 0x07, 0x07 | 0x30); // tone: all off / noise: A=on, B=off, C=off
      // ch A 音量 = 10
      writeAudio(mapper, 0x08, 10);

      let hasNonZero = false;
      for (let i = 0; i < 5000; i++) {
        mapper.cpuCycleTick!();
        if (mapper.audioOutput!() !== 0) {
          hasNonZero = true;
          break;
        }
      }
      expect(hasNonZero).toBe(true);
    });

    it("音量 0 では出力しない", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      writeAudio(mapper, 0x00, 50);
      writeAudio(mapper, 0x01, 0);
      writeAudio(mapper, 0x07, 0x38);
      writeAudio(mapper, 0x08, 0); // 音量 = 0

      for (let i = 0; i < 5000; i++) {
        mapper.cpuCycleTick!();
      }
      expect(mapper.audioOutput!()).toBe(0);
    });

    it("エンベロープモードで発音する", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      writeAudio(mapper, 0x00, 50);
      writeAudio(mapper, 0x01, 0);
      writeAudio(mapper, 0x07, 0x38);
      // ch A: エンベロープモード (bit4=1)
      writeAudio(mapper, 0x08, 0x10);
      // エンベロープ周期 = 100
      writeAudio(mapper, 0x0b, 100);
      writeAudio(mapper, 0x0c, 0);
      // エンベロープ形状 = 14 (attack + alternate + continue)
      writeAudio(mapper, 0x0d, 14);

      let hasNonZero = false;
      for (let i = 0; i < 10000; i++) {
        mapper.cpuCycleTick!();
        if (mapper.audioOutput!() !== 0) {
          hasNonZero = true;
          break;
        }
      }
      expect(hasNonZero).toBe(true);
    });

    it("$C000 で音源アドレス、$E000 でデータを書き分ける", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      // ch B のトーン周期を設定
      mapper.writePrg(0xc000, 0x02); // reg 2 = ch B 下位
      mapper.writePrg(0xe000, 200);
      mapper.writePrg(0xc000, 0x03); // reg 3 = ch B 上位
      mapper.writePrg(0xe000, 0);

      // ミキサー: ch B のみトーン有効
      mapper.writePrg(0xc000, 0x07);
      mapper.writePrg(0xe000, 0x3d); // tone: B=on / noise: all off
      // ch B 音量 = 15
      mapper.writePrg(0xc000, 0x09);
      mapper.writePrg(0xe000, 15);

      let hasNonZero = false;
      for (let i = 0; i < 5000; i++) {
        mapper.cpuCycleTick!();
        if (mapper.audioOutput!() !== 0) {
          hasNonZero = true;
          break;
        }
      }
      expect(hasNonZero).toBe(true);
    });

    it("audioOutput の値は [-1, 1] の範囲内", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      // 全チャンネル最大音量
      writeAudio(mapper, 0x00, 1);
      writeAudio(mapper, 0x01, 0);
      writeAudio(mapper, 0x02, 1);
      writeAudio(mapper, 0x03, 0);
      writeAudio(mapper, 0x04, 1);
      writeAudio(mapper, 0x05, 0);
      writeAudio(mapper, 0x07, 0x38); // 全トーン有効
      writeAudio(mapper, 0x08, 15);
      writeAudio(mapper, 0x09, 15);
      writeAudio(mapper, 0x0a, 15);

      for (let i = 0; i < 10000; i++) {
        mapper.cpuCycleTick!();
        const out = mapper.audioOutput!();
        expect(out).toBeGreaterThanOrEqual(-1);
        expect(out).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("serialize / deserialize", () => {
    it("シリアライズ→デシリアライズで状態が復元される", () => {
      const cart = makeCart();
      const mapper = new MapperSunsoftFme7(cart);

      writeCommand(mapper, 9, 5);
      writeCommand(mapper, 0, 20);
      writeCommand(mapper, 12, 2);
      writeCommand(mapper, 8, 0xc0);
      mapper.writePrgRam(0x6000, 0x42);

      const state = mapper.serializeMapper();

      const mapper2 = new MapperSunsoftFme7(cart);
      mapper2.deserializeMapper(state);

      expect(mapper2.readPrg(0x8000)).toBe(mapper.readPrg(0x8000));
      expect(mapper2.readChr(0x0000)).toBe(mapper.readChr(0x0000));
      expect(mapper2.readPrgRam(0x6000)).toBe(0x42);
    });
  });

  describe("reset", () => {
    it("reset 後に初期状態に戻る", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperSunsoftFme7(cart);

      writeCommand(mapper, 9, 10);
      writeCommand(mapper, 13, 0x81);

      mapper.reset();

      // $E000 は最終バンク
      const lastBankOffset = 31 * 0x2000;
      expect(mapper.readPrg(0xe000)).toBe(cart.prgRom[lastBankOffset]!);
      expect(mapper.irqPending).toBe(false);
    });
  });
});
