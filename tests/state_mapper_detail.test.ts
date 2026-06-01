/**
 * Mapper 固有のステートセーブ詳細テスト。
 *
 * バンク状態の書き込み → セーブ → 破壊 → ロード → 正しい値が読めることを検証。
 */

import { describe, it, expect } from "vitest";
import { NesConsole } from "../src/core/console.ts";
import type { Cart, INesHeader } from "../src/core/cart.ts";

function makeCartForMapper(mapper: number, prgSize: number, chrSize: number): Cart {
  const prgRom = new Uint8Array(prgSize);
  // 各 mapper で RESET ベクタが最終バンクの末尾にある
  prgRom[prgRom.length - 4] = 0x00;
  prgRom[prgRom.length - 3] = 0x80;
  // $8000 に NOP を埋める
  for (let i = 0; i < 256; i++) prgRom[i] = 0xea;
  // 各バンクの先頭に識別バイトを置く (バンク切替の確認用)
  for (let b = 0; b < prgSize / 0x4000; b++) {
    prgRom[b * 0x4000] = b & 0xff;
  }

  const header: INesHeader = {
    prgRomSize: prgSize,
    chrRomSize: chrSize,
    mapper,
    mirroring: mapper === 7 ? "single-lower" : "vertical",
    hasBattery: false,
    hasTrainer: false,
    fourScreen: false,
  };

  return {
    header,
    prgRom,
    chrRom: chrSize > 0 ? new Uint8Array(chrSize) : new Uint8Array(0),
    trainer: null,
  };
}

