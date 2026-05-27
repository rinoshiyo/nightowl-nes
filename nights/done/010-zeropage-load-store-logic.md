# 夜 010: zeroPage load/store/logic/arith/compare 本体ブロック

> 直近 done = 009 ((indirect,X) アドレッシングモード + ゲートの LDA zp、 nestest 1500 行到達)。
> nestest.log 1501 行目の `LDY $78 ($A4)` が次の未実装命令で、 そこから 2070 行まで
> zeroPage の load/store/logic/arith/compare 本体ブロックが続く。 2071 行目の `LSR $4F ($46)`
> から zeroPage の read-modify-write (シフト/INC/DEC) が始まるため、 夜 10 は
> **RMW 手前まで** を切れ目にし、 trace を 1500 → 2070 へ伸ばす。 RMW は夜 11 に回す。

## ゴール (/goal)

```
/goal night/010-zeropage-load-store-logic ブランチで実装し、 nightly CI 緑、 PR が auto-merge 設定済みで main に merge commit で合流、 nights/pending/010-zeropage-load-store-logic.md が nights/done/ に移動済み、 or stop after 50 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 010 merged`

## 前提

- 夜 009 done: LDA zeroPage / (indirect,X) 8 命令実装済み、 nestest trace 1500 行一致 (`TRACE_LINES = 1500`)
- zeroPage アドレッシング (`zeroPage`) は実装済み (LDA/STA/STX/BIT zp で使用中)
- addToA / compare / setZeroNeg ヘルパーは ADC/SBC/CMP/CPX/CPY/論理命令で再利用できる (immediate / (ind,X) 版と同形)
- すべて固定 cycle 3 (zeroPage load/store/logic/arith/compare)。 page-cross 加算は無い
- 仕様: nesdev wiki "6502 instructions" (既存実装は参照禁止)

## ブランチ運用

`night/010-zeropage-load-store-logic` ブランチを切って実装、 完了時に PR を auto-merge (merge commit) で立てる。 main 直 push は hook で deny。 本 md の seed は本ブランチ初手 commit (`chore(nights): seed 010 from done 009 insights`)。

## サブゴール (1 夜を 4 段階に分解)

1. **G1: load/store zeroPage (0xA4 LDY / 0xA6 LDX / 0x84 STY)** — `zeroPage` モードで load は `cpu.{y,x} = bus.read(addr)` + Z/N、 store は `bus.write(addr, cpu.y)`。 全 cycle 3。 nestest 1501 行 (LDY zp) / 1513 行 (STY zp) / 1526 行 (LDX zp) のゲートを開ける。
2. **G2: logic zeroPage (0x05 ORA / 0x25 AND / 0x45 EOR)** — `cpu.a = cpu.a {|,&,^} bus.read(addr)` + Z/N、 cycle 3。 1579 行 (ORA) / 1610 行 (AND) / 1641 行 (EOR)。
3. **G3: arith zeroPage (0x65 ADC / 0xE5 SBC)** — `addToA` を zeroPage 実効アドレス越しに再利用 (SBC は `^ 0xFF`)、 cycle 3。 1672 行 (ADC) / 1834 行 (SBC)。
4. **G4: compare zeroPage (0xC5 CMP / 0xE4 CPX / 0xC4 CPY)** — `compare(cpu, cpu.{a,x,y}, bus.read(addr))`、 cycle 3。 1746 行 (CMP) / 1912 行 (CPX) / 1990 行 (CPY)。

各サブゴールは独立 commit 単位 (Conventional Commits)。

## 実装ステップ

1. `git checkout main && git pull` → `git checkout -b night/010-zeropage-load-store-logic`
2. 本 md を pending に seed して初手 commit
3. G1〜G4: `opcodes.ts` に zeroPage 11 命令を `def(...)` 追加 (`addressing.ts` は変更不要)
4. `tests/cpu_zeropage_ops.test.ts` を新規作成 (load/store/logic/arith/compare の Z/N/C/V とサイクルを単体検証)
5. `tests/cpu_nestest_trace.test.ts` の `TRACE_LINES` を 1500 → 2070 に拡張
6. `npx vitest run` 全 pass / `npx tsc --noEmit` 警告ゼロ / `npx eslint ...` 警告ゼロ
7. `git mv nights/pending/010-*.md nights/done/` を同じブランチで commit
8. push → `gh pr create` → sub-agent レビュー → triage → STOP ゼロで auto-merge arm

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: <test_name>` / fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- auto-merge 設定: `⏳ AUTO-MERGE ARMED: CI 緑判定待ち`
- main merge 確認: `🎯 GOAL CONDITION MET: night 010 merged`

## PR body テンプレ

```markdown
## ゴール
nights/pending/010-zeropage-load-store-logic.md の DoD 全項目達成

