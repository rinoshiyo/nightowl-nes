# 夜 011: zeroPage RMW (シフト/ローテート + INC/DEC)

## ゴール (/goal)

```
/goal night/011-zeropage-rmw-shift-inc-dec ブランチで実装し、 nightly CI 緑、 PR が auto-merge 設定済みで main に merge commit 完了、 nights/pending/011-zeropage-rmw-shift-inc-dec.md が nights/done/ に移動済み、 or stop after 50 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 011 merged`

## 前提

- 夜 010 done: zeroPage load/store/logic/arith/compare (cycle 3) 実装済み。nestest trace 2070 行到達
- accumulator シフト/ローテート (ASL/LSR/ROL/ROR A、 implied、 cycle 2) は夜 8 で実装済み。 oldC を A 更新前に退避する順序を踏襲する
- INX/INY/DEX/DEY (implied、 cycle 2) は実装済み。 フラグ挙動 (Z/N、 C は触らない) を踏襲する
- 起点 = nestest.log 2071 行目 `D42C 46 78 LSR $78` (zeroPage RMW の入口)
- 仕様: nesdev wiki の 6502 命令仕様 (read-modify-write は read → write → 演算結果 write の 5 cycle)

## ブランチ運用

`night/011-zeropage-rmw-shift-inc-dec` ブランチで実装、 完了時に PR を auto-merge (merge commit) で立てる。 main 直 push は hook で deny。

## サブゴール

1. **G1: zeroPage シフト/ローテート RMW** — ASL/LSR/ROL/ROR の zeroPage 版 (opcode `06`/`46`/`26`/`66`、 全 cycle 5) を実装。 `bus.read(addr)` → 演算 (C in/out 処理) → `bus.write(addr, result)` → setZeroNeg。 accumulator 版と同じ演算ロジックを共通ヘルパーに抽出して双方から使い、 ロジックの二重管理を避ける
2. **G2: zeroPage INC/DEC RMW** — INC/DEC の zeroPage 版 (opcode `E6`/`C6`、 cycle 5) を実装。 `(v±1)&0xFF` を write back し setZeroNeg。 C フラグは触らない (INX/DEX と同じ)
3. **G3: nestest trace 延伸** — `TRACE_LINES` を 2070 → 2327 に引き上げ (line 2328 = `2C BIT absolute` が次の未実装命令のため、 そこを上限とする)
4. **G4: 単体テスト追加** — 6 命令の RMW 挙動 (C in/out、 Z/N、 ゼロページ書き戻し) を `tests/cpu_zeropage_rmw.test.ts` に追加。 加えて夜 10 申し送りの SBC zeroPage borrow (C=0) / V-overflow ケースを補完

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/011-zeropage-rmw-shift-inc-dec`
3. G1: `src/core/cpu/opcodes.ts` にシフト/ローテートの値演算ヘルパー (`aslValue`/`lsrValue`/`rolValue`/`rorValue`) を抽出し accumulator 版と zeroPage RMW 版双方で使用 → 都度 `bun test` + `bunx tsc --noEmit`
4. G1 commit (`feat(core/cpu): add zeroPage shift/rotate RMW ops`)
5. G2: INC/DEC zeroPage を実装 → commit (`feat(core/cpu): add zeroPage INC/DEC RMW ops`)
6. G3: `TRACE_LINES` 引き上げ → commit (`test(core/cpu): extend nestest trace to 2327 lines`)
7. G4: 単体テスト追加 → commit (`test(core/cpu): add zeroPage RMW + SBC borrow tests`)
8. `bun test` 全 pass / `bunx tsc --noEmit` 警告ゼロ / `bunx eslint 'src/**/*.ts' 'tests/**/*.ts'` 警告ゼロ
9. `git mv nights/pending/011-...md nights/done/011-...md` を commit (`chore(nights): move 011 to done`)
10. `git push -u origin night/011-zeropage-rmw-shift-inc-dec`
11. `gh pr create --base main --title "夜 11: zeroPage RMW (シフト/ローテート + INC/DEC)" --body-file tmp/pr-body.md`
12. sub-agent レビュー → triage が STOP ゼロを確認してから `gh pr merge --auto --merge --delete-branch`

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: <test_name>`
- テスト fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- auto-merge 設定: `⏳ AUTO-MERGE ARMED: CI 緑判定待ち`
- main merge 確認: `🎯 GOAL CONDITION MET: night 011 merged`

## 対象 opcode と nestest 出現行

| opcode | 命令 | mode | cycle | 初出行 |
|---|---|---|---|---|
| `46` | LSR | zeroPage | 5 | 2071 (`D42C`) |
| `06` | ASL | zeroPage | 5 | 2102 (`D443`) |
| `66` | ROR | zeroPage | 5 | 2134 (`D45A`) |
| `26` | ROL | zeroPage | 5 | 2166 (`D471`) |
| `E6` | INC | zeroPage | 5 | 2196 (`D48B`) |
| `C6` | DEC | zeroPage | 5 | 2220 (`D4C0`) |

延伸上限 = 2327 行 (2328 行 `2C BIT absolute` が次夜の入口)。

## 詰まったら (nesdev wiki のみ参照)

- https://www.nesdev.org/wiki/CPU_unofficial_opcodes (RMW の挙動参考)
- https://www.nesdev.org/obelisk-6502-guide/reference.html (ASL/LSR/ROL/ROR/INC/DEC 仕様)
- https://www.nesdev.org/wiki/6502_cycle_times

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。

## コミット粒度 (Conventional Commits)

- G1 / G2 / G3 / G4 + nights/done 移動 = 最低 5 commit (md seed commit を含めると 6)

## DoD (完了条件)

- [ ] `night/011-zeropage-rmw-shift-inc-dec` ブランチで作業
- [ ] G1: ASL/LSR/ROL/ROR zeroPage (`06`/`46`/`26`/`66`) 実装、 cycle 5、 C in/out 正しい
- [ ] G1: シフト/ローテート値演算を共通ヘルパー化し accumulator 版と共用 (ロジック二重管理なし)
- [ ] G2: INC/DEC zeroPage (`E6`/`C6`) 実装、 cycle 5、 C 不変
- [ ] G3: `TRACE_LINES` を 2327 に引き上げ、 nestest trace test pass
- [ ] G4: `tests/cpu_zeropage_rmw.test.ts` 追加 (6 命令 + 境界フラグ)
- [ ] G4: SBC zeroPage borrow (C=0) / V-overflow テスト補完
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts'` 警告ゼロ
- [ ] git log に最低 5 commit
- [ ] `nights/pending/011-...md` を `nights/done/` に `git mv`
- [ ] PR が立っており `gh pr merge --auto --merge --delete-branch` で auto-merge 設定済み
- [ ] nightly CI 緑後 main に merge commit 反映済み

## 詰みパターン参考

- ROL/ROR の oldC 退避順序: C を更新する前に oldC を読む (夜 8 と同根の罠)
- RMW は read と write back の両方が必要。 read 値でフラグ、 write back 値は同じ。 cycle は固定 5 (page cross なし)
- INC/DEC は C フラグを触らない (compare や ADC と混同しない)
- 共通ヘルパー抽出時に accumulator 版 (cycle 2) の挙動を壊さないこと。 抽出後も既存 trace test (〜2070 行) が緑のままか確認
