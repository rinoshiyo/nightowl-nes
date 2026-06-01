import { describe, expect, it } from "vitest";

import type { Cart } from "../src/core/cart.ts";
import { MapperMmc1 } from "../src/core/mappers/mmc1.ts";

/** PRG 16KB バンクに識別子を埋め込んだテスト用カートリッジ */
function makeMmc1Cart(
  prgBankCount: number,
  chrBankCount = 0,
): Cart {
  const prgSize = prgBankCount * 0x4000;
  const prgRom = new Uint8Array(prgSize);
  for (let bank = 0; bank < prgBankCount; bank++) {
    const offset = bank * 0x4000;
    prgRom[offset] = bank;
    prgRom[offset + 1] = 0xaa;
    prgRom[offset + 0x3fff] = bank | 0xf0;
  }

  const chrSize = chrBankCount * 0x1000;
  const chrRom = new Uint8Array(chrSize);
  for (let bank = 0; bank < chrBankCount; bank++) {
    const offset = bank * 0x1000;
    chrRom[offset] = bank;
    chrRom[offset + 0x0fff] = bank | 0xc0;
  }

  return {
    header: {
      prgRomSize: prgSize,
      chrRomSize: chrSize,
      mapper: 1,
      mirroring: "horizontal",
      hasBattery: false,
      hasTrainer: false,
      fourScreen: false,
    },
    prgRom,
    chrRom,
    trainer: null,
  };
}

/** シフトレジスタに 5 bit を書き込むヘルパー (LSB first) */
function writeShiftRegister(
  mapper: MapperMmc1,
  addr: number,
  value: number,
): void {
  for (let i = 0; i < 5; i++) {
    mapper.writePrg(addr, (value >> i) & 1);
  }
}

describe("MMC1 シフトレジスタ", () => {
  it("5 回書き込みで内部レジスタに転送される", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    // PRG bank レジスタ ($E000-$FFFF) にバンク 5 を書き込み
    writeShiftRegister(mapper, 0xe000, 5);
    // 初期 PRG mode 3: $8000 切替・$C000 末尾固定
    expect(mapper.readPrg(0x8000)).toBe(5);
  });

  it("4 回書き込みだけでは転送されない", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    // 4 回だけ書く
    for (let i = 0; i < 4; i++) {
      mapper.writePrg(0xe000, (3 >> i) & 1);
    }
    // まだ転送されないのでバンク 0 のまま
    expect(mapper.readPrg(0x8000)).toBe(0);
  });

  it("bit 7 セットでシフトレジスタがリセットされる", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    // 3 回書いてから bit 7 でリセット
    mapper.writePrg(0xe000, 1);
    mapper.writePrg(0xe000, 1);
    mapper.writePrg(0xe000, 1);
    mapper.writePrg(0xe000, 0x80); // リセット
    // 改めて 5 回書き込み → バンク 2
    writeShiftRegister(mapper, 0xe000, 2);
    expect(mapper.readPrg(0x8000)).toBe(2);
  });

  it("bit 7 リセットで control の PRG モードが 3 にセットされる", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    // control を PRG mode 0 に変更
    writeShiftRegister(mapper, 0x8000, 0x00);
    // bit 7 リセット
    mapper.writePrg(0x8000, 0x80);
    // PRG mode 3 に戻っているので、$C000 は末尾バンク固定
    expect(mapper.readPrg(0xc000)).toBe(15);
  });
});

