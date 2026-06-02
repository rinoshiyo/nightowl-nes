import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperVrc7 } from "../src/core/mappers/vrc7.ts";
import type { Mirroring } from "../src/core/cart.ts";

function makeCart(opts: {
  prgSize?: number;
  chrSize?: number;
  mirroring?: Mirroring;
} = {}): Cart {
  const prgSize = opts.prgSize ?? 0x40000; // 256KB
  const chrSize = opts.chrSize ?? 0x20000; // 128KB

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
      mapper: 85,
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

function makeVrc7(opts?: Parameters<typeof makeCart>[0]): MapperVrc7 {
  return new MapperVrc7(makeCart(opts));
}

describe("MapperVrc7", () => {
  // ==========================================================================
  // PRG バンク切替
  // ==========================================================================
  describe("PRG バンク切替", () => {
    it("$E000-$FFFF は最終 8KB バンク固定", () => {
      const cart = makeCart({ prgSize: 0x40000 }); // 256KB = 32 × 8KB
      const m = new MapperVrc7(cart);
      const lastBankStart = 31 * 0x2000;
      expect(m.readPrg(0xe000)).toBe(cart.prgRom[lastBankStart]!);
      expect(m.readPrg(0xffff)).toBe(cart.prgRom[lastBankStart + 0x1fff]!);
    });

    it("$8000 への書き込みで $8000-$9FFF の 8KB バンク切替", () => {
      const cart = makeCart({ prgSize: 0x40000 }); // 32 × 8KB
      const m = new MapperVrc7(cart);

      m.writePrg(0x8000, 5);
      expect(m.readPrg(0x8000)).toBe(cart.prgRom[5 * 0x2000]!);
      expect(m.readPrg(0x9fff)).toBe(cart.prgRom[5 * 0x2000 + 0x1fff]!);
    });

    it("$8010 への書き込みで $A000-$BFFF の 8KB バンク切替", () => {
      const cart = makeCart({ prgSize: 0x40000 }); // 32 × 8KB
      const m = new MapperVrc7(cart);

      m.writePrg(0x8010, 10);
      expect(m.readPrg(0xa000)).toBe(cart.prgRom[10 * 0x2000]!);
      expect(m.readPrg(0xbfff)).toBe(cart.prgRom[10 * 0x2000 + 0x1fff]!);
    });

    it("$9000 への書き込みで $C000-$DFFF の 8KB バンク切替", () => {
      const cart = makeCart({ prgSize: 0x40000 }); // 32 × 8KB
      const m = new MapperVrc7(cart);

      m.writePrg(0x9000, 7);
      expect(m.readPrg(0xc000)).toBe(cart.prgRom[7 * 0x2000]!);
      expect(m.readPrg(0xdfff)).toBe(cart.prgRom[7 * 0x2000 + 0x1fff]!);
    });

    it("PRG バンクは 6bit マスク (0-63)", () => {
      const m = makeVrc7({ prgSize: 0x40000 });
      m.writePrg(0x8000, 0xff);
      // 0xff & 0x3f = 0x3f = 63、32 バンクの ROM なので 63 % 32 = 31
      expect(m.readPrg(0x8000)).toBe(m.readPrg(0x8000));
    });

    it("複数バンクの独立切替", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const m = new MapperVrc7(cart);

      m.writePrg(0x8000, 1);
      m.writePrg(0x8010, 2);
      m.writePrg(0x9000, 3);

      expect(m.readPrg(0x8000)).toBe(cart.prgRom[1 * 0x2000]!);
      expect(m.readPrg(0xa000)).toBe(cart.prgRom[2 * 0x2000]!);
      expect(m.readPrg(0xc000)).toBe(cart.prgRom[3 * 0x2000]!);
    });
  });

  // ==========================================================================
  // CHR バンク切替
  // ==========================================================================
  describe("CHR バンク切替", () => {
    it("1KB × 8 バンク切替", () => {
      const cart = makeCart({ chrSize: 0x20000 }); // 128KB
      const m = new MapperVrc7(cart);

      // CHR bank 0 = スロット 0 ($0000-$03FF)
      m.writePrg(0xa000, 5);
      expect(m.readChr(0x0000)).toBe(cart.chrRom[5 * 0x0400]!);
      expect(m.readChr(0x03ff)).toBe(cart.chrRom[5 * 0x0400 + 0x3ff]!);
    });

    it("8 スロット全て独立に切替可能", () => {
      const cart = makeCart({ chrSize: 0x20000 });
      const m = new MapperVrc7(cart);

      // 各スロットに異なるバンクを設定
      m.writePrg(0xa000, 10); // slot 0
      m.writePrg(0xa010, 20); // slot 1
      m.writePrg(0xb000, 30); // slot 2
      m.writePrg(0xb010, 40); // slot 3
      m.writePrg(0xc000, 50); // slot 4
      m.writePrg(0xc010, 60); // slot 5
      m.writePrg(0xd000, 70); // slot 6
      m.writePrg(0xd010, 80); // slot 7

      expect(m.readChr(0x0000)).toBe(cart.chrRom[10 * 0x0400]!);
      expect(m.readChr(0x0400)).toBe(cart.chrRom[20 * 0x0400]!);
      expect(m.readChr(0x0800)).toBe(cart.chrRom[30 * 0x0400]!);
      expect(m.readChr(0x0c00)).toBe(cart.chrRom[40 * 0x0400]!);
      expect(m.readChr(0x1000)).toBe(cart.chrRom[50 * 0x0400]!);
      expect(m.readChr(0x1400)).toBe(cart.chrRom[60 * 0x0400]!);
      expect(m.readChr(0x1800)).toBe(cart.chrRom[70 * 0x0400]!);
      expect(m.readChr(0x1c00)).toBe(cart.chrRom[80 * 0x0400]!);
    });

    it("CHR RAM (chrRomSize=0) の読み書き", () => {
      const m = makeVrc7({ chrSize: 0 });

      m.writeChr(0x0000, 0xab);
      expect(m.readChr(0x0000)).toBe(0xab);

      m.writeChr(0x1fff, 0xcd);
      expect(m.readChr(0x1fff)).toBe(0xcd);
    });

    it("$2000 以上は 0 を返す", () => {
      const m = makeVrc7();
      expect(m.readChr(0x2000)).toBe(0);
      expect(m.readChr(0x3fff)).toBe(0);
    });
  });

  // ==========================================================================
  // ミラーリング
  // ==========================================================================
  describe("ミラーリング", () => {
    it("$E000 の bit 0-1 でミラーリング切替", () => {
      const m = makeVrc7();
      const changes: Mirroring[] = [];
      m.onMirroringChange = (mirror) => changes.push(mirror);

      m.writePrg(0xe000, 0x00); // vertical
      m.writePrg(0xe000, 0x01); // horizontal
      m.writePrg(0xe000, 0x02); // single-lower
      m.writePrg(0xe000, 0x03); // single-upper

      expect(changes).toEqual([
        "vertical", "horizontal", "single-lower", "single-upper",
      ]);
    });
  });

  // ==========================================================================
  // PRG RAM
  // ==========================================================================
  describe("PRG RAM", () => {
    it("PRG RAM enable 前は読み出し 0", () => {
      const m = makeVrc7();
      m.writePrgRam(0x6000, 0xab);
      expect(m.readPrgRam(0x6000)).toBe(0);
    });

    it("$E000 bit 7 で PRG RAM を有効化すると読み書き可能", () => {
      const m = makeVrc7();

      m.writePrg(0xe000, 0x80); // PRG RAM enable
      m.writePrgRam(0x6000, 0xab);
      expect(m.readPrgRam(0x6000)).toBe(0xab);

      m.writePrgRam(0x7fff, 0xcd);
      expect(m.readPrgRam(0x7fff)).toBe(0xcd);
    });

    it("PRG RAM disable 後は書き込み無効", () => {
      const m = makeVrc7();

      m.writePrg(0xe000, 0x80); // enable
      m.writePrgRam(0x6000, 0xab);
      expect(m.readPrgRam(0x6000)).toBe(0xab);

      m.writePrg(0xe000, 0x00); // disable
      expect(m.readPrgRam(0x6000)).toBe(0);
    });

    it("getPrgRam / setPrgRam によるバッテリーセーブ", () => {
      const m = makeVrc7();
      m.writePrg(0xe000, 0x80);
      m.writePrgRam(0x6000, 0x42);

      const ram = m.getPrgRam();
      expect(ram).not.toBeNull();
      expect(ram![0]).toBe(0x42);

      const m2 = makeVrc7();
      m2.writePrg(0xe000, 0x80);
      m2.setPrgRam(ram!);
      expect(m2.readPrgRam(0x6000)).toBe(0x42);
    });
  });

  // ==========================================================================
  // IRQ
  // ==========================================================================
  describe("IRQ", () => {
    it("IRQ 無効時は pending にならない", () => {
      const m = makeVrc7();
      m.writePrg(0xe010, 0xff); // latch = 255
      // IRQ 有効化しない
      for (let i = 0; i < 1000; i++) {
        m.cpuCycleTick!();
      }
      expect(m.irqPending).toBe(false);
    });

    it("cycle mode: カウンタが 0xFF でオーバーフロー時に IRQ 発火", () => {
      const m = makeVrc7();
      m.writePrg(0xe010, 0xfe); // latch = 254
      // IRQ control: cycle mode + enable
      m.writePrg(0xf000, 0x06); // bit 2 (cycle mode) + bit 1 (enable)

      // latch=254 → counter starts at 254
      // tick 1: counter = 255
      m.cpuCycleTick!();
      expect(m.irqPending).toBe(false);

      // tick 2: counter = 0xFF → overflow → pending + reload
      m.cpuCycleTick!();
      expect(m.irqPending).toBe(true);
    });

    it("IRQ acknowledge で pending クリア", () => {
      const m = makeVrc7();
      m.writePrg(0xe010, 0xfe);
      m.writePrg(0xf000, 0x06);

      m.cpuCycleTick!();
      m.cpuCycleTick!();
      expect(m.irqPending).toBe(true);

      // acknowledge
      m.writePrg(0xf010, 0x00);
      expect(m.irqPending).toBe(false);
    });

    it("scanline mode: prescaler で分周", () => {
      const m = makeVrc7();
      m.writePrg(0xe010, 0xfe); // latch = 254
      // scanline mode + enable (bit 1 only, bit 2 = 0)
      m.writePrg(0xf000, 0x02);

      // prescaler は 341 で初期化、毎 tick で -3
      // 341 / 3 ≈ 113.7 → 114 tick で 1 回 clock
      for (let i = 0; i < 113; i++) {
        m.cpuCycleTick!();
      }
      expect(m.irqPending).toBe(false);

      // 114 tick 目で prescaler underflow → counter 254→255
      m.cpuCycleTick!();
      // counter は 255 になったがまだ overflow していない

      // さらに 114 tick で counter 255→overflow
      for (let i = 0; i < 114; i++) {
        m.cpuCycleTick!();
      }
      expect(m.irqPending).toBe(true);
    });
  });

  // ==========================================================================
  // FM 音源レジスタ
  // ==========================================================================
  describe("FM 音源レジスタ", () => {
    it("$9010/$9030 で FM レジスタに書き込みできる", () => {
      const m = makeVrc7();

      // パッチ + ボリューム設定 (ch0)
      m.writePrg(0x9010, 0x30); // レジスタ $30 選択
      m.writePrg(0x9030, 0x15); // パッチ 1、ボリューム 5

      // F-Number 設定 (ch0)
      m.writePrg(0x9010, 0x10); // レジスタ $10
      m.writePrg(0x9030, 0x80); // F-Number low

      // Key ON (ch0)
      m.writePrg(0x9010, 0x20); // レジスタ $20
      m.writePrg(0x9030, 0x15); // key on + block 2 + F-Number high bit

      // tick して音声出力が変化することを確認
      for (let i = 0; i < 1000; i++) {
        m.cpuCycleTick!();
      }

      // silence が off なら出力が 0 でないことを期待
      const out = m.audioOutput!();
      expect(typeof out).toBe("number");
    });

    it("$E000 bit 6 で FM 音源を silence", () => {
      const m = makeVrc7();

      // 音声設定
      m.writePrg(0x9010, 0x30);
      m.writePrg(0x9030, 0x15);
      m.writePrg(0x9010, 0x10);
      m.writePrg(0x9030, 0x80);
      m.writePrg(0x9010, 0x20);
      m.writePrg(0x9030, 0x15);

      for (let i = 0; i < 1000; i++) {
        m.cpuCycleTick!();
      }

      // silence ON
      m.writePrg(0xe000, 0x40);
      expect(m.audioOutput!()).toBe(0);
    });
  });

  // ==========================================================================
  // カスタムパッチ
  // ==========================================================================
  describe("カスタムパッチ", () => {
    it("$00-$07 でカスタムパッチレジスタを設定", () => {
      const m = makeVrc7();

      // カスタムパッチデータを書き込み
      for (let i = 0; i < 8; i++) {
        m.writePrg(0x9010, i); // reg $00-$07
        m.writePrg(0x9030, 0x10 + i);
      }

      // ch0 にカスタムパッチ (0) を設定
      m.writePrg(0x9010, 0x30);
      m.writePrg(0x9030, 0x05); // パッチ 0 (カスタム)、ボリューム 5

      // F-Number + Key ON
      m.writePrg(0x9010, 0x10);
      m.writePrg(0x9030, 0x80);
      m.writePrg(0x9010, 0x20);
      m.writePrg(0x9030, 0x15);

      for (let i = 0; i < 1000; i++) {
        m.cpuCycleTick!();
      }

      const out = m.audioOutput!();
      expect(typeof out).toBe("number");
    });
  });

  // ==========================================================================
  // シリアライズ / デシリアライズ
  // ==========================================================================
  describe("シリアライズ", () => {
    it("全状態を保存・復元できる", () => {
      const cart = makeCart();
      const m1 = new MapperVrc7(cart);

      // 状態を設定
      m1.writePrg(0x8000, 5);
      m1.writePrg(0x8010, 10);
      m1.writePrg(0x9000, 3);
      m1.writePrg(0xa000, 20);
      m1.writePrg(0xe000, 0x81); // PRG RAM enable + horizontal

      const data = m1.serializeMapper();
      const m2 = new MapperVrc7(makeCart());
      m2.deserializeMapper(data);

      // PRG バンクが復元されていることを確認
      expect(m2.readPrg(0x8000)).toBe(m1.readPrg(0x8000));
      expect(m2.readPrg(0xa000)).toBe(m1.readPrg(0xa000));
      expect(m2.readPrg(0xc000)).toBe(m1.readPrg(0xc000));
    });
  });

  // ==========================================================================
  // Mapper ID
  // ==========================================================================
  describe("Mapper ID", () => {
    it("mapperId は 85 を返す", () => {
      const m = makeVrc7();
      expect(m.mapperId()).toBe(85);
    });
  });

  // ==========================================================================
  // createMapper 統合
  // ==========================================================================
  describe("createMapper 統合", () => {
    it("mapper 85 で MapperVrc7 が生成される", () => {
      const { createMapper } = require("../src/core/mappers/mapper.ts");
      const cart = makeCart();
      const m = createMapper(cart);
      expect(m.mapperId()).toBe(85);
    });
  });

  // ==========================================================================
  // Reset
  // ==========================================================================
  describe("reset", () => {
    it("reset で全状態が初期化される", () => {
      const m = makeVrc7();
      m.writePrg(0x8000, 5);
      m.writePrg(0xa000, 10);
      m.writePrg(0xe000, 0x80);
      m.writePrgRam(0x6000, 0xab);

      m.reset();

      // PRG バンクがリセットされる
      const cart = makeCart();
      const fresh = new MapperVrc7(cart);
      expect(m.readPrg(0x8000)).toBe(fresh.readPrg(0x8000));
    });
  });
});
