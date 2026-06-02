import { describe, it, expect, beforeEach } from "vitest";
import { Apu } from "../src/core/apu.ts";

/**
 * Length counter halt / envelope loop の統合テスト。
 * $4000 bit5 が length counter halt と envelope loop の両方を制御する。
 */

const DELAY = 3;

function tickN(apu: Apu, n: number): void {
  for (let i = 0; i < n; i++) apu.tick();
}

describe("Length counter halt と envelope loop の連動", () => {
  let apu: Apu;

  beforeEach(() => {
    apu = new Apu();
  });

  it("halt=true で length counter がデクリメントされない", () => {
    apu.write(0x4015, 0x01);
    apu.write(0x4000, 0x20); // halt=true, constant=false, vol=0
    apu.write(0x4003, 0x08); // length counter = 254
    apu.write(0x4017, 0x00);

    // half frame (14913+DELAY) で length counter がデクリメントされない
    tickN(apu, 14913 + DELAY);
    expect(apu.pulse1.lengthCounter).toBe(254);

    // 2回目の half frame でも同じ
    tickN(apu, 29829 - 14913);
    expect(apu.pulse1.lengthCounter).toBe(254);
  });

  it("halt=false で length counter がデクリメントされる", () => {
    apu.write(0x4015, 0x01);
    apu.write(0x4000, 0x00); // halt=false
    apu.write(0x4003, 0x08); // length counter = 254
    apu.write(0x4017, 0x00);

    tickN(apu, 14913 + DELAY);
    expect(apu.pulse1.lengthCounter).toBe(253);
  });

  it("halt=true で envelope loop も true になる", () => {
    apu.write(0x4015, 0x01);
    apu.write(0x4000, 0x20); // halt=true → envelope.loop=true
    expect(apu.pulse1.envelope.loop).toBe(true);
  });

  it("halt=false で envelope loop も false になる", () => {
    apu.write(0x4015, 0x01);
    apu.write(0x4000, 0x00); // halt=false → envelope.loop=false
    expect(apu.pulse1.envelope.loop).toBe(false);
  });

  it("noise channel の halt/loop も同じ連動", () => {
    apu.write(0x4015, 0x08);
    apu.write(0x400c, 0x20); // halt=true
    apu.write(0x400f, 0x08); // length counter = 254
    apu.write(0x4017, 0x00);

    expect(apu.noise.lengthHalt).toBe(true);
    expect(apu.noise.envelope.loop).toBe(true);

    tickN(apu, 14913 + DELAY);
    expect(apu.noise.lengthCounter).toBe(254);
  });

  it("triangle の control flag が length counter halt として機能する", () => {
    apu.write(0x4015, 0x04);
    apu.write(0x4008, 0x80); // control=true (halt)
    apu.write(0x400b, 0x08); // length counter = 254
    apu.write(0x4017, 0x00);

    tickN(apu, 14913 + DELAY);
    expect(apu.triangle.lengthCounter).toBe(254);
  });

  it("$4003 書込で envelope start フラグがセットされる", () => {
    apu.write(0x4015, 0x01);
    apu.write(0x4000, 0x30); // constant, halt
    apu.write(0x4003, 0x08);
    expect(apu.pulse1.envelope.start).toBe(true);
  });

  it("$4003 書込で duty position がリセットされる", () => {
    apu.write(0x4015, 0x01);
    apu.write(0x4000, 0x00);
    apu.write(0x4002, 0x01); // timer period
    // タイマーを回して duty position を進める
    for (let i = 0; i < 100; i++) apu.tick();

    apu.write(0x4003, 0x08); // duty position リセット
    expect(apu.pulse1.dutyPos).toBe(0);
  });
});
