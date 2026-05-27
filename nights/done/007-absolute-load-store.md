# 夜 7: absolute アドレッシングの load/store 展開 + nestest trace 拡張

## ゴール (/goal)

```
/goal night/007-absolute-load-store ブランチで実装し、 nightly CI 緑、 PR が auto-merge 設定済みで main に merge commit 完了、 nights/pending/007-absolute-load-store.md が nights/done/ に移動済み、 or stop after N turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 007 merged`

## 前提

- 夜 6 (#8) merge 済み: レジスタ転送、 nestest 先頭 801 行 trace diff
- nestest.log 802 行目 = STX absolute ($8E) 初出。 load/store 命令の absolute 版を実装して trace を伸ばす
- これまで store/load は zeroPage (STX/STA) と immediate (LDX/LDY/LDA) のみ。 本夜で absolute mode (既存 `absolute` ヘルパー) を load/store に展開する

## ブランチ運用

`night/007-absolute-load-store` ブランチ。 最初の commit で本 md を seed、 以降実装。 PR → sub-agent レビュー → triage STOP ゼロで auto-merge。

## サブゴール

1. **G1: store absolute** — `STA` (0x8D) / `STX` (0x8E) / `STY` (0x8C)。 absolute mode で実効アドレスを得て対応レジスタを書き込む。 フラグ非変化。 cycle 4
2. **G2: load absolute** — `LDA` (0xAD) / `LDX` (0xAE) / `LDY` (0xAC)。 absolute mode で read して Z/N 更新。 cycle 4
3. **G3: nestest trace 行数拡張** — `TRACE_LINES` を 801 → さらに伸ばす。 absolute load/store で到達できる行まで。 LSR ($4A、 976 行目) 等のシフト命令は夜 8 のスコープなので、 その手前で確定。 目標 900 行以上

## 実装ステップ

1. `chore(nights): seed 007` で本 md を commit
2. G1 → `feat(core/cpu): add absolute store STA/STX/STY`
3. G2 → `feat(core/cpu): add absolute load LDA/LDX/LDY`
4. G3 → `test(core/cpu): extend nestest trace diff to N lines`
5. `npx vitest run` / `npx tsc --noEmit` / `npx eslint` 全緑
6. `git mv nights/pending/007-*.md nights/done/007-*.md` → `chore(nights): move 007 to done`
7. push → PR → sub-agent レビュー → triage → auto-merge

## 検証チャンネル

- `✅ PASS: cpu_nestest_trace first N lines match` / `✅ TYPECHECK: clean`
- `🔀 PR OPENED` / `⏳ AUTO-MERGE ARMED` / `🎯 GOAL CONDITION MET: night 007 merged`

## 申し送り (継続)

- 夜 6 の TSX/TXS coverage は本夜の行数拡張で実行検証されるはず (808 行目超え)
- done md の DoD チェックボックス `[x]` 埋め / makeNestestBus doc / parseLogLine 貪欲マッチ / CLI 未検証 / def() silent overwrite — 将来送り

## 詰まったら (nesdev wiki のみ参照)

- アドレッシング: https://www.nesdev.org/wiki/CPU_addressing_modes
- 命令仕様: https://www.nesdev.org/wiki/Instruction_reference
- 30 分以上詰んだら stuck 隔離

## DoD (完了条件)

- [ ] `night/007-absolute-load-store` ブランチで作業
- [ ] G1: STA/STX/STY absolute (cycle 4, フラグ非変化)
- [ ] G2: LDA/LDX/LDY absolute (cycle 4, Z/N 更新)
- [ ] G3: `TRACE_LINES` を 801 → 900 行以上に拡張し diff pass
- [ ] `npx vitest run` exit 0
- [ ] `npx tsc --noEmit` 警告ゼロ
- [ ] `npx eslint` 警告ゼロ
- [ ] `nights/pending/007-*.md` → `nights/done/` に git mv
- [ ] PR auto-merge 設定済み + nightly CI 緑 → main merge commit

## 詰みパターン参考

1. **absolute store の cycle は 4** — STA/STX/STY absolute は 4 cycle (zeroPage 版の 3 と違う)。 load も absolute は 4 (immediate の 2 と違う)
2. **absolute は page-cross 加算なし** — 非インデックスの absolute は固定アドレスなので extraCycle ゼロ
3. **store はフラグ非変化** — STA/STX/STY は Z/N を更新しない。 load (LDA/LDX/LDY) は更新する
4. **到達行数の確定** — absolute load/store で届く行まで。 LSR ($4A、 976 行目) 等のシフト/ローテートが出たら夜 8 送り、 その手前で TRACE_LINES 確定
