import { NES_PALETTE } from "../core/palette.ts";
import { SCREEN_W, VISIBLE_LINES } from "../core/ppu.ts";

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imageData: ImageData;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = SCREEN_W;
    canvas.height = VISIBLE_LINES;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context を取得できません");
    this.ctx = ctx;
    this.imageData = ctx.createImageData(SCREEN_W, VISIBLE_LINES);
    const d = this.imageData.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
  }

  render(framebuffer: Uint8Array): void {
    const data = this.imageData.data;
    const len = SCREEN_W * VISIBLE_LINES;
    for (let i = 0; i < len; i++) {
      const colorIdx = framebuffer[i]! & 0x3f;
      const rgb = NES_PALETTE[colorIdx]!;
      const off = i << 2;
      data[off] = rgb[0];
      data[off + 1] = rgb[1];
      data[off + 2] = rgb[2];
    }
    this.ctx.putImageData(this.imageData, 0, 0);
  }
}
