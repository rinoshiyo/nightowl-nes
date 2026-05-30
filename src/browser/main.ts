import { parseINes } from "../core/cart.ts";
import { NesConsole } from "../core/console.ts";
import { Renderer } from "./renderer.ts";

const canvas = document.getElementById("screen") as HTMLCanvasElement;
const romInput = document.getElementById("rom-input") as HTMLInputElement;
const status = document.getElementById("status") as HTMLDivElement;

const renderer = new Renderer(canvas);
let nes: NesConsole | null = null;
let running = false;

romInput.addEventListener("change", () => {
  const file = romInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const buf = new Uint8Array(reader.result as ArrayBuffer);
      const cart = parseINes(buf);
      nes = new NesConsole(cart);
      status.textContent = `${file.name} (PRG: ${cart.header.prgRomSize / 1024}KB, CHR: ${cart.header.chrRomSize / 1024}KB, Mapper: ${cart.header.mapper})`;
      if (!running) {
        running = true;
        requestAnimationFrame(gameLoop);
      }
    } catch (e) {
      status.textContent = `エラー: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
  reader.readAsArrayBuffer(file);
});

function gameLoop(): void {
  if (!nes) return;

  nes.stepFrame();
  renderer.render(nes.ppu.framebuffer);

  requestAnimationFrame(gameLoop);
}
