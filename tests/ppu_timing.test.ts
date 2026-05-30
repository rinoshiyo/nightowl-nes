import { describe, expect, it } from "vitest";
import { Ppu } from "../src/core/ppu.ts";

describe("PPU タイミングエンジン", () => {
  it("341 dots で scanline が 1 進む", () => {
    const ppu = new Ppu();
    expect(ppu.dot).toBe(0);
    expect(ppu.scanline).toBe(0);

    for (let i = 0; i < 341; i++) {
      ppu.tick();
    }
    expect(ppu.dot).toBe(0);
    expect(ppu.scanline).toBe(1);
  });

  it("262 scanlines で 1 フレーム完了", () => {
    const ppu = new Ppu();
    const totalDots = 262 * 341;

    for (let i = 0; i < totalDots - 1; i++) {
      ppu.tick();
      expect(ppu.frameComplete).toBe(false);
    }
    ppu.tick();
    expect(ppu.frameComplete).toBe(true);
    expect(ppu.scanline).toBe(0);
    expect(ppu.dot).toBe(0);
  });

  it("frameComplete は呼び出し側がクリアするまで true を保持する", () => {
    const ppu = new Ppu();
    const totalDots = 262 * 341;
    for (let i = 0; i < totalDots; i++) {
      ppu.tick();
    }
    expect(ppu.frameComplete).toBe(true);

    ppu.tick();
    expect(ppu.frameComplete).toBe(true);

    ppu.frameComplete = false;
    ppu.tick();
    expect(ppu.frameComplete).toBe(false);
  });
});

describe("PPU VBlank + NMI", () => {
  function advanceTo(ppu: Ppu, scanline: number, dot: number): void {
    const target = scanline * 341 + dot;
    const current = ppu.scanline * 341 + ppu.dot;
    const ticks = target > current ? target - current : (262 * 341 - current) + target;
    for (let i = 0; i < ticks; i++) {
      ppu.tick();
    }
  }

  it("scanline 241 / dot 1 で VBlank フラグがセットされる", () => {
    const ppu = new Ppu();
    advanceTo(ppu, 241, 1);
    expect(ppu.status & 0x80).toBe(0);

    ppu.tick();
    expect(ppu.status & 0x80).toBe(0x80);
  });

  it("プリレンダーライン (261) / dot 1 で status bit7/6/5 がクリアされる", () => {
    const ppu = new Ppu();
    advanceTo(ppu, 241, 1);
    ppu.tick();
    expect(ppu.status & 0x80).toBe(0x80);

    ppu.status |= 0x40 | 0x20;
    advanceTo(ppu, 261, 1);
    expect(ppu.status & 0xe0).toBe(0xe0);

    ppu.tick();
    expect(ppu.status & 0xe0).toBe(0);
  });

  it("PPUCTRL bit7 が有効時、VBlank で NMI コールバックが呼ばれる", () => {
    const ppu = new Ppu();
    let nmiCount = 0;
    ppu.onNmi = () => { nmiCount++; };
    ppu.ctrl = 0x80;

    advanceTo(ppu, 241, 1);
    ppu.tick();
    expect(nmiCount).toBe(1);
  });

  it("PPUCTRL bit7 が無効時、VBlank で NMI は呼ばれない", () => {
    const ppu = new Ppu();
    let nmiCount = 0;
    ppu.onNmi = () => { nmiCount++; };
    ppu.ctrl = 0;

    advanceTo(ppu, 241, 1);
    ppu.tick();
    expect(nmiCount).toBe(0);
  });

  it("onNmi が null でも VBlank セットされる (NMI は呼ばれないだけ)", () => {
    const ppu = new Ppu();
    ppu.ctrl = 0x80;
    ppu.onNmi = null;

    advanceTo(ppu, 241, 1);
    ppu.tick();
    expect(ppu.status & 0x80).toBe(0x80);
  });
});
