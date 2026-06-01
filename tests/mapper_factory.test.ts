import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { createMapper } from "../src/core/mappers/index.ts";
import { MapperCnrom } from "../src/core/mappers/cnrom.ts";
import { MapperMmc1 } from "../src/core/mappers/mmc1.ts";
import { MapperMmc3 } from "../src/core/mappers/mmc3.ts";
import { MapperNrom } from "../src/core/mappers/nrom.ts";
import { MapperUxrom } from "../src/core/mappers/uxrom.ts";
import { MapperAxrom } from "../src/core/mappers/axrom.ts";
import { MapperColorDreams } from "../src/core/mappers/color-dreams.ts";
import { MapperGxrom } from "../src/core/mappers/gxrom.ts";
import { MapperCodemasters } from "../src/core/mappers/codemasters.ts";
import { MapperDxrom } from "../src/core/mappers/dxrom.ts";

function makeCart(mapper: number, chrSize = 0): Cart {
  return {
    header: {
      prgRomSize: 0x8000,
      chrRomSize: chrSize,
      mapper,
      mirroring: "vertical",
      hasBattery: false,
      hasTrainer: false,
      fourScreen: false,
    },
    prgRom: new Uint8Array(0x8000),
    chrRom: new Uint8Array(chrSize),
    trainer: null,
  };
}

describe("createMapper", () => {
  it("mapper 0 で MapperNrom を返す", () => {
    const mapper = createMapper(makeCart(0));
    expect(mapper).toBeInstanceOf(MapperNrom);
  });

  it("mapper 1 で MapperMmc1 を返す", () => {
    const mapper = createMapper(makeCart(1));
    expect(mapper).toBeInstanceOf(MapperMmc1);
  });

  it("mapper 2 で MapperUxrom を返す", () => {
    const mapper = createMapper(makeCart(2));
    expect(mapper).toBeInstanceOf(MapperUxrom);
  });

  it("mapper 3 で MapperCnrom を返す", () => {
    const mapper = createMapper(makeCart(3, 0x2000));
    expect(mapper).toBeInstanceOf(MapperCnrom);
  });

  it("mapper 4 で MapperMmc3 を返す", () => {
    const mapper = createMapper(makeCart(4));
    expect(mapper).toBeInstanceOf(MapperMmc3);
  });

  it("mapper 7 で MapperAxrom を返す", () => {
    const mapper = createMapper(makeCart(7));
    expect(mapper).toBeInstanceOf(MapperAxrom);
  });

  it("mapper 11 で MapperColorDreams を返す", () => {
    const mapper = createMapper(makeCart(11, 0x2000));
    expect(mapper).toBeInstanceOf(MapperColorDreams);
  });

  it("mapper 66 で MapperGxrom を返す", () => {
    const mapper = createMapper(makeCart(66, 0x2000));
    expect(mapper).toBeInstanceOf(MapperGxrom);
  });

  it("mapper 71 で MapperCodemasters を返す", () => {
    const mapper = createMapper(makeCart(71));
    expect(mapper).toBeInstanceOf(MapperCodemasters);
  });

  it("mapper 206 で MapperDxrom を返す", () => {
    const mapper = createMapper(makeCart(206));
    expect(mapper).toBeInstanceOf(MapperDxrom);
  });

  it("未サポート mapper で Error を throw", () => {
    expect(() => createMapper(makeCart(5))).toThrow("Unsupported mapper: 5");
    expect(() => createMapper(makeCart(255))).toThrow("Unsupported mapper: 255");
  });
});
