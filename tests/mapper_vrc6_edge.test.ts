/**
 * VRC6 エッジケーステスト。
 * 境界条件・特殊ケースを集中的に検証する。
 */
import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperVrc6 } from "../src/core/mappers/vrc6.ts";
import type { Mirroring } from "../src/core/cart.ts";

function makeCart(opts: {
  prgSize?: number;
  chrSize?: number;
  mapper?: number;
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
      mapper: opts.mapper ?? 24,
      mirroring: "vertical",
      hasBattery: false,
      hasTrainer: false,
      fourScreen: false,
    },
    prgRom,
    chrRom,
    trainer: null,
  };
}

describe("MapperVrc6 エッジケース", () => {
  // ==========================================================================
  // IRQ エッジケース
  // ==========================================================================
  describe("IRQ エッジケース", () => {
    it("latch=0xFF の場合、毎 clock で IRQ 発生", () => {
      const m = new MapperVrc6(makeCart(), 24);

      m.writePrg(0xf000, 0xff); // latch = 0xFF
      m.writePrg(0xf001, 0x06); // enable + cycle mode

      // counter = 0xFF → 即座に latch リロード + IRQ
      m.cpuCycleTick!();
      expect(m.irqPending).toBe(true);

      // acknowledge (enable を維持) してもう 1 tick → また IRQ
      m.writePrg(0xf002, 0x02); // enable 維持
      expect(m.irqPending).toBe(false);
      m.cpuCycleTick!();
      expect(m.irqPending).toBe(true);
    });

    it("latch=0x00 の場合、255 clock ごとに IRQ 発生", () => {
      const m = new MapperVrc6(makeCart(), 24);

      m.writePrg(0xf000, 0x00); // latch = 0x00
      m.writePrg(0xf001, 0x06); // enable + cycle mode

      // counter は 0x00 からスタート、0xFF まで 255 tick
      for (let i = 0; i < 255; i++) {
        m.cpuCycleTick!();
        expect(m.irqPending).toBe(false);
      }
      // 256 tick 目: 0xFF → latch(0x00) + IRQ
      m.cpuCycleTick!();
      expect(m.irqPending).toBe(true);
    });

    it("$F001 書き込みで IRQ pending がクリアされる", () => {
      const m = new MapperVrc6(makeCart(), 24);

      m.writePrg(0xf000, 0xff);
      m.writePrg(0xf001, 0x06);
      m.cpuCycleTick!();
      expect(m.irqPending).toBe(true);

      // $F001 への書き込みで pending クリア
      m.writePrg(0xf001, 0x06);
      expect(m.irqPending).toBe(false);
    });

    it("$F002 acknowledge は IRQ enable 状態も復帰する", () => {
      const m = new MapperVrc6(makeCart(), 24);

      m.writePrg(0xf000, 0xff);
      m.writePrg(0xf001, 0x06); // enable + cycle mode
      m.cpuCycleTick!();
      expect(m.irqPending).toBe(true);

      // $F002 は enable ビットも含む
      m.writePrg(0xf002, 0x02); // enable を維持
      expect(m.irqPending).toBe(false);

      // 引き続き IRQ が動作する
      m.cpuCycleTick!();
      expect(m.irqPending).toBe(true);
    });

    it("prescaler mode で IRQ 無効→有効切替時に prescaler リセット", () => {
      const m = new MapperVrc6(makeCart(), 24);

      m.writePrg(0xf000, 0xff);
      // 一旦 cycle mode で有効化
      m.writePrg(0xf001, 0x06);
      m.cpuCycleTick!();
      m.writePrg(0xf002, 0x00); // ack + disable

      // scanline mode で再有効化 → prescaler は 341 にリセット
      m.writePrg(0xf001, 0x02);
      // 有効化直後は prescaler=341, counter=latch(0xFF)
      m.cpuCycleTick!();
      expect(m.irqPending).toBe(false); // まだ prescaler が切れてない
    });
  });

  // ==========================================================================
  // 拡張音源 Pulse エッジケース
  // ==========================================================================
  describe("拡張音源 Pulse エッジケース", () => {
    it("duty=0 は 16 ステップ中 phase 0 のみ HIGH", () => {
      const m = new MapperVrc6(makeCart(), 24);

      m.writePrg(0x9000, 0x0f); // duty=0, volume=15
      m.writePrg(0x9001, 1);    // period=1 (高速)
      m.writePrg(0x9002, 0x80); // enable

      let highCount = 0;
      let lowCount = 0;
      for (let i = 0; i < 16; i++) {
        m.cpuCycleTick!();
        const out = m.audioOutput!();
        if (out > 0) highCount++;
        else lowCount++;
      }

      // duty=0: phase 0 のみ HIGH → 1/16
      expect(highCount).toBe(1);
      expect(lowCount).toBe(15);
    });

    it("duty=7 は 16 ステップ中 phase 0-7 が HIGH (50%)", () => {
      const m = new MapperVrc6(makeCart(), 24);

      m.writePrg(0x9000, 0x7f); // duty=7, volume=15
      m.writePrg(0x9001, 1);
      m.writePrg(0x9002, 0x80);

      let highCount = 0;
      for (let i = 0; i < 16; i++) {
        m.cpuCycleTick!();
        const out = m.audioOutput!();
        if (out > 0) highCount++;
      }

      expect(highCount).toBe(8);
    });

    it("period=0 ではタイマーが進まない", () => {
      const m = new MapperVrc6(makeCart(), 24);

      m.writePrg(0x9000, 0x0f); // duty=0, volume=15
      m.writePrg(0x9001, 0);    // period low = 0
      m.writePrg(0x9002, 0x80); // enable, period high = 0

      // phase は変わらない (0 のまま)
      for (let i = 0; i < 100; i++) {
        m.cpuCycleTick!();
      }

      // phase=0, duty=0: phase(0) <= duty(0) → HIGH
      const output = m.audioOutput!();
      expect(output).toBeGreaterThan(0);
    });

    it("volume=0 なら常に出力 0", () => {
      const m = new MapperVrc6(makeCart(), 24);

      m.writePrg(0x9000, 0x70); // duty=7, volume=0
      m.writePrg(0x9001, 10);
      m.writePrg(0x9002, 0x80);

      for (let i = 0; i < 100; i++) {
        m.cpuCycleTick!();
      }

      expect(m.audioOutput!()).toBe(0);
    });

    it("12bit period (period high + period low) の結合", () => {
      const m = new MapperVrc6(makeCart(), 24);

      // period = 0x0F_FF = 4095 (period_high=0x0F, period_low=0xFF)
      m.writePrg(0x9000, 0x7f); // duty=7, volume=15
      m.writePrg(0x9001, 0xff); // period low
      m.writePrg(0x9002, 0x8f); // enable + period high=0x0F

      // 初回 tick でタイマーが 0→-1 で即座に 1 phase 進行。
      // 以降 4095 tick ごとに 1 phase 進行するので 100 tick では phase=1 のまま。
      for (let i = 0; i < 100; i++) {
        m.cpuCycleTick!();
      }

      // phase=1, duty=7: phase(1) <= duty(7) → HIGH
      const output = m.audioOutput!();
      expect(output).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 拡張音源 Sawtooth エッジケース
  // ==========================================================================
  describe("拡張音源 Sawtooth エッジケース", () => {
    it("rate=0 では accumulator が変化しない", () => {
      const m = new MapperVrc6(makeCart(), 24);

      m.writePrg(0xb000, 0);    // rate = 0
      m.writePrg(0xb001, 1);    // period = 1
      m.writePrg(0xb002, 0x80); // enable

      for (let i = 0; i < 100; i++) {
        m.cpuCycleTick!();
      }

      // rate=0 なので accumulator は常に 0 → 出力も 0
      expect(m.audioOutput!()).toBe(0);
    });

    it("rate が大きいと accumulator がオーバーフローして正しくラップ", () => {
      const m = new MapperVrc6(makeCart(), 24);

      m.writePrg(0xb000, 63);   // rate = max (63)
      m.writePrg(0xb001, 1);    // period = 1
      m.writePrg(0xb002, 0x80); // enable

      // 14 ステップで 1 周期。rate=63 × 7 加算 = 441 → 8bit で 441 & 0xFF = 185
      // ただし途中で 14 ステップリセットがかかる
      const outputs: number[] = [];
      for (let i = 0; i < 30; i++) {
        m.cpuCycleTick!();
        outputs.push(m.audioOutput!());
      }

      // リセットタイミングで 0 になるはず
      expect(outputs.some(v => v === 0)).toBe(true);
    });

    it("period=0 ではタイマーが進まない", () => {
      const m = new MapperVrc6(makeCart(), 24);

      m.writePrg(0xb000, 42);   // rate = 42
      m.writePrg(0xb001, 0);    // period = 0
      m.writePrg(0xb002, 0x80); // enable, period high = 0

      for (let i = 0; i < 100; i++) {
        m.cpuCycleTick!();
      }

      // period=0 ではタイマーが進まないので accumulator は変化しない
      expect(m.audioOutput!()).toBe(0);
    });
  });

  // ==========================================================================
  // VRC6b アドレススワップ詳細
  // ==========================================================================
  describe("VRC6b アドレススワップ詳細", () => {
    it("VRC6b: $9001 → swap → $9002 (Pulse 1 period high + enable)", () => {
      const m = new MapperVrc6(makeCart(), 26);

      // VRC6b で Pulse 1 の period low ($9001 → swap → $9002)
      // $9001: A0=1, A1=0 → swap → A0=0, A1=1 → $9002
      // つまり VRC6b の $9001 は VRC6a の $9002 (enable + period high) に相当
      m.writePrg(0x9000, 0x8f); // digitized mode + volume=15
      m.writePrg(0x9002, 10);   // VRC6b: $9002 → swap → $9001 → period low
      m.writePrg(0x9001, 0x80); // VRC6b: $9001 → swap → $9002 → enable

      for (let i = 0; i < 100; i++) {
        m.cpuCycleTick!();
      }

      expect(m.audioOutput!()).toBeGreaterThan(0);
    });

    it("VRC6b: IRQ レジスタもアドレススワップされる", () => {
      const m = new MapperVrc6(makeCart(), 26);

      m.writePrg(0xf000, 0xff); // $F000 → swap → $F000 (A0=0,A1=0 → same)

      // VRC6a の $F001 に相当するのは VRC6b の $F002 (A0=0,A1=1 → swap → A0=1,A1=0 → $F001)
      // いや逆: VRC6b アドレス $F001 → swap: A0=1,A1=0 → A0=0,A1=1 → $F002
      // VRC6b アドレス $F002 → swap: A0=0,A1=1 → A0=1,A1=0 → $F001
      m.writePrg(0xf002, 0x06); // VRC6b $F002 → swap → $F001 → IRQ control

      m.cpuCycleTick!();
      expect(m.irqPending).toBe(true);
    });

    it("VRC6b: Sawtooth レジスタも正しくスワップ", () => {
      const m = new MapperVrc6(makeCart(), 26);

      m.writePrg(0xb000, 42);   // $B000 → swap → $B000 (rate)
      // VRC6b: $B002 → swap → $B001 (period low)
      m.writePrg(0xb002, 1);
      // VRC6b: $B001 → swap → $B002 (enable + period high)
      m.writePrg(0xb001, 0x80);

      for (let i = 0; i < 50; i++) {
        m.cpuCycleTick!();
      }

      expect(m.audioOutput!()).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // PRG バンク境界
  // ==========================================================================
  describe("PRG バンク境界", () => {
    it("$BFFF は 16KB バンクの最後のバイト", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const m = new MapperVrc6(cart, 24);

      m.writePrg(0x8000, 1);
      // $BFFF = bank1 の最後のバイト
      expect(m.readPrg(0xbfff)).toBe(cart.prgRom[1 * 0x4000 + 0x3fff]!);
    });

    it("$C000 は 8KB バンクの最初のバイト", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const m = new MapperVrc6(cart, 24);

      m.writePrg(0xc000, 3);
      expect(m.readPrg(0xc000)).toBe(cart.prgRom[3 * 0x2000]!);
    });

    it("$DFFF は 8KB バンクの最後のバイト", () => {
      const cart = makeCart({ prgSize: 0x40000 });
      const m = new MapperVrc6(cart, 24);

      m.writePrg(0xc000, 3);
      expect(m.readPrg(0xdfff)).toBe(cart.prgRom[3 * 0x2000 + 0x1fff]!);
    });

    it("$E000 は最終バンク固定の最初のバイト", () => {
      const cart = makeCart({ prgSize: 0x40000 }); // 32 × 8KB
      const m = new MapperVrc6(cart, 24);

      const lastBank = 31;
      expect(m.readPrg(0xe000)).toBe(cart.prgRom[lastBank * 0x2000]!);
    });
  });

  // ==========================================================================
  // 複数チャンネル同時発音
  // ==========================================================================
  describe("複数チャンネル同時発音", () => {
    it("pulse1 + pulse2 + saw 全て有効時の出力が正規化範囲内", () => {
      const m = new MapperVrc6(makeCart(), 24);

      // Pulse 1: digitized mode, max volume
      m.writePrg(0x9000, 0x8f);
      m.writePrg(0x9001, 10);
      m.writePrg(0x9002, 0x80);

      // Pulse 2: digitized mode, max volume
      m.writePrg(0xa000, 0x8f);
      m.writePrg(0xa001, 20);
      m.writePrg(0xa002, 0x80);

      // Sawtooth: max rate
      m.writePrg(0xb000, 63);
      m.writePrg(0xb001, 5);
      m.writePrg(0xb002, 0x80);

      for (let i = 0; i < 2000; i++) {
        m.cpuCycleTick!();
        const out = m.audioOutput!();
        expect(out).toBeGreaterThanOrEqual(-1);
        expect(out).toBeLessThanOrEqual(1);
      }
    });

    it("全チャンネル無効時は出力 0", () => {
      const m = new MapperVrc6(makeCart(), 24);
      expect(m.audioOutput!()).toBe(0);
    });
  });

  // ==========================================================================
  // CHR バンキングモード エッジケース
  // ==========================================================================
  describe("CHR バンキングモード エッジケース", () => {
    it("mode 0 → mode 3 への動的切替", () => {
      const cart = makeCart({ chrSize: 0x20000 });
      const m = new MapperVrc6(cart, 24);

      // mode 0: 1KB×8
      m.writePrg(0xd000, 5);
      expect(m.readChr(0x0000)).toBe(cart.chrRom[5 * 0x0400]!);

      // mode 3: 2KB×4 に切替
      m.writePrg(0xb003, 0x03);
      // R0=5 → 2KB バンク = 5>>1 = 2 → offset = 2*0x0800
      expect(m.readChr(0x0000)).toBe(cart.chrRom[2 * 0x0800]!);
    });

    it("mode 1: R1 への書き込みは $0000-$07FF に影響しない (R0 が使われる)", () => {
      const cart = makeCart({ chrSize: 0x20000 });
      const m = new MapperVrc6(cart, 24);

      m.writePrg(0xb003, 0x01); // mode 1
      m.writePrg(0xd000, 10);   // R0 = 10
      m.writePrg(0xd001, 20);   // R1 = 20 (mode 1 では $0000-$07FF に無関係)

      // $0000-$07FF は R0 が支配 (2KB)
      expect(m.readChr(0x0000)).toBe(cart.chrRom[5 * 0x0800]!);
    });

    it("mode 3: 奇数レジスタ (R1,R3,R5,R7) は無視される", () => {
      const cart = makeCart({ chrSize: 0x20000 });
      const m = new MapperVrc6(cart, 24);

      m.writePrg(0xb003, 0x03); // mode 3: 2KB×4
      m.writePrg(0xd000, 6);    // R0 = 6
      m.writePrg(0xd001, 99);   // R1 = 99 (無視される)

      // $0000-$07FF は R0 が支配
      expect(m.readChr(0x0000)).toBe(cart.chrRom[3 * 0x0800]!);
      // $0400-$07FF も同じ 2KB バンク内
      expect(m.readChr(0x0400)).toBe(cart.chrRom[3 * 0x0800 + 0x0400]!);
    });
  });

  // ==========================================================================
  // ミラーリング + PRG RAM の複合
  // ==========================================================================
  describe("ミラーリング + PRG RAM 複合", () => {
    it("$B003 で PRG RAM 有効化とミラーリングを同時設定", () => {
      const m = new MapperVrc6(makeCart(), 24);
      const changes: Mirroring[] = [];
      m.onMirroringChange = (mir) => { changes.push(mir); };

      // bit7=PRG RAM enable, bit6=write enable, bits2-3=ミラーリング
      m.writePrg(0xb003, 0xc8); // PRG RAM 有効 + write有効 + single-lower

      m.writePrgRam(0x6000, 0x42);
      expect(m.readPrgRam(0x6000)).toBe(0x42);
      expect(changes[0]).toBe("single-lower");
    });
  });
});
