import { parseINes } from "../core/cart.ts";
import { NesConsole } from "../core/console.ts";
import { Button } from "../core/controller.ts";
import { NesAudio } from "./audio.ts";
import { Renderer } from "./renderer.ts";
import { computeRomHash, loadPrgRam, savePrgRam, hasSaveData, deleteSaveData } from "./save-manager.ts";
import { formatErrorMessage } from "./error-messages.ts";
import { applyGamepadState } from "./gamepad.ts";

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`要素 #${id} が見つかりません`);
  return el as T;
}

const canvas = getEl<HTMLCanvasElement>("screen");
const romInput = getEl<HTMLInputElement>("rom-input");
const status = getEl<HTMLDivElement>("status");
const saveInfo = getEl<HTMLDivElement>("save-info");
const deleteBtn = getEl<HTMLButtonElement>("delete-save");

const renderer = new Renderer(canvas);
const audio = new NesAudio();
let nes: NesConsole | null = null;
let running = false;
let currentRomHash: string | null = null;
let currentHasBattery = false;
let saveDisabled = false;

// --- G5: エラー表示の改善 ---

const errorOverlay = getEl<HTMLDivElement>("error-overlay");
const errorMessage = getEl<HTMLDivElement>("error-message");
const errorClose = getEl<HTMLButtonElement>("error-close");

function showError(e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  const friendly = formatErrorMessage(msg);
  errorMessage.textContent = friendly;
  errorOverlay.classList.add("visible");
  status.textContent = `エラー: ${friendly}`;
}

errorClose.addEventListener("click", () => {
  errorOverlay.classList.remove("visible");
});

const FRAME_MS = 1000 / 60;
let lastFrameTime = 0;
const SAVE_INTERVAL_MS = 5000;
let lastSaveTime = 0;

function updateSaveUi(): void {
  if (!currentRomHash || !currentHasBattery) {
    saveInfo.textContent = "";
    deleteBtn.style.display = "none";
    return;
  }
  if (hasSaveData(currentRomHash)) {
    saveInfo.textContent = "💾 セーブデータあり ";
    saveInfo.appendChild(deleteBtn);
    deleteBtn.style.display = "inline";
  } else {
    saveInfo.textContent = "";
    deleteBtn.style.display = "none";
  }
}

function flushSave(): void {
  if (!nes || !currentRomHash || !currentHasBattery || saveDisabled) return;
  const ram = nes.mapper.getPrgRam();
  if (ram) savePrgRam(currentRomHash, ram);
}

async function loadRom(file: File): Promise<void> {
  const arrayBuf = await file.arrayBuffer();
  const buf = new Uint8Array(arrayBuf);
  const cart = parseINes(buf);

  flushSave();

  const hash = await computeRomHash(cart.prgRom);

  const console = new NesConsole(cart);
  currentRomHash = hash;
  currentHasBattery = cart.header.hasBattery;
  saveDisabled = false;

  if (currentHasBattery) {
    const saved = loadPrgRam(hash);
    if (saved) console.mapper.setPrgRam(saved);
  }

  nes = console;
  audio.start(nes.apu);

  let statusText = `${file.name} (PRG: ${cart.header.prgRomSize / 1024}KB, CHR: ${cart.header.chrRomSize / 1024}KB, Mapper: ${cart.header.mapper})`;
  if (currentHasBattery) {
    statusText += " [Battery]";
    if (hasSaveData(hash)) statusText += " [SAVE LOADED]";
  }
  status.textContent = statusText;
  updateSaveUi();

  if (!running) {
    running = true;
    lastFrameTime = 0;
    lastSaveTime = performance.now();
    requestAnimationFrame(gameLoop);
  }
}

romInput.addEventListener("change", () => {
  const file = romInput.files?.[0];
  if (!file) return;
  loadRom(file).catch((e) => {
    showError(e);
  });
});

// --- G1: ドラッグ&ドロップ ---

const dropOverlay = getEl<HTMLDivElement>("drop-overlay");

document.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropOverlay.classList.add("visible");
});

document.addEventListener("dragleave", (e) => {
  if (e.relatedTarget === null) {
    dropOverlay.classList.remove("visible");
  }
});

