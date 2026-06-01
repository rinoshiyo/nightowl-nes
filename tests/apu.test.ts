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