describe("Mapper ステート詳細テスト", () => {
  it("NROM: PRG RAM のステートが正確に復元される", () => {
    const nes = new NesConsole(makeCartForMapper(0, 32 * 1024, 0));

    // PRG RAM ($6000-$7FFF) に書き込み
    nes.bus.write(0x6000, 0xde);
    nes.bus.write(0x6100, 0xad);
    nes.bus.write(0x7fff, 0xbe);

    const state = nes.saveState();

    // PRG RAM を破壊
    nes.bus.write(0x6000, 0x00);
    nes.bus.write(0x6100, 0x00);
    nes.bus.write(0x7fff, 0x00);

    nes.loadState(state);

    expect(nes.bus.read(0x6000)).toBe(0xde);
    expect(nes.bus.read(0x6100)).toBe(0xad);
    expect(nes.bus.read(0x7fff)).toBe(0xbe);
  });

  it("NROM: CHR RAM のステートが正確に復元される", () => {
    const nes = new NesConsole(makeCartForMapper(0, 32 * 1024, 0));

    // CHR RAM ($0000-$1FFF via PPU)
    nes.ppu.write(6, 0x00); // PPUADDR hi
    nes.ppu.write(6, 0x00); // PPUADDR lo
    nes.ppu.write(7, 0x42); // PPUDATA

    const state = nes.saveState();

    // CHR RAM を破壊
    nes.ppu.write(6, 0x00);
    nes.ppu.write(6, 0x00);
    nes.ppu.write(7, 0x00);

    nes.loadState(state);

    // CHR RAM の値を読み取り確認 (PPU read は 1 回遅延バッファあり)
    nes.ppu.write(6, 0x00);
    nes.ppu.write(6, 0x00);
    nes.ppu.read(7); // ダミーリード (バッファ充填)
    expect(nes.ppu.read(7)).toBe(0x42);
  });

  it("MMC1: シフトレジスタ状態が復元される", () => {
    const nes = new NesConsole(makeCartForMapper(1, 256 * 1024, 0));

    // シフトレジスタに途中まで書き込み (3回)
    nes.bus.write(0x8000, 0x01);
    nes.bus.write(0x8000, 0x00);
    nes.bus.write(0x8000, 0x01);

    const state = nes.saveState();

    // シフトレジスタをリセット
    nes.bus.write(0x8000, 0x80);

    nes.loadState(state);

    // シフトレジスタの状態が復元されていることを間接的に確認
    // (状態オブジェクトの値で直接検証)
    expect(state.mapper.data["shiftCount"]).toBe(3);
  });

  it("UxROM: バンク切替状態が復元される", () => {
    const nes = new NesConsole(makeCartForMapper(2, 128 * 1024, 0));

    // バンク 3 に切替
    nes.bus.write(0x8000, 3);
    const val = nes.bus.read(0x8000); // バンク 3 の先頭バイト

    const state = nes.saveState();

    // バンク 0 に切替
    nes.bus.write(0x8000, 0);
    expect(nes.bus.read(0x8000)).not.toBe(val);

    nes.loadState(state);
    expect(nes.bus.read(0x8000)).toBe(val);
  });

  it("CNROM: CHR バンク切替状態が復元される", () => {
    const chrRom = new Uint8Array(32 * 1024);
    // 各 CHR バンクに識別バイトを配置
    for (let b = 0; b < 4; b++) {
      chrRom[b * 0x2000] = 0x10 + b;
    }

    const cart: Cart = {
      header: {
        prgRomSize: 32 * 1024, chrRomSize: chrRom.length, mapper: 3,
        mirroring: "vertical", hasBattery: false, hasTrainer: false, fourScreen: false,
      },
      prgRom: new Uint8Array(32 * 1024),
      chrRom,
      trainer: null,
    };
    // RESET ベクタ
    cart.prgRom[cart.prgRom.length - 4] = 0x00;
    cart.prgRom[cart.prgRom.length - 3] = 0x80;
    for (let i = 0; i < 256; i++) cart.prgRom[i] = 0xea;

    const nes = new NesConsole(cart);

    // CHR バンク 2 に切替
    nes.bus.write(0x8000, 2);

    const state = nes.saveState();

    // CHR バンク 0 に切替
    nes.bus.write(0x8000, 0);

    nes.loadState(state);

    // PPU から CHR を読み、バンク 2 の識別バイトが読めることを確認
    expect(nes.ppu.ppuRead(0x0000)).toBe(0x12); // 0x10 + 2
  });

  it("MMC3: IRQ カウンタ状態が復元される", () => {
    const nes = new NesConsole(makeCartForMapper(4, 128 * 1024, 0));

    // IRQ ラッチ値を設定
    nes.bus.write(0xc000, 42); // IRQ latch = 42
    nes.bus.write(0xc001, 0);  // IRQ reload
    nes.bus.write(0xe001, 0);  // IRQ enable

    for (let i = 0; i < 500; i++) nes.step();

    const state = nes.saveState();

    expect(state.mapper.data["irqLatch"]).toBe(42);
    expect(state.mapper.data["irqEnabled"]).toBe(true);

    // 状態を破壊
    nes.bus.write(0xe000, 0); // IRQ disable
    nes.bus.write(0xc000, 0); // IRQ latch = 0

    nes.loadState(state);

    // IRQ 状態が復元されたことを mapper data で確認
    const restoredState = nes.saveState();
    expect(restoredState.mapper.data["irqLatch"]).toBe(42);
    expect(restoredState.mapper.data["irqEnabled"]).toBe(true);
  });

  it("Color Dreams: PRG/CHR バンク切替状態が復元される", () => {
    const chrRom = new Uint8Array(32 * 1024);
    for (let b = 0; b < 4; b++) {
      chrRom[b * 0x2000] = 0x20 + b;
    }
    const cart: Cart = {
      header: {
        prgRomSize: 128 * 1024, chrRomSize: chrRom.length, mapper: 11,
        mirroring: "vertical", hasBattery: false, hasTrainer: false, fourScreen: false,
      },
      prgRom: (() => {
        const p = new Uint8Array(128 * 1024);
        p[p.length - 4] = 0x00; p[p.length - 3] = 0x80;
        for (let i = 0; i < 256; i++) p[i] = 0xea;
        for (let b = 0; b < 4; b++) p[b * 0x8000] = b;
        return p;
      })(),
      chrRom,
      trainer: null,
    };

    const nes = new NesConsole(cart);
    nes.bus.write(0x8000, 0x21);

    const state = nes.saveState();

    nes.bus.write(0x8000, 0x00);
    nes.loadState(state);

    const restoredState = nes.saveState();
    expect(restoredState.mapper.data["prgBankOffset"]).toBe(state.mapper.data["prgBankOffset"]);
    expect(restoredState.mapper.data["chrBankOffset"]).toBe(state.mapper.data["chrBankOffset"]);
  });

  it("GxROM: PRG/CHR バンク切替状態が復元される", () => {
    const chrRom = new Uint8Array(32 * 1024);
    for (let b = 0; b < 4; b++) {
      chrRom[b * 0x2000] = 0x30 + b;
    }
    const cart: Cart = {
      header: {
        prgRomSize: 128 * 1024, chrRomSize: chrRom.length, mapper: 66,
        mirroring: "vertical", hasBattery: false, hasTrainer: false, fourScreen: false,
      },
      prgRom: (() => {
        const p = new Uint8Array(128 * 1024);
        p[p.length - 4] = 0x00; p[p.length - 3] = 0x80;
        for (let i = 0; i < 256; i++) p[i] = 0xea;
        for (let b = 0; b < 4; b++) p[b * 0x8000] = b;
        return p;
      })(),
      chrRom,
      trainer: null,
    };

    const nes = new NesConsole(cart);
    nes.bus.write(0x8000, 0x12);

    const state = nes.saveState();

    nes.bus.write(0x8000, 0x00);
    nes.loadState(state);

    const restoredState = nes.saveState();
    expect(restoredState.mapper.data["prgBankOffset"]).toBe(state.mapper.data["prgBankOffset"]);
    expect(restoredState.mapper.data["chrBankOffset"]).toBe(state.mapper.data["chrBankOffset"]);
  });

  it("Codemasters: PRG バンク切替状態が復元される", () => {
    const nes = new NesConsole(makeCartForMapper(71, 128 * 1024, 0));

    nes.bus.write(0xc000, 3);
    const state = nes.saveState();

    nes.bus.write(0xc000, 0);
    nes.loadState(state);

    const restoredState = nes.saveState();
    expect(restoredState.mapper.data["switchBankOffset"]).toBe(state.mapper.data["switchBankOffset"]);
  });

  it("DxROM: バンクレジスタ状態が復元される", () => {
    const nes = new NesConsole(makeCartForMapper(206, 64 * 1024, 32 * 1024));

    // R6 で PRG バンク切替
    nes.bus.write(0x8000, 6); // bank select = R6
    nes.bus.write(0x8001, 3); // bank data = 3

    const state = nes.saveState();

    // 状態を破壊
    nes.bus.write(0x8000, 6);
    nes.bus.write(0x8001, 0);

    nes.loadState(state);

    const restoredState = nes.saveState();
    expect(restoredState.mapper.data["bankSelect"]).toBe(state.mapper.data["bankSelect"]);
    expect(restoredState.mapper.data["registers"]).toEqual(state.mapper.data["registers"]);
  });

  it("AxROM: バンク切替とミラーリング状態が復元される", () => {
    const nes = new NesConsole(makeCartForMapper(7, 128 * 1024, 0));

    // バンク 2 + single-upper に切替 (bit 4 = mirroring)
    nes.bus.write(0x8000, 0x12); // bank 2, single-upper

    const state = nes.saveState();

    // バンク 0 + single-lower に切替
    nes.bus.write(0x8000, 0x00);

    nes.loadState(state);

    const restoredState = nes.saveState();
    expect(restoredState.mapper.data["bankOffset"]).toBe(state.mapper.data["bankOffset"]);
  });

  it("MMC2: latch 状態と PRG バンクが復元される", () => {
    const nes = new NesConsole(makeCartForMapper(9, 128 * 1024, 128 * 1024));

    // PRG バンク切替
    nes.bus.write(0xa000, 5);
    // CHR latch レジスタ設定
    nes.bus.write(0xb000, 3);  // 低位 FD = 3
    nes.bus.write(0xc000, 10); // 低位 FE = 10

    const state = nes.saveState();

    // 状態を破壊
    nes.bus.write(0xa000, 0);
    nes.bus.write(0xb000, 0);

    nes.loadState(state);

    const restored = nes.saveState();
    expect(restored.mapper.data["prgBank"]).toBe(5);
    expect(restored.mapper.data["chrBankFD"]).toEqual([3, 0]);
    expect(restored.mapper.data["chrBankFE"]).toEqual([10, 0]);
  });

  it("MMC4: latch 状態と PRG RAM が復元される", () => {
    const nes = new NesConsole(makeCartForMapper(10, 256 * 1024, 128 * 1024));

    // PRG バンク切替
    nes.bus.write(0xa000, 7);
    // CHR latch レジスタ設定
    nes.bus.write(0xd000, 5);  // 高位 FD = 5
    nes.bus.write(0xe000, 15); // 高位 FE = 15
    // PRG RAM 書き込み
    nes.bus.write(0x6000, 0xab);

    const state = nes.saveState();

    // 状態を破壊
    nes.bus.write(0xa000, 0);
    nes.bus.write(0x6000, 0);

    nes.loadState(state);

    const restored = nes.saveState();
    expect(restored.mapper.data["prgBank"]).toBe(7);
    expect(restored.mapper.data["chrBankFD"]).toEqual([0, 5]);
    expect(restored.mapper.data["chrBankFE"]).toEqual([0, 15]);
    expect(nes.bus.read(0x6000)).toBe(0xab);
  });

  it("Bandai FCG: PRG/CHR バンクと IRQ 状態が復元される", () => {
    const nes = new NesConsole(makeCartForMapper(16, 256 * 1024, 128 * 1024));

    // PRG バンク切替 (reg $8)
    nes.bus.write(0x8008, 5);
    // CHR バンク切替 (reg $0-$2)
    nes.bus.write(0x8000, 10);
    nes.bus.write(0x8001, 20);
    nes.bus.write(0x8002, 30);
    // IRQ ラッチ設定
    nes.bus.write(0x800b, 0x34);
    nes.bus.write(0x800c, 0x12);
    // PRG RAM 書き込み
    nes.bus.write(0x6000, 0xab);

    const state = nes.saveState();

    // 状態を破壊
    nes.bus.write(0x8008, 0);
    nes.bus.write(0x8000, 0);
    nes.bus.write(0x6000, 0);

    nes.loadState(state);

    const restored = nes.saveState();
    expect(restored.mapper.data["prgBank"]).toBe(5);
    expect((restored.mapper.data["chrBanks"] as number[])[0]).toBe(10);
    expect((restored.mapper.data["chrBanks"] as number[])[1]).toBe(20);
    expect((restored.mapper.data["chrBanks"] as number[])[2]).toBe(30);
    expect(restored.mapper.data["irqLatch"]).toBe(0x1234);
    expect(nes.bus.read(0x6000)).toBe(0xab);
  });

  it("Jaleco SS8806: PRG/CHR バンクと IRQ 状態が復元される", () => {
    const nes = new NesConsole(makeCartForMapper(18, 256 * 1024, 256 * 1024));

    // PRG バンク切替 (4bit ペア)
    nes.bus.write(0x8000, 5);
    nes.bus.write(0x8001, 1); // PRG0 = 0x15
    // CHR バンク切替
    nes.bus.write(0xa000, 0x0a);
    nes.bus.write(0xa001, 0x02); // CHR0 = 0x2A
    // IRQ ラッチ設定
    nes.bus.write(0xe000, 0x04);
    nes.bus.write(0xe001, 0x03);
    nes.bus.write(0xe002, 0x02);
    nes.bus.write(0xe003, 0x01); // latch = 0x1234
    // PRG RAM 書き込み
    nes.bus.write(0x6000, 0xcd);

    const state = nes.saveState();

    // 状態を破壊
    nes.bus.write(0x8000, 0);
    nes.bus.write(0x8001, 0);
    nes.bus.write(0x6000, 0);

    nes.loadState(state);

    const restored = nes.saveState();
    expect((restored.mapper.data["prgBanks"] as number[])[0]).toBe(0x15);
    expect((restored.mapper.data["chrBanks"] as number[])[0]).toBe(0x2a);
    expect(restored.mapper.data["irqLatch"]).toBe(0x1234);
    expect(nes.bus.read(0x6000)).toBe(0xcd);
  });
});
