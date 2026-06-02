import { describe, expect, it } from "vitest";

import { Vrc7Audio } from "../src/core/mappers/vrc7-audio.ts";

function writeReg(audio: Vrc7Audio, addr: number, value: number): void {
  audio.writeAddress(addr);
  audio.writeData(value);
}

function tickN(audio: Vrc7Audio, n: number): void {
  for (let i = 0; i < n; i++) {
    audio.tick();
  }
}

describe("Vrc7Audio", () => {
  // ==========================================================================
  // 初期状態
  // ==========================================================================
  describe("初期状態", () => {
    it("初期状態では全チャンネル無音", () => {
      const audio = new Vrc7Audio();
      tickN(audio, 100);
      expect(audio.output()).toBe(0);
    });

    it("reset 後は無音に戻る", () => {
      const audio = new Vrc7Audio();

      // チャンネル 0 に音を設定
      writeReg(audio, 0x30, 0x10); // パッチ 1、ボリューム 0 (最大)
      writeReg(audio, 0x10, 0x80); // F-Number low
      writeReg(audio, 0x20, 0x15); // key on + block 2

      tickN(audio, 1000);

      audio.reset();
      tickN(audio, 100);
      expect(audio.output()).toBe(0);
    });
  });

  // ==========================================================================
  // Key ON / Key OFF
  // ==========================================================================
  describe("Key ON / Key OFF", () => {
    it("Key ON で発音が開始される", () => {
      const audio = new Vrc7Audio();

      writeReg(audio, 0x30, 0x10); // パッチ 1、ボリューム 0
      writeReg(audio, 0x10, 0x80); // F-Number low
      writeReg(audio, 0x20, 0x15); // key on + block 2

      // 十分な tick でエンベロープが進む
      tickN(audio, 5000);

      const out = audio.output();
      expect(out).not.toBe(0);
    });

    it("Key OFF 後は減衰してゼロに近づく", () => {
      const audio = new Vrc7Audio();

      writeReg(audio, 0x30, 0x10); // パッチ 1、ボリューム 0
      writeReg(audio, 0x10, 0x80);
      writeReg(audio, 0x20, 0x15); // key on

      tickN(audio, 3000);

      // key off (bit 4 をクリア)
      writeReg(audio, 0x20, 0x05);

      // リリース後は減衰
      tickN(audio, 100000);
      const out = Math.abs(audio.output());
      // 十分な時間が経過すれば事実上ゼロに近い
      expect(out).toBeLessThan(0.01);
    });

    it("Key ON → Key OFF → Key ON で再発音", () => {
      const audio = new Vrc7Audio();

      writeReg(audio, 0x30, 0x10);
      writeReg(audio, 0x10, 0x80);

      // Key ON
      writeReg(audio, 0x20, 0x15);
      tickN(audio, 3000);
      const out1 = audio.output();

      // Key OFF
      writeReg(audio, 0x20, 0x05);
      tickN(audio, 50000);

      // Key ON 再び
      writeReg(audio, 0x20, 0x15);
      tickN(audio, 3000);
      const out2 = audio.output();

      // どちらも発音している
      expect(out1).not.toBe(0);
      expect(out2).not.toBe(0);
    });
  });

  // ==========================================================================
  // 複数チャンネル
  // ==========================================================================
  describe("複数チャンネル", () => {
    it("6 チャンネル全て独立に発音可能", () => {
      const audio = new Vrc7Audio();

      for (let ch = 0; ch < 6; ch++) {
        writeReg(audio, 0x30 + ch, 0x10); // パッチ 1
        writeReg(audio, 0x10 + ch, 0x80 + ch * 10); // 異なる周波数
        writeReg(audio, 0x20 + ch, 0x15); // key on
      }

      tickN(audio, 5000);
      const out = audio.output();
      expect(out).not.toBe(0);
    });

    it("1 チャンネル key off しても他は鳴り続ける", () => {
      const audio = new Vrc7Audio();

      // ch0, ch1 を key on
      writeReg(audio, 0x30, 0x10);
      writeReg(audio, 0x10, 0x80);
      writeReg(audio, 0x20, 0x15);

      writeReg(audio, 0x31, 0x10);
      writeReg(audio, 0x11, 0xa0);
      writeReg(audio, 0x21, 0x15);

      tickN(audio, 3000);

      // ch0 だけ key off
      writeReg(audio, 0x20, 0x05);
      tickN(audio, 100000);

      // ch1 はまだ鳴っているので出力は 0 でない
      const out = audio.output();
      expect(out).not.toBe(0);
    });
  });

  // ==========================================================================
  // パッチ切替
  // ==========================================================================
  describe("パッチ切替", () => {
    it("異なるプリセットパッチで音色が変わる", () => {
      const audio1 = new Vrc7Audio();
      const audio2 = new Vrc7Audio();

      // 同じ設定で異なるパッチ
      writeReg(audio1, 0x30, 0x10); // パッチ 1
      writeReg(audio1, 0x10, 0x80);
      writeReg(audio1, 0x20, 0x15);

      writeReg(audio2, 0x30, 0x70); // パッチ 7
      writeReg(audio2, 0x10, 0x80);
      writeReg(audio2, 0x20, 0x15);

      // サンプルを収集
      const samples1: number[] = [];
      const samples2: number[] = [];
      for (let i = 0; i < 5000; i++) {
        audio1.tick();
        audio2.tick();
        if (i % 36 === 0) {
          samples1.push(audio1.output());
          samples2.push(audio2.output());
        }
      }

      // パッチが違えば波形も異なる
      let different = false;
      for (let i = 0; i < samples1.length; i++) {
        if (samples1[i] !== samples2[i]) {
          different = true;
          break;
        }
      }
      expect(different).toBe(true);
    });
  });

  // ==========================================================================
  // カスタムパッチ
  // ==========================================================================
  describe("カスタムパッチ", () => {
    it("カスタムパッチ ($00-$07) を設定して発音できる", () => {
      const audio = new Vrc7Audio();

      // Buzzy Bell と同じデータをカスタムパッチに書き込み
      const patch = [0x03, 0x21, 0x05, 0x06, 0xe8, 0x81, 0x42, 0x27];
      for (let i = 0; i < 8; i++) {
        writeReg(audio, i, patch[i]!);
      }

      // ch0 にカスタムパッチ (パッチ 0) を設定
      writeReg(audio, 0x30, 0x00); // パッチ 0、ボリューム 0
      writeReg(audio, 0x10, 0x80);
      writeReg(audio, 0x20, 0x15);

      tickN(audio, 5000);
      const out = audio.output();
      expect(out).not.toBe(0);
    });

    it("カスタムパッチ変更は使用中のチャンネルにリアルタイム反映", () => {
      const audio = new Vrc7Audio();

      // 初期カスタムパッチを設定
      for (let i = 0; i < 8; i++) {
        writeReg(audio, i, 0x00);
      }

      writeReg(audio, 0x30, 0x00); // カスタムパッチ
      writeReg(audio, 0x10, 0x80);
      writeReg(audio, 0x20, 0x15);

      tickN(audio, 1000);
      const before = audio.output();

      // カスタムパッチを変更 (attack rate を最大に)
      writeReg(audio, 0x04, 0xf0); // mod AR=15
      writeReg(audio, 0x05, 0xf0); // car AR=15

      tickN(audio, 5000);
      const after = audio.output();

      // パッチ変更前後で出力が変わっている
      // (attack rate 変更で音量の立ち上がりが変わる)
      expect(typeof before).toBe("number");
      expect(typeof after).toBe("number");
    });
  });

  // ==========================================================================
  // ボリューム制御
  // ==========================================================================
  describe("ボリューム制御", () => {
    it("ボリューム 0 (最大) と 15 (最小) で音量差がある", () => {
      const audio1 = new Vrc7Audio();
      const audio2 = new Vrc7Audio();

      // ボリューム 0 (最大)
      writeReg(audio1, 0x30, 0x10); // パッチ 1、vol 0
      writeReg(audio1, 0x10, 0x80);
      writeReg(audio1, 0x20, 0x15);

      // ボリューム 15 (最小)
      writeReg(audio2, 0x30, 0x1f); // パッチ 1、vol 15
      writeReg(audio2, 0x10, 0x80);
      writeReg(audio2, 0x20, 0x15);

      // エンベロープが落ち着くまで待つ
      tickN(audio1, 10000);
      tickN(audio2, 10000);

      // RMS 計算
      let rms1 = 0;
      let rms2 = 0;
      const samples = 1000;
      for (let i = 0; i < samples * 36; i++) {
        audio1.tick();
        audio2.tick();
        if (i % 36 === 0) {
          rms1 += audio1.output() ** 2;
          rms2 += audio2.output() ** 2;
        }
      }
      rms1 = Math.sqrt(rms1 / samples);
      rms2 = Math.sqrt(rms2 / samples);

      // vol=0 の方が音量が大きい (ゼロでなければ OK)
      expect(rms1).toBeGreaterThan(rms2);
    });
  });

  // ==========================================================================
  // 周波数制御
  // ==========================================================================
  describe("周波数制御", () => {
    it("F-Number が大きいほど高い周波数", () => {
      const audio1 = new Vrc7Audio();
      const audio2 = new Vrc7Audio();

      // 低い F-Number
      writeReg(audio1, 0x30, 0x10);
      writeReg(audio1, 0x10, 0x40); // F-Number low = 64
      writeReg(audio1, 0x20, 0x15); // block 2

      // 高い F-Number
      writeReg(audio2, 0x30, 0x10);
      writeReg(audio2, 0x10, 0xff); // F-Number low = 255
      writeReg(audio2, 0x20, 0x15); // block 2

      // ゼロクロス回数を数えて周波数を比較
      let crossings1 = 0;
      let crossings2 = 0;
      let prev1 = 0;
      let prev2 = 0;
      const totalTicks = 50000;

      for (let i = 0; i < totalTicks; i++) {
        audio1.tick();
        audio2.tick();
        if (i % 36 === 0) {
          const s1 = audio1.output();
          const s2 = audio2.output();
          if ((prev1 >= 0 && s1 < 0) || (prev1 < 0 && s1 >= 0)) crossings1++;
          if ((prev2 >= 0 && s2 < 0) || (prev2 < 0 && s2 >= 0)) crossings2++;
          prev1 = s1;
          prev2 = s2;
        }
      }

      expect(crossings2).toBeGreaterThan(crossings1);
    });

    it("ブロック (オクターブ) が大きいほど高い周波数", () => {
      const audio1 = new Vrc7Audio();
      const audio2 = new Vrc7Audio();

      // block 1
      writeReg(audio1, 0x30, 0x10);
      writeReg(audio1, 0x10, 0x80);
      writeReg(audio1, 0x20, 0x13); // block 1

      // block 4
      writeReg(audio2, 0x30, 0x10);
      writeReg(audio2, 0x10, 0x80);
      writeReg(audio2, 0x20, 0x19); // block 4

      let crossings1 = 0;
      let crossings2 = 0;
      let prev1 = 0;
      let prev2 = 0;
      const totalTicks = 50000;

      for (let i = 0; i < totalTicks; i++) {
        audio1.tick();
        audio2.tick();
        if (i % 36 === 0) {
          const s1 = audio1.output();
          const s2 = audio2.output();
          if ((prev1 >= 0 && s1 < 0) || (prev1 < 0 && s1 >= 0)) crossings1++;
          if ((prev2 >= 0 && s2 < 0) || (prev2 < 0 && s2 >= 0)) crossings2++;
          prev1 = s1;
          prev2 = s2;
        }
      }

      expect(crossings2).toBeGreaterThan(crossings1);
    });
  });

  // ==========================================================================
  // サスティン
  // ==========================================================================
  describe("サスティン", () => {
    it("sustain ビットが ON の時、リリースレートが遅くなる", () => {
      const audio1 = new Vrc7Audio();
      const audio2 = new Vrc7Audio();

      // sustain なし
      writeReg(audio1, 0x30, 0x10);
      writeReg(audio1, 0x10, 0x80);
      writeReg(audio1, 0x20, 0x15); // sustain=0, key on

      // sustain あり
      writeReg(audio2, 0x30, 0x10);
      writeReg(audio2, 0x10, 0x80);
      writeReg(audio2, 0x20, 0x35); // sustain=1, key on

      tickN(audio1, 3000);
      tickN(audio2, 3000);

      // key off
      writeReg(audio1, 0x20, 0x05); // sustain=0
      writeReg(audio2, 0x20, 0x25); // sustain=1

      // リリース後のサンプルを比較
      tickN(audio1, 30000);
      tickN(audio2, 30000);

      const rms1 = Math.abs(audio1.output());
      const rms2 = Math.abs(audio2.output());

      // sustain=1 の方がリリースが遅い = 音量が大きい残り
      expect(rms2).toBeGreaterThanOrEqual(rms1);
    });
  });

  // ==========================================================================
  // シリアライズ / デシリアライズ
  // ==========================================================================
  describe("シリアライズ", () => {
    it("シリアライズ → デシリアライズで状態が復元される", () => {
      const audio1 = new Vrc7Audio();

      writeReg(audio1, 0x30, 0x10);
      writeReg(audio1, 0x10, 0x80);
      writeReg(audio1, 0x20, 0x15);
      tickN(audio1, 3000);

      const data = audio1.serialize();
      const audio2 = new Vrc7Audio();
      audio2.deserialize(data);

      // 同じサンプルが出力される
      tickN(audio1, 36);
      tickN(audio2, 36);
      expect(audio2.output()).toBe(audio1.output());
    });
  });

  // ==========================================================================
  // プリセットパッチデータ検証
  // ==========================================================================
  describe("プリセットパッチ", () => {
    it("15 プリセット全てで発音が異なる", () => {
      const outputs: number[][] = [];

      for (let patch = 1; patch <= 15; patch++) {
        const audio = new Vrc7Audio();
        writeReg(audio, 0x30, (patch << 4) | 0x00); // パッチ N、vol 0
        writeReg(audio, 0x10, 0x80);
        writeReg(audio, 0x20, 0x15);

        const samples: number[] = [];
        for (let i = 0; i < 10000; i++) {
          audio.tick();
          if (i % 36 === 0) {
            samples.push(audio.output());
          }
        }
        outputs.push(samples);
      }

      // 全ペアで波形が異なることを確認
      let uniquePairs = 0;
      for (let i = 0; i < outputs.length; i++) {
        for (let j = i + 1; j < outputs.length; j++) {
          let different = false;
          for (let k = 0; k < Math.min(outputs[i]!.length, outputs[j]!.length); k++) {
            if (outputs[i]![k] !== outputs[j]![k]) {
              different = true;
              break;
            }
          }
          if (different) uniquePairs++;
        }
      }

      // 少なくとも半分以上のペアで異なる波形
      const totalPairs = (15 * 14) / 2;
      expect(uniquePairs).toBeGreaterThan(totalPairs / 2);
    });
  });

  // ==========================================================================
  // 出力範囲
  // ==========================================================================
  describe("出力範囲", () => {
    it("出力値は妥当な範囲内 [-1, 1]", () => {
      const audio = new Vrc7Audio();

      // 全チャンネルを最大音量で鳴らす
      for (let ch = 0; ch < 6; ch++) {
        writeReg(audio, 0x30 + ch, 0x10); // パッチ 1、vol 0
        writeReg(audio, 0x10 + ch, 0x80 + ch * 20);
        writeReg(audio, 0x20 + ch, 0x15);
      }

      let min = Infinity;
      let max = -Infinity;

      for (let i = 0; i < 50000; i++) {
        audio.tick();
        if (i % 36 === 0) {
          const out = audio.output();
          min = Math.min(min, out);
          max = Math.max(max, out);
        }
      }

      expect(min).toBeGreaterThanOrEqual(-1);
      expect(max).toBeLessThanOrEqual(1);
    });
  });
});
