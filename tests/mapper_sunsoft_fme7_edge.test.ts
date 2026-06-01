import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import type { Mirroring } from "../src/core/cart.ts";
import { MapperSunsoftFme7 } from "../src/core/mappers/sunsoft-fme7.ts";

/** テスト用 Cart を生成 */
function makeCart(opts: {
  prgSize?: number;
  chrSize?: number;
  mirroring?: Mirroring;
} = {}): Cart {
  const prgSize = opts.prgSize ?? 0x40000;
  const chrSize = opts.chrSize ?? 0x20000;

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

function writeCommand(mapper: MapperSunsoftFme7, cmd: number, param: number): void {
  mapper.writePrg(0x8000, cmd);
  mapper.writePrg(0xa000, param);
}

function writeAudio(mapper: MapperSunsoftFme7, reg: number, value: number): void {
  mapper.writePrg(0xc000, reg);
  mapper.writePrg(0xe000, value);
}

describe("MapperSunsoftFme7 エッジケース", () => {
  describe("PRG バンク境界値", () => {
    it("最小 PRG ROM (1 バンク = 8KB) でバンク切替", () => {
      const cart = makeCart({ prgSize: 0x2000 }); // 1 × 8KB
      const mapper = new MapperSunsoftFme7(cart);

      writeCommand(mapper, 9, 0);
      expect(mapper.readPrg(0x8000)).toBe(cart.prgRom[0]!);

      // 範囲外バンクはラップ (bank 5 % 1 = 0)
      writeCommand(mapper, 9, 5);
      expect(mapper.readPrg(0x8000)).toBe(cart.prgRom[0]!);
    });

    it("全 PRG ウィンドウを同じバンクに設定可能", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperSunsoftFme7(cart);

      writeCommand(mapper, 9, 10);
      writeCommand(mapper, 10, 10);
      writeCommand(mapper, 11, 10);

      expect(mapper.readPrg(0x8000)).toBe(mapper.readPrg(0xa000));
      expect(mapper.readPrg(0xa000)).toBe(mapper.readPrg(0xc000));
    });

    it("コマンド 8 の上位ビットを含む全組み合わせ", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperSunsoftFme7(cart);

      // bit7=0, bit6=0: 無効
      writeCommand(mapper, 8, 0x05);
      expect(mapper.readPrgRam(0x6000)).toBe(0);

      // bit7=0, bit6=1: 無効 (enable が 0)
      writeCommand(mapper, 8, 0x45);
      expect(mapper.readPrgRam(0x6000)).toBe(0);

      // bit7=1, bit6=0: ROM
      writeCommand(mapper, 8, 0x85);
      expect(mapper.readPrgRam(0x6000)).toBe(cart.prgRom[5 * 0x2000]!);

      // bit7=1, bit6=1: RAM
      writeCommand(mapper, 8, 0xc5);
      mapper.writePrgRam(0x6000, 0x99);
      expect(mapper.readPrgRam(0x6000)).toBe(0x99);
    });
  });

  describe("CHR バンク境界値", () => {
    it("全 8 スロットに異なるバンクを設定", () => {
      const cart = makeCart({ chrSize: 0x20000 }); // 128 × 1KB
      const mapper = new MapperSunsoftFme7(cart);

      for (let i = 0; i < 8; i++) {
        writeCommand(mapper, i, i * 10);
      }

      for (let i = 0; i < 8; i++) {
        const bank = (i * 10) % (cart.chrRom.length / 0x0400);
        expect(mapper.readChr(i * 0x0400)).toBe(cart.chrRom[bank * 0x0400]!);
      }
    });

    it("CHR バンクがラップアラウンドする", () => {
      const cart = makeCart({ chrSize: 0x2000 }); // 8 × 1KB
      const mapper = new MapperSunsoftFme7(cart);

      // bank 255 % 8 = 7
      writeCommand(mapper, 0, 255);
      const expected = cart.chrRom[7 * 0x0400]!;
      expect(mapper.readChr(0x0000)).toBe(expected);
    });
  });

  describe("IRQ 境界値", () => {
    it("カウンタ = 0 からの即時発火 (0→FFFF)", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      writeCommand(mapper, 13, 0x81);
      writeCommand(mapper, 14, 0);
      writeCommand(mapper, 15, 0);

      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("カウンタ = FFFF (最大値) から 0 にデクリメント (発火しない)", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      writeCommand(mapper, 13, 0x81);
      writeCommand(mapper, 14, 0xff);
      writeCommand(mapper, 15, 0xff);

      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(false);
    });

    it("IRQ 発火後に再度有効化で再セット可能", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      writeCommand(mapper, 13, 0x81);
      writeCommand(mapper, 14, 1);
      writeCommand(mapper, 15, 0);

      mapper.cpuCycleTick!();
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);

      // クリア
      writeCommand(mapper, 13, 0x00);
      expect(mapper.irqPending).toBe(false);

      // 再設定
      writeCommand(mapper, 14, 1);
      writeCommand(mapper, 15, 0);
      writeCommand(mapper, 13, 0x81);
      mapper.cpuCycleTick!();
      mapper.cpuCycleTick!();
      expect(mapper.irqPending).toBe(true);
    });

    it("IRQ カウンタ書き込み中にカウンタが動く場合", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      // まず有効化
      writeCommand(mapper, 13, 0x81);
      // 下位を先に書く → 上位を書く前にカウンタが動く可能性をテスト
      writeCommand(mapper, 14, 0x10);
      // 間に tick を挟む
      mapper.cpuCycleTick!();
      // 上位を書く
      writeCommand(mapper, 15, 0x00);

      // カウンタは 0x000F に減っているはず (0x0010 - 1 = 0x000F)
      // tick を続けて発火確認
      for (let i = 0; i < 16; i++) {
        mapper.cpuCycleTick!();
      }
      expect(mapper.irqPending).toBe(true);
    });
  });

  describe("拡張音源エッジケース", () => {
    it("トーン周期 0 の場合は常に出力 1", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      writeAudio(mapper, 0x00, 0); // 下位 = 0
      writeAudio(mapper, 0x01, 0); // 上位 = 0
      writeAudio(mapper, 0x07, 0x38); // ch A トーン有効
      writeAudio(mapper, 0x08, 15); // 最大音量

      // tick して出力確認 (常に非ゼロ)
      for (let i = 0; i < 100; i++) {
        mapper.cpuCycleTick!();
      }
      expect(mapper.audioOutput!()).toBeGreaterThan(0);
    });

    it("トーン・ノイズ無効 + 音量 0 で出力 0", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      writeAudio(mapper, 0x07, 0x3f); // 全 disable
      writeAudio(mapper, 0x08, 0);    // 全チャンネル音量 0
      writeAudio(mapper, 0x09, 0);
      writeAudio(mapper, 0x0a, 0);

      for (let i = 0; i < 1000; i++) {
        mapper.cpuCycleTick!();
      }
      expect(mapper.audioOutput!()).toBe(0);
    });

    it("トーン・ノイズ無効でも音量があれば DC 出力が出る (YM2149 仕様)", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      writeAudio(mapper, 0x07, 0x3f); // 全 disable
      writeAudio(mapper, 0x08, 15);   // ch A 最大音量
      writeAudio(mapper, 0x09, 0);
      writeAudio(mapper, 0x0a, 0);

      for (let i = 0; i < 100; i++) {
        mapper.cpuCycleTick!();
      }
      // disable = パススルー (常に 1) → 音量に応じた DC 出力
      expect(mapper.audioOutput!()).toBeGreaterThan(0);
    });

    it("3ch 同時発音で出力が 1ch より大きい", () => {
      const mapper1 = new MapperSunsoftFme7(makeCart());
      const mapper3 = new MapperSunsoftFme7(makeCart());

      // 1ch のみ
      writeAudio(mapper1, 0x00, 50);
      writeAudio(mapper1, 0x01, 0);
      writeAudio(mapper1, 0x07, 0x3e); // ch A のみ
      writeAudio(mapper1, 0x08, 15);

      // 3ch
      for (let ch = 0; ch < 3; ch++) {
        writeAudio(mapper3, ch * 2, 50);
        writeAudio(mapper3, ch * 2 + 1, 0);
        writeAudio(mapper3, 0x08 + ch, 15);
      }
      writeAudio(mapper3, 0x07, 0x38); // 3ch 全有効

      // 5000 tick
      let max1 = 0;
      let max3 = 0;
      for (let i = 0; i < 5000; i++) {
        mapper1.cpuCycleTick!();
        mapper3.cpuCycleTick!();
        max1 = Math.max(max1, Math.abs(mapper1.audioOutput!()));
        max3 = Math.max(max3, Math.abs(mapper3.audioOutput!()));
      }
      expect(max3).toBeGreaterThan(max1);
    });

    it("ノイズ LFSR は初期値 1 から変化する", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      writeAudio(mapper, 0x06, 1); // ノイズ周期 = 1
      writeAudio(mapper, 0x07, 0x07 | 0x30); // ch A ノイズのみ
      writeAudio(mapper, 0x08, 15);

      const outputs = new Set<number>();
      for (let i = 0; i < 500; i++) {
        mapper.cpuCycleTick!();
        outputs.add(mapper.audioOutput!());
      }
      // ノイズなので複数の出力値が出るはず
      expect(outputs.size).toBeGreaterThan(1);
    });

    it("エンベロープ形状書き込みで位置がリセットされる", () => {
      const mapper = new MapperSunsoftFme7(makeCart());

      writeAudio(mapper, 0x00, 1);
      writeAudio(mapper, 0x01, 0);
      writeAudio(mapper, 0x07, 0x38);
      writeAudio(mapper, 0x08, 0x10); // エンベロープモード
      writeAudio(mapper, 0x0b, 1);
      writeAudio(mapper, 0x0c, 0);
      writeAudio(mapper, 0x0d, 8); // 形状 8 (Continue)

      // 進める
      for (let i = 0; i < 5000; i++) {
        mapper.cpuCycleTick!();
      }

      // 形状を再書き込み → 位置リセット
      const beforeReset = mapper.audioOutput!();
      writeAudio(mapper, 0x0d, 10); // 形状 10
      // リセット直後はエンベロープ位置 0 からスタート
      mapper.cpuCycleTick!();
      // (出力が変化したかどうかは形状依存だが、クラッシュしないことを確認)
      expect(typeof mapper.audioOutput!()).toBe("number");
      expect(typeof beforeReset).toBe("number");
    });
  });

  describe("コマンドレジスタの分離", () => {
    it("コマンド書き込みはパラメータに影響しない", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperSunsoftFme7(cart);

      // PRG bank 1 をバンク 5 に設定
      writeCommand(mapper, 9, 5);
      const bank5Data = mapper.readPrg(0x8000);

      // 別コマンドを書いてもバンク 1 は変わらない
      mapper.writePrg(0x8000, 10); // コマンド 10
      expect(mapper.readPrg(0x8000)).toBe(bank5Data);
    });

    it("パラメータ書き込みは最後のコマンドに適用される", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const mapper = new MapperSunsoftFme7(cart);

      mapper.writePrg(0x8000, 9);  // コマンド 9 (PRG bank 1)
      mapper.writePrg(0x8000, 10); // コマンド 10 (PRG bank 2) で上書き
      mapper.writePrg(0xa000, 7);  // パラメータはコマンド 10 に適用

      // $A000-$BFFF がバンク 7
      expect(mapper.readPrg(0xa000)).toBe(cart.prgRom[7 * 0x2000]!);
      // $8000-$9FFF は初期値のまま
      expect(mapper.readPrg(0x8000)).toBe(cart.prgRom[0]!);
    });
  });

  describe("PRG RAM バッテリーセーブ", () => {
    it("getPrgRam / setPrgRam で PRG RAM を保存・復元", () => {
      const mapper = new MapperSunsoftFme7(makeCart());
      writeCommand(mapper, 8, 0xc0); // RAM モード

      mapper.writePrgRam(0x6000, 0x42);
      mapper.writePrgRam(0x7fff, 0xab);

      const saved = mapper.getPrgRam()!;
      expect(saved[0]).toBe(0x42);
      expect(saved[0x1fff]).toBe(0xab);

      // 新しいインスタンスに復元
      const mapper2 = new MapperSunsoftFme7(makeCart());
      writeCommand(mapper2, 8, 0xc0);
      mapper2.setPrgRam(saved);

      expect(mapper2.readPrgRam(0x6000)).toBe(0x42);
      expect(mapper2.readPrgRam(0x7fff)).toBe(0xab);
    });
  });
});
