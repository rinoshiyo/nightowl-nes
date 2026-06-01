import { Button } from "../core/controller.ts";

/** 標準 Gamepad ボタンインデックスから NES ボタンへのマッピング */
const BUTTON_MAP: readonly [number, Button][] = [
  [0, Button.B],       // Cross / A
  [1, Button.A],       // Circle / B
  [8, Button.Select],  // Share / Back
  [9, Button.Start],   // Start / Menu
];

export interface GamepadButtonState {
  pressed: boolean;
}

export interface GamepadState {
  buttons: readonly GamepadButtonState[];
  axes: readonly number[];
}

export interface ControllerActions {
  press(btn: Button): void;
  release(btn: Button): void;
}

const DEADZONE = 0.5;

/** ゲームパッドの状態を読み取り、コントローラに反映する */
export function applyGamepadState(gp: GamepadState, ctrl: ControllerActions): void {
  for (let i = 0; i < BUTTON_MAP.length; i++) {
    const entry = BUTTON_MAP[i];
    if (!entry) continue;
    const [gpIndex, nesBtn] = entry;
    const pressed = gp.buttons[gpIndex]?.pressed ?? false;
    if (pressed) ctrl.press(nesBtn);
    else ctrl.release(nesBtn);
  }

  const axes0 = gp.axes[0] ?? 0;
  const axes1 = gp.axes[1] ?? 0;

  const dUp = gp.buttons[12]?.pressed ?? false;
  const dDown = gp.buttons[13]?.pressed ?? false;
  const dLeft = gp.buttons[14]?.pressed ?? false;
  const dRight = gp.buttons[15]?.pressed ?? false;

  const wantLeft = axes0 < -DEADZONE || dLeft;
  const wantRight = axes0 > DEADZONE || dRight;
  const wantUp = axes1 < -DEADZONE || dUp;
  const wantDown = axes1 > DEADZONE || dDown;

  if (wantLeft) ctrl.press(Button.Left); else ctrl.release(Button.Left);
  if (wantRight) ctrl.press(Button.Right); else ctrl.release(Button.Right);
  if (wantUp) ctrl.press(Button.Up); else ctrl.release(Button.Up);
  if (wantDown) ctrl.press(Button.Down); else ctrl.release(Button.Down);
}
