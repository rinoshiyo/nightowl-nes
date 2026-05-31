/**
 * NES オーディオ出力 (Web Audio API)。
 *
 * APU 内部のリングバッファからサンプルを読み出し、
 * ScriptProcessorNode 経由で再生する。
 */

import type { Apu } from "../core/apu.ts";

const BUFFER_SIZE = 2048;

export class NesAudio {
  private ctx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private apu: Apu | null = null;

  start(apu: Apu): void {
    this.apu = apu;

    if (!this.ctx) {
      this.ctx = new AudioContext();
    }

    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }

    apu.setSampleRate(this.ctx.sampleRate);

    if (this.processor) {
      this.processor.disconnect();
    }

    this.processor = this.ctx.createScriptProcessor(BUFFER_SIZE, 0, 1);
    this.processor.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0);
      if (this.apu) {
        const written = this.apu.readSamples(output);
        if (written < output.length) {
          output.fill(0, written);
        }
      } else {
        output.fill(0);
      }
    };
    this.processor.connect(this.ctx.destination);
  }

  stop(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    this.apu = null;
  }
}
