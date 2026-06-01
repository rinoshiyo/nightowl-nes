/**
 * Mapper 19 (Namco 163) 拡張音源の APU ミキシング統合テスト。
 *
 * NesConsole 経由で拡張音源が APU のサンプルバッファに合算されることを検証。
 */

import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { NesConsole } from "../src/core/console.ts";

function makeConsoleCart(): Cart {
  const prgSize = 0x40000;
  const chrSize = 0x40000;
  const prgRom = new Uint8Array(prgSize);
  const chrRom = new Uint8Array(chrSize);

  // NOP で埋める
  for (let i = 0; i < prgSize; i++) prgRom[i] = 0xea;
  // リセットベクタ → $8000
  prgRom[prgSize - 4] = 0x00;
  prgRom[prgSize - 3] = 0x80;

  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: chrSize,
      mapper: 19,
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

describe("Namco 163 拡張音源 APU 統合テスト", () => {
  it("拡張音源コールバックが APU に接続されている", () => {
    const nes = new NesConsole(makeConsoleCart());
    expect(nes.apu.expansionAudioCallback).toBeDefined();
  });

  it("拡張音源有効時に APU バッファにサンプルが出力される", () => {
    const nes = new NesConsole(makeConsoleCart());

    // サウンド有効
    nes.bus.write(0xe000, 0x00);

    // ch7 に高速・高音量の設定を書き込む
    nes.bus.write(0xf800, 0x80 | 0x78);
    nes.bus.write(0x4800, 0x00); // freq lo
    nes.bus.write(0x4800, 0x00); // phase lo
    nes.bus.write(0x4800, 0x00); // freq mid
    nes.bus.write(0x4800, 0x00); // phase mid
    nes.bus.write(0x4800, 0x03); // freq hi = 0x30000
    nes.bus.write(0x4800, 0x00); // phase hi
    nes.bus.write(0x4800, 0x00); // wave addr
    nes.bus.write(0x4800, 0x0f); // volume=15, 1ch

    // 波形テーブルに非中央値のサンプルを書く
    nes.bus.write(0xf800, 0x80 | 0x00);
    for (let i = 0; i < 32; i++) {
      nes.bus.write(0x4800, 0xff); // 全サンプル = 15
    }

    // 数フレーム実行してサンプルを溜める
    for (let i = 0; i < 3; i++) {
      nes.stepFrame();
    }

    // APU からサンプルを読み出し
    const buf = new Float32Array(4096);
    const count = nes.apu.readSamples(buf);
    expect(count).toBeGreaterThan(0);

    // 全サンプルが有限の数値であること
    for (let i = 0; i < count; i++) {
      expect(Number.isFinite(buf[i])).toBe(true);
    }
  });

  it("NesBus 経由で内部 RAM の読み書きが動作する", () => {
    const nes = new NesConsole(makeConsoleCart());

    // アドレスポート設定
    nes.bus.write(0xf800, 0x80 | 0x10); // addr=16, auto-increment
    nes.bus.write(0x4800, 0xab);
    nes.bus.write(0x4800, 0xcd);

    // 読み戻し
    nes.bus.write(0xf800, 0x80 | 0x10);
    expect(nes.bus.read(0x4800)).toBe(0xab);
    expect(nes.bus.read(0x4800)).toBe(0xcd);
  });

  it("NesBus 経由で IRQ レジスタの読み書きが動作する", () => {
    const nes = new NesConsole(makeConsoleCart());

    nes.bus.write(0x5000, 0x34);
    nes.bus.write(0x5800, 0x12);

    expect(nes.bus.read(0x5000)).toBe(0x34);
    expect(nes.bus.read(0x5800)).toBe(0x12);
  });
});