## DoD チェック
- [x] <DoD 項目を全部チェック付きで列挙>

## サブゴール達成状況
- [x] G1〜G4

## 困った点・設計判断
(あれば箇条書きで)

## 次の夜の前提条件 (連鎖時の引き継ぎメモ)
- nestest trace 2070 行到達。 2071 行 `LSR $4F ($46)` が次の壁 (夜 11 = zeroPage RMW = シフト/ローテート/INC/DEC zp ブロック)
```

## 詰まったら (nesdev wiki のみ参照)

- https://www.nesdev.org/obelisk-6502-guide/reference.html (命令別 cycle/flag 早見)
- https://www.nesdev.org/wiki/CPU_addressing_modes (Zero page)

30 分以上同じエラーで詰んだら:
1. 本 md を `nights/stuck/010-zeropage-load-store-logic-stuck.md` に rename (詰み report 追記)
2. PR を draft に戻す (`gh pr ready --undo`) か ask 経由 close
3. 連鎖中断 + セッション終了 (次の夜に進まない)

## コミット粒度 (Conventional Commits)

- `chore(nights): seed 010 from done 009 insights` (本 md seed)
- `feat(core/cpu): add LDY/LDX/STY zeroPage`
- `feat(core/cpu): add ORA/AND/EOR zeroPage`
- `feat(core/cpu): add ADC/SBC zeroPage`
- `feat(core/cpu): add CMP/CPX/CPY zeroPage`
- `test(core/cpu): add zeroPage ops unit tests and extend trace to 2070`
- `chore(nights): move 010 to done`

## DoD (完了条件、 /goal 条件と同期)

- [x] `night/010-zeropage-load-store-logic` ブランチで作業
- [x] G1: LDY (0xA4) / LDX (0xA6) / STY (0x84) zeroPage 実装、 cycle 3
- [x] G2: ORA (0x05) / AND (0x25) / EOR (0x45) zeroPage 実装、 cycle 3
- [x] G3: ADC (0x65) / SBC (0xE5) zeroPage 実装、 cycle 3
- [x] G4: CMP (0xC5) / CPX (0xE4) / CPY (0xC4) zeroPage 実装、 cycle 3
- [x] `tests/cpu_zeropage_ops.test.ts` で load/store/logic/arith/compare のフラグとサイクルを単体検証
- [x] `tests/cpu_nestest_trace.test.ts` の `TRACE_LINES` を 2070 に拡張し pass
- [x] `npx vitest run` exit 0 (28 tests pass)
- [x] `npx tsc --noEmit` 警告ゼロ
- [x] `npx eslint 'src/**/*.ts' 'tests/**/*.ts'` 警告ゼロ
- [x] git log に最低 5 コミット
- [x] `nights/pending/010-*.md` を `nights/done/` に `git mv`
- [x] PR が立っており auto-merge (merge commit) 設定済み
- [ ] nightly CI 緑後 main に merge 反映済み

## 詰みパターン参考

- **ADC/SBC の V フラグ**: `addToA` を使えば immediate / (ind,X) と同じ回路で正しく出る。 zeroPage 用に再実装しないこと
- **CMP/CPX/CPY は register を変更しない**: `compare` ヘルパーは C/Z/N のみ更新。 nestest は CYC とフラグ列で検証する
- **cycle は全部 3**: immediate (2) / absolute (4) / (ind,X) (6) と混同しない。 CYC ずれは trace の CYC 列で落ちる
- **STY zp はフラグ非変化**: store 系は Z/N を触らない (STA/STX zp 踏襲)
