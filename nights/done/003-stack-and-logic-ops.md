# 夜 3: スタック命令 + 論理/比較命令 + nestest trace 拡張

## ゴール (/goal)

```
/goal night/003-stack-and-logic-ops ブランチで実装し、 nightly CI 緑、 PR が auto-merge 設定済みで main に squash merge 完了、 nights/pending/003-stack-and-logic-ops.md が nights/done/ に移動済み、 or stop after N turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 003 merged`

## 前提

- 夜 2 (#4) で merge 済み: addressing 5 モード / cpuStep / OPCODES テーブル / formatTrace / nestest 先頭 50 行 diff harness
- nestest.log の 51 行目以降に出現する夜 2 未実装命令を実装し、 trace 一致行数を伸ばす

## ブランチ運用

`night/003-stack-and-logic-ops` ブランチ。 最初の commit で本 md を seed (`chore(nights): seed 003`)、 以降実装。 PR 作成後 sub-agent レビュー → triage STOP ゼロで auto-merge (CLAUDE.md 自走連鎖プロトコル準拠)。

## サブゴール

1. **G1: スタック命令** — `PHA` (0x48) / `PLA` (0x68) / `PHP` (0x08) / `PLP` (0x28)。 push8/pull8 helper は opcodes.ts に既存。
   - **罠**: PHP は P に B(bit4)|U(bit5) を立てて push (`P | 0x30`)。 PLP は pull 値の B を無視し U を常に 1 にする (`(pulled & ~0x10) | 0x20`)。 PLA は A に pull して Z/N 更新。 cycle: PHA/PHP=3, PLA/PLP=4
2. **G2: 論理/比較命令 (immediate)** — `AND` (0x29) / `CMP` (0xC9)。
   - AND: `A &= M`、 Z/N 更新。 cycle 2
   - CMP: `A - M` を計算し C=(A>=M) / Z=(A==M) / N=(結果 bit7)。 A は変更しない。 cycle 2
   - nestest.log の続きで ORA/EOR/CPX/CPY 等も出たら必要分追加 (テストで未実装 opcode throw を見て判断)
3. **G3: フラグ命令追加** — `SEI` (0x78) / `CLI` (0x58) (I フラグ set/clear)。 cycle 2
4. **G4: nestest trace 行数拡張** — `tests/cpu_nestest_trace.test.ts` の `TRACE_LINES` を 50 → できるだけ伸ばす (目標 150 行以上)。 実装命令で到達できる行数まで通す。 未実装 opcode で throw したらその命令を G1-G3 に追加するか、 到達行数で line 数を確定する

## 実装ステップ

1. `git checkout main && git pull` (済み: 夜3 ブランチは main 最新から分岐)
2. `chore(nights): seed 003` で本 md を commit
3. G1 → `feat(core/cpu): add stack instructions PHA/PLA/PHP/PLP`
4. G2 → `feat(core/cpu): add AND/CMP immediate`
5. G3 → `feat(core/cpu): add SEI/CLI flag instructions`
6. G4 → `test(core/cpu): extend nestest trace diff to N lines` (TRACE_LINES 拡張)
7. `npx vitest run` / `npx tsc --noEmit` / `npx eslint` 全緑
8. `git mv nights/pending/003-*.md nights/done/003-*.md` → `chore(nights): move 003 to done`
9. push → PR → sub-agent レビュー → triage → auto-merge

## 検証チャンネル

- `✅ PASS: cpu_nestest_trace first N lines match`
- `✅ TYPECHECK: clean`
- `🔀 PR OPENED: <URL>` / `⏳ AUTO-MERGE ARMED` / `🎯 GOAL CONDITION MET: night 003 merged`
- 失敗時: `❌ FAIL: line N: expected ... got ...`

## 夜 2 からの申し送り (PR #4 sub-agent レビュー PASS×2)

1. **RTS / 分岐 page-cross 経路が未検証** — 夜 2 の 50 行 trace には出なかった。 本夜で行数を拡張すると RTS (51 行目以降に出現) と分岐 page-cross がカバーされるはず。 **本夜で自然に回帰カバーされる想定**
2. **`parseLogLine` の貪欲マッチ (`.*A:` / `.*CYC:`) がフルログ照合では脆い** — 現スコープ (数百行) では問題ないが、 全 8991 行照合する夜には正規表現を厳密化する。 **将来夜送り**

## 詰まったら (nesdev wiki のみ参照)

- スタック命令と B フラグ: https://www.nesdev.org/wiki/Status_flags (B flag / break)
- 命令仕様: https://www.nesdev.org/wiki/Instruction_reference
- PHP/PLP の B/U bit 挙動は nestest.log の P 値で検証する (実バイトが正典)

30 分以上同じエラーで詰んだら stuck 隔離 (nights/stuck/ に rename + 詰み report、 PR draft 戻し、 連鎖中断)。

## DoD (完了条件)

- [ ] `night/003-stack-and-logic-ops` ブランチで作業
- [ ] G1: PHA/PLA/PHP/PLP (B/U フラグ罠対応)
- [ ] G2: AND/CMP immediate (+ 到達に必要な追加命令)
- [ ] G3: SEI/CLI
- [ ] G4: `TRACE_LINES` を 50 → 150 行以上に拡張し diff pass
- [ ] `npx vitest run` exit 0
- [ ] `npx tsc --noEmit` 警告ゼロ
- [ ] `npx eslint` 警告ゼロ
- [ ] git log に最低 5 コミット
- [ ] `nights/pending/003-*.md` → `nights/done/` に git mv
- [ ] PR auto-merge 設定済み + nightly CI 緑 → main squash merge 反映

## 詰みパターン参考

1. **PHP/PLP の B/U bit** — PHP は `P | 0x30` を push、 PLP は `(pulled & 0xEF) | 0x20`。 ここを間違えると P 値が nestest.log とずれる
2. **CMP のフラグ** — C は「borrow の否定」 (A>=M で C=1)。 符号なし比較。 Z/N は (A-M)&0xFF で判定
3. **PLA の Z/N 更新忘れ** — PLA は pull した値で Z/N を更新する (PLP と違い通常の load 扱い)
4. **スタック cycle** — PHA/PHP=3, PLA/PLP=4 (pull は dummy read で +1)
5. **到達行数の確定** — 実装命令で届く行数までで TRACE_LINES を確定。 欲張って未実装命令の行を含めると throw する
