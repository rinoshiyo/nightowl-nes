import { describe, it, expect, beforeEach } from "vitest";
import { PulseChannel } from "../src/core/apu-pulse.ts";

describe("APU PulseChannel", () => {
  let ch: PulseChannel;

  beforeEach(() => {
    ch = new PulseChannel(1);
    ch.enabled = true;
  });

  describe("writeControl ($4000/$4004)", () => {
    it("デューティ比を設定する", () => {
      ch.writeControl(0xc0); // duty = 3
      expect(ch.duty).toBe(3);
    });

    it("lengthHalt + envelope 設定", () => {
      ch.writeControl(0x3f); // halt=true, constant=true, volume=15
      expect(ch.lengthHalt).toBe(true);
      expect(ch.envelope.constantVolume).toBe(true);
      expect(ch.envelope.volume).toBe(15);
      expect(ch.envelope.loop).toBe(true);
    });
  });

  describe("writeSweep ($4001/$4005)", () => {
    it("スイープパラメータを設定する", () => {
      ch.writeSweep(0xf7); // enabled=true, period=7, negate=false, shift=7
      expect(ch.sweep.enabled).toBe(true);
      expect(ch.sweep.period).toBe(7);
      expect(ch.sweep.negate).toBe(false);
      expect(ch.sweep.shift).toBe(7);
      expect(ch.sweep.reload).toBe(true);
    });

    it("negate ビットを設定する", () => {
      ch.writeSweep(0x88); // enabled=true, period=0, negate=true, shift=0
      expect(ch.sweep.negate).toBe(true);
    });
  });

  describe("writeTimerLow ($4002/$4006)", () => {
    it("タイマー周期の下位 8bit を設定する", () => {
      ch.timerPeriod = 0x700;
      ch.writeTimerLow(0xab);
      expect(ch.timerPeriod).toBe(0x7ab);
    });
  });

  describe("writeTimerHigh ($4003/$4007)", () => {
    it("タイマー周期の上位 3bit + 長さカウンタロードを設定する", () => {
      ch.timerPeriod = 0x0ab;
      ch.writeTimerHigh(0x38); // lengthIndex=7, timer high=0
      expect(ch.timerPeriod).toBe(0x0ab & 0xff); // high 3bit = 0
      expect(ch.lengthCounter).toBeGreaterThan(0);
    });

    it("dutyPos をリセットする", () => {
      ch.dutyPos = 5;
      ch.writeTimerHigh(0x00);
      expect(ch.dutyPos).toBe(0);
    });

    it("envelope.start を true にする", () => {
      ch.writeTimerHigh(0x00);
      expect(ch.envelope.start).toBe(true);
    });

    it("enabled=false の場合は長さカウンタをロードしない", () => {
      ch.enabled = false;
      ch.lengthCounter = 0;
      ch.writeTimerHigh(0xf8);
      expect(ch.lengthCounter).toBe(0);
    });
  });

  describe("tickTimer", () => {
    it("タイマーがカウントダウンし、0 で dutyPos が進む", () => {
      ch.timerPeriod = 2;
      ch.timerValue = 0;

      ch.tickTimer(); // timerValue=0 → reload to 2, dutyPos 0→1
      expect(ch.dutyPos).toBe(1);
      expect(ch.timerValue).toBe(2);

      ch.tickTimer(); // 2→1
      expect(ch.dutyPos).toBe(1);

      ch.tickTimer(); // 1→0
      expect(ch.dutyPos).toBe(1);

      ch.tickTimer(); // 0→reload, dutyPos 1→2
      expect(ch.dutyPos).toBe(2);
    });

    it("dutyPos が 0-7 でラップする", () => {
      ch.timerPeriod = 0;
      ch.timerValue = 0;

      for (let i = 0; i < 8; i++) {
        ch.tickTimer();
      }
      expect(ch.dutyPos).toBe(0); // 8 回で一周して 0 に戻る
    });
  });

  describe("tickLength", () => {
    it("lengthHalt=false で lengthCounter をデクリメントする", () => {
      ch.lengthHalt = false;
      ch.lengthCounter = 5;
      ch.tickLength();
      expect(ch.lengthCounter).toBe(4);
    });

    it("lengthHalt=true でデクリメントしない", () => {
      ch.lengthHalt = true;
      ch.lengthCounter = 5;
      ch.tickLength();
      expect(ch.lengthCounter).toBe(5);
    });

    it("lengthCounter=0 ではデクリメントしない (負にならない)", () => {
      ch.lengthHalt = false;
      ch.lengthCounter = 0;
      ch.tickLength();
      expect(ch.lengthCounter).toBe(0);
    });
  });

  describe("output", () => {
    it("enabled=false → 0", () => {
      ch.enabled = false;
      expect(ch.output()).toBe(0);
    });

    it("lengthCounter=0 → 0", () => {
      ch.lengthCounter = 0;
      expect(ch.output()).toBe(0);
    });

    it("timerPeriod < 8 → 0 (sweep muting)", () => {
      ch.lengthCounter = 10;
      ch.timerPeriod = 7;
      ch.writeControl(0x3f); // constant volume 15
      ch.dutyPos = 7; // duty=0 の最後のステップ (値=1)
      expect(ch.output()).toBe(0);
    });

    it("デューティの 0 ステップ → 0", () => {
      ch.lengthCounter = 10;
      ch.timerPeriod = 100;
      ch.writeControl(0x3f); // constant volume 15, duty=0
      ch.dutyPos = 0; // duty=0 の最初のステップ (値=0)
      expect(ch.output()).toBe(0);
    });

    it("有効な出力: duty=0, dutyPos=7 で constant volume", () => {
      ch.lengthCounter = 10;
      ch.timerPeriod = 100;
      ch.writeControl(0x1f); // duty=0, constant=true, volume=15
      ch.dutyPos = 7; // duty=0: [0,0,0,0,0,0,0,1] → 1
      expect(ch.output()).toBe(15);
    });

    it("有効な出力: duty=2 (50%) で複数ステップが 1", () => {
      ch.lengthCounter = 10;
      ch.timerPeriod = 100;
      ch.writeControl(0x9f); // duty=2, constant=true, volume=15
      // duty=2: [0,0,0,0,1,1,1,1]
      ch.dutyPos = 4;
      expect(ch.output()).toBe(15);
      ch.dutyPos = 3;
      expect(ch.output()).toBe(0);
    });
  });
});
