import { describe, it, expect } from "vitest";
import { applyGamepadState, type GamepadState, type ControllerActions } from "../src/browser/gamepad.ts";
import { Button } from "../src/core/controller.ts";

function makeButtons(pressedIndices: number[]): { pressed: boolean }[] {
  const btns: { pressed: boolean }[] = [];
  for (let i = 0; i < 17; i++) {
    btns.push({ pressed: pressedIndices.includes(i) });
  }
  return btns;
}

function makeGamepad(overrides?: Partial<GamepadState>): GamepadState {
  return {
    buttons: makeButtons([]),
    axes: [0, 0, 0, 0],
    ...overrides,
  };
}

function createTracker(): ControllerActions & { pressed: Set<Button>; released: Set<Button> } {
  const pressed = new Set<Button>();
  const released = new Set<Button>();
  return {
    pressed,
    released,
    press(btn: Button) { pressed.add(btn); },
    release(btn: Button) { released.add(btn); },
  };
}

describe("applyGamepadState", () => {
  it("ボタン 0 (B) を押すと Button.B が press される", () => {
    const ctrl = createTracker();
    const gp = makeGamepad({ buttons: makeButtons([0]) });
    applyGamepadState(gp, ctrl);
    expect(ctrl.pressed.has(Button.B)).toBe(true);
  });

  it("ボタン 1 (A) を押すと Button.A が press される", () => {
    const ctrl = createTracker();
    const gp = makeGamepad({ buttons: makeButtons([1]) });
    applyGamepadState(gp, ctrl);
    expect(ctrl.pressed.has(Button.A)).toBe(true);
  });

  it("ボタン 8 (Select) を押すと Button.Select が press される", () => {
    const ctrl = createTracker();
    const gp = makeGamepad({ buttons: makeButtons([8]) });
    applyGamepadState(gp, ctrl);
    expect(ctrl.pressed.has(Button.Select)).toBe(true);
  });

  it("ボタン 9 (Start) を押すと Button.Start が press される", () => {
    const ctrl = createTracker();
    const gp = makeGamepad({ buttons: makeButtons([9]) });
    applyGamepadState(gp, ctrl);
    expect(ctrl.pressed.has(Button.Start)).toBe(true);
  });

  it("左スティックを左に倒すと Left が press, Right が release される", () => {
    const ctrl = createTracker();
    const gp = makeGamepad({ axes: [-0.8, 0, 0, 0] });
    applyGamepadState(gp, ctrl);
    expect(ctrl.pressed.has(Button.Left)).toBe(true);
    expect(ctrl.released.has(Button.Right)).toBe(true);
  });

  it("左スティックを右に倒すと Right が press, Left が release される", () => {
    const ctrl = createTracker();
    const gp = makeGamepad({ axes: [0.8, 0, 0, 0] });
    applyGamepadState(gp, ctrl);
    expect(ctrl.pressed.has(Button.Right)).toBe(true);
    expect(ctrl.released.has(Button.Left)).toBe(true);
  });

  it("左スティックを上に倒すと Up が press, Down が release される", () => {
    const ctrl = createTracker();
    const gp = makeGamepad({ axes: [0, -0.8, 0, 0] });
    applyGamepadState(gp, ctrl);
    expect(ctrl.pressed.has(Button.Up)).toBe(true);
    expect(ctrl.released.has(Button.Down)).toBe(true);
  });

  it("左スティックを下に倒すと Down が press, Up が release される", () => {
    const ctrl = createTracker();
    const gp = makeGamepad({ axes: [0, 0.8, 0, 0] });
    applyGamepadState(gp, ctrl);
    expect(ctrl.pressed.has(Button.Down)).toBe(true);
    expect(ctrl.released.has(Button.Up)).toBe(true);
  });

  it("デッドゾーン内では方向ボタンが release される", () => {
    const ctrl = createTracker();
    const gp = makeGamepad({ axes: [0.3, -0.3, 0, 0] });
    applyGamepadState(gp, ctrl);
    expect(ctrl.released.has(Button.Left)).toBe(true);
    expect(ctrl.released.has(Button.Right)).toBe(true);
    expect(ctrl.released.has(Button.Up)).toBe(true);
    expect(ctrl.released.has(Button.Down)).toBe(true);
  });

  it("D-pad ボタン 12 (Up) が押されると Up が press される", () => {
    const ctrl = createTracker();
    const gp = makeGamepad({ buttons: makeButtons([12]) });
    applyGamepadState(gp, ctrl);
    expect(ctrl.pressed.has(Button.Up)).toBe(true);
  });

  it("D-pad ボタン 14 (Left) が押されると Left が press される", () => {
    const ctrl = createTracker();
    const gp = makeGamepad({ buttons: makeButtons([14]) });
    applyGamepadState(gp, ctrl);
    expect(ctrl.pressed.has(Button.Left)).toBe(true);
  });

  it("D-pad ボタンが離されると release が呼ばれる", () => {
    const ctrl = createTracker();
    const gp = makeGamepad();
    applyGamepadState(gp, ctrl);
    expect(ctrl.released.has(Button.Up)).toBe(true);
    expect(ctrl.released.has(Button.Down)).toBe(true);
    expect(ctrl.released.has(Button.Left)).toBe(true);
    expect(ctrl.released.has(Button.Right)).toBe(true);
  });

  it("何も押されていない時は全ボタン release", () => {
    const ctrl = createTracker();
    const gp = makeGamepad();
    applyGamepadState(gp, ctrl);
    expect(ctrl.pressed.size).toBe(0);
    expect(ctrl.released.has(Button.B)).toBe(true);
    expect(ctrl.released.has(Button.A)).toBe(true);
  });
});
