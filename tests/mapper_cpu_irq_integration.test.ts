/**
 * CPU cycle ベース IRQ mapper の統合テスト。
 * NesConsole.step() 経由で cpuCycleTick が呼ばれ IRQ が発生することを検証。
 */

import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { NesConsole } from "../src/core/console.ts";
import type { MapperBandaiFcg } from "../src/core/mappers/bandai-fcg.ts";
import type { MapperJalecoSs8806 } from "../src/core/mappers/jaleco-ss8806.ts";

function makeConsoleCart(mapperId: number): Cart {
  const prgSize = 0x40000;
  const chrSize = 0x20000;
  const prgRom = new Uint8Array(prgSize);
  const chrRom = new Uint8Array(chrSize);

  // $8000 から NOP × 256 を埋める
  for (let i = 0; i < prgSize; i++) prgRom[i] = 0xea; // NOP
  // リセットベクタ ($FFFC) → $8000
  prgRom[prgSize - 4] = 0x00;
  prgRom[prgSize - 3] = 0x80;

  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: chrSize,
      mapper: mapperId,
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

describe("CPU cycle IRQ 統合テスト", () => {
  it("Mapper 16: NesConsole.step() 経由で IRQ が発生する", () => {
    const nes = new NesConsole(makeConsoleCart(16));
    const mapper = nes.mapper as MapperBandaiFcg;

    // IRQ を 10 CPU cycle 後に設定
    nes.bus.write(0x800b, 10); // latch low = 10
    nes.bus.write(0x800c, 0);  // latch high = 0
    nes.bus.write(0x800a, 1);  // enable + load

    expect(mapper.irqPending).toBe(false);

    // step を繰り返してサイクルを消費
    let totalCycles = 0;
    while (totalCycles < 10 && !mapper.irqPending) {
      totalCycles += nes.step();
    }

    // 10 cycle 以内に IRQ が発生していること
    expect(mapper.irqPending).toBe(true);
  });

  it("Mapper 18: NesConsole.step() 経由で IRQ が発生する", () => {
    const nes = new NesConsole(makeConsoleCart(18));
    const mapper = nes.mapper as MapperJalecoSs8806;

    // IRQ を 10 CPU cycle 後に設定
    nes.bus.write(0xe000, 0x0a); // latch bits [3:0] = 0xA
    nes.bus.write(0xe001, 0x00); // latch bits [7:4] = 0
    nes.bus.write(0xe002, 0x00); // latch bits [11:8] = 0
    nes.bus.write(0xe003, 0x00); // latch bits [15:12] = 0
    nes.bus.write(0xf001, 0x01); // enable
    nes.bus.write(0xf000, 0x00); // reload

    expect(mapper.irqPending).toBe(false);

    let totalCycles = 0;
    while (totalCycles < 10 && !mapper.irqPending) {
      totalCycles += nes.step();
    }

    expect(mapper.irqPending).toBe(true);
  });

  it("Mapper 16: CPU irqPending に mapper IRQ が反映される", () => {
    const nes = new NesConsole(makeConsoleCart(16));

    // IRQ を 5 cycle 後に設定
    nes.bus.write(0x800b, 5);
    nes.bus.write(0x800c, 0);
    nes.bus.write(0x800a, 1);

    // I フラグクリア (CLI: $58)
    const cart = makeConsoleCart(16);
    cart.prgRom[0] = 0x58; // CLI
    const nes2 = new NesConsole(cart);
    nes2.step(); // CLI 実行

    // IRQ 設定
    nes2.bus.write(0x800b, 3);
    nes2.bus.write(0x800c, 0);
    nes2.bus.write(0x800a, 1);

    let totalCycles = 0;
    for (let i = 0; i < 10; i++) {
      totalCycles += nes2.step();
      if (totalCycles >= 3) break;
    }

    // mapper irqPending が CPU に伝搬
    expect(nes2.mapper.irqPending).toBe(true);
  });
});
