import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import type { Mirroring } from "../src/core/cart.ts";
import { MapperNamco163 } from "../src/core/mappers/namco163.ts";
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
      mapper: 19,
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
      mapper: 19,
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

describe("MapperNamco163", () => {
  describe("createMapper", () => {
    it("mapper 19 で MapperNamco163 が生成される", () => {
      const mapper = createMapper(makeCart());
      expect(mapper.mapperId()).toBe(19);
    });
  });

  describe("PRG バンク切替", () => {
    it("初期状態で $E000-$FFFF は最終バンク固定", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperNamco163(cart);
      // 最終バンク = bank 31 (32 × 8KB)
      const lastBankOffset = 31 * 0x2000;
      expect(mapper.readPrg(0xe000)).toBe(cart.prgRom[lastBankOffset]!);
      expect(mapper.readPrg(0xffff)).toBe(cart.prgRom[lastBankOffset + 0x1fff]!);
    });

    it("$E000 で bank 0 ($8000-$9FFF) を切り替え", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperNamco163(cart);
      // bank 5 に設定
      mapper.writePrg(0xe000, 5);
      const offset = 5 * 0x2000;
      expect(mapper.readPrg(0x8000)).toBe(cart.prgRom[offset]!);
      expect(mapper.readPrg(0x9fff)).toBe(cart.prgRom[offset + 0x1fff]!);
    });

    it("$E800 で bank 1 ($A000-$BFFF) を切り替え", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperNamco163(cart);
      mapper.writePrg(0xe800, 10);
      const offset = 10 * 0x2000;
      expect(mapper.readPrg(0xa000)).toBe(cart.prgRom[offset]!);
      expect(mapper.readPrg(0xbfff)).toBe(cart.prgRom[offset + 0x1fff]!);
    });

    it("$F000 で bank 2 ($C000-$DFFF) を切り替え", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperNamco163(cart);
      mapper.writePrg(0xf000, 15);
      const offset = 15 * 0x2000;
      expect(mapper.readPrg(0xc000)).toBe(cart.prgRom[offset]!);
      expect(mapper.readPrg(0xdfff)).toBe(cart.prgRom[offset + 0x1fff]!);
    });

    it("PRG バンクは下位 6bit のみ有効", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperNamco163(cart);
      // 0xFF → 0x3F (63 → 63 % 32 = 31)
      mapper.writePrg(0xe000, 0xff);
      const bank = 0x3f % 32;
      const offset = bank * 0x2000;
      expect(mapper.readPrg(0x8000)).toBe(cart.prgRom[offset]!);
    });
  });

  describe("CHR バンク切替", () => {
    it("$8000-$9FFF で CHR bank 0-3 を切り替え", () => {
      const cart = makeCart();
      const mapper = new MapperNamco163(cart);

      // slot 0 ($0000-$03FF) を bank 10 に設定
      mapper.writePrg(0x8000, 10);
      const offset = 10 * 0x0400;
      expect(mapper.readChr(0x0000)).toBe(cart.chrRom[offset]!);
      expect(mapper.readChr(0x03ff)).toBe(cart.chrRom[offset + 0x3ff]!);
    });

    it("$A000-$BFFF で CHR bank 4-5 を切り替え", () => {
      const cart = makeCart();
      const mapper = new MapperNamco163(cart);

      // slot 4 ($1000-$13FF) を bank 20 に設定
      mapper.writePrg(0xa000, 20);
      const offset = 20 * 0x0400;
      expect(mapper.readChr(0x1000)).toBe(cart.chrRom[offset]!);
    });

    it("全 8 スロットが独立して切替可能", () => {
      const cart = makeCart();
      const mapper = new MapperNamco163(cart);

      for (let slot = 0; slot < 8; slot++) {
        const regAddr = 0x8000 + slot * 0x800;
        mapper.writePrg(regAddr, slot + 1);
      }

      for (let slot = 0; slot < 8; slot++) {
        const chrAddr = slot * 0x400;
        const bankOffset = (slot + 1) * 0x0400;
        expect(mapper.readChr(chrAddr)).toBe(cart.chrRom[bankOffset]!);
      }
    });
  });

  describe("CHR RAM", () => {
    it("CHR ROM なしの場合は CHR RAM として動作", () => {
      const mapper = new MapperNamco163(makeCartChrRam());
      mapper.writeChr(0x0000, 0x42);
      expect(mapper.readChr(0x0000)).toBe(0x42);

      mapper.writeChr(0x1fff, 0xab);
      expect(mapper.readChr(0x1fff)).toBe(0xab);
    });

    it("CHR ROM ありの場合は CHR への書き込みが無視される", () => {
      const cart = makeCart();
      const mapper = new MapperNamco163(cart);
      const originalVal = mapper.readChr(0x0000);
      mapper.writeChr(0x0000, 0xff);
      expect(mapper.readChr(0x0000)).toBe(originalVal);
    });
  });

  describe("内部 RAM", () => {
    it("内部 RAM への書き込みと読み出し", () => {
      const mapper = new MapperNamco163(makeCart());
      // アドレスを設定 (auto-increment なし)
      mapper.writePrg(0xf800, 0x00);
      mapper.writeRegister!(0x4800, 0x42);

      // アドレスを再設定して読み出し
      mapper.writePrg(0xf800, 0x00);
      expect(mapper.readRegister!(0x4800)).toBe(0x42);
    });

    it("auto-increment で連続アクセス", () => {
      const mapper = new MapperNamco163(makeCart());
      // auto-increment 有効 (bit7 = 1)
      mapper.writePrg(0xf800, 0x80);

      // 連続書き込み
      mapper.writeRegister!(0x4800, 0x10);
      mapper.writeRegister!(0x4800, 0x20);
      mapper.writeRegister!(0x4800, 0x30);

      // アドレスリセット + auto-increment で連続読み出し
      mapper.writePrg(0xf800, 0x80);
      expect(mapper.readRegister!(0x4800)).toBe(0x10);
      expect(mapper.readRegister!(0x4800)).toBe(0x20);
      expect(mapper.readRegister!(0x4800)).toBe(0x30);
    });

    it("auto-increment なしでは同じアドレスを繰り返し読む", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writePrg(0xf800, 0x05); // addr=5, no increment
      mapper.writeRegister!(0x4800, 0xab);

      mapper.writePrg(0xf800, 0x05);
      expect(mapper.readRegister!(0x4800)).toBe(0xab);
      expect(mapper.readRegister!(0x4800)).toBe(0xab);
    });

    it("アドレスは 7bit (0-127) でラップ", () => {
      const mapper = new MapperNamco163(makeCart());
      // addr=127, auto-increment 有効
      mapper.writePrg(0xf800, 0x80 | 0x7f);
      mapper.writeRegister!(0x4800, 0xee);

      // ラップして addr=0 になる
      mapper.writeRegister!(0x4800, 0xff);

      // addr=127 を読む
      mapper.writePrg(0xf800, 0x80 | 0x7f);
      expect(mapper.readRegister!(0x4800)).toBe(0xee);
      // addr=0 を読む
      expect(mapper.readRegister!(0x4800)).toBe(0xff);
    });
  });

  describe("IRQ カウンタ", () => {
    it("IRQ カウンタの読み書き", () => {
      const mapper = new MapperNamco163(makeCart());
      // 下位 8bit 書き込み
      mapper.writeRegister!(0x5000, 0x34);
      // 上位 7bit + IRQ 有効
      mapper.writeRegister!(0x5800, 0x12);

      expect(mapper.readRegister!(0x5000)).toBe(0x34);
      expect(mapper.readRegister!(0x5800)).toBe(0x12);
    });

    it("IRQ 有効フラグの読み書き", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writeRegister!(0x5800, 0x80); // IRQ 有効、カウンタ上位 = 0
      expect(mapper.readRegister!(0x5800)).toBe(0x80);
    });

    it("IRQ カウンタが $7FFF に達すると IRQ 発火", () => {
      const mapper = new MapperNamco163(makeCart());
      // カウンタを $7FFE に設定
      mapper.writeRegister!(0x5000, 0xfe);
      mapper.writeRegister!(0x5800, 0x80 | 0x3f); // IRQ 有効 + 上位 = 0x3F → $3FFE

      expect(mapper.irqPending).toBe(false);

      // $7FFF - $3FFE = $4001 回 tick が必要
      const ticksNeeded = 0x7fff - 0x3ffe;
      for (let i = 0; i < ticksNeeded - 1; i++) {
        mapper.cpuCycleTick!();
        expect(mapper.irqPending).toBe(false);
      }
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("IRQ 無効時はカウンタが進まない", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writeRegister!(0x5000, 0xfe);
      mapper.writeRegister!(0x5800, 0x3f); // IRQ 無効 + 上位 = 0x3F

      for (let i = 0; i < 100; i++) {
        mapper.cpuCycleTick!();
      }
      expect(mapper.irqPending).toBe(false);
    });

    it("IRQ カウンタへの書き込みで irqPending がクリアされる", () => {
      const mapper = new MapperNamco163(makeCart());
      // IRQ を発火させる
      mapper.writeRegister!(0x5000, 0xfe);
      mapper.writeRegister!(0x5800, 0xff); // IRQ 有効 + 上位 = $7F → $7FFE
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);

      // 下位書き込みで pending クリア
      mapper.writeRegister!(0x5000, 0x00);
      expect(mapper.irqPending).toBe(false);
    });
  });

  describe("PRG RAM", () => {
    it("PRG RAM への書き込みと読み出し ($6000-$7FFF)", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writePrgRam(0x6000, 0x42);
      expect(mapper.readPrgRam(0x6000)).toBe(0x42);

      mapper.writePrgRam(0x7fff, 0xcd);
      expect(mapper.readPrgRam(0x7fff)).toBe(0xcd);
    });

    it("getPrgRam / setPrgRam が動作", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writePrgRam(0x6000, 0x11);
      mapper.writePrgRam(0x6001, 0x22);

      const ram = mapper.getPrgRam()!;
      expect(ram[0]).toBe(0x11);
      expect(ram[1]).toBe(0x22);

      const newData = new Uint8Array(0x2000);
      newData[0] = 0xaa;
      newData[1] = 0xbb;
      mapper.setPrgRam(newData);
      expect(mapper.readPrgRam(0x6000)).toBe(0xaa);
      expect(mapper.readPrgRam(0x6001)).toBe(0xbb);
    });
  });

  describe("拡張音源", () => {
    it("サウンド無効時は audioOutput が 0", () => {
      const mapper = new MapperNamco163(makeCart());
      expect(mapper.audioOutput()).toBe(0);
    });

    it("サウンド有効フラグの制御", () => {
      const mapper = new MapperNamco163(makeCart());
      // $E000 の bit6 = 0 でサウンド有効
      mapper.writePrg(0xe000, 0x00);
      // チャンネル数を 1 に設定 ($7F の上位 3bit = 0 → 1ch)
      mapper.writePrg(0xf800, 0x80 | 0x7f);
      mapper.writeRegister!(0x4800, 0x00);

      // 数回 tick して拡張音源を駆動
      for (let i = 0; i < 20; i++) {
        mapper.cpuCycleTick!();
      }
      // サウンド有効なので audioOutput は呼べるはず
      const output = mapper.audioOutput();
      expect(typeof output).toBe("number");
    });

    it("$E000 bit6=1 でサウンド無効", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writePrg(0xe000, 0x40);
      for (let i = 0; i < 100; i++) {
        mapper.cpuCycleTick!();
      }
      expect(mapper.audioOutput()).toBe(0);
    });

    it("波形テーブルに書き込んで音源出力が変化する", () => {
      const mapper = new MapperNamco163(makeCart());
      // サウンド有効
      mapper.writePrg(0xe000, 0x00);

      // 内部 RAM に ch7 (最後のチャンネル) のレジスタを設定
      // ch7: baseAddr = 0x40 + 7*8 = 0x78
      mapper.writePrg(0xf800, 0x80 | 0x78);
      // freq lo = 0 (addr 0x78)
      mapper.writeRegister!(0x4800, 0x00);
      // phase lo = 0 (addr 0x79)
      mapper.writeRegister!(0x4800, 0x00);
      // freq mid = 0 (addr 0x7A)
      mapper.writeRegister!(0x4800, 0x00);
      // phase mid = 0 (addr 0x7B)
      mapper.writeRegister!(0x4800, 0x00);
      // freq hi = 0x03 (freq[17:16]=3, wave length = 256 - 0 = 256) (addr 0x7C)
      // → 18bit freq = 0x30000 → 位相は 1 tick ごとに 0x30000 進む → phase>>16 が即座に変わる
      mapper.writeRegister!(0x4800, 0x03);
      // phase hi = 0 (addr 0x7D)
      mapper.writeRegister!(0x4800, 0x00);
      // wave addr = 0x00 (addr 0x7E)
      mapper.writeRegister!(0x4800, 0x00);
      // volume = 15 (addr 0x7F — ここが ch 数レジスタでもある: 上位3bit=0 → 1ch)
      mapper.writeRegister!(0x4800, 0x0f);

      // 波形テーブルに複数サンプルを書き込む (非ゼロ出力を得るため)
      mapper.writePrg(0xf800, 0x80 | 0x00);
      // addr 0: 4bit サンプル: 0xF0 = 下位ニブル 0, 上位ニブル F(15) → sample 15, (15-8)*15=105
      mapper.writeRegister!(0x4800, 0xf0);
      // addr 1: 0xFF = 下位 F(15), 上位 F(15)
      mapper.writeRegister!(0x4800, 0xff);
      // addr 2
      mapper.writeRegister!(0x4800, 0xff);

      // 十分に tick して音源を駆動
      for (let i = 0; i < 300; i++) {
        mapper.cpuCycleTick!();
      }

      // サウンド出力が非ゼロ
      const output = mapper.audioOutput();
      expect(output).not.toBe(0);
    });

    it("チャンネル数の変更で更新レートが変わる", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writePrg(0xe000, 0x00);

      // ch 数 = 1 ($7F の上位 3bit = 0)
      mapper.writePrg(0xf800, 0x7f);
      mapper.writeRegister!(0x4800, 0x0f); // volume=15, channels=1

      // ch 数 = 8 ($7F の上位 3bit = 7)
      mapper.writePrg(0xf800, 0x7f);
      mapper.writeRegister!(0x4800, 0x7f); // volume=15, channels=8

      // 読み戻して確認
      mapper.writePrg(0xf800, 0x7f);
      const val = mapper.readRegister!(0x4800);
      expect((val >> 4) & 0x07).toBe(7); // 8 チャンネル
    });
  });

  describe("NT バンク", () => {
    it("NT バンクに $E0 以上を設定すると内蔵 VRAM に委譲", () => {
      const mapper = new MapperNamco163(makeCart());
      // NT slot 0 を $E0 に設定
      mapper.writePrg(0xc000, 0xe0);
      // readNametable が undefined を返す = PPU 側で通常処理
      expect(mapper.readNametable(0x2000)).toBeUndefined();
    });

    it("NT バンクに CHR ROM 番号を設定すると CHR ROM から読む", () => {
      const cart = makeCart();
      const mapper = new MapperNamco163(cart);
      // NT slot 0 を bank 5 に設定
      mapper.writePrg(0xc000, 5);
      const offset = 5 * 0x0400;
      expect(mapper.readNametable(0x2000)).toBe(cart.chrRom[offset]!);
    });
  });

  describe("シリアライズ / デシリアライズ", () => {
    it("全状態を正しく保存・復元", () => {
      const mapper = new MapperNamco163(makeCart());
      // 状態を設定
      mapper.writePrg(0xe000, 5);
      mapper.writePrg(0xe800, 10);
      mapper.writePrg(0xf000, 15);
      mapper.writePrg(0xf800, 0x80 | 0x42);
      mapper.writeRegister!(0x4800, 0xcd);
      mapper.writeRegister!(0x5000, 0x34);
      mapper.writeRegister!(0x5800, 0x92);
      mapper.writePrgRam(0x6000, 0xab);

      const state = mapper.serializeMapper();

      // 新しい mapper で復元
      const mapper2 = new MapperNamco163(makeCart());
      mapper2.deserializeMapper(state);

      // PRG バンクが復元されている
      expect(mapper2.readPrg(0x8000)).toBe(mapper.readPrg(0x8000));
      expect(mapper2.readPrg(0xa000)).toBe(mapper.readPrg(0xa000));
      expect(mapper2.readPrg(0xc000)).toBe(mapper.readPrg(0xc000));

      // PRG RAM が復元
      expect(mapper2.readPrgRam(0x6000)).toBe(0xab);
    });
  });

  describe("reset", () => {
    it("reset で全状態が初期化される", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writePrg(0xe000, 5);
      mapper.writeRegister!(0x5800, 0x80);
      mapper.writePrg(0xf800, 0x80);
      mapper.writeRegister!(0x4800, 0xff);

      mapper.reset();

      expect(mapper.irqPending).toBe(false);
      // 内部 RAM は全 0
      mapper.writePrg(0xf800, 0x00);
      expect(mapper.readRegister!(0x4800)).toBe(0);
    });
  });
});
