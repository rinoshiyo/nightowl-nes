# 夜 5: レジスタ増減命令 (INX/INY/DEX/DEY) + nestest trace 拡張

## ゴール (/goal)

```
/goal night/005-register-inc-dec ブランチで実装し、 nightly CI 緑、 PR が auto-merge 設定済みで main に merge commit 完了、 nights/pending/005-register-inc-dec.md が nights/done/ に移動済み、 or stop after N turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 005 merged`

## 前提

- 夜 4 (#6) merge 済み: ADC/SBC (overflow) + LDY、 nestest 先頭 505 行 trace diff
- nestest.log 506 行目 = INY 初出。 レジスタ増減 4 命令を実装して trace を伸ばす

## ブランチ運用

`night/005-register-inc-dec` ブランチ。 最初の commit で本 md を seed、 以降実装。 PR → sub-agent レビュー → triage STOP ゼロで auto-merge。

## サブゴール

1. **G1: レジスタ増減 4 命令** — すべて implied / cycle 2 / X or Y を ±1 して Z/N 更新:
   - `INX` (0xE8): X = (X+1)&0xFF
   - `INY` (0xC8): Y = (Y+1)&0xFF
   - `DEX` (0xCA): X = (X-1)&0xFF
   - `DEY` (0x88): Y = (Y-1)&0xFF
2. **G2: nestest trace 行数拡張** — `TRACE_LINES` を 505 → さらに伸ばす。 増減 4 命令で到達できる行まで。 未実装 opcode で throw したら確認し、 本夜スコープ (レジスタ増減) に収まるか・次夜送りかを判断して行数確定。 目標 600 行以上

## 実装ステップ

1. `chore(nights): seed 005` で本 md を commit
2. G1 → `feat(core/cpu): add register inc/dec INX/INY/DEX/DEY`
3. G2 → `test(core/cpu): extend nestest trace diff to N lines`
4. `npx vitest run` / `npx tsc --noEmit` / `npx eslint` 全緑
5. `git mv nights/pending/005-*.md nights/done/005-*.md` → `chore(nights): move 005 to done`
6. push → PR → sub-agent レビュー → triage → auto-merge

## 検証チャンネル

- `✅ PASS: cpu_nestest_trace first N lines match` / `✅ TYPECHECK: clean`
- `🔀 PR OPENED` / `⏳ AUTO-MERGE ARMED` / `🎯 GOAL CONDITION MET: night 005 merged`

## 申し送り (継続)

- makeNestestBus doc コメント / parseLogLine 貪欲マッチ / CLI 未検証 — 全行照合する夜に対応 (将来送り)

## 詰まったら (nesdev wiki のみ参照)

- 命令仕様: https://www.nesdev.org/wiki/Instruction_reference
- 30 分以上詰んだら stuck 隔離

## DoD (完了条件)

- [ ] `night/005-register-inc-dec` ブランチで作業
- [ ] G1: INX/INY/DEX/DEY (implied, cycle 2, Z/N 更新)
- [ ] G2: `TRACE_LINES` を 505 → 600 行以上に拡張し diff pass
- [ ] `npx vitest run` exit 0
- [ ] `npx tsc --noEmit` 警告ゼロ
- [ ] `npx eslint` 警告ゼロ
- [ ] `nights/pending/005-*.md` → `nights/done/` に git mv
- [ ] PR auto-merge 設定済み + nightly CI 緑 → main merge commit

## 詰みパターン参考

1. **増減の wrap** — `(X+1)&0xFF` / `(X-1)&0xFF` で 8bit に収める。 0x00 - 1 = 0xFF、 0xFF + 1 = 0x00
2. **Z/N の対象** — 増減後の値で Z/N を更新 (setZeroNeg を使う)
3. **到達行数の確定** — 増減 4 命令で届く行まで。 次の未実装命令 (TAX/TAY 等の転送、 INC/DEC memory、 STY、 新 addressing) が出たら TRACE_LINES 確定
