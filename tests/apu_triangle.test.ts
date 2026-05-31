import { describe, it, expect, beforeEach } from "vitest";
import { TriangleChannel } from "../src/core/apu-triangle.ts";
import { Apu } from "../src/core/apu.ts";

describe("TriangleChannel", () => {
  let ch: TriangleChannel;

  beforeEach(() => {
    ch = new TriangleChannel();
  });

  describe("三角波シーケンサ", () => {
    it("初期位置は 0 (出力 15)", () => {
      ch.enabled = true;
      ch.lengthCounter = 1;
      ch.linearCounter = 1;
      expect(ch.output()).toBe(15);
    });

    it("タイマー clock でシーケンサが進む (15→14→13...)", () => {
      ch.enabled = true;
      ch.lengthCounter = 1;
      ch.linearCounter = 1;
      ch.timerPeriod = 0;

      // period=0 なので tickTimer ごとにシーケンサが進む
      ch.tickTimer(); // pos 0→1
      expect(ch.output()).toBe(14);
      ch.tickTimer(); // pos 1→2
      expect(ch.output()).toBe(13);
    });

    it("32 ステップで一周する (15→0→0→15)", () => {
      ch.enabled = true;
      ch.lengthCounter = 1;
      ch.linearCounter = 1;
      ch.timerPeriod = 0;

      const outputs: number[] = [];
      outputs.push(ch.output()); // pos 0 = 15
      for (let i = 0; i < 31; i++) {
        ch.tickTimer();
        outputs.push(ch.output());
      }

      // 15→0 の下降
      for (let i = 0; i <= 15; i++) {
        expect(outputs[i]).toBe(15 - i);
      }
      // 0→15 の上昇
      for (let i = 0; i <= 15; i++) {
        expect(outputs[16 + i]).toBe(i);
      }
    });

    it("長さカウンタが 0 だとシーケンサが進まない", () => {
      ch.enabled = true;
      ch.lengthCounter = 0;
      ch.linearCounter = 1;
      ch.timerPeriod = 0;

      ch.tickTimer();
      expect(ch.sequencerPos).toBe(0);
    });

    it("リニアカウンタが 0 だとシーケンサが進まない", () => {
      ch.enabled = true;
      ch.lengthCounter = 1;
      ch.linearCounter = 0;
      ch.timerPeriod = 0;

      ch.tickTimer();
      expect(ch.sequencerPos).toBe(0);
    });
  });

  describe("タイマー", () => {
    it("timerPeriod に基づいてカウントダウンする", () => {
      ch.enabled = true;
      ch.lengthCounter = 1;
      ch.linearCounter = 1;
      ch.timerPeriod = 2;

      // timerValue=0 → reload して進む
      ch.tickTimer(); // 0→period(2), seq 0→1
      expect(ch.sequencerPos).toBe(1);

      ch.tickTimer(); // 2→1
      expect(ch.sequencerPos).toBe(1);

      ch.tickTimer(); // 1→0
      expect(ch.sequencerPos).toBe(1);

      ch.tickTimer(); // 0→period(2), seq 1→2
      expect(ch.sequencerPos).toBe(2);
    });
  });

  describe("リニアカウンタ", () => {
    it("reload フラグが立っていたらリロード値をセットする", () => {
      ch.linearCounterReload = 10;
      ch.linearCounterReloadFlag = true;
      ch.controlFlag = true;

      ch.tickLinearCounter();
      expect(ch.linearCounter).toBe(10);
    });

    it("reload フラグなしの時、カウンタをデクリメントする", () => {
      ch.linearCounter = 5;
      ch.linearCounterReloadFlag = false;

      ch.tickLinearCounter();
      expect(ch.linearCounter).toBe(4);
    });

    it("カウンタが 0 の時はデクリメントしない", () => {
      ch.linearCounter = 0;
      ch.linearCounterReloadFlag = false;

      ch.tickLinearCounter();
      expect(ch.linearCounter).toBe(0);
    });

    it("control フラグ OFF で reload フラグがクリアされる", () => {
      ch.linearCounterReloadFlag = true;
      ch.linearCounterReload = 10;
      ch.controlFlag = false;

      ch.tickLinearCounter();
      expect(ch.linearCounter).toBe(10); // reload は実行される
      expect(ch.linearCounterReloadFlag).toBe(false); // その後クリア
    });

    it("control フラグ ON で reload フラグはクリアされない", () => {
      ch.linearCounterReloadFlag = true;
      ch.linearCounterReload = 10;
      ch.controlFlag = true;

      ch.tickLinearCounter();
      expect(ch.linearCounterReloadFlag).toBe(true);
    });
  });

  describe("長さカウンタ", () => {
    it("control フラグ OFF でデクリメントする", () => {
      ch.lengthCounter = 5;
      ch.controlFlag = false;

      ch.tickLength();
      expect(ch.lengthCounter).toBe(4);
    });

    it("control フラグ ON (halt) でデクリメントしない", () => {
      ch.lengthCounter = 5;
      ch.controlFlag = true;

      ch.tickLength();
      expect(ch.lengthCounter).toBe(5);
    });

    it("0 の時はデクリメントしない", () => {
      ch.lengthCounter = 0;
      ch.controlFlag = false;

      ch.tickLength();
      expect(ch.lengthCounter).toBe(0);
    });
  });

  describe("出力", () => {
    it("カウンタに関係なくシーケンサの現在値を返す (NES 仕様: カウンタは clock をゲートするだけ)", () => {
      ch.sequencerPos = 0;
      expect(ch.output()).toBe(15);

      ch.sequencerPos = 8;
      expect(ch.output()).toBe(7);

      ch.sequencerPos = 16;
      expect(ch.output()).toBe(0);
    });

    it("長さカウンタ 0 でもシーケンサの凍結値を返す", () => {
      ch.lengthCounter = 0;
      ch.linearCounter = 5;
      ch.sequencerPos = 5;
      expect(ch.output()).toBe(10);
    });

    it("リニアカウンタ 0 でもシーケンサの凍結値を返す", () => {
      ch.lengthCounter = 5;
      ch.linearCounter = 0;
      ch.sequencerPos = 20;
      expect(ch.output()).toBe(4);
    });
  });

  describe("レジスタ write", () => {
    it("$4008: control フラグとリニアカウンタリロード値", () => {
      ch.writeLinearCounter(0xff); // bit7=1, bits 0-6=0x7f
      expect(ch.controlFlag).toBe(true);
      expect(ch.linearCounterReload).toBe(0x7f);

      ch.writeLinearCounter(0x42); // bit7=0, bits 0-6=0x42
      expect(ch.controlFlag).toBe(false);
      expect(ch.linearCounterReload).toBe(0x42);
    });

    it("$400A: タイマー下位 8bit", () => {
      ch.timerPeriod = 0x700;
      ch.writeTimerLow(0xab);
      expect(ch.timerPeriod).toBe(0x7ab);
    });

    it("$400B: タイマー上位 3bit + 長さカウンタロード", () => {
      ch.enabled = true;
      ch.timerPeriod = 0xff;
      // 0x0b = 0000_1011 → bits 0-2 (timer high) = 3, bits 3-7 (length index) = 1
      ch.writeTimerHigh(0x0b);
      expect(ch.timerPeriod).toBe(0x3ff); // 0xff | (3 << 8)
      expect(ch.lengthCounter).toBe(254); // LENGTH_TABLE[1]
      expect(ch.linearCounterReloadFlag).toBe(true);
    });

    it("$400B: disabled 時は長さカウンタがロードされない", () => {
      ch.enabled = false;
      ch.writeTimerHigh(0x08); // length index = 1
      expect(ch.lengthCounter).toBe(0);
    });
  });
});

