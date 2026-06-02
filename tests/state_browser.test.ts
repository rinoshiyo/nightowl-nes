/**
 * ステートセーブ/ロードのブラウザ永続化関数テスト。
 *
 * save-manager.ts の saveState/loadState/hasState をテスト。
 * localStorage のモックを使用。
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { NesState } from "../src/core/state.ts";
import { STATE_VERSION } from "../src/core/state.ts";

const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
  get length() { return store.size; },
  key: (_index: number) => null as string | null,
};
(globalThis as Record<string, unknown>)["localStorage"] = localStorageMock;

// save-manager.ts を localStorage モック設定後にインポート
const { saveState, loadState, hasState } = await import("../src/browser/save-manager.ts");

function makeMinimalState(overrides?: Partial<NesState>): NesState {
  return {
    version: STATE_VERSION,
    cpu: { a: 0x42, x: 0x10, y: 0x20, sp: 0xfd, pc: 0x8000, p: 0x24, cycles: 1234, nmiPending: false, irqPending: false },
    ppu: {
      mirroring: "vertical",
      ctrl: 0, mask: 0, status: 0, oamAddr: 0, ioLatch: 0,
      v: 0, t: 0, x: 0, w: false, readBuffer: 0,
      dot: 0, scanline: 0, frameComplete: false, oddFrame: false, nmiDelay: 0,
      ioLatchDecay: [0,0,0,0,0,0,0,0],
      bgNametable: 0, bgAttribute: 0, bgPatternLo: 0, bgPatternHi: 0,
      bgFetchedCol: -1, bgColorIdx: 0,
      slInitCoarseX: 0, slInitNtX: 0,
      spriteCount: 0, sprite0InLine: false, lastA12: 0,
      chrRam: [], vram: [], palette: [], oam: [],
    },
    apu: {
      pulse1: { duty: 0, dutyPos: 0, timerPeriod: 0, timerValue: 0, lengthCounter: 0, lengthHalt: false, enabled: false, envelope: { start: false, loop: false, constantVolume: false, volume: 0, decayLevel: 0, divider: 0 }, sweep: { enabled: false, period: 0, negate: false, shift: 0, reload: false, divider: 0 } },
      pulse2: { duty: 0, dutyPos: 0, timerPeriod: 0, timerValue: 0, lengthCounter: 0, lengthHalt: false, enabled: false, envelope: { start: false, loop: false, constantVolume: false, volume: 0, decayLevel: 0, divider: 0 }, sweep: { enabled: false, period: 0, negate: false, shift: 0, reload: false, divider: 0 } },
      triangle: { linearCounter: 0, linearCounterReload: 0, linearCounterReloadFlag: false, controlFlag: false, timerPeriod: 0, timerValue: 0, sequencerPos: 0, lengthCounter: 0, enabled: false },
      noise: { shiftRegister: 1, mode: false, timerPeriod: 0, timerValue: 0, lengthCounter: 0, lengthHalt: false, enabled: false, envelope: { start: false, loop: false, constantVolume: false, volume: 0, decayLevel: 0, divider: 0 } },
      dmc: { timerPeriod: 428, timerValue: 0, outputLevel: 0, sampleBuffer: 0, sampleBufferEmpty: true, shiftRegister: 0, bitsRemaining: 1, silenceFlag: true, sampleAddress: 0xc000, sampleLength: 1, currentAddress: 0xc000, bytesRemaining: 0, loop: false, irqEnabled: false, irqFlag: false, stallCycles: 0 },
      frameMode: 0, frameCycle: 0, frameStep: 0, frameIrqInhibit: false, frameIrqFlag: false, cpuCycleOdd: false, frameResetDelay: 0, pendingFrameMode: 0,
    },
    bus: { ram: [], dmaCycles: 0 },
    mapper: { id: 0, data: {} },
    ...overrides,
  };
}

describe("save-manager ステートセーブ", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saveState + loadState で往復できる", () => {
    const state = makeMinimalState();
    saveState("abc123", 1, state);
    const loaded = loadState("abc123", 1);
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(STATE_VERSION);
    expect(loaded!.cpu.a).toBe(0x42);
    expect(loaded!.cpu.pc).toBe(0x8000);
  });

  it("hasState が正しく判定する", () => {
    expect(hasState("abc123", 1)).toBe(false);
    saveState("abc123", 1, makeMinimalState());
    expect(hasState("abc123", 1)).toBe(true);
    expect(hasState("abc123", 2)).toBe(false);
  });

  it("異なるスロットに独立してセーブできる", () => {
    const state1 = makeMinimalState({ cpu: { ...makeMinimalState().cpu, a: 0x11 } });
    const state2 = makeMinimalState({ cpu: { ...makeMinimalState().cpu, a: 0x22 } });
    saveState("abc123", 1, state1);
    saveState("abc123", 2, state2);

    const loaded1 = loadState("abc123", 1);
    const loaded2 = loadState("abc123", 2);
    expect(loaded1!.cpu.a).toBe(0x11);
    expect(loaded2!.cpu.a).toBe(0x22);
  });

  it("異なる ROM ハッシュに独立してセーブできる", () => {
    const stateA = makeMinimalState({ cpu: { ...makeMinimalState().cpu, x: 0xaa } });
    const stateB = makeMinimalState({ cpu: { ...makeMinimalState().cpu, x: 0xbb } });
    saveState("romA", 1, stateA);
    saveState("romB", 1, stateB);

    expect(loadState("romA", 1)!.cpu.x).toBe(0xaa);
    expect(loadState("romB", 1)!.cpu.x).toBe(0xbb);
  });

  it("存在しないスロットの loadState は null を返す", () => {
    expect(loadState("notexist", 1)).toBeNull();
  });

  it("セーブデータの上書きが動作する", () => {
    saveState("abc123", 1, makeMinimalState({ cpu: { ...makeMinimalState().cpu, a: 0x01 } }));
    saveState("abc123", 1, makeMinimalState({ cpu: { ...makeMinimalState().cpu, a: 0x02 } }));
    expect(loadState("abc123", 1)!.cpu.a).toBe(0x02);
  });
});
