/**
 * blargg テスト ROM 実行ヘルパー。
 *
 * テスト ROM を読み込み、NesConsole で規定フレーム数実行して結果を判定する。
 * blargg テスト ROM は $6000 にステータス、$6004- にテキストメッセージを書く。
 */

import { readFileSync } from "node:fs";
import { parseINes } from "../../src/core/cart.ts";
import { NesConsole } from "../../src/core/console.ts";

export interface TestRomResult {
  status: number;
  message: string;
  passed: boolean;
  frames: number;
}

/**
 * blargg テスト ROM を実行して結果を返す。
 * @param romPath ROM ファイルパス
 * @param maxFrames 最大フレーム数 (タイムアウト)
 */
export function runTestRom(romPath: string, maxFrames = 600): TestRomResult {
  const buf = new Uint8Array(readFileSync(romPath));
  const cart = parseINes(buf);
  const nes = new NesConsole(cart);

  let frames = 0;
  let lastStatus = 0x80;

  for (frames = 0; frames < maxFrames; frames++) {
    nes.stepFrame();

    const status = nes.bus.read(0x6000);

    if (status !== 0x80 && status !== 0x00 && frames > 10) {
      lastStatus = status;
    }

    if (status === 0x00 && frames > 10) {
      lastStatus = 0;
      break;
    }

    if (frames > 30 && status !== 0x80 && status !== 0x00) {
      lastStatus = status;
      break;
    }
  }

  if (lastStatus === 0x80) {
    lastStatus = nes.bus.read(0x6000);
  }

  const message = readResultText(nes, 0x6004);

  return {
    status: lastStatus,
    message,
    passed: lastStatus === 0,
    frames,
  };
}

function readResultText(nes: NesConsole, startAddr: number): string {
  const chars: string[] = [];
  for (let i = 0; i < 256; i++) {
    const ch = nes.bus.read(startAddr + i);
    if (ch === 0) break;
    chars.push(String.fromCharCode(ch));
  }
  return chars.join("");
}
