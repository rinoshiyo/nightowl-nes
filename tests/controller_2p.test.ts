import { describe, expect, it } from "vitest";

import { Apu } from "../src/core/apu.ts";
import type { Cart } from "../src/core/cart.ts";
import { Button, Controller } from "../src/core/controller.ts";
import { createMapper } from "../src/core/mappers/index.ts";
import { NesBus } from "../src/core/nes-bus.ts";
import { Ppu } from "../src/core/ppu.ts";

function makeDummyCart(): Cart {
  const prgRom = new Uint8Array(0x4000);
  return {
    header: {
      prgRomSize: 0x4000,
      chrRomSize: 0,
      mapper: 0,
      mirroring: "horizontal",
      hasBattery: false,
      hasTrainer: false,
      fourScreen: false,
    },
    prgRom,
    chrRom: new Uint8Array(0),
    trainer: null,
  };
}

function makeBus(): { bus: NesBus; ctrl1: Controller; ctrl2: Controller } {
  const ctrl1 = new Controller();
  const ctrl2 = new Controller();
  const bus = new NesBus(new Ppu(), createMapper(makeDummyCart()), ctrl1, ctrl2, new Apu());
  return { bus, ctrl1, ctrl2 };
}

/** $4016 write でストローブ→ラッチ後、指定アドレスから 8 ビット読む */
function latchAndRead(bus: NesBus, addr: number): number[] {
  bus.write(0x4016, 1);
  bus.write(0x4016, 0);
  const bits: number[] = [];
  for (let i = 0; i < 8; i++) {
    bits.push(bus.read(addr));
  }
  return bits;
}

describe("2P コントローラ — NesBus 統合", () => {
  it("$4017 read で 2P コントローラの状態が読める", () => {
    const { bus, ctrl2 } = makeBus();
    ctrl2.press(Button.A);
    const bits = latchAndRead(bus, 0x4017);
    expect(bits).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("$4016 read は 1P、$4017 read は 2P (独立)", () => {
    const { bus, ctrl1, ctrl2 } = makeBus();
    ctrl1.press(Button.A);
    ctrl2.press(Button.B);
    const bits1p = latchAndRead(bus, 0x4016);
    const bits2p = latchAndRead(bus, 0x4017);
    expect(bits1p).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(bits2p).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it("$4016 write のストローブが 1P/2P 両方に効く", () => {
    const { bus, ctrl1, ctrl2 } = makeBus();
    ctrl1.press(Button.Right);
    ctrl2.press(Button.Left);

    bus.write(0x4016, 1);
    bus.write(0x4016, 0);

    const bits1p: number[] = [];
    const bits2p: number[] = [];
    for (let i = 0; i < 8; i++) {
      bits1p.push(bus.read(0x4016));
      bits2p.push(bus.read(0x4017));
    }
    expect(bits1p).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(bits2p).toEqual([0, 0, 0, 0, 0, 0, 1, 0]);
  });

  it("strobe 中は $4017 も A ボタンの状態を返し続ける", () => {
    const { bus, ctrl2 } = makeBus();
    ctrl2.press(Button.A);
    bus.write(0x4016, 1);
    expect(bus.read(0x4017)).toBe(1);
    expect(bus.read(0x4017)).toBe(1);
    expect(bus.read(0x4017)).toBe(1);
  });

  it("2P コントローラで複数ボタン同時押し", () => {
    const { bus, ctrl2 } = makeBus();
    ctrl2.press(Button.A);
    ctrl2.press(Button.B);
    ctrl2.press(Button.Start);
    const bits = latchAndRead(bus, 0x4017);
    expect(bits).toEqual([1, 1, 0, 1, 0, 0, 0, 0]);
  });

  it("2P の 9 回目以降の read は 1 を返す", () => {
    const { bus, ctrl2 } = makeBus();
    ctrl2.setButtons(0x00);
    bus.write(0x4016, 1);
    bus.write(0x4016, 0);
    const bits: number[] = [];
    for (let i = 0; i < 12; i++) {
      bits.push(bus.read(0x4017));
    }
    expect(bits.slice(0, 8)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(bits.slice(8)).toEqual([1, 1, 1, 1]);
  });

  it("再ラッチで 2P の新しいボタン状態を取得できる", () => {
    const { bus, ctrl2 } = makeBus();
    ctrl2.press(Button.A);
    const bits1 = latchAndRead(bus, 0x4017);
    expect(bits1[0]).toBe(1);

    ctrl2.release(Button.A);
    ctrl2.press(Button.Up);
    const bits2 = latchAndRead(bus, 0x4017);
    expect(bits2[0]).toBe(0);
    expect(bits2[4]).toBe(1);
  });
});

describe("$4017 read/write の分離 (read=2P コントローラ, write=APU)", () => {
  it("$4017 write は APU フレームカウンタに届き、2P コントローラには影響しない", () => {
    const { bus, ctrl2 } = makeBus();
    ctrl2.press(Button.A);
    ctrl2.press(Button.B);

    // $4017 write = APU フレームカウンタ設定 (bit7: IRQ inhibit)
    bus.write(0x4017, 0xc0);

    // 2P コントローラのボタン状態は変わっていないことを確認
    const bits = latchAndRead(bus, 0x4017);
    expect(bits).toEqual([1, 1, 0, 0, 0, 0, 0, 0]);
  });

  it("$4017 write の後でも $4017 read は正常に 2P のシフトレジスタを返す", () => {
    const { bus, ctrl2 } = makeBus();
    ctrl2.setButtons(0b10101010);

    bus.write(0x4017, 0x40);

    const bits = latchAndRead(bus, 0x4017);
    expect(bits).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
  });
});

describe("2P コントローラ — NesConsole 統合", () => {
  it("NesConsole.controller2 が存在し NesBus 経由で動作する", async () => {
    const { NesConsole } = await import("../src/core/console.ts");
    const { parseINes } = await import("../src/core/cart.ts");

    const header = new Uint8Array(16);
    header[0] = 0x4e; // N
    header[1] = 0x45; // E
    header[2] = 0x53; // S
    header[3] = 0x1a; // EOF
    header[4] = 1;    // 1 × 16KB PRG
    header[5] = 1;    // 1 × 8KB CHR

    const prg = new Uint8Array(0x4000);
    // RESET ベクタ → $8000
    prg[0x3ffc] = 0x00;
    prg[0x3ffd] = 0x80;
    // $8000: JMP $8000 (無限ループ)
    prg[0] = 0x4c;
    prg[1] = 0x00;
    prg[2] = 0x80;

    const chr = new Uint8Array(0x2000);
    const rom = new Uint8Array(header.length + prg.length + chr.length);
    rom.set(header);
    rom.set(prg, 16);
    rom.set(chr, 16 + prg.length);

    const cart = parseINes(rom);
    const console = new NesConsole(cart);

    console.controller2.press(Button.Start);
    console.bus.write(0x4016, 1);
    console.bus.write(0x4016, 0);
    const bit = console.bus.read(0x4017);
    expect(bit).toBe(0);
    // Start は bit3
    console.bus.write(0x4016, 1);
    console.bus.write(0x4016, 0);
    const bits: number[] = [];
    for (let i = 0; i < 8; i++) {
      bits.push(console.bus.read(0x4017));
    }
    expect(bits[3]).toBe(1);
  });
});
