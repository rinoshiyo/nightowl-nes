import { describe, it, expect, beforeEach } from "vitest";
import { Apu } from "../src/core/apu.ts";

describe("APU", () => {
  let apu: Apu;

  beforeEach(() => {
    apu = new Apu();
  });

  describe("$4015 ステータス", () => {
    it("初期状態で $4015 read は 0", () => {
      expect(apu.read(0x4015)).toBe(0);
    });

    it("pulse1 enable + 長さカウンタ > 0 → bit0 が立つ", () => {
      apu.write(0x4015, 0x01); // pulse1 enable
      apu.write(0x4000, 0x3f); // constant volume 15, halt=true
      apu.write(0x4003, 0x08); // 長さカウンタロード (index 1 → 254)
      expect(apu.read(0x4015) & 0x01).toBe(0x01);
    });

    it("pulse2 enable + 長さカウンタ > 0 → bit1 が立つ", () => {
      apu.write(0x4015, 0x02); // pulse2 enable
      apu.write(0x4004, 0x3f);
      apu.write(0x4007, 0x08);
      expect(apu.read(0x4015) & 0x02).toBe(0x02);
    });

    it("disable で長さカウンタが 0 に強制される", () => {
      apu.write(0x4015, 0x01); // enable
      apu.write(0x4000, 0x3f);
      apu.write(0x4003, 0x08);
      expect(apu.read(0x4015) & 0x01).toBe(0x01);

      apu.write(0x4015, 0x00); // disable
      expect(apu.read(0x4015) & 0x01).toBe(0x00);
    });
  });

  describe("$4017 フレームカウンタ", () => {
    it("bit7=0 で 4-step モード", () => {
      apu.write(0x4017, 0x00);
      // フレームカウンタが動いてる (直接検証は難しいので例外なく通ること)
    });

    it("bit7=1 で 5-step モード (即座に quarter+half frame)", () => {
      apu.write(0x4015, 0x01); // pulse1 enable
      apu.write(0x4000, 0x00); // halt=false
      apu.write(0x4003, 0x08); // 長さカウンタロード

      const lengthBefore = apu.read(0x4015) & 0x01;
      expect(lengthBefore).toBe(0x01);

      // 5-step モード切替で即座に half frame → 長さカウンタ -1
      apu.write(0x4017, 0x80);
      // 長さカウンタは 254→253 (まだ > 0)
      expect(apu.read(0x4015) & 0x01).toBe(0x01);
    });

    it("IRQ inhibit フラグでフレーム IRQ がクリアされる", () => {
      apu.frameIrqFlag = true;
      apu.write(0x4017, 0x40); // IRQ inhibit
      expect(apu.frameIrqFlag).toBe(false);
    });
  });

  describe("tick", () => {
    it("CPU tick を進めてもクラッシュしない", () => {
      apu.write(0x4015, 0x03); // pulse1 + pulse2 enable
      apu.write(0x4000, 0xbf); // pulse1: duty=2, halt, constant, vol=15
      apu.write(0x4002, 0xfd); // timer low
      apu.write(0x4003, 0x08); // timer high + length load

      for (let i = 0; i < 30000; i++) {
        apu.tick();
      }
    });

    it("4-step モードで約 14915 cycle 後にフレーム IRQ が立つ", () => {
      apu.write(0x4017, 0x00); // 4-step, IRQ enabled
      apu.frameIrqFlag = false;

      // 29830 半 cycle = 14915 full cycle でステップ 3 → IRQ
      for (let i = 0; i < 29830; i++) {
        apu.tick();
      }
      expect(apu.frameIrqFlag).toBe(true);
    });

    it("5-step モードではフレーム IRQ が立たない", () => {
      apu.write(0x4017, 0x80); // 5-step
      apu.frameIrqFlag = false;

      for (let i = 0; i < 40000; i++) {
        apu.tick();
      }
      expect(apu.frameIrqFlag).toBe(false);
    });
  });

  describe("readSamples", () => {
    it("tick 後にサンプルを読める", () => {
      apu.setSampleRate(44100);
      apu.write(0x4015, 0x01);
      apu.write(0x4000, 0xbf); // duty=2, constant, vol=15
      apu.write(0x4002, 0x00);
      apu.write(0x4003, 0x08);

      // CPU clock / sampleRate ≈ 40.6 tick で 1 sample
      for (let i = 0; i < 1000; i++) {
        apu.tick();
      }

      const buf = new Float32Array(64);
      const written = apu.readSamples(buf);
      expect(written).toBeGreaterThan(0);
    });
  });

  describe("$4015 read がフレーム IRQ フラグをクリアする", () => {
    it("read 後に frameIrqFlag が false になる", () => {
      apu.frameIrqFlag = true;
      const status = apu.read(0x4015);
      expect(status & 0x40).toBe(0x40);
      expect(apu.frameIrqFlag).toBe(false);
    });
  });
});
