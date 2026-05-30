import { NES_PALETTE } from "../core/palette.ts";

const SCREEN_W = 256;
const SCREEN_H = 240;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imageData: ImageData;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context を取得できません");
    this.ctx = ctx;
    this.imageData = ctx.createImageData(SCREEN_W, SCREEN_H);
  }

  render(framebuffer: Uint8Array): void {
    const data = this.imageData.data;
    const len = SCREEN_W * SCREEN_H;
    for (let i = 0; i < len; i++) {
      const colorIdx = framebuffer[i]! & 0x3f;
      const rgb = NES_PALETTE[colorIdx]!;
      const off = i << 2;
      data[off] = rgb[0];
      data[off + 1] = rgb[1];
      data[off + 2] = rgb[2];
      data[off + 3] = 255;
    }
    this.ctx.putImageData(this.imageData, 0, 0);
  }
}
