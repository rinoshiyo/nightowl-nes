/**
 * iNES (.nes) ヘッダパーサ。
 *
 * 仕様: https://www.nesdev.org/wiki/INES
 *
 * 16 byte ヘッダを解釈し、 PRG ROM / CHR ROM / Trainer の各バイト列に
 * 切り出した結果を Cart として返す。 NES 2.0 拡張・PlayChoice 等は
 * 後続の夜で必要になり次第拡張する (現状は無視)。
 */

const INES_MAGIC = [0x4e, 0x45, 0x53, 0x1a] as const;
const HEADER_SIZE = 16;
const PRG_BANK_SIZE = 16 * 1024;
const CHR_BANK_SIZE = 8 * 1024;
const TRAINER_SIZE = 512;

export type Mirroring = "horizontal" | "vertical" | "single-lower" | "single-upper" | "four-screen";

export interface INesHeader {
  /** PRG ROM サイズ (バイト) */
  prgRomSize: number;
  /** CHR ROM サイズ (バイト)。 0 の時は CHR RAM */
  chrRomSize: number;
  /** Mapper 番号 (flags6 上位 4bit + flags7 上位 4bit) */
  mapper: number;
  /** ネームテーブルミラーリング (four-screen の時は別途 fourScreen フラグを参照) */
  mirroring: Mirroring;
  /** バッテリーバックアップ SRAM の有無 */
  hasBattery: boolean;
  /** 0x7000-0x71FF にロードされる 512 byte トレーナーの有無 */
  hasTrainer: boolean;
  /** Four-screen VRAM レイアウト */
  fourScreen: boolean;
}

export interface Cart {
  header: INesHeader;
  prgRom: Uint8Array;
  chrRom: Uint8Array;
  trainer: Uint8Array | null;
}

export function parseINes(buf: Uint8Array): Cart {
  if (buf.length < HEADER_SIZE) {
    throw new Error(`iNES: header too short (${buf.length} bytes)`);
  }
  for (let i = 0; i < INES_MAGIC.length; i++) {
    if (buf[i] !== INES_MAGIC[i]) {
      throw new Error("iNES: magic mismatch (expected 'NES\\x1A')");
    }
  }

  const prgBanks = buf[4] ?? 0;
  const chrBanks = buf[5] ?? 0;
  const flags6 = buf[6] ?? 0;
  const flags7 = buf[7] ?? 0;

  const prgRomSize = prgBanks * PRG_BANK_SIZE;
  const chrRomSize = chrBanks * CHR_BANK_SIZE;
  const mapper = ((flags7 & 0xf0) | (flags6 >> 4)) & 0xff;
  const mirroring: Mirroring = (flags6 & 0x01) !== 0 ? "vertical" : "horizontal";
  const hasBattery = (flags6 & 0x02) !== 0;
  const hasTrainer = (flags6 & 0x04) !== 0;
  const fourScreen = (flags6 & 0x08) !== 0;

  let offset = HEADER_SIZE;
  let trainer: Uint8Array | null = null;
  if (hasTrainer) {
    trainer = new Uint8Array(buf.subarray(offset, offset + TRAINER_SIZE));
    offset += TRAINER_SIZE;
  }

  const prgRom = new Uint8Array(buf.subarray(offset, offset + prgRomSize));
  offset += prgRomSize;
  const chrRom = new Uint8Array(buf.subarray(offset, offset + chrRomSize));

  if (prgRom.length !== prgRomSize) {
    throw new Error(
      `iNES: PRG ROM truncated (expected ${prgRomSize}, got ${prgRom.length})`,
    );
  }
  if (chrRom.length !== chrRomSize) {
    throw new Error(
      `iNES: CHR ROM truncated (expected ${chrRomSize}, got ${chrRom.length})`,
    );
  }

  return {
    header: {
      prgRomSize,
      chrRomSize,
      mapper,
      mirroring,
      hasBattery,
      hasTrainer,
      fourScreen,
    },
    prgRom,
    chrRom,
    trainer,
  };
}
