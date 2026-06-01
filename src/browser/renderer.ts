import { NES_PALETTE_RGBA32 } from "../core/palette.ts";
import { SCREEN_W, VISIBLE_LINES } from "../core/ppu.ts";

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imageData: ImageData;
  /** ImageData バッファの Uint32Array ビュー (1 ピクセル 1 write) */
  private readonly pixels: Uint32Array;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = SCREEN_W;
    canvas.height = VISIBLE_LINES;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context を取得できません");
    this.ctx = ctx;
    this.imageData = ctx.createImageData(SCREEN_W, VISIBLE_LINES);
    this.pixels = new Uint32Array(this.imageData.data.buffer);
  }

  render(framebuffer: Uint8Array): void {
    const px = this.pixels;
    const pal = NES_PALETTE_RGBA32;
    const len = SCREEN_W * VISIBLE_LINES;
    for (let i = 0; i < len; i++) {
      px[i] = pal[framebuffer[i]! & 0x3f]!;
    }
    this.ctx.putImageData(this.imageData, 0, 0);
  }
}