describe("MMC1 PRG バンク切替", () => {
  it("初期状態: PRG mode 3 (先頭切替+末尾固定)", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    // $8000 = バンク 0、$C000 = 最終バンク 15
    expect(mapper.readPrg(0x8000)).toBe(0);
    expect(mapper.readPrg(0xc000)).toBe(15);
    expect(mapper.readPrg(0xffff)).toBe(15 | 0xf0);
  });

  it("PRG mode 3: $8000 のバンクを切替", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    writeShiftRegister(mapper, 0xe000, 7);
    expect(mapper.readPrg(0x8000)).toBe(7);
    expect(mapper.readPrg(0x8001)).toBe(0xaa);
    expect(mapper.readPrg(0xbfff)).toBe(7 | 0xf0);
    // $C000 は変わらず末尾固定
    expect(mapper.readPrg(0xc000)).toBe(15);
  });

  it("PRG mode 2: 先頭固定 + $C000 切替", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    // control: PRG mode 2, CHR mode 0
    writeShiftRegister(mapper, 0x8000, 0x08);
    // PRG bank = 5
    writeShiftRegister(mapper, 0xe000, 5);
    // $8000 は先頭バンク (0) 固定
    expect(mapper.readPrg(0x8000)).toBe(0);
    // $C000 はバンク 5
    expect(mapper.readPrg(0xc000)).toBe(5);
  });

  it("PRG mode 0: 32KB 切替", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    // control: PRG mode 0
    writeShiftRegister(mapper, 0x8000, 0x00);
    // PRG bank = 4 (bit 0 無視なので 32KB バンク 2)
    writeShiftRegister(mapper, 0xe000, 4);
    // 32KB バンク 2 = PRG 16KB バンク 4 と 5
    expect(mapper.readPrg(0x8000)).toBe(4);
    expect(mapper.readPrg(0xc000)).toBe(5);
  });

  it("PRG mode 1: 32KB 切替 (mode 0 と同じ)", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    // control: PRG mode 1
    writeShiftRegister(mapper, 0x8000, 0x04);
    // PRG bank = 6 → 32KB バンク 3 = PRG 16KB バンク 6, 7
    writeShiftRegister(mapper, 0xe000, 6);
    expect(mapper.readPrg(0x8000)).toBe(6);
    expect(mapper.readPrg(0xc000)).toBe(7);
  });
});

describe("MMC1 CHR バンク切替", () => {
  it("CHR mode 0 (8KB): chrBank0 で 8KB 単位切替", () => {
    // 32KB CHR ROM (8 × 4KB バンク = 4 × 8KB バンク)
    const mapper = new MapperMmc1(makeMmc1Cart(8, 8));
    // chrBank0 = 2 → 8KB モードでは bit 0 無視 → 8KB バンク 1 = 4KB バンク 2, 3
    writeShiftRegister(mapper, 0xa000, 2);
    expect(mapper.readChr(0x0000)).toBe(2);
    expect(mapper.readChr(0x1000)).toBe(3);
  });

  it("CHR mode 1 (4KB×2): chrBank0 と chrBank1 で独立切替", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(8, 8));
    // control: CHR mode 1 + PRG mode 3
    writeShiftRegister(mapper, 0x8000, 0x1c);
    // chrBank0 = 3 → $0000-$0FFF
    writeShiftRegister(mapper, 0xa000, 3);
    // chrBank1 = 5 → $1000-$1FFF
    writeShiftRegister(mapper, 0xc000, 5);
    expect(mapper.readChr(0x0000)).toBe(3);
    expect(mapper.readChr(0x0fff)).toBe(3 | 0xc0);
    expect(mapper.readChr(0x1000)).toBe(5);
    expect(mapper.readChr(0x1fff)).toBe(5 | 0xc0);
  });

  it("CHR mode 0 の初期状態 (chrBank0=0): 先頭 8KB", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(8, 8));
    expect(mapper.readChr(0x0000)).toBe(0);
    expect(mapper.readChr(0x1000)).toBe(1);
  });
});

describe("MMC1 CHR RAM", () => {
  it("chrRomSize=0 の時は CHR RAM 8KB を使用", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(8, 0));
    expect(mapper.readChr(0x0000)).toBe(0);
    mapper.writeChr(0x0000, 0x42);
    expect(mapper.readChr(0x0000)).toBe(0x42);
    mapper.writeChr(0x1fff, 0xef);
    expect(mapper.readChr(0x1fff)).toBe(0xef);
  });

  it("CHR ROM 時は writeChr が無視される", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(8, 8));
    const before = mapper.readChr(0x0000);
    mapper.writeChr(0x0000, 0xff);
    expect(mapper.readChr(0x0000)).toBe(before);
  });
});

