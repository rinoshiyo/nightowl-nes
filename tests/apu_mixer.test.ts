import { describe, it, expect } from "vitest";
import { PULSE_TABLE, TND_TABLE, ApuMixer } from "../src/core/apu-mixer.ts";

describe("PULSE_TABLE", () => {
  it("インデックス 0 は 0", () => {
    expect(PULSE_TABLE[0]).toBe(0);
  });

  it("インデックス 1 の値が公式と一致", () => {
    const expected = 95.88 / (8128 / 1 + 100);
    expect(PULSE_TABLE[1]).toBeCloseTo(expected, 10);
  });

  it("インデックス 15 (単チャンネル最大) の値が公式と一致", () => {
    const expected = 95.88 / (8128 / 15 + 100);
    expect(PULSE_TABLE[15]).toBeCloseTo(expected, 10);
  });

  it("インデックス 30 (両チャンネル最大) の値が公式と一致", () => {
    const expected = 95.88 / (8128 / 30 + 100);
    expect(PULSE_TABLE[30]).toBeCloseTo(expected, 10);
  });

  it("テーブルは単調増加", () => {
    for (let i = 1; i < 31; i++) {
      expect(PULSE_TABLE[i]!).toBeGreaterThan(PULSE_TABLE[i - 1]!);
    }
  });

  it("最大値が 1.0 未満", () => {
    expect(PULSE_TABLE[30]!).toBeLessThan(1);
    expect(PULSE_TABLE[30]!).toBeGreaterThan(0);
  });
});

describe("TND_TABLE", () => {
  it("インデックス 0 は 0", () => {
    expect(TND_TABLE[0]).toBe(0);
  });

  it("インデックス 1 の値が公式と一致", () => {
    const expected = 159.79 / (1 / (1 / 24329) + 100);
    expect(TND_TABLE[1]).toBeCloseTo(expected, 10);
  });

  it("最大インデックス 202 (3*15 + 2*15 + 127) の値を検証", () => {
    const expected = 159.79 / (1 / (202 / 24329) + 100);
    expect(TND_TABLE[202]).toBeCloseTo(expected, 10);
  });

  it("テーブルは単調増加", () => {
    for (let i = 1; i < 203; i++) {
      expect(TND_TABLE[i]!).toBeGreaterThan(TND_TABLE[i - 1]!);
    }
  });

  it("最大値が 1.0 未満", () => {
    expect(TND_TABLE[202]!).toBeLessThan(1);
    expect(TND_TABLE[202]!).toBeGreaterThan(0);
  });
});

describe("ApuMixer", () => {
  it("全チャンネル無音なら出力 0", () => {
    const mixer = new ApuMixer(44100);
    expect(mixer.process(0, 0, 0, 0, 0)).toBe(0);
  });

  it("パルスのみ入力で非ゼロ出力", () => {
    const mixer = new ApuMixer(44100);
    // ウォームアップ (フィルタの過渡応答を安定させる)
    for (let i = 0; i < 5000; i++) {
      mixer.process(8, 8, 0, 0, 0);
    }
    const sample = mixer.process(8, 8, 0, 0, 0);
    expect(sample).not.toBe(0);
  });

  it("出力は ±1.0 の範囲内", () => {
    const mixer = new ApuMixer(44100);
    for (let i = 0; i < 10000; i++) {
      const s = mixer.process(15, 15, 15, 15, 127);
      expect(s).toBeGreaterThanOrEqual(-1);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("HPF が DC オフセットを除去する", () => {
    const mixer = new ApuMixer(44100);
    // 定常入力を十分長く与えると HPF が DC を除去し出力が 0 に収束
    let lastSample = 0;
    for (let i = 0; i < 100000; i++) {
      lastSample = mixer.process(8, 0, 8, 0, 64);
    }
    expect(Math.abs(lastSample)).toBeLessThan(0.001);
  });

  it("フィルタ係数がサンプルレートに依存する", () => {
    const mixer44 = new ApuMixer(44100);
    const mixer48 = new ApuMixer(48000);
    // 同じ入力を同じ回数処理しても結果が異なる
    for (let i = 0; i < 1000; i++) {
      mixer44.process(10, 5, 8, 4, 64);
      mixer48.process(10, 5, 8, 4, 64);
    }
    const s44 = mixer44.process(10, 5, 8, 4, 64);
    const s48 = mixer48.process(10, 5, 8, 4, 64);
    expect(s44).not.toBe(s48);
  });
});
