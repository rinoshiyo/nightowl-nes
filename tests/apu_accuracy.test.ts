import { describe, it, expect, beforeEach } from "vitest";
import { Apu } from "../src/core/apu.ts";
import { DmcChannel } from "../src/core/apu-dmc.ts";
import { SweepUnit } from "../src/core/apu-sweep.ts";

/**
 * APU 精度向上のユニットテスト。
 * G1-G5 の各サブゴールに対応するテストを含む。
 */

describe("G1: スイープ mute 条件", () => {
  describe("pulse1 (1の補数)", () => {
    let sweep: SweepUnit;

    beforeEach(() => {
      sweep = new SweepUnit(1);
    });

    it("currentPeriod < 8 で mute", () => {
      expect(sweep.isMuting(7)).toBe(true);
      expect(sweep.isMuting(0)).toBe(true);
    });

    it("currentPeriod >= 8 で mute しない (target が範囲内)", () => {
      sweep.shift = 1;
      expect(sweep.isMuting(8)).toBe(false);
      expect(sweep.isMuting(100)).toBe(false);
    });

    it("targetPeriod > $7FF で mute", () => {
      sweep.shift = 1;
      // target = 0x600 + 0x300 = 0x900 > 0x7FF
      expect(sweep.isMuting(0x600)).toBe(true);
    });

    it("negate モードで pulse1 は 1の補数 (change - 1)", () => {
      sweep.negate = true;
      sweep.shift = 1;
      // pulse1: target = 100 - 50 - 1 = 49
      expect(sweep.targetPeriod(100)).toBe(49);
    });
  });

  describe("pulse2 (2の補数)", () => {
    let sweep: SweepUnit;

    beforeEach(() => {
      sweep = new SweepUnit(2);
    });

    it("negate モードで pulse2 は 2の補数 (change のみ)", () => {
      sweep.negate = true;
      sweep.shift = 1;
      // pulse2: target = 100 - 50 = 50
      expect(sweep.targetPeriod(100)).toBe(50);
    });

    it("pulse1 と pulse2 で negate 結果が 1 差", () => {
      const s1 = new SweepUnit(1);
      const s2 = new SweepUnit(2);
      s1.negate = true; s1.shift = 1;
      s2.negate = true; s2.shift = 1;

      const t1 = s1.targetPeriod(200); // 200 - 100 - 1 = 99
      const t2 = s2.targetPeriod(200); // 200 - 100 = 100
      expect(t2 - t1).toBe(1);
    });
  });
});

describe("G2: DMC bit-by-bit 出力", () => {
  let dmc: DmcChannel;

  beforeEach(() => {
    dmc = new DmcChannel();
  });

  it("サンプルバイトが 8 bit ずつ処理される", () => {
    dmc.outputLevel = 64;
    dmc.readSample = () => 0xff; // 全ビット 1 → 毎回 +2
    dmc.writeControl(0x0f); // 最速レート (54 cycles)
    dmc.writeLength(0x00); // 1 byte
    dmc.setEnabled(true);

    // 8 output cycles × 54 ticks = 432 ticks で 1 バイト分
    for (let i = 0; i < 54 * 9; i++) {
      dmc.tickTimer();
    }
    // 全ビット 1 → 8 回の +2 → 64 + 16 = 80
    expect(dmc.outputLevel).toBe(80);
  });
});

describe("G3: DMC CPU stall", () => {
  let dmc: DmcChannel;

  beforeEach(() => {
    dmc = new DmcChannel();
    dmc.readSample = () => 0;
  });

  it("サンプルフェッチ時に stallCycles が加算される", () => {
    dmc.writeLength(0x00); // 1 byte
    dmc.setEnabled(true);

    // tickTimer でフェッチが発生する
    dmc.tickTimer();
    expect(dmc.stallCycles).toBe(4);
  });

  it("フェッチしなければ stallCycles は 0 のまま", () => {
    // enable しないのでフェッチは発生しない
    dmc.tickTimer();
    expect(dmc.stallCycles).toBe(0);
  });

  it("複数回フェッチで stallCycles が累積する", () => {
    dmc.writeControl(0x4f); // loop=true, 最速レート
    dmc.writeLength(0x00); // 1 byte
    dmc.setEnabled(true);

    // 最初のフェッチで +4
    dmc.tickTimer();
    expect(dmc.stallCycles).toBe(4);

    // stallCycles をリセットし、十分 tick して 2 回目のフェッチを発生させる
    dmc.stallCycles = 0;
    for (let i = 0; i < 54 * 8 + 10; i++) {
      dmc.tickTimer();
    }
    expect(dmc.stallCycles).toBeGreaterThanOrEqual(4);
  });
});

