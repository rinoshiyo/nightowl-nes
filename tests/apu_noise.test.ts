import { describe, it, expect, beforeEach } from "vitest";
import { NoiseChannel } from "../src/core/apu-noise.ts";
import { Apu } from "../src/core/apu.ts";

describe("NoiseChannel", () => {
  let ch: NoiseChannel;

  beforeEach(() => {
    ch = new NoiseChannel();
  });

  describe("LFSR", () => {
    it("初期値は 1", () => {
      expect(ch.shiftRegister).toBe(1);
    });

    it("モード 0: bit0 XOR bit1 のフィードバックで右シフト", () => {
      ch.timerPeriod = 0;
      // 初期状態: shiftRegister = 0b000_0000_0000_0001
      // bit0=1, bit1=0 → feedback=1
      // 右シフト → 0b000_0000_0000_0000
      // bit14 に feedback=1 → 0b100_0000_0000_0000
      ch.tickTimer();
      expect(ch.shiftRegister).toBe(0b100_0000_0000_0000);
    });

    it("モード 1: bit0 XOR bit6 のフィードバックで右シフト", () => {
      ch.mode = true;
      ch.timerPeriod = 0;
      // 初期状態: shiftRegister = 1
      // bit0=1, bit6=0 → feedback=1
      ch.tickTimer();
      expect(ch.shiftRegister).toBe(0b100_0000_0000_0000);
    });

    it("モード 0 は 32767 ステップで一周する", () => {
      ch.timerPeriod = 0;
      ch.mode = false;
      const initial = ch.shiftRegister;

      for (let i = 0; i < 32767; i++) {
        ch.tickTimer();
      }
      expect(ch.shiftRegister).toBe(initial);
    });

    it("モード 1 は 93 ステップで一周する", () => {
      ch.timerPeriod = 0;
      ch.mode = true;
      const initial = ch.shiftRegister;

      for (let i = 0; i < 93; i++) {
        ch.tickTimer();
      }
      expect(ch.shiftRegister).toBe(initial);
    });

    it("タイマーが 0 に達した時だけ LFSR が clock される", () => {
      ch.timerPeriod = 2;
      const initial = ch.shiftRegister;

      ch.tickTimer(); // timerValue 0→reload(2), LFSR clock
      expect(ch.shiftRegister).not.toBe(initial);

      const afterFirst = ch.shiftRegister;
      ch.tickTimer(); // timerValue 2→1, LFSR 不変
      expect(ch.shiftRegister).toBe(afterFirst);
      ch.tickTimer(); // timerValue 1→0, LFSR 不変
      expect(ch.shiftRegister).toBe(afterFirst);
      ch.tickTimer(); // timerValue 0→reload(2), LFSR clock
      expect(ch.shiftRegister).not.toBe(afterFirst);
    });
  });

  describe("出力", () => {
    it("LFSR bit0=1 の時は出力 0 (ミュート)", () => {
      ch.shiftRegister = 1; // bit0 = 1
      ch.lengthCounter = 10;
      ch.envelope.constantVolume = true;
      ch.envelope.volume = 15;
      expect(ch.output()).toBe(0);
    });

    it("LFSR bit0=0 かつ lengthCounter>0 の時はエンベロープ出力を返す", () => {
      ch.shiftRegister = 0b10; // bit0 = 0
      ch.lengthCounter = 10;
      ch.envelope.constantVolume = true;
      ch.envelope.volume = 12;
      expect(ch.output()).toBe(12);
    });

    it("lengthCounter=0 の時は出力 0", () => {
      ch.shiftRegister = 0b10; // bit0 = 0
      ch.lengthCounter = 0;
      ch.envelope.constantVolume = true;
      ch.envelope.volume = 15;
      expect(ch.output()).toBe(0);
    });

    it("エンベロープモード (decayLevel) の出力", () => {
      ch.shiftRegister = 0b10;
      ch.lengthCounter = 5;
      ch.envelope.constantVolume = false;
      ch.envelope.decayLevel = 8;
      expect(ch.output()).toBe(8);
    });
  });

  describe("長さカウンタ", () => {
    it("lengthHalt=false でデクリメントする", () => {
      ch.lengthCounter = 5;
      ch.lengthHalt = false;
      ch.tickLength();
      expect(ch.lengthCounter).toBe(4);
    });

    it("lengthHalt=true でデクリメントしない", () => {
      ch.lengthCounter = 5;
      ch.lengthHalt = true;
      ch.tickLength();
      expect(ch.lengthCounter).toBe(5);
    });

    it("0 の時はデクリメントしない", () => {
      ch.lengthCounter = 0;
      ch.lengthHalt = false;
      ch.tickLength();
      expect(ch.lengthCounter).toBe(0);
    });
  });

  describe("レジスタ write", () => {
    it("$400C: lengthHalt + envelope 設定", () => {
      ch.writeControl(0x3f); // bit5=1, bit4=1, bits 0-3=0xf
      expect(ch.lengthHalt).toBe(true);
      expect(ch.envelope.loop).toBe(true);
      expect(ch.envelope.constantVolume).toBe(true);
      expect(ch.envelope.volume).toBe(15);
    });

    it("$400C: lengthHalt=false, envelope モード", () => {
      ch.writeControl(0x05); // bit5=0, bit4=0, bits 0-3=5
      expect(ch.lengthHalt).toBe(false);
      expect(ch.envelope.loop).toBe(false);
      expect(ch.envelope.constantVolume).toBe(false);
      expect(ch.envelope.volume).toBe(5);
    });

    it("$400E: モードとタイマー周期テーブル参照", () => {
      ch.writePeriod(0x80); // mode=1, index=0 → period=4
      expect(ch.mode).toBe(true);
      expect(ch.timerPeriod).toBe(4);

      ch.writePeriod(0x0f); // mode=0, index=15 → period=4068
      expect(ch.mode).toBe(false);
      expect(ch.timerPeriod).toBe(4068);
    });

    it("$400E: 全インデックスのタイマー周期テーブル値", () => {
      const expected = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
      for (let i = 0; i < 16; i++) {
        ch.writePeriod(i);
        expect(ch.timerPeriod).toBe(expected[i]);
      }
    });

    it("$400F: 長さカウンタロード (enabled 時)", () => {
      ch.enabled = true;
      ch.writeLengthLoad(0x08); // length index = 1 → LENGTH_TABLE[1] = 254
      expect(ch.lengthCounter).toBe(254);
      expect(ch.envelope.start).toBe(true);
    });

    it("$400F: disabled 時は長さカウンタがロードされない", () => {
      ch.enabled = false;
      ch.writeLengthLoad(0x08);
      expect(ch.lengthCounter).toBe(0);
      expect(ch.envelope.start).toBe(true); // start は enabled に関係なくセット
    });
  });
});

