/** NES 標準コントローラ ($4016/$4017) */
export const enum Button {
  A      = 0,
  B      = 1,
  Select = 2,
  Start  = 3,
  Up     = 4,
  Down   = 5,
  Left   = 6,
  Right  = 7,
}

export class Controller {
  private buttons = 0;
  private shift = 0;
  private strobe = false;

  setButtons(state: number): void {
    this.buttons = state & 0xff;
  }

  press(button: Button): void {
    this.buttons |= (1 << button);
  }

  release(button: Button): void {
    this.buttons &= ~(1 << button);
  }

  write(value: number): void {
    const s = (value & 1) !== 0;
    if (this.strobe && !s) {
      this.shift = this.buttons;
    }
    this.strobe = s;
  }

  read(): number {
    if (this.strobe) {
      return this.buttons & 1;
    }
    const bit = (this.shift & 1);
    this.shift >>>= 1;
    return bit;
  }
}
