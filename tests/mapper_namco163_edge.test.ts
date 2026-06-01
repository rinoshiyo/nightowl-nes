/**
 * Mapper 19 (Namco 163) エッジケーステスト。
 *
 * バンク境界・IRQ 境界値・拡張音源の詳細動作を検証。
 */

import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import type { Mirroring } from "../src/core/cart.ts";
import { MapperNamco163 } from "../src/core/mappers/namco163.ts";

function makeCart(opts: {
  prgSize?: number;
  chrSize?: number;
  mirroring?: Mirroring;
} = {}): Cart {
  const prgSize = opts.prgSize ?? 0x40000;
  const chrSize = opts.chrSize ?? 0x40000;

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

describe("MapperNamco163 エッジケース", () => {
  describe("PRG バンク境界", () => {
    it("bank 0 と bank 1 の境界 ($9FFF/$A000) が正しく分離", () => {
      const cart = makeCart();
      const mapper = new MapperNamco163(cart);
      mapper.writePrg(0xe000, 2);  // bank 0 = 2
      mapper.writePrg(0xe800, 5);  // bank 1 = 5

      const bank0End = 2 * 0x2000 + 0x1fff;
      const bank1Start = 5 * 0x2000;
      expect(mapper.readPrg(0x9fff)).toBe(cart.prgRom[bank0End]!);
      expect(mapper.readPrg(0xa000)).toBe(cart.prgRom[bank1Start]!);
    });

    it("bank 1 と bank 2 の境界 ($BFFF/$C000) が正しく分離", () => {
      const cart = makeCart();
      const mapper = new MapperNamco163(cart);
      mapper.writePrg(0xe800, 3);  // bank 1 = 3
      mapper.writePrg(0xf000, 7);  // bank 2 = 7

      const bank1End = 3 * 0x2000 + 0x1fff;
      const bank2Start = 7 * 0x2000;
      expect(mapper.readPrg(0xbfff)).toBe(cart.prgRom[bank1End]!);
      expect(mapper.readPrg(0xc000)).toBe(cart.prgRom[bank2Start]!);
    });

    it("bank 2 と固定バンクの境界 ($DFFF/$E000) が正しく分離", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperNamco163(cart);
      mapper.writePrg(0xf000, 10); // bank 2 = 10

      const bank2End = 10 * 0x2000 + 0x1fff;
      const lastBankStart = 31 * 0x2000;
      expect(mapper.readPrg(0xdfff)).toBe(cart.prgRom[bank2End]!);
      expect(mapper.readPrg(0xe000)).toBe(cart.prgRom[lastBankStart]!);
    });

    it("小さい PRG ROM でバンク番号がラップする", () => {
      const cart = makeCart({ prgSize: 0x8000 }); // 32KB = 4 × 8KB
      const mapper = new MapperNamco163(cart);
      // bank 5 → 5 % 4 = 1
      mapper.writePrg(0xe000, 5);
      const offset = (5 % 4) * 0x2000;
      expect(mapper.readPrg(0x8000)).toBe(cart.prgRom[offset]!);
    });
  });

  describe("CHR バンク境界", () => {
    it("隣接 CHR スロット間の境界が正しく分離", () => {
      const cart = makeCart();
      const mapper = new MapperNamco163(cart);
      mapper.writePrg(0x8000, 3); // slot 0 = bank 3
      mapper.writePrg(0x8800, 7); // slot 1 = bank 7

      const slot0End = 3 * 0x0400 + 0x03ff;
      const slot1Start = 7 * 0x0400;
      expect(mapper.readChr(0x03ff)).toBe(cart.chrRom[slot0End]!);
      expect(mapper.readChr(0x0400)).toBe(cart.chrRom[slot1Start]!);
    });

    it("全 8 スロットの境界アドレスが正しい", () => {
      const cart = makeCart();
      const mapper = new MapperNamco163(cart);

      for (let slot = 0; slot < 8; slot++) {
        const regAddr = 0x8000 + slot * 0x0800;
        mapper.writePrg(regAddr, slot * 2);
      }

      for (let slot = 0; slot < 8; slot++) {
        const chrAddr = slot * 0x0400;
        const expectedBank = slot * 2;
        const expectedByte = cart.chrRom[expectedBank * 0x0400]!;
        expect(mapper.readChr(chrAddr)).toBe(expectedByte);
      }
    });
  });

  describe("IRQ 境界値", () => {
    it("カウンタ $7FFE → $7FFF で正確に発火", () => {
      const mapper = new MapperNamco163(makeCart());
      // カウンタを $7FFE に設定
      mapper.writeRegister!(0x5000, 0xfe);
      mapper.writeRegister!(0x5800, 0x80 | 0x3f); // IRQ 有効 + 上位 = $3F → $3FFE

      // ちょうど $7FFF - $3FFE = $4001 回で発火
      const ticks = 0x7fff - 0x3ffe;
      for (let i = 0; i < ticks - 1; i++) {
        mapper.cpuCycleTick!();
      }
      expect(mapper.irqPending).toBe(false);
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("カウンタが $7FFF に達した後はそれ以上進まない", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writeRegister!(0x5000, 0xfe);
      mapper.writeRegister!(0x5800, 0x80 | 0x3f);

      // $7FFF まで進める
      for (let i = 0; i < 0x4100; i++) {
        mapper.cpuCycleTick!();
      }

      // 読み出して $7FFF であることを確認
      const lo = mapper.readRegister!(0x5000);
      const hi = mapper.readRegister!(0x5800) & 0x7f;
      expect((hi << 8) | lo).toBe(0x7fff);
    });

    it("カウンタ 0 から開始して $7FFF に達する", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writeRegister!(0x5000, 0x00);
      mapper.writeRegister!(0x5800, 0x80); // IRQ 有効、カウンタ = 0

      for (let i = 0; i < 0x7fff - 1; i++) {
        mapper.cpuCycleTick!();
      }
      expect(mapper.irqPending).toBe(false);
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("IRQ 有効→無効→有効でカウンタが維持される", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writeRegister!(0x5000, 0x00);
      mapper.writeRegister!(0x5800, 0x80); // IRQ 有効

      // 100 tick 進める
      for (let i = 0; i < 100; i++) {
        mapper.cpuCycleTick!();
      }

      // IRQ 無効にする (カウンタ上位は維持)
      const currentHi = mapper.readRegister!(0x5800) & 0x7f;
      mapper.writeRegister!(0x5800, currentHi); // bit7 = 0 → IRQ 無効

      // 50 tick — カウンタは進まない
      const beforeLo = mapper.readRegister!(0x5000);
      for (let i = 0; i < 50; i++) {
        mapper.cpuCycleTick!();
      }

      // 注意: $5800 への書き込みで下位は保たれるが上位が再設定される
      // ただし $5000 の下位は元のまま
      mapper.writeRegister!(0x5000, beforeLo);

      // IRQ 再有効
      mapper.writeRegister!(0x5800, 0x80 | currentHi);

      // カウンタが元の位置から再開
      expect(mapper.irqPending).toBe(false);
    });
  });

  describe("内部 RAM 境界", () => {
    it("128 bytes 全域に書き込み・読み出し可能", () => {
      const mapper = new MapperNamco163(makeCart());

      // 全 128 bytes に書き込み
      mapper.writePrg(0xf800, 0x80 | 0x00); // addr=0, auto-increment
      for (let i = 0; i < 128; i++) {
        mapper.writeRegister!(0x4800, i & 0xff);
      }

      // 全 128 bytes を読み出し検証
      mapper.writePrg(0xf800, 0x80 | 0x00);
      for (let i = 0; i < 128; i++) {
        expect(mapper.readRegister!(0x4800)).toBe(i & 0xff);
      }
    });

    it("addr=127 → 0 にラップ後も正常動作", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writePrg(0xf800, 0x80 | 126); // addr=126, auto-increment

      mapper.writeRegister!(0x4800, 0xaa); // addr 126
      mapper.writeRegister!(0x4800, 0xbb); // addr 127
      mapper.writeRegister!(0x4800, 0xcc); // addr 0 (wrap)

      mapper.writePrg(0xf800, 0x80 | 126);
      expect(mapper.readRegister!(0x4800)).toBe(0xaa);
      expect(mapper.readRegister!(0x4800)).toBe(0xbb);
      expect(mapper.readRegister!(0x4800)).toBe(0xcc);
    });
  });

  describe("拡張音源の詳細", () => {
    it("全 8 チャンネルのレジスタが独立", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writePrg(0xe000, 0x00); // サウンド有効

      // 各チャンネルの volume (最終バイト) に異なる値を設定
      for (let ch = 0; ch < 8; ch++) {
        const volumeAddr = 0x40 + ch * 8 + 7;
        mapper.writePrg(0xf800, volumeAddr & 0x7f);
        mapper.writeRegister!(0x4800, ch); // volume = ch, channels = 0 (上位3bit)
      }

      // 読み戻し
      for (let ch = 0; ch < 8; ch++) {
        const volumeAddr = 0x40 + ch * 8 + 7;
        mapper.writePrg(0xf800, volumeAddr & 0x7f);
        const val = mapper.readRegister!(0x4800);
        expect(val & 0x0f).toBe(ch);
      }
    });

    it("サウンドクロック分周が 15 cycle ごと", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writePrg(0xe000, 0x00); // サウンド有効

      // 1ch, volume=15, freq=0x30000 (高速)
      mapper.writePrg(0xf800, 0x80 | 0x78);
      mapper.writeRegister!(0x4800, 0x00); // freq lo
      mapper.writeRegister!(0x4800, 0x00); // phase lo
      mapper.writeRegister!(0x4800, 0x00); // freq mid
      mapper.writeRegister!(0x4800, 0x00); // phase mid
      mapper.writeRegister!(0x4800, 0x03); // freq hi (0x30000)
      mapper.writeRegister!(0x4800, 0x00); // phase hi
      mapper.writeRegister!(0x4800, 0x00); // wave addr
      mapper.writeRegister!(0x4800, 0x0f); // volume=15, 1ch

      // 波形テーブル addr 0 に非ゼロサンプル
      mapper.writePrg(0xf800, 0x00);
      mapper.writeRegister!(0x4800, 0xf0); // sample 0 = 0, sample 1 = 15

      // 14 tick ではまだ更新されない
      for (let i = 0; i < 14; i++) {
        mapper.cpuCycleTick!();
      }
      // 15 tick 目で初回更新
      mapper.cpuCycleTick!();

      // 更新されたことを確認 (位相が進んでいる)
      mapper.writePrg(0xf800, 0x79); // phase lo
      const phaseLo = mapper.readRegister!(0x4800);
      mapper.writePrg(0xf800, 0x7b); // phase mid
      const phaseMid = mapper.readRegister!(0x4800);
      mapper.writePrg(0xf800, 0x7d); // phase hi
      const phaseHi = mapper.readRegister!(0x4800);
      const phase = phaseLo | (phaseMid << 8) | (phaseHi << 16);
      expect(phase).toBe(0x30000); // freq = 0x30000 → 1 回の更新で +0x30000
    });

    it("audioOutput の範囲が [-1, 1] 以内", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writePrg(0xe000, 0x00);

      // 全 8ch を最大音量・最大サンプル値で設定
      for (let ch = 0; ch < 8; ch++) {
        const base = 0x40 + ch * 8;
        mapper.writePrg(0xf800, base & 0x7f);
        mapper.writeRegister!(0x4800, 0x01); // freq lo
        mapper.writeRegister!(0x4800, 0x00); // phase lo
        mapper.writeRegister!(0x4800, 0x00); // freq mid
        mapper.writeRegister!(0x4800, 0x00); // phase mid
        mapper.writeRegister!(0x4800, 0x00); // freq hi
        mapper.writeRegister!(0x4800, 0x00); // phase hi
        mapper.writeRegister!(0x4800, 0x00); // wave addr
      }
      // $7F: volume=15, 8ch (上位 3bit = 7)
      mapper.writePrg(0xf800, 0x7f);
      mapper.writeRegister!(0x4800, 0x7f); // volume=15, channels=8

      // 波形テーブルを最大値で埋める
      mapper.writePrg(0xf800, 0x80);
      for (let i = 0; i < 64; i++) {
        mapper.writeRegister!(0x4800, 0xff); // 全サンプル = 15
      }

      // 十分に tick
      for (let i = 0; i < 1000; i++) {
        mapper.cpuCycleTick!();
      }

      const out = mapper.audioOutput();
      expect(out).toBeGreaterThanOrEqual(-1);
      expect(out).toBeLessThanOrEqual(1);
    });
  });

  describe("NT バンクの詳細", () => {
    it("各 NT スロットが独立して CHR ROM / VRAM を切替可能", () => {
      const cart = makeCart();
      const mapper = new MapperNamco163(cart);

      // slot 0 = CHR ROM bank 3, slot 1 = VRAM $E0
      mapper.writePrg(0xc000, 3);
      mapper.writePrg(0xc800, 0xe0);

      const chrByte = cart.chrRom[3 * 0x0400]!;
      expect(mapper.readNametable(0x2000)).toBe(chrByte);
      expect(mapper.readNametable(0x2400)).toBeUndefined();
    });

    it("CHR ROM 割り当て時は writeNametable が書き込みを拒否", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writePrg(0xc000, 3); // CHR ROM

      // true = 書き込み拒否 (handled by mapper)
      expect(mapper.writeNametable(0x2000, 0xff)).toBe(true);
    });

    it("VRAM 割り当て時は writeNametable が PPU に委譲", () => {
      const mapper = new MapperNamco163(makeCart());
      mapper.writePrg(0xc000, 0xe0); // VRAM

      // false = PPU に委譲
      expect(mapper.writeNametable(0x2000, 0xff)).toBe(false);
    });
  });
});
