/**
 * APU エンベロープユニット。
 *
 * Quarter Frame ごとに clock され、音量の減衰を制御する。
 * 仕様参照: https://www.nesdev.org/wiki/APU_Envelope
 */

export class Envelope {
  start = false;
  loop = false;
  constantVolume = false;
  volume = 0;
  decayLevel = 0;
  divider = 0;

  tick(): void {
    if (this.start) {
      this.start = false;
      this.decayLevel = 15;
      this.divider = this.volume;
      return;
    }

    if (this.divider > 0) {
      this.divider--;
      return;
    }

    this.divider = this.volume;

    if (this.decayLevel > 0) {
      this.decayLevel--;
    } else if (this.loop) {
      this.decayLevel = 15;
    }
  }

  output(): number {
    return this.constantVolume ? this.volume : this.decayLevel;
  }
}