describe("APU triangle 統合", () => {
  let apu: Apu;

  beforeEach(() => {
    apu = new Apu();
  });

  describe("$4015 ステータス", () => {
    it("triangle enable + 長さカウンタ > 0 → bit2 が立つ", () => {
      apu.write(0x4015, 0x04); // triangle enable
      apu.write(0x4008, 0xff); // control=true, reload=127
      apu.write(0x400b, 0x08); // 長さカウンタロード (index 1 → 254)
      expect(apu.read(0x4015) & 0x04).toBe(0x04);
    });

    it("triangle disable で長さカウンタが 0 になる", () => {
      apu.write(0x4015, 0x04);
      apu.write(0x4008, 0xff);
      apu.write(0x400b, 0x08);
      expect(apu.read(0x4015) & 0x04).toBe(0x04);

      apu.write(0x4015, 0x00);
      expect(apu.read(0x4015) & 0x04).toBe(0x00);
    });
  });

  describe("レジスタ委譲", () => {
    it("$4008 write で triangle の linear counter 設定が反映される", () => {
      apu.write(0x4008, 0xc2); // control=1, reload=0x42
      expect(apu.triangle.controlFlag).toBe(true);
      expect(apu.triangle.linearCounterReload).toBe(0x42);
    });

    it("$400A/$400B write で triangle の timer period が設定される", () => {
      apu.write(0x4015, 0x04); // enable
      apu.write(0x400a, 0xab);
      apu.write(0x400b, 0x03); // upper=3
      expect(apu.triangle.timerPeriod).toBe(0x3ab);
    });
  });

  describe("フレームカウンタ連動", () => {
    it("5-step モード設定で即座に quarter + half frame が clock される", () => {
      apu.write(0x4015, 0x04);
      apu.triangle.linearCounterReloadFlag = true;
      apu.triangle.linearCounterReload = 50;
      apu.triangle.lengthCounter = 10;
      apu.triangle.controlFlag = false;

      apu.write(0x4017, 0x80); // 5-step モード

      // quarter frame: linear counter reload → 50 に、reload flag clear
      expect(apu.triangle.linearCounter).toBe(50);
      expect(apu.triangle.linearCounterReloadFlag).toBe(false);
      // half frame: length counter デクリメント (controlFlag=false)
      expect(apu.triangle.lengthCounter).toBe(9);
    });
  });

  describe("ミキサー", () => {
    it("pulse のみ (triangle=0) でサンプルが出力される", () => {
      apu.write(0x4015, 0x03); // pulse1 + pulse2 enable
      apu.write(0x4000, 0xbf); // pulse1: duty=2(50%), constant volume=15
      apu.write(0x4002, 0x00); // timer low
      apu.write(0x4003, 0x08); // timer high + length

      // CPU tick を十分回してサンプルを生成
      for (let i = 0; i < 2000; i++) apu.tick();

      const buf = new Float32Array(64);
      const written = apu.readSamples(buf);
      expect(written).toBeGreaterThan(0);

      // triangle=0 なので tnd_out=0、pulse のみの出力
      const nonZero = buf.slice(0, written).some(s => s > 0);
      expect(nonZero).toBe(true);
    });

    it("triangle 有効時に tnd_out が加算される", () => {
      apu.write(0x4015, 0x04); // triangle enable
      apu.write(0x4008, 0xff); // control=true, reload=127
      apu.write(0x400a, 0x10); // timer low
      apu.write(0x400b, 0x08); // timer high + length load

      // リニアカウンタを reload するため quarter frame を発火
      apu.write(0x4017, 0x80); // 5-step モード (即 quarter+half)

      for (let i = 0; i < 2000; i++) apu.tick();

      const buf = new Float32Array(64);
      const written = apu.readSamples(buf);
      expect(written).toBeGreaterThan(0);

      const nonZero = buf.slice(0, written).some(s => s > 0);
      expect(nonZero).toBe(true);
    });
  });
});
