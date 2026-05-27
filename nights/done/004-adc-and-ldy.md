# 夜 4: ADC (overflow フラグ) + LDY + nestest trace 拡張

## ゴール (/goal)

```
/goal night/004-adc-and-ldy ブランチで実装し、 nightly CI 緑、 PR が auto-merge 設定済みで main に merge commit 完了、 nights/pending/004-adc-and-ldy.md が nights/done/ に移動済み、 or stop after N turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 004 merged`

## 前提

- 夜 3 (#5) merge 済み: スタック/論理/比較/フラグ命令、 nestest 先頭 217 行 trace diff
- nestest.log 218 行目 = ADC 初出。 ADC + LDY を実装して trace 行数を伸ばす

## ブランチ運用

`night/004-adc-and-ldy` ブランチ。 最初の commit で本 md を seed、 以降実装。 PR → sub-agent レビュー → triage STOP ゼロで auto-merge。

## サブゴール

1. **G1: ADC immediate (0x69)** — Add with Carry。 **6502 で最も間違えやすい overflow フラグ**を正しく実装する。
   - `sum = A + M + C`、 `result = sum & 0xFF`
   - C = `sum > 0xFF`
   - V (overflow) = `((A ^ result) & (M ^ result) & 0x80) !== 0` (両オペランドと結果の符号不一致)
   - Z/N は result で更新
   - **NES の 6502 は decimal mode 無効**: D フラグが立っていても binary 加算 (nestest は SED 後に ADC するが結果は binary)。 cycle 2
2. **G2: LDY immediate (0xA0)** — `Y = M`、 Z/N 更新。 LDX/LDA と同型。 cycle 2
3. **G3: nestest trace 行数拡張** — `TRACE_LINES` を 217 → さらに伸ばす。 ADC/LDY 実装で到達できる行数まで。 未実装 opcode で throw したらその命令を確認し、 G1/G2 に収まる範囲か・次夜送りかを判断して行数を確定。 目標 300 行以上 (夜3 申し送りの CPY=339 行に届けば自動カバー)

## 実装ステップ

1. `chore(nights): seed 004` で本 md を commit
2. G1 → `feat(core/cpu): add ADC immediate with overflow flag`
3. G2 → `feat(core/cpu): add LDY immediate`
4. G3 → `test(core/cpu): extend nestest trace diff to N lines`
5. `npx vitest run` / `npx tsc --noEmit` / `npx eslint` 全緑
6. `git mv nights/pending/004-*.md nights/done/004-*.md` → `chore(nights): move 004 to done`
7. push → PR → sub-agent レビュー → triage → auto-merge

## 検証チャンネル

- `✅ PASS: cpu_nestest_trace first N lines match` / `✅ TYPECHECK: clean`
- `🔀 PR OPENED` / `⏳ AUTO-MERGE ARMED` / `🎯 GOAL CONDITION MET: night 004 merged`

## 夜 3 からの申し送り (PR #5 sub-agent レビュー PASS×2)

1. **makeNestestBus の doc コメントが「先頭50行」 のまま** — 文言が古い (現 217 行)。 本夜の test 拡張時に「この trace 範囲では PPU/APU レジスタに触れない」 等へ更新する
2. **CPX(387行)/CPY(339行)/CLI(log 未出現) が未検証** — 本夜で行数を 339+ に伸ばせば CPX/CPY は自動カバー。 CLI は nestest.log に出ないため、 必要なら別途ユニットテストを検討 (将来送り可)
3. (夜2 から継続) **parseLogLine の貪欲マッチ** — 全 8991 行照合する夜に正規表現を厳密化 (将来送り)

## 詰まったら (nesdev wiki のみ参照)

- ADC と overflow: https://www.nesdev.org/wiki/Instruction_reference#ADC / overflow フラグの導出は http://www.6502.org/tutorials/vflag.html (パブリックドメイン解説) も参考可
- decimal mode が NES で無効な点: https://www.nesdev.org/wiki/Status_flags

30 分以上詰んだら stuck 隔離。

## DoD (完了条件)

- [ ] `night/004-adc-and-ldy` ブランチで作業
- [ ] G1: ADC immediate (overflow フラグ正確)
- [ ] G2: LDY immediate
- [ ] G3: `TRACE_LINES` を 217 → 300 行以上に拡張し diff pass
- [ ] `npx vitest run` exit 0
- [ ] `npx tsc --noEmit` 警告ゼロ
- [ ] `npx eslint` 警告ゼロ
- [ ] `nights/pending/004-*.md` → `nights/done/` に git mv
- [ ] PR auto-merge 設定済み + nightly CI 緑 → main merge commit

## 詰みパターン参考

1. **ADC の overflow フラグ** — 最頻出バグ。 `V = ((A ^ result) & (M ^ result) & 0x80)`。 carry フラグ (C) と混同しない。 nestest.log の P 値 (218-340 行に ADC が密集) で 1 行ずつ検証できる
2. **decimal mode** — NES では D フラグ無視。 SED 後の ADC も binary。 BCD 実装を入れると nestest.log とずれる
3. **carry 入力** — ADC は `A + M + C` (現在の C を足す)。 C を足し忘れると即ずれる
4. **到達行数の確定** — ADC/LDY で届く行まで。 次の未実装命令 (SBC/INC/DEC 等) が出たらそこで TRACE_LINES 確定
