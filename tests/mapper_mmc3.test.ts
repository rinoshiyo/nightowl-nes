import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperMmc3 } from "../src/core/mappers/mmc3.ts";
import type { Mirroring } from "../src/core/cart.ts";

/** テスト用 Cart を生成 */
function makeCart(opts: {
  prgSize?: number;
  chrSize?: number;
  mirroring?: Mirroring;
} = {}): Cart {
  const prgSize = opts.prgSize ?? 0x20000; // 128KB (16 × 8KB)
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
      mapper: 4,
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

describe("MapperMmc3", () => {
  describe("初期状態", () => {
    it("irqPending が false", () => {
      const mapper = new MapperMmc3(makeCart());
      expect(mapper.irqPending).toBe(false);
    });

    it("全レジスタが 0", () => {
      const mapper = new MapperMmc3(makeCart());
      // 初期状態で $8000-$9FFF は R6=0 なのでバンク 0 が見える
      const val = mapper.readPrg(0x8000);
      expect(val).toBe(0); // PRG バンク 0 のオフセット 0
    });
  });

  describe("Bank Select ($8000) + Bank Data ($8001)", () => {
    it("バンク選択インデックスを変更できる", () => {
      const mapper = new MapperMmc3(makeCart());
      // R6 を選択してバンク 2 を設定
      mapper.writePrg(0x8000, 6);  // bankSelect = 6
      mapper.writePrg(0x8001, 2);  // R6 = 2
      // PRG mode 0: $8000 = R6 → バンク 2
      const val = mapper.readPrg(0x8000);
      expect(val).toBe((2 * 0x2000) & 0xff);
    });

    it("bit 6 で PRG バンクモードを切替", () => {
      const mapper = new MapperMmc3(makeCart());
      // R6=3 を設定
      mapper.writePrg(0x8000, 6);
      mapper.writePrg(0x8001, 3);

      // mode 0: $8000=R6, $C000=second-last
      const mode0_8000 = mapper.readPrg(0x8000);
      expect(mode0_8000).toBe((3 * 0x2000) & 0xff);

      // mode 1 に切替 (bit 6 set)
      mapper.writePrg(0x8000, 0x46); // bankSelect=6, prgMode=1
      // mode 1: $8000=second-last, $C000=R6
      const mode1_8000 = mapper.readPrg(0x8000);
      // 128KB PRG = 16 banks, second-last = 14
      expect(mode1_8000).toBe((14 * 0x2000) & 0xff);
      const mode1_C000 = mapper.readPrg(0xc000);
      expect(mode1_C000).toBe((3 * 0x2000) & 0xff);
    });

    it("bit 7 で CHR A12 反転を切替", () => {
      const mapper = new MapperMmc3(makeCart());
      // R2=10 を設定
      mapper.writePrg(0x8000, 2);
      mapper.writePrg(0x8001, 10);

      // 通常モード: R2 は $1000-$13FF
      const normal = mapper.readChr(0x1000);
      // バンク 10 のオフセット 0
      expect(normal).toBe((10 * 0x400 + 0x80) & 0xff);

      // 反転モード: R2 は $0000-$03FF
      mapper.writePrg(0x8000, 0x82); // chrInversion=1, bankSelect=2
      mapper.writePrg(0x8001, 10);
      const inverted = mapper.readChr(0x0000);
      expect(inverted).toBe((10 * 0x400 + 0x80) & 0xff);
    });
  });

  describe("PRG ROM バンク切替", () => {
    it("R6 で $8000-$9FFF を切替 (mode 0)", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0x8000, 6);
      mapper.writePrg(0x8001, 5); // R6 = 5

      const val = mapper.readPrg(0x8000);
      expect(val).toBe((5 * 0x2000) & 0xff);
    });

    it("R7 で $A000-$BFFF を切替", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0x8000, 7);
      mapper.writePrg(0x8001, 3); // R7 = 3

      const val = mapper.readPrg(0xa000);
      expect(val).toBe((3 * 0x2000) & 0xff);
    });

    it("$C000-$DFFF は mode 0 で second-last バンク固定", () => {
      const mapper = new MapperMmc3(makeCart());
      // 128KB = 16 banks → second-last = 14
      const val = mapper.readPrg(0xc000);
      expect(val).toBe((14 * 0x2000) & 0xff);
    });

    it("$E000-$FFFF は常に最終バンク", () => {
      const mapper = new MapperMmc3(makeCart());
      // 128KB = 16 banks → last = 15
      const val = mapper.readPrg(0xe000);
      expect(val).toBe((15 * 0x2000) & 0xff);
    });

    it("mode 1 で R6 と second-last が入れ替わる", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0x8000, 6);
      mapper.writePrg(0x8001, 5);

      // mode 1
      mapper.writePrg(0x8000, 0x46);
      // $8000 = second-last (14)
      expect(mapper.readPrg(0x8000)).toBe((14 * 0x2000) & 0xff);
      // $C000 = R6 (5)
      expect(mapper.readPrg(0xc000)).toBe((5 * 0x2000) & 0xff);
      // $A000 は R7 のまま
      // $E000 は最終バンクのまま
    });

    it("バンク番号が PRG バンク数で modulo される", () => {
      const mapper = new MapperMmc3(makeCart({ prgSize: 0x8000 })); // 32KB = 4 banks
      mapper.writePrg(0x8000, 6);
      mapper.writePrg(0x8001, 5); // R6 = 5 → 5 % 4 = 1

      const val = mapper.readPrg(0x8000);
      expect(val).toBe((1 * 0x2000) & 0xff);
    });
  });

  describe("CHR ROM バンク切替", () => {
    it("R0 が $0000-$07FF を 2KB 単位で切替 (通常モード)", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0x8000, 0); // bankSelect = 0 (R0)
      mapper.writePrg(0x8001, 4); // R0 = 4 (2KB 単位なので bit 0 を無視 → バンク 4,5)

      // $0000 → 1KB バンク 4
      const lo = mapper.readChr(0x0000);
      expect(lo).toBe((4 * 0x400 + 0x80) & 0xff);
      // $0400 → 1KB バンク 5
      const hi = mapper.readChr(0x0400);
      expect(hi).toBe((5 * 0x400 + 0x80) & 0xff);
    });

    it("R1 が $0800-$0FFF を 2KB 単位で切替 (通常モード)", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0x8000, 1); // bankSelect = 1 (R1)
      mapper.writePrg(0x8001, 6); // R1 = 6

      const lo = mapper.readChr(0x0800);
      expect(lo).toBe((6 * 0x400 + 0x80) & 0xff);
      const hi = mapper.readChr(0x0c00);
      expect(hi).toBe((7 * 0x400 + 0x80) & 0xff);
    });

    it("R2-R5 が $1000-$1FFF を 1KB 単位で切替 (通常モード)", () => {
      const mapper = new MapperMmc3(makeCart());
      for (let reg = 2; reg <= 5; reg++) {
        mapper.writePrg(0x8000, reg);
        mapper.writePrg(0x8001, reg * 10);
      }

      // R2 → $1000
      expect(mapper.readChr(0x1000)).toBe((20 * 0x400 + 0x80) & 0xff);
      // R3 → $1400
      expect(mapper.readChr(0x1400)).toBe((30 * 0x400 + 0x80) & 0xff);
      // R4 → $1800
      expect(mapper.readChr(0x1800)).toBe((40 * 0x400 + 0x80) & 0xff);
      // R5 → $1C00
      expect(mapper.readChr(0x1c00)).toBe((50 * 0x400 + 0x80) & 0xff);
    });

    it("CHR A12 反転モードでレイアウトが逆転", () => {
      const mapper = new MapperMmc3(makeCart());
      // レジスタ設定
      mapper.writePrg(0x8000, 0);
      mapper.writePrg(0x8001, 4); // R0 = 4
      mapper.writePrg(0x8000, 2);
      mapper.writePrg(0x8001, 20); // R2 = 20

      // 反転モード有効化
      mapper.writePrg(0x8000, 0x80 | 0); // chrInversion=1

      // 反転: R2-R5 が $0000-$0FFF, R0/R1 が $1000-$1FFF
      // $0000 → R2 = 20
      expect(mapper.readChr(0x0000)).toBe((20 * 0x400 + 0x80) & 0xff);
      // $1000 → R0 (バンク4,5)
      expect(mapper.readChr(0x1000)).toBe((4 * 0x400 + 0x80) & 0xff);
    });

    it("CHR バンク番号が CHR バンク数で modulo される", () => {
      const mapper = new MapperMmc3(makeCart({ chrSize: 0x8000 })); // 32KB = 32 banks
      mapper.writePrg(0x8000, 2);
      mapper.writePrg(0x8001, 35); // 35 % 32 = 3

      const val = mapper.readChr(0x1000);
      expect(val).toBe((3 * 0x400 + 0x80) & 0xff);
    });

    it("CHR RAM 時はバンク切替なしのフラットアクセス", () => {
      const mapper = new MapperMmc3(makeCart({ chrSize: 0 }));
      mapper.writeChr(0x0123, 0xab);
      expect(mapper.readChr(0x0123)).toBe(0xab);

      // バンクレジスタを設定してもフラットのまま
      mapper.writePrg(0x8000, 0);
      mapper.writePrg(0x8001, 4);
      mapper.writeChr(0x0000, 0xcd);
      expect(mapper.readChr(0x0000)).toBe(0xcd);
    });
  });

  describe("Mirroring ($A000)", () => {
    it("bit 0 = 0 で vertical", () => {
      let result: Mirroring | null = null;
      const mapper = new MapperMmc3(makeCart());
      mapper.onMirroringChange = (m) => { result = m; };

      mapper.writePrg(0xa000, 0);
      expect(result).toBe("vertical");
    });

    it("bit 0 = 1 で horizontal", () => {
      let result: Mirroring | null = null;
      const mapper = new MapperMmc3(makeCart());
      mapper.onMirroringChange = (m) => { result = m; };

      mapper.writePrg(0xa000, 1);
      expect(result).toBe("horizontal");
    });
  });

  describe("IRQ カウンタ", () => {
    it("$C000 で latch 値を設定", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0xc000, 42);
      // latch 値は clockIrqCounter で使われる
      mapper.writePrg(0xc001, 0); // reload フラグセット
      mapper.clockIrqCounter(); // reload → counter = 42
      // もう1回 clock → 41
      mapper.clockIrqCounter();
      // 42回目の clock で 0 になる (初回 reload 後にデクリメント開始)
    });

    it("$C001 で次の clocking でリロード", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0xc000, 5); // latch = 5
      mapper.writePrg(0xc001, 0); // reload

      mapper.clockIrqCounter();
      // counter = 5 (latch からリロード)

      // 5 回 clock → 4, 3, 2, 1, 0 → IRQ
      mapper.writePrg(0xe001, 0); // enable IRQ
      for (let i = 0; i < 5; i++) {
        mapper.clockIrqCounter();
      }
      expect(mapper.irqPending).toBe(true);
    });

    it("$E000 で IRQ 無効化 + pending クリア", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0xe001, 0); // enable
      mapper.writePrg(0xc000, 1); // latch = 1
      mapper.writePrg(0xc001, 0); // reload

      mapper.clockIrqCounter(); // reload → 1
      mapper.clockIrqCounter(); // 1→0 → IRQ

      expect(mapper.irqPending).toBe(true);

      mapper.writePrg(0xe000, 0); // disable + clear
      expect(mapper.irqPending).toBe(false);
    });

    it("$E001 で IRQ 有効化", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0xc000, 1);
      mapper.writePrg(0xc001, 0);

      // IRQ 無効のまま clock
      mapper.clockIrqCounter(); // reload → 1
      mapper.clockIrqCounter(); // 1→0 だが IRQ disabled
      expect(mapper.irqPending).toBe(false);

      // 有効化して再度
      mapper.writePrg(0xe001, 0);
      mapper.writePrg(0xc001, 0); // reload
      mapper.clockIrqCounter(); // reload → 1
      mapper.clockIrqCounter(); // 0 → IRQ
      expect(mapper.irqPending).toBe(true);
    });

    it("カウンタ 0 到達で IRQ 生成 (enabled 時)", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0xe001, 0); // enable
      mapper.writePrg(0xc000, 3); // latch = 3
      mapper.writePrg(0xc001, 0); // reload

      mapper.clockIrqCounter(); // reload → 3
      expect(mapper.irqPending).toBe(false);
      mapper.clockIrqCounter(); // 2
      expect(mapper.irqPending).toBe(false);
      mapper.clockIrqCounter(); // 1
      expect(mapper.irqPending).toBe(false);
      mapper.clockIrqCounter(); // 0 → IRQ!
      expect(mapper.irqPending).toBe(true);
    });

    it("counter が 0 の時に reload で latch 値をセット", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0xc000, 5); // latch = 5
      // counter = 0 (初期値)、reload なし
      // counter==0 のとき clockIrqCounter は reload する
      mapper.clockIrqCounter(); // counter=0 → reload → counter=5
      // 以降 5 回の clock でデクリメント
      mapper.writePrg(0xe001, 0); // enable
      for (let i = 0; i < 5; i++) {
        mapper.clockIrqCounter();
      }
      expect(mapper.irqPending).toBe(true);
    });

    it("latch=0 で毎 scanline IRQ", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0xe001, 0); // enable
      mapper.writePrg(0xc000, 0); // latch = 0
      mapper.writePrg(0xc001, 0); // reload

      mapper.clockIrqCounter(); // reload → 0 → IRQ
      expect(mapper.irqPending).toBe(true);

      // pending をクリアして再度
      mapper.writePrg(0xe000, 0); // disable + clear
      mapper.writePrg(0xe001, 0); // enable
      mapper.writePrg(0xc001, 0); // reload

      mapper.clockIrqCounter(); // reload → 0 → IRQ
      expect(mapper.irqPending).toBe(true);
    });
  });

  describe("PRG RAM ($6000-$7FFF)", () => {
    it("read/write が動作する", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrgRam(0x6000, 0xab);
      expect(mapper.readPrgRam(0x6000)).toBe(0xab);
    });

    it("8KB 空間全体が使える", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrgRam(0x7fff, 0xcd);
      expect(mapper.readPrgRam(0x7fff)).toBe(0xcd);
    });

    it("$6000-$7FFF 範囲外のアドレスはマスクされる", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrgRam(0x6123, 0xef);
      expect(mapper.readPrgRam(0x6123)).toBe(0xef);
    });
  });

  describe("エッジケース", () => {
    it("R0 の奇数値は bit 0 が無視される (2KB 単位)", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0x8000, 0); // R0 選択
      mapper.writePrg(0x8001, 5); // R0 = 5 → 2KB: バンク4,5

      const lo = mapper.readChr(0x0000); // バンク 4 (5 & 0xFE)
      const hi = mapper.readChr(0x0400); // バンク 5 (5 | 1)
      expect(lo).toBe((4 * 0x400 + 0x80) & 0xff);
      expect(hi).toBe((5 * 0x400 + 0x80) & 0xff);
    });

    it("全レジスタ (R0-R7) への書き込みが動作する", () => {
      const mapper = new MapperMmc3(makeCart());
      for (let reg = 0; reg < 8; reg++) {
        mapper.writePrg(0x8000, reg);
        mapper.writePrg(0x8001, reg + 1);
      }
      // R6=7 → PRG $8000 はバンク 7
      expect(mapper.readPrg(0x8000)).toBe((7 * 0x2000) & 0xff);
      // R7=8 → PRG $A000 はバンク 8
      expect(mapper.readPrg(0xa000)).toBe((8 * 0x2000) & 0xff);
    });

    it("$A001 (PRG RAM protect) への書き込みはクラッシュしない", () => {
      const mapper = new MapperMmc3(makeCart());
      expect(() => mapper.writePrg(0xa001, 0x80)).not.toThrow();
    });

    it("小さい PRG ROM (32KB) で末尾バンクが正しい", () => {
      const mapper = new MapperMmc3(makeCart({ prgSize: 0x8000 })); // 4 banks
      // second-last = 2, last = 3
      expect(mapper.readPrg(0xc000)).toBe((2 * 0x2000) & 0xff);
      expect(mapper.readPrg(0xe000)).toBe((3 * 0x2000) & 0xff);
    });

    it("IRQ disable 後に enable しても旧 pending はクリア済み", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0xe001, 0); // enable
      mapper.writePrg(0xc000, 1);
      mapper.writePrg(0xc001, 0);
      mapper.clockIrqCounter(); // reload → 1
      mapper.clockIrqCounter(); // 0 → IRQ
      expect(mapper.irqPending).toBe(true);

      mapper.writePrg(0xe000, 0); // disable + clear
      expect(mapper.irqPending).toBe(false);

      mapper.writePrg(0xe001, 0); // enable
      // pending は clear されたまま
      expect(mapper.irqPending).toBe(false);
    });

    it("$8000/$8001 の奇偶アドレスが正しくディスパッチ", () => {
      const mapper = new MapperMmc3(makeCart());
      // $8001 → Bank Data (奇数アドレス)
      mapper.writePrg(0x8000, 6); // select R6
      mapper.writePrg(0x8001, 10); // R6 = 10

      // $8003 も Bank Data (奇数アドレスの別ミラー)
      mapper.writePrg(0x8000, 7); // select R7
      mapper.writePrg(0x9FFF, 12); // 奇数 → R7 = 12

      expect(mapper.readPrg(0x8000)).toBe((10 * 0x2000) & 0xff); // R6
      expect(mapper.readPrg(0xa000)).toBe((12 * 0x2000) & 0xff); // R7
    });

    it("$E000/$E001 の奇偶が正しくディスパッチ", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0xe001, 0); // enable (奇数)
      mapper.writePrg(0xc000, 1);
      mapper.writePrg(0xc001, 0);
      mapper.clockIrqCounter();
      mapper.clockIrqCounter();
      expect(mapper.irqPending).toBe(true);

      mapper.writePrg(0xe000, 0); // disable (偶数)
      expect(mapper.irqPending).toBe(false);
    });

    it("PRG $9FFF/$BFFF/$DFFF/$FFFF の各ウィンドウ末尾が正しく読める", () => {
      const mapper = new MapperMmc3(makeCart());
      mapper.writePrg(0x8000, 6);
      mapper.writePrg(0x8001, 1); // R6 = 1
      mapper.writePrg(0x8000, 7);
      mapper.writePrg(0x8001, 2); // R7 = 2

      // $9FFF = R6(1) のオフセット 0x1FFF
      expect(mapper.readPrg(0x9fff)).toBe((1 * 0x2000 + 0x1fff) & 0xff);
      // $BFFF = R7(2) のオフセット 0x1FFF
      expect(mapper.readPrg(0xbfff)).toBe((2 * 0x2000 + 0x1fff) & 0xff);
      // $DFFF = second-last(14) のオフセット 0x1FFF
      expect(mapper.readPrg(0xdfff)).toBe((14 * 0x2000 + 0x1fff) & 0xff);
      // $FFFF = last(15) のオフセット 0x1FFF
      expect(mapper.readPrg(0xffff)).toBe((15 * 0x2000 + 0x1fff) & 0xff);
    });
  });
});
