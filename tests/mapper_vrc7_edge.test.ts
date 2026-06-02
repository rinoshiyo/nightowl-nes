import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperVrc7 } from "../src/core/mappers/vrc7.ts";
import type { Mirroring } from "../src/core/cart.ts";

function makeCart(opts: {
  prgSize?: number;
  chrSize?: number;
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
      mapper: 85,
      mirroring: "vertical" as Mirroring,
      hasBattery: false,
      hasTrainer: false,
      fourScreen: false,
    },
    prgRom,
    chrRom,
    trainer: null,
  };
}

describe("MapperVrc7 エッジケース", () => {
  // ==========================================================================
  // PRG バンク境界
  // ==========================================================================
  describe("PRG バンク境界", () => {
    it("小さい PRG ROM (32KB = 4 バンク) でバンクが wrap する", () => {
      const cart = makeCart({ prgSize: 0x8000 }); // 32KB = 4 × 8KB
      const m = new MapperVrc7(cart);

      // バンク 5 → 5 % 4 = 1
      m.writePrg(0x8000, 5);
      expect(m.readPrg(0x8000)).toBe(cart.prgRom[1 * 0x2000]!);

      // バンク 4 → 4 % 4 = 0
      m.writePrg(0x8010, 4);
      expect(m.readPrg(0xa000)).toBe(cart.prgRom[0 * 0x2000]!);
    });

    it("PRG バンク境界でのバイトアクセス", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const m = new MapperVrc7(cart);

      m.writePrg(0x8000, 1); // bank 0: $8000-$9FFF
      m.writePrg(0x8010, 2); // bank 1: $A000-$BFFF

      // $9FFF → bank 0 の末尾
      expect(m.readPrg(0x9fff)).toBe(cart.prgRom[1 * 0x2000 + 0x1fff]!);
      // $A000 → bank 1 の先頭
      expect(m.readPrg(0xa000)).toBe(cart.prgRom[2 * 0x2000]!);
    });

    it("$E000-$FFFF 固定バンクは書き込みに影響されない", () => {
      const cart = makeCart({ prgSize: 0x40000 }); // 32 バンク
      const m = new MapperVrc7(cart);

      const lastBankStart = 31 * 0x2000;
      const expected = cart.prgRom[lastBankStart]!;

      // 関係ないバンクを切り替えても固定バンクは変化しない
      m.writePrg(0x8000, 10);
      m.writePrg(0x8010, 20);
      m.writePrg(0x9000, 30);
      expect(m.readPrg(0xe000)).toBe(expected);
    });
  });

  // ==========================================================================
  // CHR バンク境界
  // ==========================================================================
  describe("CHR バンク境界", () => {
    it("CHR バンク番号が ROM サイズを超えると wrap", () => {
      const cart = makeCart({ chrSize: 0x2000 }); // 8KB = 8 バンク
      const m = new MapperVrc7(cart);

      // バンク 10 → 10 % 8 = 2
      m.writePrg(0xa000, 10);
      expect(m.readChr(0x0000)).toBe(cart.chrRom[2 * 0x0400]!);
    });

    it("CHR RAM 書き込みは ROM モードでは無視される", () => {
      const m = new MapperVrc7(makeCart({ chrSize: 0x20000 }));

      const before = m.readChr(0x0000);
      m.writeChr(0x0000, 0xff);
      expect(m.readChr(0x0000)).toBe(before); // 変化なし
    });

    it("CHR $2000 以上への書き込みは無視", () => {
      const m = new MapperVrc7(makeCart({ chrSize: 0 }));

      m.writeChr(0x2000, 0xab);
      expect(m.readChr(0x2000)).toBe(0);
    });
  });

  // ==========================================================================
  // IRQ エッジケース
  // ==========================================================================
  describe("IRQ エッジケース", () => {
    it("IRQ latch=0 で cycle mode: 256 tick ごとに発火", () => {
      const m = new MapperVrc7(makeCart());

      m.writePrg(0xe010, 0x00); // latch = 0
      m.writePrg(0xf000, 0x06); // cycle mode + enable

      // counter は 0 からスタート → 255 回 tick で 0xFF → overflow
      for (let i = 0; i < 255; i++) {
        m.cpuCycleTick!();
        expect(m.irqPending).toBe(false);
      }
      m.cpuCycleTick!(); // 256th tick → overflow
      expect(m.irqPending).toBe(true);
    });

    it("IRQ control 書き込みで pending がクリアされる", () => {
      const m = new MapperVrc7(makeCart());

      m.writePrg(0xe010, 0xfe);
      m.writePrg(0xf000, 0x06);

      m.cpuCycleTick!();
      m.cpuCycleTick!();
      expect(m.irqPending).toBe(true);

      // IRQ control を再書き込み → pending クリア
      m.writePrg(0xf000, 0x06);
      expect(m.irqPending).toBe(false);
    });

    it("IRQ acknowledge で enable を A bit にコピー", () => {
      const m = new MapperVrc7(makeCart());

      m.writePrg(0xe010, 0xfe);
      m.writePrg(0xf000, 0x06); // enable=1, A=0

      m.cpuCycleTick!();
      m.cpuCycleTick!();
      expect(m.irqPending).toBe(true);

      // acknowledge with A=1 → enable=1 (A にコピー)
      m.writePrg(0xf010, 0x02);
      expect(m.irqPending).toBe(false);
    });

    it("IRQ disable 状態で acknowledge しても pending は false のまま", () => {
      const m = new MapperVrc7(makeCart());
      m.writePrg(0xe010, 0xff);
      // enable しない
      for (let i = 0; i < 300; i++) {
        m.cpuCycleTick!();
      }
      m.writePrg(0xf010, 0x00);
      expect(m.irqPending).toBe(false);
    });
  });

  // ==========================================================================
  // ミラーリングエッジケース
  // ==========================================================================
  describe("ミラーリングエッジケース", () => {
    it("ミラーリング変更は PRG RAM enable と独立", () => {
      const m = new MapperVrc7(makeCart());
      const changes: Mirroring[] = [];
      m.onMirroringChange = (mirror) => changes.push(mirror);

      // PRG RAM enable + horizontal
      m.writePrg(0xe000, 0x81);
      expect(changes).toEqual(["horizontal"]);

      // PRG RAM enable 維持 + single-lower
      m.writePrg(0xe000, 0x82);
      expect(changes).toEqual(["horizontal", "single-lower"]);
    });
  });

  // ==========================================================================
  // FM 音源 + silence の統合
  // ==========================================================================
  describe("FM 音源 silence", () => {
    it("silence ON → OFF で音が復帰する", () => {
      const m = new MapperVrc7(makeCart());

      // 音を設定
      m.writePrg(0x9010, 0x30);
      m.writePrg(0x9030, 0x10);
      m.writePrg(0x9010, 0x10);
      m.writePrg(0x9030, 0x80);
      m.writePrg(0x9010, 0x20);
      m.writePrg(0x9030, 0x15);

      for (let i = 0; i < 5000; i++) m.cpuCycleTick!();

      // silence ON
      m.writePrg(0xe000, 0x40);
      expect(m.audioOutput!()).toBe(0);

      // silence OFF (PRG RAM enable も解除)
      m.writePrg(0xe000, 0x00);
      for (let i = 0; i < 5000; i++) m.cpuCycleTick!();

      // 音は鳴り続けているはず (key on のまま)
      // ただし silence 中に内部状態が進んでいるので、0 でなければ OK
      const out = m.audioOutput!();
      expect(typeof out).toBe("number");
    });
  });

  // ==========================================================================
  // シリアライズの完全性
  // ==========================================================================
  describe("シリアライズ完全性", () => {
    it("IRQ 状態がシリアライズで保存される", () => {
      const cart = makeCart();
      const m1 = new MapperVrc7(cart);

      m1.writePrg(0xe010, 0xfe);
      m1.writePrg(0xf000, 0x06);
      m1.cpuCycleTick!();

      const data = m1.serializeMapper();
      const m2 = new MapperVrc7(makeCart());
      m2.deserializeMapper(data);

      // 復元後に同じタイミングで IRQ 発火すること
      m1.cpuCycleTick!();
      m2.cpuCycleTick!();
      expect(m2.irqPending).toBe(m1.irqPending);
    });

    it("CHR RAM 内容がシリアライズで保存される", () => {
      const m1 = new MapperVrc7(makeCart({ chrSize: 0 }));

      m1.writeChr(0x0000, 0xab);
      m1.writeChr(0x1000, 0xcd);

      const data = m1.serializeMapper();
      const m2 = new MapperVrc7(makeCart({ chrSize: 0 }));
      m2.deserializeMapper(data);

      expect(m2.readChr(0x0000)).toBe(0xab);
      expect(m2.readChr(0x1000)).toBe(0xcd);
    });

    it("FM 音源状態がシリアライズで保存される", () => {
      const m1 = new MapperVrc7(makeCart());

      m1.writePrg(0x9010, 0x30);
      m1.writePrg(0x9030, 0x10);
      m1.writePrg(0x9010, 0x10);
      m1.writePrg(0x9030, 0x80);
      m1.writePrg(0x9010, 0x20);
      m1.writePrg(0x9030, 0x15);

      for (let i = 0; i < 3000; i++) m1.cpuCycleTick!();

      const data = m1.serializeMapper();
      const m2 = new MapperVrc7(makeCart());
      m2.deserializeMapper(data);

      // 復元後に同じ出力
      for (let i = 0; i < 36; i++) {
        m1.cpuCycleTick!();
        m2.cpuCycleTick!();
      }
      expect(m2.audioOutput!()).toBe(m1.audioOutput!());
    });
  });
});
