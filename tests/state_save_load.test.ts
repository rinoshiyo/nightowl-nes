/**
 * State Save/Load テスト。
 *
 * NesConsole.saveState() / loadState() で全状態を正確に復元できることを検証。
 */

import { describe, it, expect } from "vitest";
import { NesConsole } from "../src/core/console.ts";
import type { Cart, INesHeader } from "../src/core/cart.ts";
import type { NesState } from "../src/core/state.ts";
import { STATE_VERSION } from "../src/core/state.ts";

function makeCart(opts?: { mapper?: number; chrRomSize?: number }): Cart {
  const mapper = opts?.mapper ?? 0;
  const chrSize = opts?.chrRomSize ?? 0;
  const prgRom = new Uint8Array(32 * 1024);
  // RESET ベクタ ($FFFC/$FFFD) → $8000
  prgRom[0x7ffc] = 0x00;
  prgRom[0x7ffd] = 0x80;
  // $8000 に NOP (0xEA) を配置して step が動くようにする
  for (let i = 0; i < 256; i++) {
    prgRom[i] = 0xea;
  }

  const header: INesHeader = {
    prgRomSize: prgRom.length,
    chrRomSize: chrSize,
    mapper,
    mirroring: "vertical",
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

describe("State Save/Load", () => {
  it("saveState が NesState 型のオブジェクトを返す", () => {
    const nes = new NesConsole(makeCart());
    const state = nes.saveState();

    expect(state.version).toBe(STATE_VERSION);
    expect(state.cpu).toBeDefined();
    expect(state.ppu).toBeDefined();
    expect(state.apu).toBeDefined();
    expect(state.bus).toBeDefined();
    expect(state.mapper).toBeDefined();
    expect(state.mapper.id).toBe(0);
  });

  it("saveState の結果が JSON シリアライズ可能", () => {
    const nes = new NesConsole(makeCart());
    nes.stepFrame();
    const state = nes.saveState();

    const json = JSON.stringify(state);
    expect(json).toBeTruthy();

    const parsed = JSON.parse(json) as NesState;
    expect(parsed.version).toBe(STATE_VERSION);
    expect(parsed.cpu.pc).toBe(state.cpu.pc);
  });

  it("saveState → loadState で CPU レジスタが正確に復元される", () => {
    const nes = new NesConsole(makeCart());
    for (let i = 0; i < 100; i++) nes.step();

    const state = nes.saveState();

    // 追加で step を進めて状態を変える
    for (let i = 0; i < 50; i++) nes.step();
    expect(nes.cpu.cycles).not.toBe(state.cpu.cycles);

    nes.loadState(state);
    expect(nes.cpu.a).toBe(state.cpu.a);
    expect(nes.cpu.x).toBe(state.cpu.x);
    expect(nes.cpu.y).toBe(state.cpu.y);
    expect(nes.cpu.sp).toBe(state.cpu.sp);
    expect(nes.cpu.pc).toBe(state.cpu.pc);
    expect(nes.cpu.p).toBe(state.cpu.p);
    expect(nes.cpu.cycles).toBe(state.cpu.cycles);
  });

  it("saveState → loadState で PPU 状態が正確に復元される", () => {
    const nes = new NesConsole(makeCart());
    nes.stepFrame();

    const state = nes.saveState();
    const ppuState = state.ppu;

    nes.stepFrame();
    nes.loadState(state);

    expect(nes.ppu.ctrl).toBe(ppuState.ctrl);
    expect(nes.ppu.mask).toBe(ppuState.mask);
    expect(nes.ppu.status).toBe(ppuState.status);
    expect(nes.ppu.v).toBe(ppuState.v);
    expect(nes.ppu.t).toBe(ppuState.t);
    expect(nes.ppu.dot).toBe(ppuState.dot);
    expect(nes.ppu.scanline).toBe(ppuState.scanline);
  });

  it("saveState → loadState で RAM が正確に復元される", () => {
    const nes = new NesConsole(makeCart());

    // RAM に書き込み
    nes.bus.write(0x0000, 0x42);
    nes.bus.write(0x0100, 0xab);
    nes.bus.write(0x07ff, 0xcd);

    const state = nes.saveState();

    // RAM を書き換え
    nes.bus.write(0x0000, 0x00);
    nes.bus.write(0x0100, 0x00);
    nes.bus.write(0x07ff, 0x00);

    nes.loadState(state);

    expect(nes.bus.read(0x0000)).toBe(0x42);
    expect(nes.bus.read(0x0100)).toBe(0xab);
    expect(nes.bus.read(0x07ff)).toBe(0xcd);
  });

  it("saveState → loadState で PPU VRAM/パレット/OAM が復元される", () => {
    const nes = new NesConsole(makeCart());

    // PPU VRAM に書き込み ($2006 で VRAM アドレスを設定して $2007 で書き込み)
    nes.ppu.write(6, 0x20);
    nes.ppu.write(6, 0x00);
    nes.ppu.write(7, 0x55);

    // OAM に書き込み
    nes.ppu.write(3, 0x00); // OAMADDR
    nes.ppu.write(4, 0xaa); // OAMDATA

    // パレットに書き込み ($2006 で $3F00 を設定して $2007 で書き込み)
    nes.ppu.write(6, 0x3f);
    nes.ppu.write(6, 0x00);
    nes.ppu.write(7, 0x0f);

    const state = nes.saveState();

    // PPU をリセットして状態を破壊
    nes.ppu.reset();

    nes.loadState(state);

    // 復元確認: OAM の最初のバイトが 0xaa であること
    expect(nes.ppu.oam[0]).toBe(0xaa);
  });

  it("saveState → stepFrame → loadState → stepFrame で同じ結果になる", () => {
    const nes = new NesConsole(makeCart());
    nes.stepFrame();

    const state = nes.saveState();

    // 分岐 A: state からさらに 1 フレーム
    nes.loadState(state);
    nes.stepFrame();
    const cpuAfterA = { ...nes.cpu };
    const framebufA = new Uint8Array(nes.ppu.framebuffer);

    // 分岐 B: 同じ state からさらに 1 フレーム
    nes.loadState(state);
    nes.stepFrame();
    const cpuAfterB = { ...nes.cpu };
    const framebufB = new Uint8Array(nes.ppu.framebuffer);

    expect(cpuAfterA.pc).toBe(cpuAfterB.pc);
    expect(cpuAfterA.cycles).toBe(cpuAfterB.cycles);
    expect(cpuAfterA.a).toBe(cpuAfterB.a);
    expect(framebufA).toEqual(framebufB);
  });

  it("mapper 不一致で loadState が例外を投げる", () => {
    const nes0 = new NesConsole(makeCart({ mapper: 0 }));
    const state = nes0.saveState();

    // mapper ID を偽装
    const badState = { ...state, mapper: { ...state.mapper, id: 99 } };

    expect(() => nes0.loadState(badState)).toThrow("Mapper 不一致");
  });

  it("バージョン不一致で loadState が例外を投げる", () => {
    const nes = new NesConsole(makeCart());
    const state = nes.saveState();

    const badState = { ...state, version: 999 };

    expect(() => nes.loadState(badState)).toThrow("ステートバージョン不一致");
  });

  describe("各 Mapper のステートセーブ", () => {
    it("Mapper 0 (NROM) で saveState/loadState が動作する", () => {
      const nes = new NesConsole(makeCart({ mapper: 0 }));
      nes.stepFrame();
      const state = nes.saveState();
      expect(state.mapper.id).toBe(0);
      nes.stepFrame();
      nes.loadState(state);
      expect(nes.cpu.cycles).toBe(state.cpu.cycles);
    });

    it("Mapper 1 (MMC1) で saveState/loadState が動作する", () => {
      const prgRom = new Uint8Array(256 * 1024);
      prgRom[prgRom.length - 4] = 0x00;
      prgRom[prgRom.length - 3] = 0x80;
      for (let i = 0; i < 256; i++) prgRom[i] = 0xea;
      const cart: Cart = {
        header: {
          prgRomSize: prgRom.length, chrRomSize: 0, mapper: 1,
          mirroring: "horizontal", hasBattery: false, hasTrainer: false, fourScreen: false,
        },
        prgRom, chrRom: new Uint8Array(0), trainer: null,
      };
      const nes = new NesConsole(cart);
      nes.stepFrame();
      const state = nes.saveState();
      expect(state.mapper.id).toBe(1);
      nes.stepFrame();
      nes.loadState(state);
      expect(nes.cpu.cycles).toBe(state.cpu.cycles);
    });

    it("Mapper 2 (UxROM) で saveState/loadState が動作する", () => {
      const prgRom = new Uint8Array(128 * 1024);
      prgRom[prgRom.length - 4] = 0x00;
      prgRom[prgRom.length - 3] = 0xc0;
      for (let i = prgRom.length - 0x4000; i < prgRom.length - 0x4000 + 256; i++) prgRom[i] = 0xea;
      const cart: Cart = {
        header: {
          prgRomSize: prgRom.length, chrRomSize: 0, mapper: 2,
          mirroring: "vertical", hasBattery: false, hasTrainer: false, fourScreen: false,
        },
        prgRom, chrRom: new Uint8Array(0), trainer: null,
      };
      const nes = new NesConsole(cart);
      nes.stepFrame();
      const state = nes.saveState();
      expect(state.mapper.id).toBe(2);
      nes.stepFrame();
      nes.loadState(state);
      expect(nes.cpu.cycles).toBe(state.cpu.cycles);
    });

    it("Mapper 4 (MMC3) で saveState/loadState が動作する", () => {
      const prgRom = new Uint8Array(128 * 1024);
      prgRom[prgRom.length - 4] = 0x00;
      prgRom[prgRom.length - 3] = 0x80;
      for (let i = 0; i < 256; i++) prgRom[i] = 0xea;
      const cart: Cart = {
        header: {
          prgRomSize: prgRom.length, chrRomSize: 0, mapper: 4,
          mirroring: "vertical", hasBattery: false, hasTrainer: false, fourScreen: false,
        },
        prgRom, chrRom: new Uint8Array(0), trainer: null,
      };
      const nes = new NesConsole(cart);
      nes.stepFrame();
      const state = nes.saveState();
      expect(state.mapper.id).toBe(4);
      nes.stepFrame();
      nes.loadState(state);
      expect(nes.cpu.cycles).toBe(state.cpu.cycles);
    });

    it("Mapper 7 (AxROM) で saveState/loadState が動作する", () => {
      const prgRom = new Uint8Array(128 * 1024);
      prgRom[prgRom.length - 4] = 0x00;
      prgRom[prgRom.length - 3] = 0x80;
      for (let i = 0; i < 256; i++) prgRom[i] = 0xea;
      const cart: Cart = {
        header: {
          prgRomSize: prgRom.length, chrRomSize: 0, mapper: 7,
          mirroring: "single-lower", hasBattery: false, hasTrainer: false, fourScreen: false,
        },
        prgRom, chrRom: new Uint8Array(0), trainer: null,
      };
      const nes = new NesConsole(cart);
      nes.stepFrame();
      const state = nes.saveState();
      expect(state.mapper.id).toBe(7);
      nes.stepFrame();
      nes.loadState(state);
      expect(nes.cpu.cycles).toBe(state.cpu.cycles);
    });
  });

  it("APU チャンネル状態が正確に復元される", () => {
    const nes = new NesConsole(makeCart());

    // APU レジスタに書き込んでチャンネル状態を変える
    nes.bus.write(0x4015, 0x0f); // 全チャンネル有効
    nes.bus.write(0x4000, 0xbf); // Pulse 1: duty=2, halt, const vol, vol=15
    nes.bus.write(0x4002, 0x70); // Pulse 1: timer low
    nes.bus.write(0x4003, 0x08); // Pulse 1: length + timer high

    for (let i = 0; i < 100; i++) nes.step();

    const state = nes.saveState();

    // APU 状態を破壊
    nes.bus.write(0x4015, 0x00); // 全チャンネル無効
    for (let i = 0; i < 100; i++) nes.step();

    nes.loadState(state);

    expect(nes.apu.pulse1.enabled).toBe(state.apu.pulse1.enabled);
    expect(nes.apu.pulse1.duty).toBe(state.apu.pulse1.duty);
    expect(nes.apu.pulse1.timerPeriod).toBe(state.apu.pulse1.timerPeriod);
    expect(nes.apu.pulse1.lengthCounter).toBe(state.apu.pulse1.lengthCounter);
  });

  it("複数回の save/load が安定して動作する", () => {
    const nes = new NesConsole(makeCart());
    const states: NesState[] = [];

    for (let i = 0; i < 5; i++) {
      nes.stepFrame();
      states.push(nes.saveState());
    }

    // 最初の状態に戻る
    nes.loadState(states[0]!);
    expect(nes.cpu.cycles).toBe(states[0]!.cpu.cycles);

    // 最後の状態に戻る
    nes.loadState(states[4]!);
    expect(nes.cpu.cycles).toBe(states[4]!.cpu.cycles);

    // 2番目の状態に戻って再び進める
    nes.loadState(states[1]!);
    nes.stepFrame();
    const afterReload = nes.saveState();
    expect(afterReload.cpu.cycles).toBe(states[2]!.cpu.cycles);
  });
});
