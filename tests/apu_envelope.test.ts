import { describe, it, expect, beforeEach } from "vitest";
import { Envelope } from "../src/core/apu-envelope.ts";

describe("APU Envelope", () => {
  let env: Envelope;

  beforeEach(() => {
    env = new Envelope();
  });

  it("constant volume モードで固定値を返す", () => {
    env.constantVolume = true;
    env.volume = 10;
    expect(env.output()).toBe(10);
  });

  it("decay モードの初回 tick で start → decayLevel=15, divider=volume", () => {
    env.constantVolume = false;
    env.volume = 3;
    env.start = true;

    env.tick();

    expect(env.decayLevel).toBe(15);
    expect(env.divider).toBe(3);
    expect(env.start).toBe(false);
  });

  it("decay モードで divider がカウントダウン → 0 で decayLevel 減少", () => {
    env.constantVolume = false;
    env.volume = 2;
    env.start = true;
    env.tick(); // start → decayLevel=15, divider=2

    env.tick(); // divider 2→1
    expect(env.decayLevel).toBe(15);

    env.tick(); // divider 1→0
    expect(env.decayLevel).toBe(15);

    env.tick(); // divider=0 → reload=2, decayLevel 15→14
    expect(env.decayLevel).toBe(14);
    expect(env.divider).toBe(2);
  });

  it("decay が 0 まで下がって stop (loop=false)", () => {
    env.constantVolume = false;
    env.volume = 0; // divider period = 0 → 毎 tick で decay
    env.loop = false;
    env.start = true;

    env.tick(); // start → decayLevel=15

    // 16 回 tick で 15→0
    for (let i = 0; i < 16; i++) {
      env.tick();
    }
    expect(env.decayLevel).toBe(0);
    expect(env.output()).toBe(0);

    // さらに tick しても 0 のまま
    env.tick();
    expect(env.decayLevel).toBe(0);
  });

  it("loop=true で decayLevel が 0→15 に戻る", () => {
    env.constantVolume = false;
    env.volume = 0;
    env.loop = true;
    env.start = true;

    env.tick(); // start → decayLevel=15

    // 16 回 tick で 15→0 → 15 (loop)
    for (let i = 0; i < 16; i++) {
      env.tick();
    }
    expect(env.decayLevel).toBe(15);
  });

  it("output() は constantVolume=true なら volume、false なら decayLevel", () => {
    env.constantVolume = true;
    env.volume = 7;
    expect(env.output()).toBe(7);

    env.constantVolume = false;
    env.decayLevel = 12;
    expect(env.output()).toBe(12);
  });
});
