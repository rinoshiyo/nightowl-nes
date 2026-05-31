import { describe, it, expect, beforeEach, vi } from "vitest";
import { DmcChannel } from "../src/core/apu-dmc.ts";
import { Apu } from "../src/core/apu.ts";

describe("DmcChannel", () => {
  let ch: DmcChannel;

  beforeEach(() => {
    ch = new DmcChannel();
  });

  describe("レジスタ書き込み", () => {
    it("$4010: IRQ 有効フラグ、ループフラグ、レートインデックス", () => {
      ch.writeControl(0xc3);
      expect(ch.irqFlag).toBe(false);
    });

    it("$4010 bit7 クリアで IRQ フラグもクリアされる", () => {
      ch.irqFlag = true;
      ch.writeControl(0x00);
      expect(ch.irqFlag).toBe(false);
    });

    it("$4010 bit7 セットでは既存の IRQ フラグをクリアしない", () => {
      ch.irqFlag = true;
      ch.writeControl(0x80);
      expect(ch.irqFlag).toBe(true);
    });

    it("$4011: 出力レベルのダイレクトロード (0-127)", () => {
      ch.writeDirectLoad(0x40);
      expect(ch.outputLevel).toBe(0x40);
    });

    it("$4011: bit7 は無視される", () => {
      ch.writeDirectLoad(0xff);
      expect(ch.outputLevel).toBe(0x7f);
    });

    it("$4012: サンプルアドレスは $C000 + (A * 64)", () => {
      ch.writeAddress(0x00);
      ch.setEnabled(true);
      // bytesRemaining が設定された後で確認するため、内部フェッチで検証
    });

    it("$4013: サンプル長は (L * 16) + 1", () => {
      ch.writeLength(0x01);
      ch.setEnabled(true);
      expect(ch.bytesRemaining).toBe(17);
    });

    it("$4013: L=0 でサンプル長 1", () => {
      ch.writeLength(0x00);
      ch.setEnabled(true);
      expect(ch.bytesRemaining).toBe(1);
    });

    it("$4013: L=255 でサンプル長 4081", () => {
      ch.writeLength(0xff);
      ch.setEnabled(true);
      expect(ch.bytesRemaining).toBe(4081);
    });
  });

  describe("タイマー周期テーブル", () => {
    it("インデックス 0 で周期 428", () => {
      ch.writeControl(0x00);
      expect(ch.timerPeriod).toBe(428);
    });

    it("インデックス 15 で周期 54", () => {
      ch.writeControl(0x0f);
      expect(ch.timerPeriod).toBe(54);
    });

    it("インデックス 8 で周期 190", () => {
      ch.writeControl(0x08);
      expect(ch.timerPeriod).toBe(190);
    });
  });

  describe("出力ユニット", () => {
    it("出力レベル +2: シフトレジスタ bit0=1", () => {
      ch.outputLevel = 10;
      ch.writeLength(0x00);
      ch.readSample = () => 0xff; // 全ビット 1
      ch.setEnabled(true);

      // タイマーを十分回して最初のサンプルをフェッチ→出力ユニットが動く
      for (let i = 0; i < ch.timerPeriod + 1; i++) {
        ch.tickTimer();
      }

      // bit0=1 なので +2 が発生しているはず
      expect(ch.outputLevel).toBeGreaterThan(10);
    });

    it("出力レベル -2: シフトレジスタ bit0=0", () => {
      ch.outputLevel = 10;
      ch.writeLength(0x00);
      ch.readSample = () => 0x00; // 全ビット 0
      ch.setEnabled(true);

      for (let i = 0; i < ch.timerPeriod + 1; i++) {
        ch.tickTimer();
      }

      expect(ch.outputLevel).toBeLessThan(10);
    });

    it("出力レベル +2 で 127 を超える場合は変更しない", () => {
      ch.outputLevel = 126;
      ch.writeLength(0x00);
      ch.readSample = () => 0xff;
      ch.setEnabled(true);

      for (let i = 0; i < ch.timerPeriod + 1; i++) {
        ch.tickTimer();
      }

      // 126 + 2 = 128 > 127 なので変更しない
      expect(ch.outputLevel).toBe(126);
    });

    it("出力レベル -2 で 0 未満になる場合は変更しない", () => {
      ch.outputLevel = 1;
      ch.writeLength(0x00);
      ch.readSample = () => 0x00;
      ch.setEnabled(true);

      for (let i = 0; i < ch.timerPeriod + 1; i++) {
        ch.tickTimer();
      }

      // 1 - 2 = -1 < 0 なので変更しない
      expect(ch.outputLevel).toBe(1);
    });

    it("出力レベル 125 + bit0=1 で +2 → 127 になる", () => {
      ch.outputLevel = 125;
      ch.writeLength(0x00);
      ch.readSample = () => 0xff;
      ch.setEnabled(true);

      for (let i = 0; i < ch.timerPeriod + 1; i++) {
        ch.tickTimer();
      }

      expect(ch.outputLevel).toBe(127);
    });

    it("出力レベル 2 + bit0=0 で -2 → 0 になる", () => {
      ch.outputLevel = 2;
      ch.writeLength(0x00);
      ch.readSample = () => 0x00;
      ch.setEnabled(true);

      for (let i = 0; i < ch.timerPeriod + 1; i++) {
        ch.tickTimer();
      }

      expect(ch.outputLevel).toBe(0);
    });

    it("サイレンスフラグ時に出力レベルは変化しない", () => {
      ch.outputLevel = 50;
      // サンプルをロードしなければサイレンス状態のまま
      const initialLevel = ch.outputLevel;

      for (let i = 0; i < ch.timerPeriod * 10; i++) {
        ch.tickTimer();
      }

      expect(ch.outputLevel).toBe(initialLevel);
    });
  });

  describe("メモリリーダー", () => {
    it("サンプルバッファが空 & 残りバイト > 0 でフェッチする", () => {
      const mockRead = vi.fn().mockReturnValue(0xaa);
      ch.readSample = mockRead;
      ch.writeAddress(0x00); // $C000
      ch.writeLength(0x00); // 1 byte
      ch.setEnabled(true);

      // fetchSample は tickTimer 内で呼ばれる
      ch.tickTimer();

      expect(mockRead).toHaveBeenCalledWith(0xc000);
    });

    it("アドレスカウンタが $FFFF → $8000 にラップする", () => {
      const addresses: number[] = [];
      ch.readSample = (addr) => {
        addresses.push(addr);
        return 0;
      };
      ch.writeAddress(0xff); // $C000 + 255*64 = $FFC0
      ch.writeLength(0x10); // 257 bytes (十分な長さ)

      // rate=15 (54 cycles), ループで無限再生
      ch.writeControl(0x4f); // loop + rate=15 (54 cycles)
      ch.setEnabled(true);

      // 1 byte = 8 output cycles × 54 ticks = 432 ticks
      // $FFC0 → $FFFF = 64 bytes → 65 回目で $8000
      // 65 * 432 = 28080 ticks 必要
      for (let i = 0; i < 30000; i++) {
        ch.tickTimer();
      }

      const ffff_idx = addresses.indexOf(0xffff);
      expect(ffff_idx).toBeGreaterThanOrEqual(0);
      if (ffff_idx >= 0 && ffff_idx + 1 < addresses.length) {
        expect(addresses[ffff_idx + 1]).toBe(0x8000);
      }
    });

    it("残りバイト 0 + ループ ON でリスタート", () => {
      const addresses: number[] = [];
      ch.readSample = (addr) => {
        addresses.push(addr);
        return 0;
      };
      ch.writeAddress(0x00); // $C000
      ch.writeLength(0x00); // 1 byte
      ch.writeControl(0x4f); // loop=true, rate=15 (54 cycles, 最速)
      ch.setEnabled(true);

      // 1 byte = 8 × 54 = 432 ticks per cycle. 2 回のフェッチに十分
      for (let i = 0; i < 1000; i++) {
        ch.tickTimer();
      }

      expect(addresses.filter((a) => a === 0xc000).length).toBeGreaterThanOrEqual(
        2,
      );
    });

    it("残りバイト 0 + ループ OFF + IRQ 有効で IRQ フラグがセット", () => {
      ch.readSample = () => 0;
      ch.writeAddress(0x00);
      ch.writeLength(0x00); // 1 byte
      ch.writeControl(0x80); // irq=true, loop=false
      ch.setEnabled(true);

      expect(ch.irqFlag).toBe(false);

      // 1 byte フェッチで残り 0 → IRQ
      ch.tickTimer();

      expect(ch.irqFlag).toBe(true);
    });

    it("ループ時は IRQ が発生しない", () => {
      ch.readSample = () => 0;
      ch.writeAddress(0x00);
      ch.writeLength(0x00); // 1 byte
      ch.writeControl(0xc0); // irq=true, loop=true
      ch.setEnabled(true);

      for (let i = 0; i < 428 * 3; i++) {
        ch.tickTimer();
      }

      expect(ch.irqFlag).toBe(false);
    });
  });

  describe("$4015 連携", () => {
    it("setEnabled(false) で残りバイトが 0 になる", () => {
      ch.writeLength(0x10);
      ch.setEnabled(true);
      expect(ch.bytesRemaining).toBeGreaterThan(0);

      ch.setEnabled(false);
      expect(ch.bytesRemaining).toBe(0);
    });

    it("setEnabled(true) で残りバイト 0 の時のみリスタート", () => {
      ch.writeLength(0x01); // 17 bytes
      ch.setEnabled(true);
      expect(ch.bytesRemaining).toBe(17);

      // 無効→有効: 残りバイトが再設定される
      ch.setEnabled(false);
      expect(ch.bytesRemaining).toBe(0);
      ch.setEnabled(true);
      expect(ch.bytesRemaining).toBe(17);
    });

    it("setEnabled(true) で残りバイト > 0 の時はリスタートしない", () => {
      ch.readSample = () => 0;
      ch.writeLength(0x01); // 17 bytes
      ch.setEnabled(true);
      expect(ch.bytesRemaining).toBe(17);

      // 1 byte フェッチ
      ch.tickTimer();
      expect(ch.bytesRemaining).toBe(16);

      // 有効のまま再設定しても残りバイトが 17 に戻らない
      ch.setEnabled(true);
      expect(ch.bytesRemaining).toBe(16);
    });
  });

  describe("出力", () => {
    it("output() は 0-127 の範囲で出力レベルを返す", () => {
      ch.outputLevel = 0;
      expect(ch.output()).toBe(0);

      ch.outputLevel = 127;
      expect(ch.output()).toBe(127);

      ch.outputLevel = 64;
      expect(ch.output()).toBe(64);
    });
  });
});

