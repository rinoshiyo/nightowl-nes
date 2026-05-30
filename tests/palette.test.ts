import { describe, expect, it } from "vitest";
import { NES_PALETTE } from "../src/core/palette.ts";

describe("NES パレットカラーテーブル", () => {
  it("64 色エントリが存在する", () => {
    expect(NES_PALETTE.length).toBe(64);
  });

  it("各エントリは [r, g, b] の 3 要素タプル", () => {
    for (const entry of NES_PALETTE) {
      expect(entry.length).toBe(3);
    }
  });

  it("全ての RGB 値が 0-255 の範囲", () => {
    for (const [r, g, b] of NES_PALETTE) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
    }
  });

  it("0x0D は黒 (0, 0, 0)", () => {
    const [r, g, b] = NES_PALETTE[0x0d]!;
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it("0x20 は白 (255, 255, 255)", () => {
    const [r, g, b] = NES_PALETTE[0x20]!;
    expect(r).toBe(255);
    expect(g).toBe(255);
    expect(b).toBe(255);
  });
});
