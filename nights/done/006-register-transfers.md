# 夜 6: レジスタ転送命令 (TAX/TAY/TXA/TYA/TSX/TXS) + nestest trace 拡張

## ゴール (/goal)

```
/goal night/006-register-transfers ブランチで実装し、 nightly CI 緑、 PR が auto-merge 設定済みで main に merge commit 完了、 nights/pending/006-register-transfers.md が nights/done/ に移動済み、 or stop after N turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 006 merged`

## 前提

- 夜 5 (#7) merge 済み: レジスタ増減 INX/INY/DEX/DEY、 nestest 先頭 677 行 trace diff
- nestest.log 678 行目 = TAY 初出。 レジスタ転送 6 命令を実装して trace を伸ばす

## ブランチ運用

`night/006-register-transfers` ブランチ。 最初の commit で本 md を seed、 以降実装。 PR → sub-agent レビュー → triage STOP ゼロで auto-merge。

## サブゴール

1. **G1: レジスタ転送 6 命令** — すべて implied / cycle 2:
   - `TAX` (0xAA): X = A、 Z/N 更新
   - `TAY` (0xA8): Y = A、 Z/N 更新
   - `TXA` (0x8A): A = X、 Z/N 更新
   - `TYA` (0x98): A = Y、 Z/N 更新
   - `TSX` (0xBA): X = SP、 Z/N 更新
   - `TXS` (0x9A): SP = X、 **Z/N 更新しない** ← 6502 の罠。 TXS だけフラグ非変化
2. **G2: nestest trace 行数拡張** — `TRACE_LINES` を 677 → さらに伸ばす。 転送 6 命令で到達できる行まで。 未実装 opcode で throw したら確認し、 本夜スコープに収まるか・次夜送りかを判断して行数確定。 目標 750 行以上

## 実装ステップ

1. `chore(nights): seed 006` で本 md を commit
2. G1 → `feat(core/cpu): add register transfers TAX/TAY/TXA/TYA/TSX/TXS`
3. G2 → `test(core/cpu): extend nestest trace diff to N lines`
4. `npx vitest run` / `npx tsc --noEmit` / `npx eslint` 全緑
5. `git mv nights/pending/006-*.md nights/done/006-*.md` → `chore(nights): move 006 to done`
6. push → PR → sub-agent レビュー → triage → auto-merge

## 検証チャンネル

- `✅ PASS: cpu_nestest_trace first N lines match` / `✅ TYPECHECK: clean`
- `🔀 PR OPENED` / `⏳ AUTO-MERGE ARMED` / `🎯 GOAL CONDITION MET: night 006 merged`

## 申し送り (継続)

- done md の DoD チェックボックスを `[x]` で埋めてから移動する (夜 5 レビュー参考指摘、 体裁改善)
- makeNestestBus doc / parseLogLine 貪欲マッチ / CLI 未検証 / def() の silent overwrite — 全行照合する夜・テーブル肥大時に対応 (将来送り)

## 詰まったら (nesdev wiki のみ参照)

- 命令仕様: https://www.nesdev.org/wiki/Instruction_reference
- 30 分以上詰んだら stuck 隔離

## DoD (完了条件)

- [ ] `night/006-register-transfers` ブランチで作業
- [ ] G1: TAX/TAY/TXA/TYA/TSX/TXS (TXS のみ Z/N 非更新)
- [ ] G2: `TRACE_LINES` を 677 → 750 行以上に拡張し diff pass
- [ ] `npx vitest run` exit 0
- [ ] `npx tsc --noEmit` 警告ゼロ
- [ ] `npx eslint` 警告ゼロ
- [ ] `nights/pending/006-*.md` → `nights/done/` に git mv
- [ ] PR auto-merge 設定済み + nightly CI 緑 → main merge commit

## 詰みパターン参考

1. **TXS は Z/N を更新しない** — 他の 5 転送は setZeroNeg するが TXS だけしない。 ここを間違えると SP 操作後の P 値が nestest.log とずれる
2. **TSX は SP を X に読む** — TSX は X = SP で Z/N 更新する (TXS と対だが TSX はフラグ更新あり)
3. **到達行数の確定** — 転送 6 命令で届く行まで。 次の未実装命令 (STX/STY の別 addressing、 INC/DEC memory、 新 addressing mode) が出たら TRACE_LINES 確定