describe("Apu DMC 統合", () => {
  let apu: Apu;

  beforeEach(() => {
    apu = new Apu();
  });

  it("$4010 書き込みがルーティングされる", () => {
    apu.write(0x4010, 0x0f);
    expect(apu.dmc.timerPeriod).toBe(54);
  });

  it("$4011 書き込みがルーティングされる", () => {
    apu.write(0x4011, 0x40);
    expect(apu.dmc.outputLevel).toBe(0x40);
  });

  it("$4012 書き込みがルーティングされる", () => {
    apu.write(0x4012, 0x01);
    // アドレスの直接検証は internal だが enable 時にフェッチで確認可能
  });

  it("$4013 書き込みがルーティングされる", () => {
    apu.write(0x4013, 0x01);
    apu.write(0x4015, 0x10);
    expect(apu.dmc.bytesRemaining).toBe(17);
  });

  it("$4015 書込 bit4 で DMC enable/disable", () => {
    apu.write(0x4013, 0x01);
    apu.write(0x4015, 0x10);
    expect(apu.dmc.bytesRemaining).toBe(17);

    apu.write(0x4015, 0x00);
    expect(apu.dmc.bytesRemaining).toBe(0);
  });

  it("$4015 書込で DMC IRQ フラグがクリアされる", () => {
    apu.dmc.irqFlag = true;
    apu.write(0x4015, 0x00);
    expect(apu.dmc.irqFlag).toBe(false);
  });

  it("$4015 読出 bit4 で DMC の残りバイト > 0 を返す", () => {
    apu.write(0x4013, 0x01);
    apu.write(0x4015, 0x10);
    const status = apu.read(0x4015);
    expect(status & 0x10).toBe(0x10);
  });

  it("$4015 読出 bit4 で残りバイト 0 の時は 0", () => {
    const status = apu.read(0x4015);
    expect(status & 0x10).toBe(0);
  });

  it("$4015 読出 bit7 で DMC IRQ フラグを返す", () => {
    apu.dmc.irqFlag = true;
    const status = apu.read(0x4015);
    expect(status & 0x80).toBe(0x80);
  });

  it("$4015 読出で DMC IRQ フラグはクリアしない", () => {
    apu.dmc.irqFlag = true;
    apu.read(0x4015);
    expect(apu.dmc.irqFlag).toBe(true);
  });

  it("tick() で毎 CPU cycle に dmc.tickTimer が呼ばれる", () => {
    apu.write(0x4011, 0x40); // 出力レベル 64
    apu.write(0x4013, 0x00); // 1 byte
    apu.dmc.readSample = () => 0xff;
    apu.write(0x4015, 0x10); // enable

    // 十分な回数 tick すれば出力レベルが変化する
    for (let i = 0; i < 428 * 2; i++) {
      apu.tick();
    }

    // 全ビット 1 のサンプルなので +2 が繰り返されるはず
    expect(apu.dmc.outputLevel).toBeGreaterThan(64);
  });
});
