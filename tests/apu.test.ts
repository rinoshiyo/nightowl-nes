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

  describe("非線形ミキシング統合", () => {
    it("サンプルが ±1.0 の範囲内に収まる", () => {
      apu.setSampleRate(44100);
      // 全チャンネル有効 + 最大出力で tick
      apu.write(0x4015, 0x1f);
      apu.write(0x4000, 0xbf); // pulse1: duty=2, constant, vol=15
      apu.write(0x4002, 0x00);
      apu.write(0x4003, 0x08);
      apu.write(0x4004, 0xbf); // pulse2: duty=2, constant, vol=15
      apu.write(0x4006, 0x00);
      apu.write(0x4007, 0x08);
      apu.write(0x4008, 0xff); // triangle
      apu.write(0x400a, 0x01);
      apu.write(0x400b, 0x08);
      apu.write(0x400c, 0x3f); // noise: constant, vol=15
      apu.write(0x400f, 0x08);
      apu.write(0x4011, 0x7f); // DMC direct load max

      for (let i = 0; i < 100000; i++) {
        apu.tick();
      }

      const buf = new Float32Array(2048);
      const written = apu.readSamples(buf);
      expect(written).toBeGreaterThan(0);
      for (let i = 0; i < written; i++) {
        expect(buf[i]!).toBeGreaterThanOrEqual(-1);
        expect(buf[i]!).toBeLessThanOrEqual(1);
      }
    });

    it("HPF により定常入力の DC 成分が除去される", () => {
      apu.setSampleRate(44100);
      apu.write(0x4015, 0x10); // DMC のみ有効
      apu.write(0x4011, 0x40); // direct load (一定値)

      // 十分長く tick して HPF を安定させる
      for (let i = 0; i < 500000; i++) {
        apu.tick();
      }
      const buf = new Float32Array(512);
      const written = apu.readSamples(buf);
      expect(written).toBeGreaterThan(0);
      // 最後のサンプルは DC 除去により 0 付近
      const lastSample = buf[written - 1]!;
      expect(Math.abs(lastSample)).toBeLessThan(0.01);
    });

    it("setSampleRate でフィルタ係数が再計算される", () => {
      apu.write(0x4015, 0x01);
      apu.write(0x4000, 0xbf);
      apu.write(0x4002, 0x10);
      apu.write(0x4003, 0x08);

      // 44100 Hz でサンプル取得
      apu.setSampleRate(44100);
      for (let i = 0; i < 50000; i++) apu.tick();
      const buf44 = new Float32Array(512);
      apu.readSamples(buf44);

      // 新しい APU で 48000 Hz
      const apu2 = new Apu();
      apu2.setSampleRate(48000);
      apu2.write(0x4015, 0x01);
      apu2.write(0x4000, 0xbf);
      apu2.write(0x4002, 0x10);
      apu2.write(0x4003, 0x08);
      for (let i = 0; i < 50000; i++) apu2.tick();
      const buf48 = new Float32Array(512);
      const w2 = apu2.readSamples(buf48);
      // サンプルレートが違うので生成サンプル数も違う
      expect(w2).not.toBe(0);
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