describe("APU noise 統合", () => {
  let apu: Apu;

  beforeEach(() => {
    apu = new Apu();
  });

  describe("$4015 ステータス", () => {
    it("noise enable + 長さカウンタ > 0 → bit3 が立つ", () => {
      apu.write(0x4015, 0x08); // noise enable
      apu.write(0x400c, 0x3f); // lengthHalt=true, constant volume=15
      apu.write(0x400f, 0x08); // 長さカウンタロード (index 1 → 254)
      expect(apu.read(0x4015) & 0x08).toBe(0x08);
    });

    it("noise disable で長さカウンタが 0 になる", () => {
      apu.write(0x4015, 0x08);
      apu.write(0x400c, 0x3f);
      apu.write(0x400f, 0x08);
      expect(apu.read(0x4015) & 0x08).toBe(0x08);

      apu.write(0x4015, 0x00);
      expect(apu.read(0x4015) & 0x08).toBe(0x00);
    });

    it("他チャンネルに影響しない", () => {
      apu.write(0x4015, 0x0f); // pulse1+pulse2+triangle+noise 全 enable
      apu.write(0x400c, 0x3f);
      apu.write(0x400f, 0x08);

      // noise だけ disable
      apu.write(0x4015, 0x07);
      expect(apu.read(0x4015) & 0x08).toBe(0x00);
      // pulse + triangle の enable は維持 (長さカウンタは各自の状態次第)
    });
  });

  describe("レジスタ委譲", () => {
    it("$400C write で noise の envelope 設定が反映される", () => {
      apu.write(0x400c, 0x1a); // lengthHalt=0, constantVolume=1, volume=10
      expect(apu.noise.lengthHalt).toBe(false);
      expect(apu.noise.envelope.constantVolume).toBe(true);
      expect(apu.noise.envelope.volume).toBe(10);
    });

    it("$400E write で noise のモードとタイマー周期が設定される", () => {
      apu.write(0x400e, 0x85); // mode=1, index=5 → period=96
      expect(apu.noise.mode).toBe(true);
      expect(apu.noise.timerPeriod).toBe(96);
    });

    it("$400F write で noise の長さカウンタがロードされる", () => {
      apu.write(0x4015, 0x08); // noise enable
      apu.write(0x400f, 0x10); // length index = 2 → LENGTH_TABLE[2] = 20
      expect(apu.noise.lengthCounter).toBe(20);
    });
  });

  describe("フレームカウンタ連動", () => {
    it("5-step モード設定で即座に quarter + half frame が clock される", () => {
      apu.write(0x4015, 0x08); // noise enable
      apu.write(0x400c, 0x05); // lengthHalt=false, envelope mode, period=5
      apu.write(0x400f, 0x08); // 長さカウンタロード (index 1 → 254)

      apu.write(0x4017, 0x80); // 5-step モード

      // quarter frame: envelope.tick が呼ばれる (start=true だった → decayLevel=15)
      expect(apu.noise.envelope.decayLevel).toBe(15);
      // half frame: length counter デクリメント (lengthHalt=false)
      expect(apu.noise.lengthCounter).toBe(253);
    });
  });

  describe("タイマー tick タイミング", () => {
    it("noise タイマーは 2 CPU cycle ごとに tick される (パルスと同タイミング)", () => {
      apu.write(0x4015, 0x08);
      apu.write(0x400e, 0x00); // period=4
      apu.noise.shiftRegister = 1;
      const initial = apu.noise.shiftRegister;

      apu.tick(); // cpuCycleOdd toggle → false (初期 false → true に変わる場合あり)
      apu.tick();
      // 2 CPU cycle で 1 回 tickTimer が呼ばれる
      // period=4 なので LFSR がすぐには clock されないこともある
      // 十分回して LFSR が変化することを確認
      for (let i = 0; i < 20; i++) apu.tick();
      expect(apu.noise.shiftRegister).not.toBe(initial);
    });
  });

  describe("ミキサー", () => {
    it("noise 有効時に tnd_out が加算される", () => {
      apu.write(0x4015, 0x08); // noise enable
      apu.write(0x400c, 0xbf); // lengthHalt=true, constant volume=15
      apu.write(0x400e, 0x00); // period=4
      apu.write(0x400f, 0x08); // length load

      // LFSR を回して bit0=0 の状態を作る
      for (let i = 0; i < 2000; i++) apu.tick();

      const buf = new Float32Array(64);
      const written = apu.readSamples(buf);
      expect(written).toBeGreaterThan(0);

      // noise が出力を生成する瞬間がある (LFSR bit0=0 のとき)
      const nonZero = buf.slice(0, written).some(s => s > 0);
      expect(nonZero).toBe(true);
    });
  });
});
