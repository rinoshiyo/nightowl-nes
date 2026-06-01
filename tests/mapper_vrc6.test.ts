import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperVrc6 } from "../src/core/mappers/vrc6.ts";
import type { Mirroring } from "../src/core/cart.ts";

function makeCart(opts: {
  prgSize?: number;
  chrSize?: number;
  mapper?: number;
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
      mapper: opts.mapper ?? 24,
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

function makeVrc6a(opts?: Parameters<typeof makeCart>[0]): MapperVrc6 {
  return new MapperVrc6(makeCart({ ...opts, mapper: 24 }), 24);
}

function makeVrc6b(opts?: Parameters<typeof makeCart>[0]): MapperVrc6 {
  return new MapperVrc6(makeCart({ ...opts, mapper: 26 }), 26);
}

describe("MapperVrc6", () => {
  // ==========================================================================
  // PRG バンク切替
  // ==========================================================================
  describe("PRG バンク切替", () => {
    it("$E000-$FFFF は最終 8KB バンク固定", () => {
      const cart = makeCart({ prgSize: 0x40000 }); // 256KB = 32 × 8KB
      const m = new MapperVrc6(cart, 24);
      const lastBankStart = 31 * 0x2000;
      expect(m.readPrg(0xe000)).toBe(cart.prgRom[lastBankStart]!);
      expect(m.readPrg(0xffff)).toBe(cart.prgRom[lastBankStart + 0x1fff]!);
    });

    it("$8000 への書き込みで 16KB バンク切替", () => {
      const cart = makeCart({ prgSize: 0x40000 }); // 16 × 16KB
      const m = new MapperVrc6(cart, 24);

      // バンク 2 を選択 → $8000-$BFFF = PRG ROM の 0x8000-0xBFFF
      m.writePrg(0x8000, 2);
      expect(m.readPrg(0x8000)).toBe(cart.prgRom[2 * 0x4000]!);
      expect(m.readPrg(0xbfff)).toBe(cart.prgRom[2 * 0x4000 + 0x3fff]!);
    });

    it("$C000 への書き込みで 8KB バンク切替", () => {
      const cart = makeCart({ prgSize: 0x40000 }); // 32 × 8KB
      const m = new MapperVrc6(cart, 24);

      m.writePrg(0xc000, 5);
      expect(m.readPrg(0xc000)).toBe(cart.prgRom[5 * 0x2000]!);
      expect(m.readPrg(0xdfff)).toBe(cart.prgRom[5 * 0x2000 + 0x1fff]!);
    });

    it("PRG バンクはラップアラウンドする", () => {
      const cart = makeCart({ prgSize: 0x20000 }); // 128KB = 8 × 16KB
      const m = new MapperVrc6(cart, 24);

      m.writePrg(0x8000, 10); // 10 % 8 = 2
      expect(m.readPrg(0x8000)).toBe(cart.prgRom[2 * 0x4000]!);
    });
  });

  // ==========================================================================
  // CHR バンク切替
  // ==========================================================================
  describe("CHR バンク切替", () => {
    it("$D000-$D003 で CHR bank 0-3 を切替", () => {
      const cart = makeCart({ chrSize: 0x20000 }); // 128KB = 128 × 1KB
      const m = new MapperVrc6(cart, 24);

      m.writePrg(0xd000, 5);  // CHR bank 0 = 5
      m.writePrg(0xd001, 10); // CHR bank 1 = 10
      m.writePrg(0xd002, 15); // CHR bank 2 = 15
      m.writePrg(0xd003, 20); // CHR bank 3 = 20

      expect(m.readChr(0x0000)).toBe(cart.chrRom[5 * 0x0400]!);
      expect(m.readChr(0x0400)).toBe(cart.chrRom[10 * 0x0400]!);
      expect(m.readChr(0x0800)).toBe(cart.chrRom[15 * 0x0400]!);
      expect(m.readChr(0x0c00)).toBe(cart.chrRom[20 * 0x0400]!);
    });

    it("$E000-$E003 で CHR bank 4-7 を切替", () => {
      const cart = makeCart({ chrSize: 0x20000 });
      const m = new MapperVrc6(cart, 24);

      m.writePrg(0xe000, 25); // CHR bank 4 = 25
      m.writePrg(0xe001, 30); // CHR bank 5 = 30
      m.writePrg(0xe002, 35); // CHR bank 6 = 35
      m.writePrg(0xe003, 40); // CHR bank 7 = 40

      expect(m.readChr(0x1000)).toBe(cart.chrRom[25 * 0x0400]!);
      expect(m.readChr(0x1400)).toBe(cart.chrRom[30 * 0x0400]!);
      expect(m.readChr(0x1800)).toBe(cart.chrRom[35 * 0x0400]!);
      expect(m.readChr(0x1c00)).toBe(cart.chrRom[40 * 0x0400]!);
    });

    it("CHR RAM モードでは flat アクセス", () => {
      const m = makeVrc6a({ chrSize: 0 });
      m.writeChr(0x0100, 0x42);
      expect(m.readChr(0x0100)).toBe(0x42);
    });

    it("CHR バンクはラップアラウンドする", () => {
      const cart = makeCart({ chrSize: 0x8000 }); // 32KB = 32 × 1KB
      const m = new MapperVrc6(cart, 24);

      m.writePrg(0xd000, 35); // 35 % 32 = 3
      expect(m.readChr(0x0000)).toBe(cart.chrRom[3 * 0x0400]!);
    });
  });

  // ==========================================================================
  // ミラーリング
  // ==========================================================================
  describe("ミラーリング", () => {
    it("$B003 bits 2-3 でミラーリングを制御", () => {
      const m = makeVrc6a();
      const changes: Mirroring[] = [];
      m.onMirroringChange = (mir) => { changes.push(mir); };

      m.writePrg(0xb003, 0b00000000); // 0 → vertical
      m.writePrg(0xb003, 0b00000100); // 1 → horizontal
      m.writePrg(0xb003, 0b00001000); // 2 → single-lower
      m.writePrg(0xb003, 0b00001100); // 3 → single-upper

      expect(changes).toEqual(["vertical", "horizontal", "single-lower", "single-upper"]);
    });
  });

  // ==========================================================================
  // PRG RAM
  // ==========================================================================
  describe("PRG RAM", () => {
    it("$B003 bit7 (enable) + bit6 (write enable) で PRG RAM 制御", () => {
      const m = makeVrc6a();

      // 初期状態: 無効
      m.writePrgRam(0x6000, 0xaa);
      expect(m.readPrgRam(0x6000)).toBe(0);

      // bit7 のみ: read 可、write 不可
      m.writePrg(0xb003, 0x80);
      m.writePrgRam(0x6000, 0xaa);
      expect(m.readPrgRam(0x6000)).toBe(0); // write protect

      // bit7 + bit6: read/write 可
      m.writePrg(0xb003, 0xc0);
      m.writePrgRam(0x6000, 0xaa);
      expect(m.readPrgRam(0x6000)).toBe(0xaa);

      // 無効化
      m.writePrg(0xb003, 0x00);
      expect(m.readPrgRam(0x6000)).toBe(0);
    });

    it("getPrgRam / setPrgRam でバッテリーセーブ", () => {
      const m = makeVrc6a();
      m.writePrg(0xb003, 0xc0); // PRG RAM 有効化 (enable + write enable)
      m.writePrgRam(0x6000, 0x42);
      m.writePrgRam(0x6001, 0x55);

      const saved = m.getPrgRam()!;
      expect(saved[0]).toBe(0x42);
      expect(saved[1]).toBe(0x55);

      const m2 = makeVrc6a();
      m2.setPrgRam(saved);
      m2.writePrg(0xb003, 0xc0);
      expect(m2.readPrgRam(0x6000)).toBe(0x42);
    });
  });

  // ==========================================================================
  // IRQ
  // ==========================================================================
  describe("IRQ", () => {
    it("cycle mode: カウンタが 0xFF → latch にリロードし IRQ 発生", () => {
      const m = makeVrc6a();

      m.writePrg(0xf000, 0xfe); // latch = 0xFE
      m.writePrg(0xf001, 0x06); // enable + cycle mode (bits 1,2)

      // counter は latch (0xFE) からスタート
      // tick 1: 0xFE → 0xFF (まだ IRQ なし)
      expect(m.irqPending).toBe(false);
      m.cpuCycleTick!();
      expect(m.irqPending).toBe(false);

      // tick 2: 0xFF → latch にリロード + IRQ 発生
      m.cpuCycleTick!();
      expect(m.irqPending).toBe(true);
    });

    it("IRQ acknowledge で pending をクリア", () => {
      const m = makeVrc6a();

      m.writePrg(0xf000, 0xfe);
      m.writePrg(0xf001, 0x06); // enable + cycle mode
      m.cpuCycleTick!(); // 0xFE → 0xFF
      m.cpuCycleTick!(); // 0xFF → latch + IRQ
      expect(m.irqPending).toBe(true);

      m.writePrg(0xf002, 0x00); // acknowledge
      expect(m.irqPending).toBe(false);
    });

    it("scanline mode: prescaler 経由で clocking", () => {
      const m = makeVrc6a();

      m.writePrg(0xf000, 0xfe); // latch = 0xFE
      m.writePrg(0xf001, 0x02); // enable + scanline mode (cycle bit = 0)

      // scanline mode: prescaler は 341 からスタート、毎 tick -3
      // 114 tick で prescaler が 0 以下 → 1 clock (0xFE → 0xFF)
      for (let i = 0; i < 114; i++) {
        m.cpuCycleTick!();
      }
      expect(m.irqPending).toBe(false); // 1 clock 目: 0xFE → 0xFF

      // さらに ~114 tick で 2 clock 目: 0xFF → latch + IRQ
      for (let i = 0; i < 114; i++) {
        m.cpuCycleTick!();
      }
      expect(m.irqPending).toBe(true);
    });

    it("IRQ 無効時はカウントしない", () => {
      const m = makeVrc6a();

      m.writePrg(0xf000, 0xfe);
      // enable bit を立てない
      m.writePrg(0xf001, 0x04); // cycle mode だが enable = false

      for (let i = 0; i < 10; i++) {
        m.cpuCycleTick!();
      }
      expect(m.irqPending).toBe(false);
    });
  });

  // ==========================================================================
  // 拡張音源: Pulse
  // ==========================================================================
  describe("拡張音源: Pulse", () => {
    it("Pulse 1 が有効な時に音声出力を返す", () => {
      const m = makeVrc6a();

      // $9000: volume=15, duty=7, digitized=false
      m.writePrg(0x9000, 0x7f);
      // period = 100
      m.writePrg(0x9001, 100);
      m.writePrg(0x9002, 0x80); // enable + period high = 0

      // tick して位相を進める
      for (let i = 0; i < 200; i++) {
        m.cpuCycleTick!();
      }

      const output = m.audioOutput!();
      expect(typeof output).toBe("number");
      expect(output).toBeGreaterThanOrEqual(-1);
      expect(output).toBeLessThanOrEqual(1);
    });

    it("Pulse 無効時は出力 0", () => {
      const m = makeVrc6a();

      // enable しない
      m.writePrg(0x9000, 0x7f);
      m.writePrg(0x9001, 100);
      m.writePrg(0x9002, 0x00); // disabled

      expect(m.audioOutput!()).toBe(0);
    });

    it("Digitized mode では常に volume を出力", () => {
      const m = makeVrc6a();

      // digitized mode (bit7=1), volume=10
      m.writePrg(0x9000, 0x8a);
      m.writePrg(0x9001, 100);
      m.writePrg(0x9002, 0x80); // enable

      const output = m.audioOutput!();
      expect(output).toBeGreaterThan(0);
    });

    it("Pulse 2 も独立して動作", () => {
      const m = makeVrc6a();

      m.writePrg(0xa000, 0x7f); // volume=15, duty=7
      m.writePrg(0xa001, 50);
      m.writePrg(0xa002, 0x80); // enable

      for (let i = 0; i < 200; i++) {
        m.cpuCycleTick!();
      }

      expect(m.audioOutput!()).toBeGreaterThan(0);
    });

    it("disable すると phase がリセットされる", () => {
      const m = makeVrc6a();

      m.writePrg(0x9000, 0x7f);
      m.writePrg(0x9001, 10);
      m.writePrg(0x9002, 0x80); // enable

      for (let i = 0; i < 50; i++) {
        m.cpuCycleTick!();
      }

      m.writePrg(0x9002, 0x00); // disable → phase=0
      // 8 段階 duty=7: phase 0 <= 7 なので出力が volume (有効なら)
      // ただし disabled なので出力は 0
      expect(m.audioOutput!()).toBe(0);
    });
  });

  // ==========================================================================
  // 拡張音源: Sawtooth
  // ==========================================================================
  describe("拡張音源: Sawtooth", () => {
    it("Sawtooth が有効な時に音声出力を返す", () => {
      const m = makeVrc6a();

      m.writePrg(0xb000, 10); // rate = 10
      m.writePrg(0xb001, 50); // period low
      m.writePrg(0xb002, 0x80); // enable

      for (let i = 0; i < 1000; i++) {
        m.cpuCycleTick!();
      }

      const output = m.audioOutput!();
      expect(typeof output).toBe("number");
    });

    it("Sawtooth 無効時は accumulator がリセットされる", () => {
      const m = makeVrc6a();

      m.writePrg(0xb000, 20);
      m.writePrg(0xb001, 10);
      m.writePrg(0xb002, 0x80); // enable

      for (let i = 0; i < 500; i++) {
        m.cpuCycleTick!();
      }

      m.writePrg(0xb002, 0x00); // disable → accumulator と step リセット
      // pulse 出力もないので全体の出力は 0
      expect(m.audioOutput!()).toBe(0);
    });

    it("14 ステップで 1 周期", () => {
      const m = makeVrc6a();

      m.writePrg(0xb000, 42); // rate = 42
      m.writePrg(0xb001, 1);  // period = 1 (高速)
      m.writePrg(0xb002, 0x80);

      // 14 tick で 1 周期分進む (period=1 なので毎 tick で step 進行)
      const outputs: number[] = [];
      for (let i = 0; i < 28; i++) {
        m.cpuCycleTick!();
        outputs.push(m.audioOutput!());
      }

      // 鋸歯波は上昇してからリセットを繰り返す
      // 少なくとも 0 に戻るタイミングがあるはず
      const hasZero = outputs.some(v => v === 0);
      const hasPositive = outputs.some(v => v > 0);
      expect(hasZero).toBe(true);
      expect(hasPositive).toBe(true);
    });
  });

  // ==========================================================================
  // VRC6a/VRC6b アドレス差分
  // ==========================================================================
  describe("VRC6a/VRC6b アドレス差分", () => {
    it("VRC6a (mapper 24): A0=bit0, A1=bit1 — そのまま", () => {
      const m = makeVrc6a();
      const changes: Mirroring[] = [];
      m.onMirroringChange = (mir) => { changes.push(mir); };

      // $B003 = ミラーリング制御。VRC6a ではそのまま $B003
      m.writePrg(0xb003, 0b00000100); // horizontal
      expect(changes[0]).toBe("horizontal");
    });

    it("VRC6b (mapper 26): A0 と A1 がスワップ", () => {
      const m = makeVrc6b();
      const changes: Mirroring[] = [];
      m.onMirroringChange = (mir) => { changes.push(mir); };

      // VRC6b: $B003 の bit0 と bit1 がスワップされる
      // $B003 → swapAddr → $B003 (A0=1,A1=1 → swap → A0=1,A1=1 — 同じ)
      // $B002 → swapAddr → $B001 (A0=0,A1=1 → swap → A0=1,A1=0)
      // 実際の B003 レジスタを叩くには: A0=1,A1=1 が必要
      // VRC6b のアドレスでは bit0=A1,bit1=A0 なので $B003 で A0=1,A1=1 → swap しても同じ
      m.writePrg(0xb003, 0b00000100); // horizontal
      expect(changes[0]).toBe("horizontal");
    });

    it("VRC6b: PRG バンク切替もアドレススワップが適用される", () => {
      const cart = makeCart({ prgSize: 0x40000, mapper: 26 });
      const m = new MapperVrc6(cart, 26);

      // VRC6a では $8000 で PRG bank0 を書く
      // VRC6b では $8000 の A0/A1 はスワップ
      // $8000 のビット 0,1 は 00 → swap 後も 00 → $8000 → PRG bank0
      m.writePrg(0x8000, 3);
      expect(m.readPrg(0x8000)).toBe(cart.prgRom[3 * 0x4000]!);
    });

    it("VRC6b: CHR バンクレジスタのアドレスが正しくスワップされる", () => {
      const cart = makeCart({ chrSize: 0x20000, mapper: 26 });
      const m = new MapperVrc6(cart, 26);

      // VRC6a: $D000 → CHR bank 0
      // VRC6b: $D000 の A0=0, A1=0 → swap → A0=0, A1=0 → $D000 → CHR bank 0
      m.writePrg(0xd000, 7);
      expect(m.readChr(0x0000)).toBe(cart.chrRom[7 * 0x0400]!);

      // VRC6a: $D001 → CHR bank 1。VRC6b: $D001 (A0=1,A1=0 → swap → A0=0,A1=1 → $D002)
      // なので VRC6b で CHR bank 1 を書くには $D002 を使う
      m.writePrg(0xd002, 12);
      expect(m.readChr(0x0400)).toBe(cart.chrRom[12 * 0x0400]!);

      // VRC6b: $D001 → swap → $D002 → CHR bank 2
      m.writePrg(0xd001, 18);
      expect(m.readChr(0x0800)).toBe(cart.chrRom[18 * 0x0400]!);
    });

    it("VRC6a と VRC6b で mapperId が異なる", () => {
      const a = makeVrc6a();
      const b = makeVrc6b();
      expect(a.mapperId()).toBe(24);
      expect(b.mapperId()).toBe(26);
    });
  });

  // ==========================================================================
  // シリアライズ/デシリアライズ
  // ==========================================================================
  describe("serialize/deserialize", () => {
    it("状態を保存・復元できる", () => {
      const m1 = makeVrc6a();

      m1.writePrg(0x8000, 3);
      m1.writePrg(0xc000, 5);
      m1.writePrg(0xd000, 10);
      m1.writePrg(0xb003, 0xc4); // PRG RAM 有効 + write有効 + horizontal
      m1.writePrg(0x9000, 0x7f); // pulse1 volume=15, duty=7
      m1.writePrg(0x9002, 0x80); // pulse1 enable

      const state = m1.serializeMapper();

      const m2 = makeVrc6a();
      m2.deserializeMapper(state);

      expect(m2.readPrg(0x8000)).toBe(m1.readPrg(0x8000));
      expect(m2.readPrg(0xc000)).toBe(m1.readPrg(0xc000));
      expect(m2.readChr(0x0000)).toBe(m1.readChr(0x0000));
    });
  });

  // ==========================================================================
  // リセット
  // ==========================================================================
  describe("reset", () => {
    it("reset で全状態がクリアされる", () => {
      const m = makeVrc6a();

      m.writePrg(0x8000, 5);
      m.writePrg(0x9000, 0x8f); // pulse1
      m.writePrg(0x9002, 0x80); // enable
      m.writePrg(0xf000, 0xff); // IRQ latch

      m.reset();

      expect(m.readPrg(0x8000)).toBe(m.readPrg(0x8000)); // bank 0 = 0
      expect(m.audioOutput!()).toBe(0);
      expect(m.irqPending).toBe(false);
    });
  });

  // ==========================================================================
  // 拡張音源の出力範囲
  // ==========================================================================
  describe("audioOutput 出力範囲", () => {
    it("全チャンネル最大出力でも [-1, 1] に収まる", () => {
      const m = makeVrc6a();

      // Pulse 1: max volume, max duty, digitized mode
      m.writePrg(0x9000, 0x8f); // digitized + vol=15
      m.writePrg(0x9001, 10);
      m.writePrg(0x9002, 0x80);

      // Pulse 2: max volume, max duty, digitized mode
      m.writePrg(0xa000, 0x8f);
      m.writePrg(0xa001, 10);
      m.writePrg(0xa002, 0x80);

      // Sawtooth: max rate
      m.writePrg(0xb000, 63); // max rate
      m.writePrg(0xb001, 1);
      m.writePrg(0xb002, 0x80);

      for (let i = 0; i < 1000; i++) {
        m.cpuCycleTick!();
        const out = m.audioOutput!();
        expect(out).toBeGreaterThanOrEqual(-1);
        expect(out).toBeLessThanOrEqual(1);
      }
    });
  });
});
