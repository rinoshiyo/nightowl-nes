/**
 * モバイル向けバーチャルパッド。
 * canvas の下にオーバーレイ表示し、タッチイベントで NES コントローラーを操作する。
 */

import type { Controller } from "../core/controller.ts";
import { Button } from "../core/controller.ts";

interface DpadState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

const DPAD_BUTTONS: readonly { btn: Button; key: keyof DpadState; }[] = [
  { btn: Button.Up, key: "up" },
  { btn: Button.Down, key: "down" },
  { btn: Button.Left, key: "left" },
  { btn: Button.Right, key: "right" },
];

export class TouchControls {
  private readonly container: HTMLDivElement;
  private readonly controller: Controller;
  private readonly dpadState: DpadState = {
    up: false, down: false, left: false, right: false,
  };

  constructor(controller: Controller) {
    this.controller = controller;
    this.container = document.createElement("div");
    this.container.className = "touch-controls";
    this.container.innerHTML = this.buildHtml();

    this.setupDpad();
    this.setupActionButtons();
    this.setupMenuButtons();
  }

  get element(): HTMLDivElement {
    return this.container;
  }

  private buildHtml(): string {
    return `
      <div class="touch-left">
        <div class="touch-dpad">
          <button class="dpad-btn dpad-up" data-dir="up">▲</button>
          <div class="dpad-middle">
            <button class="dpad-btn dpad-left" data-dir="left">◀</button>
            <div class="dpad-center"></div>
            <button class="dpad-btn dpad-right" data-dir="right">▶</button>
          </div>
          <button class="dpad-btn dpad-down" data-dir="down">▼</button>
        </div>
      </div>
      <div class="touch-center">
        <button class="menu-btn" data-btn="select">SELECT</button>
        <button class="menu-btn" data-btn="start">START</button>
      </div>
      <div class="touch-right">
        <div class="action-buttons">
          <button class="action-btn btn-b" data-btn="b">B</button>
          <button class="action-btn btn-a" data-btn="a">A</button>
        </div>
      </div>
    `;
  }

  private setupDpad(): void {
    const dpadBtns = this.container.querySelectorAll<HTMLButtonElement>(".dpad-btn");
    for (const btn of dpadBtns) {
      const dir = btn.dataset["dir"] as keyof DpadState | undefined;
      if (!dir) continue;

      const press = (e: Event) => {
        e.preventDefault();
        this.dpadState[dir] = true;
        this.syncDpad();
      };
      const release = (e: Event) => {
        e.preventDefault();
        this.dpadState[dir] = false;
        this.syncDpad();
      };

      btn.addEventListener("touchstart", press);
      btn.addEventListener("touchend", release);
      btn.addEventListener("touchcancel", release);
    }
  }

  private syncDpad(): void {
    for (const { btn, key } of DPAD_BUTTONS) {
      if (this.dpadState[key]) {
        this.controller.press(btn);
      } else {
        this.controller.release(btn);
      }
    }
  }

  private setupActionButtons(): void {
    const btnMap: Record<string, Button> = {
      a: Button.A,
      b: Button.B,
    };
    const actionBtns = this.container.querySelectorAll<HTMLButtonElement>(".action-btn");
    for (const btn of actionBtns) {
      const key = btn.dataset["btn"];
      if (!key) continue;
      const nesBtn = btnMap[key];
      if (nesBtn === undefined) continue;

      const ctrl = this.controller;
      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        ctrl.press(nesBtn);
      });
      btn.addEventListener("touchend", (e) => {
        e.preventDefault();
        ctrl.release(nesBtn);
      });
      btn.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        ctrl.release(nesBtn);
      });
    }
  }

  private setupMenuButtons(): void {
    const btnMap: Record<string, Button> = {
      start: Button.Start,
      select: Button.Select,
    };
    const menuBtns = this.container.querySelectorAll<HTMLButtonElement>(".menu-btn");
    for (const btn of menuBtns) {
      const key = btn.dataset["btn"];
      if (!key) continue;
      const nesBtn = btnMap[key];
      if (nesBtn === undefined) continue;

      const ctrl = this.controller;
      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        ctrl.press(nesBtn);
      });
      btn.addEventListener("touchend", (e) => {
        e.preventDefault();
        ctrl.release(nesBtn);
      });
      btn.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        ctrl.release(nesBtn);
      });
    }
  }
}

export function isTouchDevice(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}
