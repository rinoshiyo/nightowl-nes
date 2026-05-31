import { describe, it, expect } from "vitest";
import { SweepUnit } from "../src/core/apu-sweep.ts";

describe("APU SweepUnit", () => {
  it("targetPeriod: negate=false → currentPeriod + (currentPeriod >> shift)", () => {
    const sw = new SweepUnit(1);
    sw.shift = 2;
    sw.negate = false;
    // 400 + (400 >> 2) = 400 + 100 = 500
    expect(sw.targetPeriod(400)).toBe(500);
  });

  it("targetPeriod: pulse1 negate → 1の補数 (period - change - 1)", () => {
    const sw = new SweepUnit(1);
    sw.shift = 2;
    sw.negate = true;
    // 400 - (400 >> 2) - 1 = 400 - 100 - 1 = 299
    expect(sw.targetPeriod(400)).toBe(299);
  });

  it("targetPeriod: pulse2 negate → 2の補数 (period - change)", () => {
    const sw = new SweepUnit(2);
    sw.shift = 2;
    sw.negate = true;
    // 400 - (400 >> 2) = 400 - 100 = 300
    expect(sw.targetPeriod(400)).toBe(300);
  });

  it("isMuting: period < 8 → true", () => {
    const sw = new SweepUnit(1);
    sw.shift = 0;
    sw.negate = false;
    expect(sw.isMuting(7)).toBe(true);
    expect(sw.isMuting(8)).toBe(false);
  });

  it("isMuting: targetPeriod > $7FF → true", () => {
    const sw = new SweepUnit(1);
    sw.shift = 1;
    sw.negate = false;
    // 1500 + (1500 >> 1) = 1500 + 750 = 2250 > 0x7FF (2047)
    expect(sw.isMuting(1500)).toBe(true);
  });

  it("tick: enabled + shift > 0 + divider=0 + not muting → 周期が変化", () => {
    const sw = new SweepUnit(1);
    sw.enabled = true;
    sw.shift = 1;
    sw.negate = false;
    sw.period = 3;
    sw.divider = 0;

    // 100 + (100 >> 1) = 150
    const newPeriod = sw.tick(100);
    expect(newPeriod).toBe(150);
    expect(sw.divider).toBe(3); // reload
  });

  it("tick: shift=0 → 周期変化しない (enabled でも)", () => {
    const sw = new SweepUnit(1);
    sw.enabled = true;
    sw.shift = 0;
    sw.negate = false;
    sw.period = 2;
    sw.divider = 0;

    const newPeriod = sw.tick(100);
    expect(newPeriod).toBe(100);
  });

  it("tick: reload フラグで divider が再設定される", () => {
    const sw = new SweepUnit(1);
    sw.enabled = false;
    sw.shift = 1;
    sw.period = 5;
    sw.divider = 2;
    sw.reload = true;

    sw.tick(100);
    expect(sw.divider).toBe(5);
    expect(sw.reload).toBe(false);
  });

  it("tick: divider > 0 → デクリメントのみ", () => {
    const sw = new SweepUnit(1);
    sw.enabled = true;
    sw.shift = 1;
    sw.period = 3;
    sw.divider = 2;

    const newPeriod = sw.tick(100);
    expect(newPeriod).toBe(100); // divider > 0 なので変化なし
    expect(sw.divider).toBe(1);
  });
});