describe("MMC1 初期状態", () => {
  it("初期 control = 0x0C (PRG mode 3, CHR mode 0, mirroring one-screen lower)", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(8, 8));
    // PRG mode 3: $8000 切替 (初期 bank 0)、$C000 末尾固定
    expect(mapper.readPrg(0x8000)).toBe(0);
    expect(mapper.readPrg(0xc000)).toBe(7);
    // CHR mode 0 (8KB): chrBank0=0 → 先頭 8KB
    expect(mapper.readChr(0x0000)).toBe(0);
    expect(mapper.readChr(0x1000)).toBe(1);
  });

  it("初期 PRG bank = 0", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    expect(mapper.readPrg(0x8000)).toBe(0);
  });

  it("初期 CHR bank 0/1 = 0", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(4, 16));
    // CHR mode 0: 初期 chrBank0=0 → 先頭 8KB
    expect(mapper.readChr(0x0000)).toBe(0);
  });
});

describe("MMC1 Control レジスタ", () => {
  it("ミラーリングモードの値が control に保持される", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(8, 0));
    // control = 0 (mirroring = one-screen lower, PRG mode 0, CHR mode 0)
    writeShiftRegister(mapper, 0x8000, 0x00);
    // PRG mode 0 を確認 → 32KB 切替動作で検証
    writeShiftRegister(mapper, 0xe000, 2);
    expect(mapper.readPrg(0x8000)).toBe(2);
    expect(mapper.readPrg(0xc000)).toBe(3);
  });

  it("PRG mode と CHR mode を独立に制御", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(8, 8));
    // control: PRG mode 2 + CHR mode 1 = 0x18
    writeShiftRegister(mapper, 0x8000, 0x18);
    // PRG mode 2 確認: $8000 固定
    writeShiftRegister(mapper, 0xe000, 3);
    expect(mapper.readPrg(0x8000)).toBe(0); // 先頭固定
    expect(mapper.readPrg(0xc000)).toBe(3); // 切替
    // CHR mode 1 確認: 4KB 独立
    writeShiftRegister(mapper, 0xa000, 2);
    writeShiftRegister(mapper, 0xc000, 6);
    expect(mapper.readChr(0x0000)).toBe(2);
    expect(mapper.readChr(0x1000)).toBe(6);
  });
});

