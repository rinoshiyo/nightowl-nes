import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperSunsoftFme7 } from "../src/core/mappers/sunsoft-fme7.ts";
import { ApuMixer } from "../src/core/apu-mixer.ts";

function makeCart(): Cart {
  const prgSize = 0x40000;
  const chrSize = 0x20000;

  const prgRom = new Uint8Array(prgSize);
  const chrRom = new Uint8Array(chrSize);

  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: chrSize,
      mapper: 69,
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

function writeAudio(mapper: MapperSunsoftFme7, reg: number, value: number): void {
  mapper.writePrg(0xc000, reg);
  mapper.writePrg(0xe000, value);
}

describe("Sunsoft 5B APU ミキシング統合テスト", () => {
  it("拡張音源が ApuMixer に expansion として加算される", () => {
    const mapper = new MapperSunsoftFme7(makeCart());
    const mixer = new ApuMixer(44100);

    // ch A を有効化
    writeAudio(mapper, 0x00, 50);
    writeAudio(mapper, 0x01, 0);
    writeAudio(mapper, 0x07, 0x38);
    writeAudio(mapper, 0x08, 15);

    // 十分 tick して音源を安定させる
    for (let i = 0; i < 5000; i++) {
      mapper.cpuCycleTick!();
    }

    const expansion = mapper.audioOutput!();
    // ミキサーに拡張音源 0 で処理
    const withoutExp = mixer.process(0, 0, 0, 0, 0, 0);
    // ミキサーに拡張音源あり
    const withExp = mixer.process(0, 0, 0, 0, 0, expansion);

    // 拡張音源が非ゼロならミキシング結果が変わる
    if (expansion !== 0) {
      expect(withExp).not.toBe(withoutExp);
    }
  });

  it("拡張音源の出力値が APU と同スケールでバランスが取れている", () => {
    const mapper = new MapperSunsoftFme7(makeCart());

    // 3ch 全力
    for (let ch = 0; ch < 3; ch++) {
      writeAudio(mapper, ch * 2, 1);
      writeAudio(mapper, ch * 2 + 1, 0);
      writeAudio(mapper, 0x08 + ch, 15);
    }
    writeAudio(mapper, 0x07, 0x38);

    let maxOut = 0;
    for (let i = 0; i < 10000; i++) {
      mapper.cpuCycleTick!();
      maxOut = Math.max(maxOut, Math.abs(mapper.audioOutput!()));
    }

    // 最大出力が APU の範囲 (0-1) に収まっている
    expect(maxOut).toBeLessThanOrEqual(1);
    // ある程度の音量がある (小さすぎない)
    expect(maxOut).toBeGreaterThan(0.01);
  });

  it("ApuMixer に通してもクリッピングしない", () => {
    const mapper = new MapperSunsoftFme7(makeCart());
    const mixer = new ApuMixer(44100);

    for (let ch = 0; ch < 3; ch++) {
      writeAudio(mapper, ch * 2, 1);
      writeAudio(mapper, ch * 2 + 1, 0);
      writeAudio(mapper, 0x08 + ch, 15);
    }
    writeAudio(mapper, 0x07, 0x38);

    for (let i = 0; i < 10000; i++) {
      mapper.cpuCycleTick!();
      const exp = mapper.audioOutput!();
      // APU 最大出力 + 拡張音源
      const mixed = mixer.process(15, 15, 15, 15, 0, exp);
      expect(mixed).toBeGreaterThanOrEqual(-1);
      expect(mixed).toBeLessThanOrEqual(1);
    }
  });
});
