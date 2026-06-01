import { parseINes } from "../core/cart.ts";
import type { Cart } from "../core/cart.ts";
import { NesConsole } from "../core/console.ts";
import { Button } from "../core/controller.ts";
import { NesAudio } from "./audio.ts";
import { Renderer } from "./renderer.ts";
import { computeRomHash, loadPrgRam, savePrgRam } from "./save-manager.ts";

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
let currentRomHash: string | null = null;
let currentCart: Cart | null = null;

const FRAME_MS = 1000 / 60;
let lastFrameTime = 0;
const SAVE_INTERVAL_MS = 5000;
let lastSaveTime = 0;

function flushSave(): void {
  if (!nes || !currentRomHash || !currentCart?.header.hasBattery) return;
  const ram = nes.mapper.getPrgRam();
  if (ram) savePrgRam(currentRomHash, ram);
}

romInput.addEventListener("change", () => {
  const file = romInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      flushSave();
      const buf = new Uint8Array(reader.result as ArrayBuffer);
      const cart = parseINes(buf);
      currentCart = cart;
      nes = new NesConsole(cart);
      audio.start(nes.apu);

      computeRomHash(cart.prgRom).then((hash) => {
        currentRomHash = hash;
        if (cart.header.hasBattery) {
          const saved = loadPrgRam(hash);
          if (saved) {
            nes!.mapper.setPrgRam(saved);
            status.textContent += " [SAVE LOADED]";
          }
        }
      });

      let statusText = `${file.name} (PRG: ${cart.header.prgRomSize / 1024}KB, CHR: ${cart.header.chrRomSize / 1024}KB, Mapper: ${cart.header.mapper})`;
      if (cart.header.hasBattery) statusText += " [Battery]";
      status.textContent = statusText;

      if (!running) {
        running = true;
        lastFrameTime = 0;
        lastSaveTime = 0;
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

  if (timestamp - lastSaveTime >= SAVE_INTERVAL_MS) {
    lastSaveTime = timestamp;
    flushSave();
  }

  requestAnimationFrame(gameLoop);
}

window.addEventListener("beforeunload", flushSave);
