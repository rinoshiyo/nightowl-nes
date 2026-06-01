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

const TOUCH_OPTS: AddEventListenerOptions = { passive: false };

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
    this.setupButtons(".action-btn", { a: Button.A, b: Button.B });
    this.setupButtons(".menu-btn", { start: Button.Start, select: Button.Select });
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

      btn.addEventListener("touchstart", press, TOUCH_OPTS);
      btn.addEventListener("touchend", release, TOUCH_OPTS);
      btn.addEventListener("touchcancel", release, TOUCH_OPTS);
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

  private setupButtons(selector: string, btnMap: Record<string, Button>): void {
    const buttons = this.container.querySelectorAll<HTMLButtonElement>(selector);
    const ctrl = this.controller;
    for (const btn of buttons) {
      const key = btn.dataset["btn"];
      if (!key) continue;
      const nesBtn = btnMap[key];
      if (nesBtn === undefined) continue;

      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        ctrl.press(nesBtn);
      }, TOUCH_OPTS);
      btn.addEventListener("touchend", (e) => {
        e.preventDefault();
        ctrl.release(nesBtn);
      }, TOUCH_OPTS);
      btn.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        ctrl.release(nesBtn);
      }, TOUCH_OPTS);
    }
  }
}

export function isTouchDevice(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}
