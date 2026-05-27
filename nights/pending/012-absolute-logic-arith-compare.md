# 夜 012: absolute 論理 / 算術 / 比較 + BIT absolute

## ゴール (/goal)

```
/goal night/012-absolute-logic-arith-compare ブランチで実装し、 nightly CI 緑、 PR が auto-merge 設定済みで main に merge commit 完了、 nights/pending/012-absolute-logic-arith-compare.md が nights/done/ に移動済み、 or stop after 50 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 012 merged`

## 前提

- 夜 011 done: zeroPage RMW (シフト/ローテート + INC/DEC、 cycle 5) 実装済み。nestest trace 2327 行到達
- absolute load/store (LDA/STA/LDX/STX/LDY/STY absolute、 cycle 4) は夜 7 で実装済み。 `absolute` アドレッシング (`src/core/cpu/addressing.ts`) はそのまま流用する
- 論理 (ORA/AND/EOR)・算術 (ADC/SBC)・比較 (CMP/CPX/CPY) の演算ヘルパー (`addToA`/`compare`/`setZeroNeg`) は immediate / zeroPage / (ind,X) 版で実装済み。 これを absolute 実効アドレス越しに再利用するだけで新規ロジックはほぼゼロ
- BIT は zeroPage 版 (`24`) のみ実装済み。 absolute 版 (`2C`) を足すため、 BIT のフラグ演算を共通ヘルパー `bitTest` に抽出して双方から使う (ロジック二重管理を避ける、 夜 11 の `aslValue` 抽出と同じ idiom)
- 起点 = nestest.log 2328 行目 `D5C4 2C 78 06 BIT $0678` (absolute 論理/算術/比較ブロックの入口)
- 仕様: nesdev wiki の 6502 命令仕様 (absolute = cycle 4、 page-cross 加算なし)

## ブランチ運用

`night/012-absolute-logic-arith-compare` ブランチで実装、 完了時に PR を auto-merge (merge commit) で立てる。 main 直 push は hook で deny。

## サブゴール

1. **G1: BIT absolute + ヘルパー抽出** — BIT の Z/V/N 演算を `bitTest(cpu, m)` ヘルパーに抽出し、 既存 BIT zeroPage (`24`) と新規 BIT absolute (`2C`、 cycle 4) の双方から使う。 挙動 (A&M で Z、 M の bit6→V、 bit7→N) は不変
2. **G2: absolute 論理** — ORA/AND/EOR の absolute 版 (opcode `0D`/`2D`/`4D`、 cycle 4) を実装。 immediate / zeroPage 版と同じ演算を `absolute` 実効アドレス越しに行い setZeroNeg
3. **G3: absolute 算術 + 比較** — ADC/SBC (opcode `6D`/`ED`、 cycle 4) と CMP/CPX/CPY (opcode `CD`/`EC`/`CC`、 cycle 4) を実装。 `addToA` (SBC は `^0xFF`)・`compare` ヘルパーを再利用
4. **G4: nestest trace 延伸** — `TRACE_LINES` を 2327 → 2848 に引き上げ (line 2849 = `4E LSR absolute` = absolute RMW が次の未実装命令のため、 そこを上限とする)
5. **G5: 単体テスト追加** — 9 命令の absolute 挙動 (Z/N/V/C フラグ、 ADC/SBC overflow、 compare の borrow) を `tests/cpu_absolute_logic.test.ts` に追加

各サブゴールは独立 commit 単位 (Conventional Commits)。

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/012-absolute-logic-arith-compare`
3. G1: `src/core/cpu/opcodes.ts` に `bitTest` ヘルパーを抽出 → BIT zp/abs 双方で使用 → 都度 `bun test` + `bunx tsc --noEmit`
4. G1 commit (`feat(core/cpu): add BIT absolute + extract bitTest helper`)
5. G2: ORA/AND/EOR absolute → commit (`feat(core/cpu): add absolute logic ops (ORA/AND/EOR)`)
6. G3: ADC/SBC + CMP/CPX/CPY absolute → commit (`feat(core/cpu): add absolute arith/compare ops`)
7. G4: `TRACE_LINES` 引き上げ → commit (`test(core/cpu): extend nestest trace to 2848 lines`)
8. G5: 単体テスト追加 → commit (`test(core/cpu): add absolute logic/arith/compare tests`)
9. `bun test` 全 pass / `bunx tsc --noEmit` 警告ゼロ / `bunx eslint 'src/**/*.ts' 'tests/**/*.ts'` 警告ゼロ
10. `git mv nights/pending/012-...md nights/done/012-...md` を commit (`chore(nights): move 012 to done`)
11. `git push -u origin night/012-absolute-logic-arith-compare`
12. `gh pr create --base main --title "夜 12: absolute 論理/算術/比較 + BIT absolute" --body-file tmp/pr-body.md`
13. sub-agent レビュー → triage が STOP ゼロを確認してから `gh pr merge --auto --merge --delete-branch`

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: <test_name>`
- テスト fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- auto-merge 設定: `⏳ AUTO-MERGE ARMED: CI 緑判定待ち`
- main merge 確認: `🎯 GOAL CONDITION MET: night 012 merged`