describe("MMC1 エッジケース", () => {
  it("連続 write で正しく動作 (途中リセットなし)", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    // バンク 3 → バンク 10 を連続切替
    writeShiftRegister(mapper, 0xe000, 3);
    expect(mapper.readPrg(0x8000)).toBe(3);
    writeShiftRegister(mapper, 0xe000, 10);
    expect(mapper.readPrg(0x8000)).toBe(10);
  });

  it("異なるアドレスレンジへの書き込みが対応するレジスタに届く", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    // $9FFF (Control 範囲の末尾) に書き込み → PRG mode 2
    writeShiftRegister(mapper, 0x9fff, 0x08);
    writeShiftRegister(mapper, 0xe000, 4);
    expect(mapper.readPrg(0x8000)).toBe(0); // 先頭固定
    expect(mapper.readPrg(0xc000)).toBe(4);
  });

  it("2 バンク PRG ROM で正しく動作", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(2, 0));
    // 初期: mode 3 → $8000=bank0, $C000=bank1(末尾)
    expect(mapper.readPrg(0x8000)).toBe(0);
    expect(mapper.readPrg(0xc000)).toBe(1);
    // bank 1 に切替
    writeShiftRegister(mapper, 0xe000, 1);
    expect(mapper.readPrg(0x8000)).toBe(1);
    expect(mapper.readPrg(0xc000)).toBe(1);
  });

  it("PRG バンク番号が bankCount を超えた場合はマスクされる", () => {
    // 8 バンク (128KB PRG)
    const mapper = new MapperMmc1(makeMmc1Cart(8, 0));
    // バンク 15 を指定 → 8 バンクなので 15 % 8 = 7
    writeShiftRegister(mapper, 0xe000, 15);
    expect(mapper.readPrg(0x8000)).toBe(7);
  });

  it("シフトレジスタの書き込みアドレスは転送先レジスタ決定にのみ影響", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    // $8000 で 2 回、$E000 で 3 回 → 最終回の $E000 がレジスタ決定
    mapper.writePrg(0x8000, 1);
    mapper.writePrg(0x8000, 0);
    mapper.writePrg(0xe000, 1);
    mapper.writePrg(0xe000, 0);
    mapper.writePrg(0xe000, 0); // 5 回目 → $E000 → PRG bank レジスタ
    // 書き込み値: bits = 1,0,1,0,0 → LSB first で 0b00101 = 5
    expect(mapper.readPrg(0x8000)).toBe(5);
  });

  it("CHR RAM でアドレスが $1FFF でマスクされる", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(4, 0));
    mapper.writeChr(0x2000, 0xab);
    expect(mapper.readChr(0x0000)).toBe(0xab);
  });

  it("control 書込で onMirroringChange が通知される", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(4, 0));
    const history: string[] = [];
    mapper.onMirroringChange = (m) => history.push(m);

    // control bit 0-1 = 0 → single-lower
    writeShiftRegister(mapper, 0x8000, 0x0c);
    // control bit 0-1 = 1 → single-upper
    writeShiftRegister(mapper, 0x8000, 0x0d);
    // control bit 0-1 = 2 → vertical
    writeShiftRegister(mapper, 0x8000, 0x0e);
    // control bit 0-1 = 3 → horizontal
    writeShiftRegister(mapper, 0x8000, 0x0f);

    expect(history).toEqual(["single-lower", "single-upper", "vertical", "horizontal"]);
  });

  it("PRG mode 0/1 で奇数バンク番号は bit 0 無視 (32KB 単位)", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    writeShiftRegister(mapper, 0x8000, 0x00); // PRG mode 0
    // PRG bank = 5 → bit 0 無視で 4 → 32KB バンク 2 = 16KB バンク 4,5
    writeShiftRegister(mapper, 0xe000, 5);
    expect(mapper.readPrg(0x8000)).toBe(4);
    expect(mapper.readPrg(0xc000)).toBe(5);
  });

  it("bit 7 リセット後もシフトレジスタが正常に使える", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 0));
    writeShiftRegister(mapper, 0xe000, 3);
    expect(mapper.readPrg(0x8000)).toBe(3);
    // リセット
    mapper.writePrg(0x8000, 0x80);
    // 再度書き込み
    writeShiftRegister(mapper, 0xe000, 7);
    expect(mapper.readPrg(0x8000)).toBe(7);
  });

  it("全アドレス範囲のレジスタ選択が正しい", () => {
    const mapper = new MapperMmc1(makeMmc1Cart(16, 8));
    // $8000 → control (reg 0)
    writeShiftRegister(mapper, 0x8000, 0x1c); // PRG mode 3 + CHR mode 1
    // $A000 → CHR bank 0 (reg 1)
    writeShiftRegister(mapper, 0xa000, 2);
    // $C000 → CHR bank 1 (reg 2)
    writeShiftRegister(mapper, 0xc000, 4);
    // $E000 → PRG bank (reg 3)
    writeShiftRegister(mapper, 0xe000, 9);
    // 各レジスタの効果を検証
    expect(mapper.readChr(0x0000)).toBe(2); // CHR bank 0
    expect(mapper.readChr(0x1000)).toBe(4); // CHR bank 1
    expect(mapper.readPrg(0x8000)).toBe(9); // PRG bank 切替
    expect(mapper.readPrg(0xc000)).toBe(15); // 末尾固定
  });
});