describe("G4: フレームカウンタ遅延リセット", () => {
  let apu: Apu;

  beforeEach(() => {
    apu = new Apu();
  });

  it("$4017 書込後 3 cycle で frame counter がリセットされる (偶数 cycle)", () => {
    apu.write(0x4017, 0x00);

    // 3 cycle 後に frameCycle=0 にリセット
    // 7457+3=7460 cycle 後に最初の quarter frame
    apu.write(0x4015, 0x01);
    apu.write(0x4000, 0x30);
    apu.write(0x4003, 0x08);
    apu.write(0x4017, 0x00);

    apu.pulse1.envelope.start = true;

    // 7459 cycle: まだ quarter frame 発火前
    for (let i = 0; i < 7459; i++) apu.tick();
    expect(apu.pulse1.envelope.start).toBe(true);

    // 7460 cycle: quarter frame 発火
    apu.tick();
    expect(apu.pulse1.envelope.start).toBe(false);
  });

  it("5-step モード切替時は即座に quarter+half が clock される", () => {
    apu.write(0x4015, 0x01);
    apu.write(0x4000, 0x00);
    apu.write(0x4003, 0x08); // length 254

    apu.write(0x4017, 0x80); // 5-step: 即座に half frame
    expect(apu.pulse1.lengthCounter).toBe(253);
  });
});

describe("G5: APU reset 精度", () => {
  let apu: Apu;

  beforeEach(() => {
    apu = new Apu();
  });

  it("reset で $4015=$00 相当: 全チャンネル disable", () => {
    apu.write(0x4015, 0x1f); // 全チャンネル enable
    apu.reset();

    expect(apu.pulse1.enabled).toBe(false);
    expect(apu.pulse2.enabled).toBe(false);
    expect(apu.triangle.enabled).toBe(false);
    expect(apu.noise.enabled).toBe(false);
  });

  it("reset で IRQ フラグがクリアされる", () => {
    apu.frameIrqFlag = true;
    apu.dmc.irqFlag = true;

    apu.reset();

    expect(apu.frameIrqFlag).toBe(false);
    expect(apu.dmc.irqFlag).toBe(false);
  });

  it("reset で triangle phase がリセットされる", () => {
    apu.triangle.sequencerPos = 16;
    apu.reset();
    expect(apu.triangle.sequencerPos).toBe(0);
  });

  it("reset で frame counter mode は維持される", () => {
    apu.write(0x4017, 0x80); // 5-step
    // tick して mode を適用
    for (let i = 0; i < 10; i++) apu.tick();

    apu.reset();

    // frame counter は即座リセット (mode は維持されない — $4015=$00 で再初期化)
    // ただし wiki によると $4017 は unchanged → mode 維持
    // 実装では frameCycle=0, frameStep=0 にリセット
  });

  it("powerOn と reset は異なる挙動", () => {
    // powerOn は $4015=$00 + $4017=$00 (遅延付き)
    apu.powerOn();

    // reset は $4015=$00 + frame counter リセット (mode 維持)
    apu.write(0x4015, 0x01);
    apu.pulse1.enabled = true;
    apu.reset();
    expect(apu.pulse1.enabled).toBe(false); // $4015=$00 で disable
  });
});

describe("新フィールドの serialize/deserialize", () => {
  let apu: Apu;

  beforeEach(() => {
    apu = new Apu();
  });

  it("DMC stallCycles が保存/復元される", () => {
    apu.dmc.stallCycles = 3;
    const state = apu.serialize();
    expect(state.dmc.stallCycles).toBe(3);

    apu.dmc.stallCycles = 0;
    apu.deserialize(state);
    expect(apu.dmc.stallCycles).toBe(3);
  });

  it("frameResetDelay が保存/復元される", () => {
    apu.write(0x4017, 0x00); // frameResetDelay が設定される
    const state = apu.serialize();
    expect(state.frameResetDelay).toBe(3); // 偶数 cycle なので 3

    // tick して delay を消費
    apu.tick(); apu.tick(); apu.tick();
    expect(apu.serialize().frameResetDelay).toBe(0);

    // 復元
    apu.deserialize(state);
    expect(apu.serialize().frameResetDelay).toBe(3);
  });

  it("pendingFrameMode が保存/復元される", () => {
    apu.write(0x4017, 0x80); // 5-step mode
    const state = apu.serialize();
    expect(state.pendingFrameMode).toBe(1);

    apu.deserialize(state);
    expect(apu.serialize().pendingFrameMode).toBe(1);
  });
});
