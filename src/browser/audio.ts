/**
 * NES オーディオ出力 (Web Audio API + AudioWorklet)。
 *
 * APU 内部のリングバッファからサンプルを読み出し、
 * AudioWorkletNode 経由で再生する。
 */

import type { Apu } from "../core/apu.ts";

const PROCESSOR_NAME = "nes-processor";

const PROCESSOR_JS = /* js */ `
class NesProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(8192);
    this._rd = 0;
    this._wr = 0;
    this.port.onmessage = (e) => {
      const data = e.data;
      for (let i = 0; i < data.length; i++) {
        this._buf[this._wr] = data[i];
        this._wr = (this._wr + 1) & 0x1fff;
      }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      if (this._rd === this._wr) {
        out[i] = 0;
      } else {
        out[i] = this._buf[this._rd];
        this._rd = (this._rd + 1) & 0x1fff;
      }
    }
    return true;
  }
}
registerProcessor('${PROCESSOR_NAME}', NesProcessor);
`;

const DRAIN_BUFFER_SIZE = 4096;

export class NesAudio {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private apu: Apu | null = null;
  private workletReady = false;
  private readonly drainBuffer = new Float32Array(DRAIN_BUFFER_SIZE);

  async start(apu: Apu): Promise<void> {
    this.apu = apu;

    if (!this.ctx) {
      this.ctx = new AudioContext();
    }

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    apu.setSampleRate(this.ctx.sampleRate);

    if (this.workletNode) {
      this.workletNode.disconnect();
    }

    if (!this.workletReady) {
      const blob = new Blob([PROCESSOR_JS], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      try {
        await this.ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      this.workletReady = true;
    }

    this.workletNode = new AudioWorkletNode(this.ctx, PROCESSOR_NAME);
    this.workletNode.connect(this.ctx.destination);
  }

  /** メインスレッドから呼び出し、APU バッファのサンプルを Worklet へ転送する */
  drain(): void {
    if (!this.apu || !this.workletNode) return;
    const written = this.apu.readSamples(this.drainBuffer);
    if (written > 0) {
      this.workletNode.port.postMessage(this.drainBuffer.subarray(0, written));
    }
  }

  stop(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.apu = null;
  }
}
