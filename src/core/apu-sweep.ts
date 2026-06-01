/**
 * APU スイープユニット。
 *
 * Half Frame ごとに clock され、パルスチャンネルの周波数を自動変化させる。
 * pulse1 と pulse2 で negate の計算方式が異なる。
 * 仕様参照: https://www.nesdev.org/wiki/APU_Sweep
 */

import type { SweepState } from "./state.ts";

export class SweepUnit {
  enabled = false;
  period = 0;
  negate = false;
  shift = 0;
  reload = false;
  divider = 0;
  /** pulse1 = 1 (1の補数), pulse2 = 2 (2の補数) */
  channelId: 1 | 2;

  constructor(channelId: 1 | 2) {
    this.channelId = channelId;
  }

  targetPeriod(currentPeriod: number): number {
    const change = currentPeriod >> this.shift;
    if (this.negate) {
      // pulse1: 1の補数 (change を引いてさらに -1)
      // pulse2: 2の補数 (change を引くだけ)
      return this.channelId === 1
        ? currentPeriod - change - 1
        : currentPeriod - change;
    }
    return currentPeriod + change;
  }

  isMuting(currentPeriod: number): boolean {
    return currentPeriod < 8 || this.targetPeriod(currentPeriod) > 0x7ff;
  }

  tick(timerPeriod: number): number {
    let newPeriod = timerPeriod;

    if (this.divider === 0 && this.enabled && !this.isMuting(timerPeriod) && this.shift > 0) {
      newPeriod = this.targetPeriod(timerPeriod);
    }

    if (this.divider === 0 || this.reload) {
      this.divider = this.period;
      this.reload = false;
    } else {
      this.divider--;
    }

    return newPeriod;
  }

  serialize(): SweepState {
    return {
      enabled: this.enabled,
      period: this.period,
      negate: this.negate,
      shift: this.shift,
      reload: this.reload,
      divider: this.divider,
    };
  }

  deserialize(state: SweepState): void {
    this.enabled = state.enabled;
    this.period = state.period;
    this.negate = state.negate;
    this.shift = state.shift;
    this.reload = state.reload;
    this.divider = state.divider;
  }
}