## 対象 opcode と nestest 出現行

| opcode | 命令 | mode | cycle | 初出行 |
|---|---|---|---|---|
| `2C` | BIT | absolute | 4 | 2328 (`D5C4`) |
| `0D` | ORA | absolute | 4 | 2357 (`D5FF`) |
| `2D` | AND | absolute | 4 | 2388 (`D61D`) |
| `4D` | EOR | absolute | 4 | 2419 (`D63B`) |
| `6D` | ADC | absolute | 4 | 2450 (`D659`) |
| `CD` | CMP | absolute | 4 | 2524 (`D69A`) |
| `ED` | SBC | absolute | 4 | 2612 (`D703`) |
| `EC` | CPX | absolute | 4 | 2690 (`D74F`) |
| `CC` | CPY | absolute | 4 | 2768 (`D7AF`) |

延伸上限 = 2848 行 (2849 行 `4E LSR absolute` = absolute RMW が次夜の入口)。

## 詰まったら (nesdev wiki のみ参照)

- https://www.nesdev.org/obelisk-6502-guide/reference.html (BIT/ORA/AND/EOR/ADC/SBC/CMP/CPX/CPY 仕様)
- https://www.nesdev.org/obelisk-6502-guide/addressing.html (absolute モード)
- https://www.nesdev.org/wiki/6502_cycle_times

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。

## コミット粒度 (Conventional Commits)

- G1 / G2 / G3 / G4 / G5 + nights/done 移動 = 最低 6 commit (md seed commit を含めると 7)

## DoD (完了条件)

- [ ] `night/012-absolute-logic-arith-compare` ブランチで作業
- [ ] G1: BIT absolute (`2C`) 実装、 cycle 4。 `bitTest` ヘルパーに抽出し zp/abs 双方で共用 (ロジック二重管理なし)
- [ ] G2: ORA/AND/EOR absolute (`0D`/`2D`/`4D`) 実装、 cycle 4、 Z/N 正しい
- [ ] G3: ADC/SBC absolute (`6D`/`ED`) 実装、 cycle 4、 C/V/Z/N 正しい
- [ ] G3: CMP/CPX/CPY absolute (`CD`/`EC`/`CC`) 実装、 cycle 4、 C/Z/N 正しい
- [ ] G4: `TRACE_LINES` を 2848 に引き上げ、 nestest trace test pass
- [ ] G5: `tests/cpu_absolute_logic.test.ts` 追加 (9 命令 + フラグ境界)
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts'` 警告ゼロ
- [ ] git log に最低 6 commit
- [ ] `nights/pending/012-...md` を `nights/done/` に `git mv`
- [ ] PR が立っており `gh pr merge --auto --merge --delete-branch` で auto-merge 設定済み
- [ ] nightly CI 緑後 main に merge commit 反映済み

## 詰みパターン参考

- BIT は A を変更しない。 Z は `A & M`、 V は `M` の bit6、 N は `M` の bit7 (A ではなく M のビットを見る点に注意)
- absolute は固定 4 cycle (page cross なし)。 zeroPage (cycle 3) や absoluteX/Y (page cross 加算あり) と混同しない
- SBC は `~M` を `addToA` に渡すと ADC と同じ回路 (既存 immediate/zeroPage/(ind,X) と同根)
- CMP/CPX/CPY は register を変更せず C/Z/N のみ更新 (C は register >= value)
- `bitTest` 抽出時に既存 BIT zeroPage の挙動を壊さないこと (抽出後も既存 trace test が緑のまま)
