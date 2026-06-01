import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperMmc5 } from "../src/core/mappers/mmc5.ts";
import type { Mirroring } from "../src/core/cart.ts";

function makeCart(opts: {
  prgSize?: number;
  chrSize?: number;
  mirroring?: Mirroring;
} = {}): Cart {
  const prgSize = opts.prgSize ?? 0x40000; // 256KB (32 × 8KB)
  const chrSize = opts.chrSize ?? 0x40000; // 256KB

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
      mapper: 5,
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

describe("MapperMmc5", () => {
  describe("PRG バンク切替", () => {
    it("デフォルトはモード 3 で最終バンクが $E000-$FFFF にマッピングされる", () => {
      const cart = makeCart({ prgSize: 0x40000 }); // 32 × 8KB
      const m = new MapperMmc5(cart);
      // $5117 のデフォルト値 = 最終バンク (31) | 0x80
      // $FFFF を読むと prgRom の最終バンクの末尾
      const lastBankStart = 31 * 0x2000;
      expect(m.readPrg(0xffff)).toBe(cart.prgRom[lastBankStart + 0x1fff]!);
    });

    it("モード 3: 8KB×4 独立バンク切替", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const m = new MapperMmc5(cart);
      m.writeRegister!(0x5100, 3); // モード 3

      // $5114 = bank 2 (ROM, bit7=1)
      m.writeRegister!(0x5114, 0x82);
      // $5115 = bank 5
      m.writeRegister!(0x5115, 0x85);
      // $5116 = bank 10
      m.writeRegister!(0x5116, 0x8a);
      // $5117 = bank 15
      m.writeRegister!(0x5117, 0x0f); // bit 7 は writeRegister が自動で設定

      expect(m.readPrg(0x8000)).toBe(cart.prgRom[2 * 0x2000]!);
      expect(m.readPrg(0xa000)).toBe(cart.prgRom[5 * 0x2000]!);
      expect(m.readPrg(0xc000)).toBe(cart.prgRom[10 * 0x2000]!);
      expect(m.readPrg(0xe000)).toBe(cart.prgRom[15 * 0x2000]!);
    });

    it("モード 0: 32KB 一括切替", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const m = new MapperMmc5(cart);
      m.writeRegister!(0x5100, 0); // モード 0

      // $5117 = bank index 4 (32KB 単位 → 8KB 換算で bank 16-19)
      m.writeRegister!(0x5117, 0x04);
      // bit 7=1 が自動設定されるので値は 0x84
      // (0x84 & 0x7c) >> 2 = 1 → 1<<2 = 4 → 8KB bank 4,5,6,7

      expect(m.readPrg(0x8000)).toBe(cart.prgRom[4 * 0x2000]!);
      expect(m.readPrg(0xa000)).toBe(cart.prgRom[5 * 0x2000]!);
      expect(m.readPrg(0xc000)).toBe(cart.prgRom[6 * 0x2000]!);
      expect(m.readPrg(0xe000)).toBe(cart.prgRom[7 * 0x2000]!);
    });

    it("モード 1: 16KB+16KB 切替", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const m = new MapperMmc5(cart);
      m.writeRegister!(0x5100, 1); // モード 1

      // $5115: $8000-$BFFF = 16KB bank 3 (8KB 換算で bank 6,7)
      m.writeRegister!(0x5115, 0x83);
      // $5117: $C000-$FFFF = 16KB bank 5 (8KB 換算で bank 10,11)
      m.writeRegister!(0x5117, 0x05);

      expect(m.readPrg(0x8000)).toBe(cart.prgRom[6 * 0x2000]!);
      expect(m.readPrg(0xa000)).toBe(cart.prgRom[7 * 0x2000]!);
      expect(m.readPrg(0xc000)).toBe(cart.prgRom[10 * 0x2000]!);
      expect(m.readPrg(0xe000)).toBe(cart.prgRom[11 * 0x2000]!);
    });

    it("モード 2: 16KB+8KB+8KB 切替", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const m = new MapperMmc5(cart);
      m.writeRegister!(0x5100, 2); // モード 2

      // $5115: $8000-$BFFF = 16KB bank 2
      m.writeRegister!(0x5115, 0x82);
      // $5116: $C000-$DFFF = 8KB bank 20
      m.writeRegister!(0x5116, 0x94);
      // $5117: $E000-$FFFF = 8KB bank 25
      m.writeRegister!(0x5117, 0x19);

      expect(m.readPrg(0x8000)).toBe(cart.prgRom[4 * 0x2000]!);
      expect(m.readPrg(0xa000)).toBe(cart.prgRom[5 * 0x2000]!);
      expect(m.readPrg(0xc000)).toBe(cart.prgRom[20 * 0x2000]!);
      expect(m.readPrg(0xe000)).toBe(cart.prgRom[25 * 0x2000]!);
    });

    it("PRG RAM の読み書き ($6000-$7FFF)", () => {
      const m = new MapperMmc5(makeCart());
      // PRG RAM 書き込み保護解除
      m.writeRegister!(0x5102, 0x02);
      m.writeRegister!(0x5103, 0x01);

      m.writePrgRam(0x6000, 0x42);
      expect(m.readPrgRam(0x6000)).toBe(0x42);

      m.writePrgRam(0x7fff, 0xab);
      expect(m.readPrgRam(0x7fff)).toBe(0xab);
    });

    it("モード 3: RAM バンク ($8000-$DFFF) の読み書き", () => {
      const m = new MapperMmc5(makeCart());
      m.writeRegister!(0x5100, 3); // モード 3
      m.writeRegister!(0x5102, 0x02);
      m.writeRegister!(0x5103, 0x01);

      // $5114 = RAM bank 0 (bit 7=0)
      m.writeRegister!(0x5114, 0x00);
      m.writePrg(0x8000, 0x42);
      expect(m.readPrg(0x8000)).toBe(0x42);
    });

    it("PRG RAM 書き込み保護が有効な時は書き込み不可", () => {
      const m = new MapperMmc5(makeCart());
      // デフォルトは保護有効
      m.writePrgRam(0x6000, 0x42);
      expect(m.readPrgRam(0x6000)).toBe(0); // 書き込まれない
    });
  });

  describe("CHR バンク切替", () => {
    it("モード 3: 1KB×8 独立バンク切替 (スプライト)", () => {
      const cart = makeCart({ chrSize: 0x40000 }); // 256 × 1KB
      const m = new MapperMmc5(cart);
      m.writeRegister!(0x5101, 3); // モード 3

      // スプライト用バンクを設定
      m.writeRegister!(0x5120, 10); // $0000-$03FF = bank 10
      m.writeRegister!(0x5121, 20); // $0400-$07FF = bank 20
      m.writeRegister!(0x5122, 30); // $0800-$0BFF = bank 30
      m.writeRegister!(0x5123, 40); // $0C00-$0FFF = bank 40

      expect(m.readChr(0x0000)).toBe(cart.chrRom[10 * 0x400]!);
      expect(m.readChr(0x0400)).toBe(cart.chrRom[20 * 0x400]!);
      expect(m.readChr(0x0800)).toBe(cart.chrRom[30 * 0x400]!);
      expect(m.readChr(0x0c00)).toBe(cart.chrRom[40 * 0x400]!);
    });

    it("モード 3: 背景用バンクが全 8 slots に反映される (4 レジスタがミラー)", () => {
      const cart = makeCart({ chrSize: 0x40000 });
      const m = new MapperMmc5(cart);
      m.writeRegister!(0x5101, 3); // モード 3

      // 背景用バンクを設定 ($5128-$512B)
      m.writeRegister!(0x5128, 50);
      m.writeRegister!(0x5129, 60);
      m.writeRegister!(0x512a, 70);
      m.writeRegister!(0x512b, 80);

      // lastChrWrite が "bg" なので全 8 slots に BG バンクがミラーされる
      // $0000-$0FFF も BG バンクを使う
      expect(m.readChr(0x0000)).toBe(cart.chrRom[50 * 0x400]!);
      expect(m.readChr(0x0400)).toBe(cart.chrRom[60 * 0x400]!);
      expect(m.readChr(0x0800)).toBe(cart.chrRom[70 * 0x400]!);
      expect(m.readChr(0x0c00)).toBe(cart.chrRom[80 * 0x400]!);
      // $1000-$1FFF
      expect(m.readChr(0x1000)).toBe(cart.chrRom[50 * 0x400]!);
      expect(m.readChr(0x1400)).toBe(cart.chrRom[60 * 0x400]!);
      expect(m.readChr(0x1800)).toBe(cart.chrRom[70 * 0x400]!);
      expect(m.readChr(0x1c00)).toBe(cart.chrRom[80 * 0x400]!);
    });

    it("CHR バンク上位ビット ($5130) が反映される", () => {
      const cart = makeCart({ chrSize: 0x80000 }); // 512KB = 512 × 1KB
      const m = new MapperMmc5(cart);
      m.writeRegister!(0x5101, 3); // モード 3

      // 上位ビットを 1 に設定 → バンク値に 0x100 が加算される
      m.writeRegister!(0x5130, 1);
      m.writeRegister!(0x5120, 5); // 実効バンク = 0x100 + 5 = 261

      expect(m.readChr(0x0000)).toBe(cart.chrRom[(261 % 512) * 0x400]!);
    });

    it("CHR RAM モード", () => {
      const m = new MapperMmc5(makeCart({ chrSize: 0 }));
      m.writeChr(0x0000, 0xab);
      expect(m.readChr(0x0000)).toBe(0xab);
      m.writeChr(0x1fff, 0xcd);
      expect(m.readChr(0x1fff)).toBe(0xcd);
    });
  });

  describe("ExRAM", () => {
    it("モード 2: 汎用 RAM として読み書き", () => {
      const m = new MapperMmc5(makeCart());
      m.writeRegister!(0x5104, 2); // ExRAM モード 2

      m.writeRegister!(0x5c00, 0x42);
      expect(m.readRegister!(0x5c00)).toBe(0x42);

      m.writeRegister!(0x5dff, 0xab);
      expect(m.readRegister!(0x5dff)).toBe(0xab);
    });

    it("モード 3: 読み取り専用", () => {
      const m = new MapperMmc5(makeCart());
      m.writeRegister!(0x5104, 2); // まずモード 2 で書き込み
      m.writeRegister!(0x5c00, 0x42);

      m.writeRegister!(0x5104, 3); // モード 3 に切替
      expect(m.readRegister!(0x5c00)).toBe(0x42); // 読める
      m.writeRegister!(0x5c00, 0xff); // 書き込み試行
      expect(m.readRegister!(0x5c00)).toBe(0x42); // 変化なし
    });
  });

  describe("ネームテーブルマッピング", () => {
    it("fill mode でタイルデータを返す", () => {
      const m = new MapperMmc5(makeCart());
      // NT0 を fill mode に設定
      m.writeRegister!(0x5105, 0x03); // NT0 = source 3 (fill)
      m.writeRegister!(0x5106, 0xaa); // fill タイル
      m.writeRegister!(0x5107, 0x02); // fill 属性

      // タイル領域
      expect(m.readNametable!(0x2000)).toBe(0xaa);
      expect(m.readNametable!(0x2100)).toBe(0xaa);

      // 属性テーブル ($23C0-$23FF)
      const attr = m.readNametable!(0x23c0);
      // 属性は (2<<6)|(2<<4)|(2<<2)|2 = 0xAA
      expect(attr).toBe(0xaa);
    });

    it("ExRAM (source 2) がネームテーブルデータを返す", () => {
      const m = new MapperMmc5(makeCart());
      m.writeRegister!(0x5104, 0); // ExRAM モード 0
      m.writeRegister!(0x5105, 0x02); // NT0 = source 2 (ExRAM)

      // ExRAM に書き込み
      m.writeNametable!(0x2000, 0xcd);
      expect(m.readNametable!(0x2000)).toBe(0xcd);
    });

    it("CIRAM source (0,1) — ciram 未設定時は PPU に委譲 (undefined)", () => {
      const m = new MapperMmc5(makeCart());
      m.writeRegister!(0x5105, 0x00); // NT0 = source 0 (CIRAM page 0)

      expect(m.readNametable!(0x2000)).toBeUndefined();
    });

    it("CIRAM source (0,1) — ciram 設定時は直接読む", () => {
      const m = new MapperMmc5(makeCart());
      const ciram = new Uint8Array(0x1000);
      ciram[0x000] = 0x11; // CIRAM page 0, offset 0
      ciram[0x400] = 0x22; // CIRAM page 1, offset 0
      m.ciram = ciram;

      // NT0 = CIRAM page 0, NT1 = CIRAM page 1
      m.writeRegister!(0x5105, 0x01 | (0x01 << 2)); // NT0=page0(0), NT1=page1(1)
      m.writeRegister!(0x5105, 0x04); // NT0=source0, NT1=source1

      expect(m.readNametable!(0x2000)).toBe(0x11); // NT0 → CIRAM page 0
      expect(m.readNametable!(0x2400)).toBe(0x22); // NT1 → CIRAM page 1
    });

    it("writeNametable は fill mode で書き込みを無視", () => {
      const m = new MapperMmc5(makeCart());
      m.writeRegister!(0x5105, 0x03); // NT0 = fill mode
      expect(m.writeNametable!(0x2000, 0xff)).toBe(true); // mapper が処理済み
    });
  });

  describe("IRQ scanline カウンタ", () => {
    it("IRQ target に達したら irqPending がセットされる", () => {
      const m = new MapperMmc5(makeCart());
      m.writeRegister!(0x5203, 10); // IRQ target = 10
      m.writeRegister!(0x5204, 0x80); // IRQ 有効

      // 10 回 clockIrqCounter を呼ぶ
      for (let i = 0; i < 9; i++) {
        m.clockIrqCounter();
        expect(m.irqPending).toBe(false);
      }
      m.clockIrqCounter();
      expect(m.irqPending).toBe(true);
    });

    it("IRQ 無効時は irqPending がセットされない", () => {
      const m = new MapperMmc5(makeCart());
      m.writeRegister!(0x5203, 5);
      // IRQ 無効 (デフォルト)

      for (let i = 0; i < 10; i++) {
        m.clockIrqCounter();
      }
      expect(m.irqPending).toBe(false);
    });

    it("$5204 読み出しで irqPending がクリアされる", () => {
      const m = new MapperMmc5(makeCart());
      m.writeRegister!(0x5203, 1);
      m.writeRegister!(0x5204, 0x80);

      m.clockIrqCounter();
      expect(m.irqPending).toBe(true);

      const status = m.readRegister!(0x5204);
      expect(status & 0x80).toBe(0x80); // pending ビット
      expect(m.irqPending).toBe(false); // クリア済み
    });

    it("240 scanline でカウンタがリセットされる", () => {
      const m = new MapperMmc5(makeCart());
      m.writeRegister!(0x5203, 100); // target = 100
      m.writeRegister!(0x5204, 0x80);

      // 240 scanline 分 clock
      for (let i = 0; i < 240; i++) {
        m.clockIrqCounter();
      }
      expect(m.irqPending).toBe(true); // scanline 100 で fire 済み

      m.irqPending = false;

      // フレーム 2 — カウンタはリセット済みなので再び target=100 で fire
      for (let i = 0; i < 100; i++) {
        m.clockIrqCounter();
      }
      expect(m.irqPending).toBe(true); // フレーム 2 でも正しく fire
    });
  });

  describe("8×8 乗算器", () => {
    it("基本的な乗算", () => {
      const m = new MapperMmc5(makeCart());
      m.writeRegister!(0x5205, 12); // multiplicand
      m.writeRegister!(0x5206, 10); // multiplier

      // 12 × 10 = 120 = 0x0078
      expect(m.readRegister!(0x5205)).toBe(0x78); // lo
      expect(m.readRegister!(0x5206)).toBe(0x00); // hi
    });

    it("オーバーフローする乗算", () => {
      const m = new MapperMmc5(makeCart());
      m.writeRegister!(0x5205, 255);
      m.writeRegister!(0x5206, 255);

      // 255 × 255 = 65025 = 0xFE01
      expect(m.readRegister!(0x5205)).toBe(0x01);
      expect(m.readRegister!(0x5206)).toBe(0xfe);
    });

    it("ゼロの乗算", () => {
      const m = new MapperMmc5(makeCart());
      m.writeRegister!(0x5205, 100);
      m.writeRegister!(0x5206, 0);

      expect(m.readRegister!(0x5205)).toBe(0x00);
      expect(m.readRegister!(0x5206)).toBe(0x00);
    });
  });

  describe("拡張音源", () => {
    it("pulse を有効化して audioOutput が非ゼロになる", () => {
      const m = new MapperMmc5(makeCart());
      // pulse 1 有効化
      m.writeRegister!(0x5015, 0x01);

      // duty=50%, constant volume, vol=15
      m.writeRegister!(0x5000, 0x7f); // duty=1, halt=1, const=1, vol=15

      // period 設定 (短いperiodで速い波形)
      m.writeRegister!(0x5002, 0x10); // timer lo = 16
      m.writeRegister!(0x5003, 0x08); // timer hi=0, length counter load (table index 1 = 254)

      // CPU サイクルを十分回して波形を一周させる
      let hasOutput = false;
      for (let i = 0; i < 2000; i++) {
        m.cpuCycleTick!();
        if (m.audioOutput!() !== 0) {
          hasOutput = true;
          break;
        }
      }
      expect(hasOutput).toBe(true);
    });

    it("pulse 無効時は出力ゼロ", () => {
      const m = new MapperMmc5(makeCart());
      // 有効化しない
      expect(m.audioOutput!()).toBe(0);
    });
  });

  describe("シリアライズ/デシリアライズ", () => {
    it("状態を正しく復元できる", () => {
      const cart = makeCart();
      const m = new MapperMmc5(cart);

      m.writeRegister!(0x5100, 2);
      m.writeRegister!(0x5101, 1);
      m.writeRegister!(0x5105, 0xff);
      m.writeRegister!(0x5106, 0x42);
      m.writeRegister!(0x5203, 30);
      m.writeRegister!(0x5205, 7);
      m.writeRegister!(0x5206, 8);

      const state = m.serializeMapper();

      const m2 = new MapperMmc5(cart);
      m2.deserializeMapper(state);

      // 乗算結果が同じ
      expect(m2.readRegister!(0x5205)).toBe(m.readRegister!(0x5205));
      expect(m2.readRegister!(0x5206)).toBe(m.readRegister!(0x5206));
    });
  });

  it("mapperId は 5 を返す", () => {
    const m = new MapperMmc5(makeCart());
    expect(m.mapperId()).toBe(5);
  });
});
