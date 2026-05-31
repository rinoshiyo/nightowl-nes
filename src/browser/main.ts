import { parseINes } from "../core/cart.ts";
import { NesConsole } from "../core/console.ts";
import { Button } from "../core/controller.ts";
import { NesAudio } from "./audio.ts";
import { Renderer } from "./renderer.ts";

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`要素 #${id} が見つかりません`);
  return el as T;
}

const canvas = getEl<HTMLCanvasElement>("screen");
const romInput = getEl<HTMLInputElement>("rom-input");
const status = getEl<HTMLDivElement>("status");

const renderer = new Renderer(canvas);
const audio = new NesAudio();
let nes: NesConsole | null = null;
let running = false;

const FRAME_MS = 1000 / 60;
let lastFrameTime = 0;

romInput.addEventListener("change", () => {
  const file = romInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const buf = new Uint8Array(reader.result as ArrayBuffer);
      const cart = parseINes(buf);
      nes = new NesConsole(cart);
      audio.start(nes.apu);
      status.textContent = `${file.name} (PRG: ${cart.header.prgRomSize / 1024}KB, CHR: ${cart.header.chrRomSize / 1024}KB, Mapper: ${cart.header.mapper})`;
      if (!running) {
        running = true;
        lastFrameTime = 0;
        requestAnimationFrame(gameLoop);
      }
    } catch (e) {
      status.textContent = `エラー: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
  reader.onerror = () => {
    status.textContent = "エラー: ファイルの読み込みに失敗しました";
  };
  reader.readAsArrayBuffer(file);
});

const KEY_MAP: ReadonlyMap<string, Button> = new Map([
  ["arrowup", Button.Up],
  ["arrowdown", Button.Down],
  ["arrowleft", Button.Left],
  ["arrowright", Button.Right],
  ["z", Button.A],
  ["x", Button.B],
  ["enter", Button.Start],
  ["shift", Button.Select],
]);

document.addEventListener("keydown", (e) => {
  const btn = KEY_MAP.get(e.key.toLowerCase());
  if (btn !== undefined && nes) {
    e.preventDefault();
    nes.controller1.press(btn);
  }
});

document.addEventListener("keyup", (e) => {
  const btn = KEY_MAP.get(e.key.toLowerCase());
  if (btn !== undefined && nes) {
    e.preventDefault();
    nes.controller1.release(btn);
  }
});

function gameLoop(timestamp: number): void {
  if (!nes) {
    running = false;
    return;
  }

  const elapsed = timestamp - lastFrameTime;
  if (elapsed >= FRAME_MS) {
    lastFrameTime = timestamp - (elapsed % FRAME_MS);
    try {
      nes.stepFrame();
      renderer.render(nes.ppu.framebuffer);
    } catch (e) {
      status.textContent = `エラー: ${e instanceof Error ? e.message : String(e)}`;
      running = false;
      return;
    }
  }

  requestAnimationFrame(gameLoop);
}
