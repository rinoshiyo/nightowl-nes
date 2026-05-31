import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { createMapper } from "../src/core/mappers/index.ts";
import { MapperNrom } from "../src/core/mappers/nrom.ts";
import { MapperUxrom } from "../src/core/mappers/uxrom.ts";

function makeCart(mapper: number): Cart {
  return {
    header: {
      prgRomSize: 0x8000,
      chrRomSize: 0,
      mapper,
      mirroring: "vertical",
      hasBattery: false,
      hasTrainer: false,
      fourScreen: false,
    },
    prgRom: new Uint8Array(0x8000),
    chrRom: new Uint8Array(0),
    trainer: null,
  };
}

describe("createMapper", () => {
  it("mapper 0 で MapperNrom を返す", () => {
    const mapper = createMapper(makeCart(0));
    expect(mapper).toBeInstanceOf(MapperNrom);
  });

  it("mapper 2 で MapperUxrom を返す", () => {
    const mapper = createMapper(makeCart(2));
    expect(mapper).toBeInstanceOf(MapperUxrom);
  });

  it("未サポート mapper で Error を throw", () => {
    expect(() => createMapper(makeCart(4))).toThrow("Unsupported mapper: 4");
    expect(() => createMapper(makeCart(255))).toThrow("Unsupported mapper: 255");
  });
});
