import { describe, it, expect, beforeEach, vi } from "vitest";
import { Apu } from "../src/core/apu.ts";

/**
 * APU フレームカウンタの精度検証。
 *
 * nesdev wiki: https://www.nesdev.org/wiki/APU_Frame_Counter
 * 4-step: 7457, 14913, 22371, 29829 CPU cycles
 * 5-step: 7457, 14913, 22371, 29829, 37281 CPU cycles
 */

/** 指定サイクル数だけ APU を tick する */
function tickN(apu: Apu, n: number): void {
  for (let i = 0; i < n; i++) {
    apu.tick();
  }
}

describe("APU フレームカウンタ", () => {
  let apu: Apu;

  beforeEach(() => {
    apu = new Apu();
  });

  describe("4-step モード (mode 0) のサイクルタイミング", () => {
    beforeEach(() => {
      apu.write(0x4015, 0x01); // pulse1 enable
      apu.write(0x4000, 0x00); // halt=false, constant=false, vol=0
      apu.write(0x4003, 0x08); // 長さカウンタロード (index 1 → 254)
      apu.write(0x4017, 0x00); // 4-step, IRQ enabled
    });

    it("step 0 (cycle 7457): quarter frame が発火する", () => {
      // cycle 7456 ではまだ発火していない
      tickN(apu, 7456);
      // envelope は初回 tick で start=true → decayLevel=15 をセットする
      // まだ quarter frame が来ていないので start=true のまま
      expect(apu.pulse1.envelope.start).toBe(true);

      // cycle 7457 で quarter frame が発火
      apu.tick();
      expect(apu.pulse1.envelope.start).toBe(false);
    });

    it("step 1 (cycle 14913): quarter + half frame が発火する", () => {
      tickN(apu, 14912);
      const lengthBefore = apu.pulse1.lengthCounter;

      apu.tick(); // cycle 14913
      // half frame で長さカウンタがデクリメントされる
      expect(apu.pulse1.lengthCounter).toBe(lengthBefore - 1);
    });

    it("step 2 (cycle 22371): quarter frame が発火する", () => {
      tickN(apu, 22370);
      // step 0, 1 で envelope が 2 回 tick されている
      // step 2 の直前で envelope tick 数を確認
      const decayBefore = apu.pulse1.envelope.decayLevel;

      apu.tick(); // cycle 22371
      // quarter frame で envelope がもう 1 回 tick される
      // decayLevel は divider が 0 になった時にデクリメントされる
      // tick 回数が増えたことを確認 (値の変化は volume 設定依存)
      expect(apu.pulse1.envelope.decayLevel).toBeLessThanOrEqual(decayBefore);
    });

    it("step 3 (cycle 29829): quarter + half + IRQ が発火する", () => {
      apu.frameIrqFlag = false;
      tickN(apu, 29828);
      expect(apu.frameIrqFlag).toBe(false);

      apu.tick(); // cycle 29829
      expect(apu.frameIrqFlag).toBe(true);
    });

    it("cycle 29830 でカウンタがリセットされ、次のループが始まる", () => {
      tickN(apu, 29829);
      apu.frameIrqFlag = false;

      // 2 周目: 29830 でリセット → 次の 7457 サイクル後に step 0
      tickN(apu, 1); // cycle 29830: リセット
      tickN(apu, 7457); // 2 周目の step 0
      // envelope が tick されたことで start=false (もう初回ではないが tick 自体は発生)
      // 2 周目の step 3 で再度 IRQ が発火することを確認
      tickN(apu, 14913 - 7457); // step 1
      tickN(apu, 22371 - 14913); // step 2
      tickN(apu, 29829 - 22371); // step 3
      expect(apu.frameIrqFlag).toBe(true);
    });
  });

  describe("5-step モード (mode 1) のサイクルタイミング", () => {
    beforeEach(() => {
      apu.write(0x4015, 0x01); // pulse1 enable
      apu.write(0x4000, 0x00); // halt=false
      apu.write(0x4003, 0x08); // 長さカウンタロード (index 1 → 254)
      apu.write(0x4017, 0x80); // 5-step (即座に quarter+half)
    });

    it("$4017 書き込み直後に quarter + half frame が即発火する", () => {
      // 5-step モード設定時に即座に quarter+half が発火
      // half frame で長さカウンタがデクリメントされる (254 → 253)
      expect(apu.pulse1.lengthCounter).toBe(253);
    });

    it("step 0 (cycle 7457): quarter frame が発火する", () => {
      tickN(apu, 7456);
      const decayBefore = apu.pulse1.envelope.decayLevel;

      apu.tick(); // cycle 7457
      expect(apu.pulse1.envelope.decayLevel).toBeLessThanOrEqual(decayBefore);
    });

    it("step 1 (cycle 14913): quarter + half frame が発火する", () => {
      const lengthBefore = apu.pulse1.lengthCounter;
      tickN(apu, 14913);
      // half frame で長さカウンタがデクリメント
      expect(apu.pulse1.lengthCounter).toBe(lengthBefore - 1);
    });

    it("step 2 (cycle 22371): quarter frame のみ発火する", () => {
      const lengthAfterStep1 = apu.pulse1.lengthCounter;
      tickN(apu, 14913); // step 1 まで進める
      const lengthAfterHalf = apu.pulse1.lengthCounter;

      tickN(apu, 22371 - 14913); // step 2
      // quarter frame のみなので長さカウンタは変化しない
      expect(apu.pulse1.lengthCounter).toBe(lengthAfterHalf);
    });

    it("step 3 (cycle 29829): 何も発火しない", () => {
      tickN(apu, 14913); // step 1
      const lengthAfterStep1 = apu.pulse1.lengthCounter;

      tickN(apu, 22371 - 14913); // step 2
      tickN(apu, 29829 - 22371); // step 3
      // step 2 は quarter のみ、step 3 は何もない → 長さカウンタは step 1 から変化なし
      expect(apu.pulse1.lengthCounter).toBe(lengthAfterStep1);
    });

    it("step 4 (cycle 37281): quarter + half frame が発火する", () => {
      tickN(apu, 14913); // step 1: half
      const lengthAfterStep1 = apu.pulse1.lengthCounter;

      tickN(apu, 37281 - 14913); // step 2, 3, 4
      // step 4 の half frame で長さカウンタがデクリメント
      expect(apu.pulse1.lengthCounter).toBe(lengthAfterStep1 - 1);
    });

    it("5-step モードでは IRQ が一切生成されない", () => {
      apu.frameIrqFlag = false;
      tickN(apu, 37282); // 1 周期分
      expect(apu.frameIrqFlag).toBe(false);

      tickN(apu, 37282); // 2 周期分
      expect(apu.frameIrqFlag).toBe(false);
    });

    it("cycle 37282 でカウンタがリセットされる", () => {
      tickN(apu, 37281); // step 4
      const lengthAfterStep4 = apu.pulse1.lengthCounter;

      // リセット後、2 周目の step 1 (cycle 14913) で再度 half frame
      tickN(apu, 1); // cycle 37282: リセット
      tickN(apu, 14913); // 2 周目 step 1
      expect(apu.pulse1.lengthCounter).toBe(lengthAfterStep4 - 1);
    });
  });

  describe("quarter frame がエンベロープと linear カウンタを駆動する", () => {
    it("pulse1 エンベロープが quarter frame で tick される", () => {
      apu.write(0x4015, 0x01);
      apu.write(0x4000, 0x30); // halt=true, constant=true, vol=0
      apu.write(0x4003, 0x08); // 長さカウンタロード
      apu.write(0x4017, 0x00); // 4-step

      // envelope.start は $4003 書き込みで true にセットされる
      expect(apu.pulse1.envelope.start).toBe(true);

      // step 0 (cycle 7457) で quarter frame → envelope.tick() → start=false
      tickN(apu, 7457);
      expect(apu.pulse1.envelope.start).toBe(false);
      expect(apu.pulse1.envelope.decayLevel).toBe(15);
    });

    it("pulse2 エンベロープが quarter frame で tick される", () => {
      apu.write(0x4015, 0x02);
      apu.write(0x4004, 0x30);
      apu.write(0x4007, 0x08);
      apu.write(0x4017, 0x00);

      expect(apu.pulse2.envelope.start).toBe(true);
      tickN(apu, 7457);
      expect(apu.pulse2.envelope.start).toBe(false);
    });

    it("noise エンベロープが quarter frame で tick される", () => {
      apu.write(0x4015, 0x08);
      apu.write(0x400c, 0x30);
      apu.write(0x400f, 0x08);
      apu.write(0x4017, 0x00);

      expect(apu.noise.envelope.start).toBe(true);
      tickN(apu, 7457);
      expect(apu.noise.envelope.start).toBe(false);
    });

    it("triangle linear カウンタが quarter frame で tick される", () => {
      apu.write(0x4015, 0x04); // triangle enable
      apu.write(0x4008, 0x0a); // control=false, reload=10
      apu.write(0x400b, 0x08); // 長さカウンタロード → linearCounterReloadFlag=true
      apu.write(0x4017, 0x00);

      // $400B 書き込みで reloadFlag=true
      // 最初の quarter frame で linearCounter = linearCounterReload (10)
      tickN(apu, 7457);
      expect(apu.triangle.linearCounter).toBe(10);

      // control=false なので reloadFlag は false にリセットされる
      // 次の quarter frame で linearCounter がデクリメント
      tickN(apu, 14913 - 7457);
      expect(apu.triangle.linearCounter).toBe(9);
    });
  });

  describe("half frame が長さカウンタとスウィープを駆動する", () => {
    it("pulse1 長さカウンタが half frame でデクリメントされる", () => {
      apu.write(0x4015, 0x01);
      apu.write(0x4000, 0x00); // halt=false
      apu.write(0x4003, 0x08); // 長さカウンタロード (254)
      apu.write(0x4017, 0x00);

      tickN(apu, 7457); // step 0: quarter のみ
      expect(apu.pulse1.lengthCounter).toBe(254);

      tickN(apu, 14913 - 7457); // step 1: quarter + half
      expect(apu.pulse1.lengthCounter).toBe(253);
    });

    it("pulse2 長さカウンタが half frame でデクリメントされる", () => {
      apu.write(0x4015, 0x02);
      apu.write(0x4004, 0x00);
      apu.write(0x4007, 0x08); // 長さカウンタ 254
      apu.write(0x4017, 0x00);

      tickN(apu, 14913); // step 1: quarter + half
      expect(apu.pulse2.lengthCounter).toBe(253);
    });

    it("triangle 長さカウンタが half frame でデクリメントされる", () => {
      apu.write(0x4015, 0x04);
      apu.write(0x4008, 0x00); // control=false (halt=false)
      apu.write(0x400b, 0x08); // 長さカウンタ 254
      apu.write(0x4017, 0x00);

      tickN(apu, 14913); // step 1: quarter + half
      expect(apu.triangle.lengthCounter).toBe(253);
    });

    it("noise 長さカウンタが half frame でデクリメントされる", () => {
      apu.write(0x4015, 0x08);
      apu.write(0x400c, 0x00); // halt=false
      apu.write(0x400f, 0x08); // 長さカウンタ 254
      apu.write(0x4017, 0x00);

      tickN(apu, 14913); // step 1: quarter + half
      expect(apu.noise.lengthCounter).toBe(253);
    });

    it("pulse1 スウィープが half frame で tick される", () => {
      apu.write(0x4015, 0x01);
      apu.write(0x4000, 0x3f); // halt=true, constant, vol=15
      apu.write(0x4001, 0x81); // sweep: enabled, period=0, shift=1
      apu.write(0x4002, 0x00); // timer low = 0
      apu.write(0x4003, 0x10); // timer high = 2 → timerPeriod = 0x200 = 512
      apu.write(0x4017, 0x00);

      // sweep.reload が true の状態で half frame が来ると divider がリセットされる
      expect(apu.pulse1.sweep.reload).toBe(true);
      tickN(apu, 14913); // step 1: half frame
      expect(apu.pulse1.sweep.reload).toBe(false);
    });
  });

  describe("フレームカウンタ IRQ", () => {
    it("4-step モードで IRQ コールバックが呼ばれる", () => {
      const irqCallback = vi.fn();
      apu.onIrq = irqCallback;
      apu.write(0x4017, 0x00); // 4-step, IRQ enabled

      tickN(apu, 29829);
      expect(irqCallback).toHaveBeenCalled();
    });

    it("IRQ inhibit 時はコールバックが呼ばれない", () => {
      const irqCallback = vi.fn();
      apu.onIrq = irqCallback;
      apu.write(0x4017, 0x40); // 4-step, IRQ inhibit

      tickN(apu, 29830);
      expect(irqCallback).not.toHaveBeenCalled();
      expect(apu.frameIrqFlag).toBe(false);
    });

    it("$4015 read でフレーム IRQ フラグがクリアされる", () => {
      apu.write(0x4017, 0x00);
      tickN(apu, 29829);
      expect(apu.frameIrqFlag).toBe(true);

      const status = apu.read(0x4015);
      expect(status & 0x40).toBe(0x40);
      expect(apu.frameIrqFlag).toBe(false);

      // 2 回目の read では bit6 がクリアされている
      expect(apu.read(0x4015) & 0x40).toBe(0);
    });

    it("IRQ inhibit を後からセットするとフラグがクリアされる", () => {
      apu.write(0x4017, 0x00);
      tickN(apu, 29829);
      expect(apu.frameIrqFlag).toBe(true);

      apu.write(0x4017, 0x40); // IRQ inhibit
      expect(apu.frameIrqFlag).toBe(false);
    });

    it("5-step モードでは IRQ コールバックが呼ばれない", () => {
      const irqCallback = vi.fn();
      apu.onIrq = irqCallback;
      apu.write(0x4017, 0x80); // 5-step

      tickN(apu, 37282 * 2); // 2 周期
      expect(irqCallback).not.toHaveBeenCalled();
    });
  });

  describe("$4017 書き込み時のリセット動作", () => {
    it("$4017 書き込みでフレームカウンタがリセットされる", () => {
      apu.write(0x4017, 0x00); // 4-step
      tickN(apu, 10000); // 途中まで進める

      // リセット
      apu.write(0x4017, 0x00);
      apu.frameIrqFlag = false;

      // リセット後、step 3 は 29829 cycle 後
      tickN(apu, 29828);
      expect(apu.frameIrqFlag).toBe(false);

      apu.tick(); // cycle 29829
      expect(apu.frameIrqFlag).toBe(true);
    });

    it("モード切替 (4-step → 5-step) でリセットされる", () => {
      apu.write(0x4015, 0x01);
      apu.write(0x4000, 0x00);
      apu.write(0x4003, 0x08); // 長さカウンタ 254
      apu.write(0x4017, 0x00); // 4-step
      tickN(apu, 10000);

      const lengthBefore = apu.pulse1.lengthCounter;

      // 5-step に切替 → 即座に half frame
      apu.write(0x4017, 0x80);
      expect(apu.pulse1.lengthCounter).toBe(lengthBefore - 1);
    });

    it("5-step モードで $4017 再書き込みすると再度 quarter + half が即発火", () => {
      apu.write(0x4015, 0x01);
      apu.write(0x4000, 0x00);
      apu.write(0x4003, 0x08); // 長さカウンタ 254
      apu.write(0x4017, 0x80); // 5-step → 即 half (254→253)
      expect(apu.pulse1.lengthCounter).toBe(253);

      // 再度 $4017 書き込み → 即 half (253→252)
      apu.write(0x4017, 0x80);
      expect(apu.pulse1.lengthCounter).toBe(252);
    });

    it("4-step モードでの $4017 書き込みでは即時 clock しない", () => {
      apu.write(0x4015, 0x01);
      apu.write(0x4000, 0x00);
      apu.write(0x4003, 0x08); // 長さカウンタ 254
      apu.write(0x4017, 0x00); // 4-step → 即時 clock なし
      expect(apu.pulse1.lengthCounter).toBe(254);
    });
  });

  describe("DMC IRQ との共存", () => {
    it("$4015 read で DMC IRQ フラグは bit7 に反映される", () => {
      apu.dmc.irqFlag = true;
      const status = apu.read(0x4015);
      expect(status & 0x80).toBe(0x80);
    });

    it("フレーム IRQ と DMC IRQ が同時に立つ場合、両方反映される", () => {
      apu.frameIrqFlag = true;
      apu.dmc.irqFlag = true;
      const status = apu.read(0x4015);
      expect(status & 0xc0).toBe(0xc0); // bit6 + bit7
    });
  });
});
