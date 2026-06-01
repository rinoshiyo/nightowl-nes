import { Button } from "../core/controller.ts";

/** 標準 Gamepad ボタンインデックスから NES ボタンへのマッピング */
const BUTTON_MAP: ReadonlyMap<number, Button> = new Map([
  [0, Button.B],       // Cross / A
  [1, Button.A],       // Circle / B
  [8, Button.Select],  // Share / Back
  [9, Button.Start],   // Start / Menu
]);

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
  for (const [gpIndex, nesBtn] of BUTTON_MAP) {
    const pressed = gp.buttons[gpIndex]?.pressed ?? false;
    if (pressed) ctrl.press(nesBtn);
    else ctrl.release(nesBtn);
  }

  const axes0 = gp.axes[0] ?? 0;
  const axes1 = gp.axes[1] ?? 0;

  if (axes0 < -DEADZONE) { ctrl.press(Button.Left); ctrl.release(Button.Right); }
  else if (axes0 > DEADZONE) { ctrl.press(Button.Right); ctrl.release(Button.Left); }
  else { ctrl.release(Button.Left); ctrl.release(Button.Right); }

  if (axes1 < -DEADZONE) { ctrl.press(Button.Up); ctrl.release(Button.Down); }
  else if (axes1 > DEADZONE) { ctrl.press(Button.Down); ctrl.release(Button.Up); }
  else { ctrl.release(Button.Up); ctrl.release(Button.Down); }

  const dUp = gp.buttons[12]?.pressed ?? false;
  const dDown = gp.buttons[13]?.pressed ?? false;
  const dLeft = gp.buttons[14]?.pressed ?? false;
  const dRight = gp.buttons[15]?.pressed ?? false;
  if (dUp) ctrl.press(Button.Up);
  if (dDown) ctrl.press(Button.Down);
  if (dLeft) ctrl.press(Button.Left);
  if (dRight) ctrl.press(Button.Right);
}