document.addEventListener("drop", (e) => {
  e.preventDefault();
  dropOverlay.classList.remove("visible");
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".nes")) {
    showError(new Error(".nes ファイルのみ対応しています"));
    return;
  }
  loadRom(file).catch((err) => {
    showError(err);
  });
});

const KEY_MAP_1P: ReadonlyMap<string, Button> = new Map([
  ["arrowup", Button.Up],
  ["arrowdown", Button.Down],
  ["arrowleft", Button.Left],
  ["arrowright", Button.Right],
  ["z", Button.A],
  ["x", Button.B],
  ["enter", Button.Start],
  ["shift", Button.Select],
]);

const KEY_MAP_2P: ReadonlyMap<string, Button> = new Map([
  ["w", Button.Up],
  ["s", Button.Down],
  ["a", Button.Left],
  ["d", Button.Right],
  ["j", Button.A],
  ["k", Button.B],
  ["t", Button.Start],
  ["g", Button.Select],
]);

document.addEventListener("keydown", (e) => {
  if (!nes) return;
  const key = e.key.toLowerCase();
  const btn1 = KEY_MAP_1P.get(key);
  if (btn1 !== undefined) {
    e.preventDefault();
    nes.controller1.press(btn1);
    return;
  }
  const btn2 = KEY_MAP_2P.get(key);
  if (btn2 !== undefined) {
    e.preventDefault();
    nes.controller2.press(btn2);
  }
});

document.addEventListener("keyup", (e) => {
  if (!nes) return;
  const key = e.key.toLowerCase();
  const btn1 = KEY_MAP_1P.get(key);
  if (btn1 !== undefined) {
    e.preventDefault();
    nes.controller1.release(btn1);
    return;
  }
  const btn2 = KEY_MAP_2P.get(key);
  if (btn2 !== undefined) {
    e.preventDefault();
    nes.controller2.release(btn2);
  }
});

// --- G2: Gamepad API ---

function pollGamepads(): void {
  if (!nes) return;
  const gamepads = navigator.getGamepads();
  for (let gi = 0; gi < gamepads.length; gi++) {
    const gp = gamepads[gi];
    if (!gp) continue;
    const ctrl = gi === 0 ? nes.controller1 : nes.controller2;
    applyGamepadState(gp, ctrl);
  }
}

function gameLoop(timestamp: number): void {
  if (!nes) {
    running = false;
    return;
  }

  pollGamepads();

  const elapsed = timestamp - lastFrameTime;
  if (elapsed >= FRAME_MS) {
    lastFrameTime = timestamp - (elapsed % FRAME_MS);
    try {
      nes.stepFrame();
      renderer.render(nes.ppu.framebuffer);
    } catch (e) {
      showError(e);
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

// --- G4: 画面サイズ切替 ---

type ScreenScale = 1 | 2 | 3;
let currentScale: ScreenScale = 2;
const scaleBtn = getEl<HTMLButtonElement>("scale-btn");
const fullscreenBtn = getEl<HTMLButtonElement>("fullscreen-btn");

function applyScale(scale: ScreenScale): void {
  currentScale = scale;
  canvas.style.width = `${256 * scale}px`;
  canvas.style.height = `${240 * scale}px`;
  scaleBtn.textContent = `${scale}x`;
}

scaleBtn.addEventListener("click", () => {
  const next = currentScale === 1 ? 2 : currentScale === 2 ? 3 : 1;
  applyScale(next as ScreenScale);
});

fullscreenBtn.addEventListener("click", () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    canvas.requestFullscreen().catch(() => {});
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (document.activeElement === document.body || document.activeElement === canvas) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        canvas.requestFullscreen().catch(() => {});
      }
    }
  }
});

// --- G3: 操作ヘルプ表示 ---

const helpToggle = getEl<HTMLButtonElement>("help-toggle");
const helpContent = getEl<HTMLDivElement>("help-content");

helpToggle.addEventListener("click", () => {
  const visible = helpContent.classList.toggle("visible");
  helpToggle.textContent = visible ? "操作ヘルプ ▲" : "操作ヘルプ ▼";
});

deleteBtn.addEventListener("click", () => {
  if (!currentRomHash) return;
  if (!confirm("セーブデータを削除しますか？")) return;
  deleteSaveData(currentRomHash);
  saveDisabled = true;
  updateSaveUi();
});
