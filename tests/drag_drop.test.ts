import { describe, it, expect } from "vitest";
import { isNesFile } from "../src/browser/drag-drop.ts";

describe("isNesFile", () => {
  it(".nes 拡張子を受け付ける", () => {
    expect(isNesFile("game.nes")).toBe(true);
  });

  it("大文字 .NES を受け付ける", () => {
    expect(isNesFile("GAME.NES")).toBe(true);
  });

  it("混合ケース .Nes を受け付ける", () => {
    expect(isNesFile("game.Nes")).toBe(true);
  });

  it(".zip を拒否する", () => {
    expect(isNesFile("game.zip")).toBe(false);
  });

  it(".nes.bak を拒否する", () => {
    expect(isNesFile("game.nes.bak")).toBe(false);
  });

  it("拡張子なしを拒否する", () => {
    expect(isNesFile("game")).toBe(false);
  });

  it("空文字を拒否する", () => {
    expect(isNesFile("")).toBe(false);
  });
});
