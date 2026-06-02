/**
 * ステートセーブ/ロードのデータ型とユーティリティ。
 *
 * 各コンポーネントの状態を JSON シリアライズ可能な形に変換する。
 * Uint8Array は number[] に変換して JSON 互換にする。
 */

export const STATE_VERSION = 1;

export interface CpuState {
  a: number;
  x: number;
  y: number;
  sp: number;
  pc: number;
  p: number;
  cycles: number;
  nmiPending: boolean;
  irqPending: boolean;
  halted: boolean;
}

export interface PpuState {
  mirroring: import("./cart.ts").Mirroring;
  ctrl: number;
  mask: number;
  status: number;
  oamAddr: number;
  ioLatch: number;
  v: number;
  t: number;
  x: number;
  w: boolean;
  readBuffer: number;
  dot: number;
  scanline: number;
  frameComplete: boolean;
  oddFrame: boolean;
  nmiDelay: number;
  ioLatchDecay: number[];
  bgNametable: number;
  bgAttribute: number;
  bgPatternLo: number;
  bgPatternHi: number;
  bgFetchedCol: number;
  bgColorIdx: number;
  slInitCoarseX: number;
  slInitNtX: number;
  spriteCount: number;
  sprite0InLine: boolean;
  lastA12: number;
  chrRam: number[];
  vram: number[];
  palette: number[];
  oam: number[];
}

export interface EnvelopeState {
  start: boolean;
  loop: boolean;
  constantVolume: boolean;
  volume: number;
  decayLevel: number;
  divider: number;
}

export interface SweepState {
  enabled: boolean;
  period: number;
  negate: boolean;
  shift: number;
  reload: boolean;
  divider: number;
}

export interface PulseState {
  duty: number;
  dutyPos: number;
  timerPeriod: number;
  timerValue: number;
  lengthCounter: number;
  lengthHalt: boolean;
  enabled: boolean;
  envelope: EnvelopeState;
  sweep: SweepState;
}

export interface TriangleState {
  linearCounter: number;
  linearCounterReload: number;
  linearCounterReloadFlag: boolean;
  controlFlag: boolean;
  timerPeriod: number;
  timerValue: number;
  sequencerPos: number;
  lengthCounter: number;
  enabled: boolean;
}

export interface NoiseState {
  shiftRegister: number;
  mode: boolean;
  timerPeriod: number;
  timerValue: number;
  lengthCounter: number;
  lengthHalt: boolean;
  enabled: boolean;
  envelope: EnvelopeState;
}

export interface DmcState {
  timerPeriod: number;
  timerValue: number;
  outputLevel: number;
  sampleBuffer: number;
  sampleBufferEmpty: boolean;
  shiftRegister: number;
  bitsRemaining: number;
  silenceFlag: boolean;
  sampleAddress: number;
  sampleLength: number;
  currentAddress: number;
  bytesRemaining: number;
  loop: boolean;
  irqEnabled: boolean;
  irqFlag: boolean;
  stallCycles: number;
}

export interface ApuState {
  pulse1: PulseState;
  pulse2: PulseState;
  triangle: TriangleState;
  noise: NoiseState;
  dmc: DmcState;
  frameMode: number;
  frameCycle: number;
  frameStep: number;
  frameIrqInhibit: boolean;
  frameIrqFlag: boolean;
  cpuCycleOdd: boolean;
  frameResetDelay: number;
  pendingFrameMode: number;
}

export interface BusState {
  ram: number[];
  dmaCycles: number;
}

export interface MapperState {
  id: number;
  data: Record<string, unknown>;
}

export interface NesState {
  version: number;
  cpu: CpuState;
  ppu: PpuState;
  apu: ApuState;
  bus: BusState;
  mapper: MapperState;
}
