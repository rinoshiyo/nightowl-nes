import { describe, expect, it } from "vitest";

import { Button, Controller } from "../src/core/controller.ts";

describe("Controller", () => {
  function latchAndRead(ctrl: Controller, count = 8): number[] {
    ctrl.write(1);
    ctrl.write(0);
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
      result.push(ctrl.read());
    }
    return result;
  }

  it("初期状態では全ボタン OFF (8 回 read すべて 0)", () => {
    const ctrl = new Controller();
    const bits = latchAndRead(ctrl);
    expect(bits).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("A ボタンのみ押下時、read 順序が A,B,Sel,Start,U,D,L,R", () => {
    const ctrl = new Controller();
    ctrl.press(Button.A);
    const bits = latchAndRead(ctrl);
    expect(bits).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("複数ボタン押下時、対応ビットが正しい位置に出る", () => {
    const ctrl = new Controller();
    ctrl.press(Button.A);
    ctrl.press(Button.Start);
    ctrl.press(Button.Right);
    const bits = latchAndRead(ctrl);
    expect(bits).toEqual([1, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("setButtons で全ビットを一括設定", () => {
    const ctrl = new Controller();
    ctrl.setButtons(0xff);
    const bits = latchAndRead(ctrl);
    expect(bits).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("release でボタンを離せる", () => {
    const ctrl = new Controller();
    ctrl.press(Button.A);
    ctrl.press(Button.B);
    ctrl.release(Button.A);
    const bits = latchAndRead(ctrl);
    expect(bits).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it("strobe 中 (write 1 のまま) は毎回 A ボタンの状態を返す", () => {
    const ctrl = new Controller();
    ctrl.press(Button.A);
    ctrl.write(1);
    expect(ctrl.read()).toBe(1);
    expect(ctrl.read()).toBe(1);
    expect(ctrl.read()).toBe(1);
  });

  it("strobe 中に A が OFF なら 0 を返し続ける", () => {
    const ctrl = new Controller();
    ctrl.press(Button.B);
    ctrl.write(1);
    expect(ctrl.read()).toBe(0);
    expect(ctrl.read()).toBe(0);
  });

  it("9 回目以降の read は 0 を返す (シフトレジスタ消費後)", () => {
    const ctrl = new Controller();
    ctrl.setButtons(0xff);
    const bits = latchAndRead(ctrl, 12);
    expect(bits.slice(0, 8)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(bits.slice(8)).toEqual([0, 0, 0, 0]);
  });

  it("latch なしの連続 read はシフトレジスタを進める", () => {
    const ctrl = new Controller();
    ctrl.setButtons(0b10000001);
    ctrl.write(1);
    ctrl.write(0);
    expect(ctrl.read()).toBe(1);
    expect(ctrl.read()).toBe(0);
    expect(ctrl.read()).toBe(0);
    expect(ctrl.read()).toBe(0);
    expect(ctrl.read()).toBe(0);
    expect(ctrl.read()).toBe(0);
    expect(ctrl.read()).toBe(0);
    expect(ctrl.read()).toBe(1);
  });

  it("再 latch で新しいボタン状態を取得できる", () => {
    const ctrl = new Controller();
    ctrl.press(Button.A);
    const bits1 = latchAndRead(ctrl);
    expect(bits1[0]).toBe(1);

    ctrl.release(Button.A);
    ctrl.press(Button.B);
    const bits2 = latchAndRead(ctrl);
    expect(bits2[0]).toBe(0);
    expect(bits2[1]).toBe(1);
  });

  it("$4016 write は bit0 のみ参照 (上位ビット無視)", () => {
    const ctrl = new Controller();
    ctrl.press(Button.A);
    ctrl.write(0xff);
    ctrl.write(0xfe);
    expect(ctrl.read()).toBe(1);
    expect(ctrl.read()).toBe(0);
  });
});
