# 夜 2: 6502 デコーダ + 主要命令 12 個 + nestest.log diff harness

## ゴール (/goal)

```
/goal night/002-cpu-decode-and-core-instructions ブランチで実装し、 nightly CI 緑、 PR が auto-merge 設定済みで main に merge commit 完了、 nights/pending/002-cpu-decode-and-core-instructions.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 002 merged`

## 前提

- 夜 1 (#1) で merge 済み: `Cpu` 型 / `createCpu` / `CpuFlags` / `Bus` interface / `parseINes` / nestest.nes 1 命令 fetch テスト
- nestest.log は `roms/test/other/nestest.log` に存在 (submodule 内)
- 既存 NES エミュレータ参照禁止 (CLAUDE.md 「ソース由来制約」 参照)

## ブランチ運用

`night/002-cpu-decode-and-core-instructions` ブランチを切って実装、 完了時に PR auto-merge。 main 直 push は hook で deny される。

## サブゴール (4 段階)

1. **G1: Addressing mode helper** — `src/core/cpu/addressing.ts` に implicit / accumulator / immediate / zeroPage / zeroPageX / zeroPageY / absolute / absoluteX / absoluteY / indirect / indirectX / indirectY / relative の 13 種類のアドレッシング関数を実装。 各関数は `(cpu, bus) => { addr: number, extraCycle: boolean }` (implicit/accumulator は `addr: -1` 返却) を返す。 page-cross extraCycle 計算込み。
2. **G2: 命令テーブル + コア命令 12 個** — `src/core/cpu/opcodes.ts` に 256 エントリの命令テーブル (未実装は `null`)。 実装する命令: `JMP` (absolute / indirect)、 `LDX` / `LDY` / `LDA` (immediate / zeroPage / absolute)、 `STX` / `STY` / `STA` (zeroPage / absolute)、 `NOP` (implicit)、 `SEC` / `CLC` / `SED` / `CLD` (implicit)、 `BCS` / `BCC` (relative)、 `JSR` (absolute) / `RTS` (implicit)。 ステップ関数 `cpuStep(cpu, bus): number` (消費サイクル返却) を `src/core/cpu/step.ts` に。
3. **G3: nestest.log diff harness** — `src/core/cpu/nestest_trace.ts` に「現在の Cpu 状態を nestest.log フォーマット (PC, A, X, Y, P, SP, CYC) で 1 行にフォーマット」 する `formatTrace(cpu)` を実装。 ただし opcode / disassembly カラムは省略可 (空白埋め)。 trace 比較は PC/A/X/Y/P/SP/CYC のみ厳密一致を判定。
4. **G4: nestest 50 行 pass テスト** — `tests/cpu_nestest_trace.test.ts` で nestest.nes をロード → RAM 2KB ($0000-$07FF) を持つ簡易 Bus (PRG ROM を $8000/$C000 にミラー) を組む → PC=$C000 から 50 命令実行 → 各命令前の Cpu 状態を `nestest.log` の対応行と diff、 全 50 行 PASS。

## 実装ステップ (要点)

1. `git checkout main && git pull`
2. `git checkout -b night/002-cpu-decode-and-core-instructions`
3. G1 → commit `feat(core/cpu): add addressing mode helpers`
4. G2 → commit を 2-3 分割 (`feat(core/cpu): add opcode table skeleton` / `feat(core/cpu): implement JMP/LDX/LDY/LDA/STX/STY/STA/NOP` / `feat(core/cpu): implement flag/branch/JSR/RTS instructions`)
5. G3 → commit `feat(core/cpu): add nestest log trace formatter`
6. G4 → commit `test(core/cpu): nestest first 50 lines diff pass`
7. `npx vitest run` / `npx tsc --noEmit` / `npx eslint` 全緑確認
8. `git mv nights/pending/002-*.md nights/done/002-*.md` → commit `chore(nights): move 002 to done`
9. push → `gh pr create` → `gh pr merge --auto --merge --delete-branch`

## 検証チャンネル (transcript 出力ルール)

- `✅ PASS: cpu_nestest_trace first 50 lines match`
- `✅ TYPECHECK: clean`
- `🔀 PR OPENED: <URL>`
- `⏳ AUTO-MERGE ARMED: CI 緑判定待ち`
- `🎯 GOAL CONDITION MET: night 002 merged`
- 失敗時: `❌ FAIL: <line N: expected ... got ...>`

## PR body テンプレ

```markdown
## ゴール
nights/pending/002-cpu-decode-and-core-instructions.md の DoD 全項目達成

## DoD チェック
- [x] <下記 DoD を全項目チェック>

## サブゴール達成状況
- [x] G1: 13 種アドレッシングモード helper
- [x] G2: 命令テーブル + コア命令 (JMP/LDX/LDY/LDA/STX/STY/STA/NOP/SEC/CLC/SED/CLD/BCS/BCC/JSR/RTS)
- [x] G3: nestest trace formatter
- [x] G4: nestest 最初 50 行 diff pass

## 困った点・設計判断
(あれば)

## 次の夜の前提条件
- 命令ステップ関数 `cpuStep` が動く
- nestest trace diff harness が動く
- 残命令 (ALU / 残ブランチ / スタック / 比較 / シフト等) は夜 3 以降
```

## 詰まったら (nesdev wiki のみ参照)

- 6502 命令仕様: https://www.nesdev.org/wiki/CPU_unofficial_opcodes (公式命令も同 wiki ナビから)
- アドレッシングモード: https://www.nesdev.org/wiki/CPU_addressing_modes
- ステータスフラグ: https://www.nesdev.org/wiki/Status_flags
- nestest.log フォーマット: https://www.nesdev.org/wiki/Emulator_tests (nestest セクション)

30 分以上同じエラーで詰んだら:
1. このファイルを `nights/stuck/002-cpu-decode-and-core-instructions-stuck.md` に rename + 詰み report 追記
2. PR を draft に戻す (`gh pr ready --undo`)
3. 連鎖中ならセッション終了 (次の夜には進まない)

## DoD (完了条件、 /goal 条件と同期)

- [ ] `night/002-cpu-decode-and-core-instructions` ブランチで作業
- [ ] G1: `src/core/cpu/addressing.ts` に 13 種アドレッシング helper
- [ ] G2: `src/core/cpu/opcodes.ts` + `src/core/cpu/step.ts` にコア命令 16 種 (上記列挙) と `cpuStep`
- [ ] G3: `src/core/cpu/nestest_trace.ts` に `formatTrace` (PC/A/X/Y/P/SP/CYC を nestest.log フォーマットで出力)
- [ ] G4: `tests/cpu_nestest_trace.test.ts` で nestest 先頭 50 行 diff pass
- [ ] `npx vitest run` exit 0
- [ ] `npx tsc --noEmit` 警告ゼロ
- [ ] `npx eslint 'src/**/*.ts' 'tests/**/*.ts'` 警告ゼロ
- [ ] git log に最低 5 コミット
- [ ] `nights/pending/002-cpu-decode-and-core-instructions.md` を `nights/done/` に `git mv`
- [ ] PR auto-merge 設定済み
- [ ] nightly CI 緑判定後 main に merge commit 反映済み

## 詰みパターン参考

1. **PC インクリメント順序の罠** — fetch 直後に PC をインクリメントするか、 命令完了後にインクリメントするかで CYC が 1 ずれる。 nestest.log は「命令実行前」 の状態を 1 行 1 命令で記録する仕様
2. **CYC 累積の罠** — nestest.log の CYC は CPU cycles だが、 cycle counter リセット (reset 時) は CYC=7 (nestest は reset 後直行で $C000 にいるためログ初期値 CYC:7)
3. **JSR / RTS の PC 操作** — JSR push する PC は `JSR の次の命令の PC - 1` (6502 の独特なクセ)。 RTS pull 後に PC+1
4. **indirect JMP のバグ再現** — `JMP ($xxFF)` は page wrap する (実機バグ)。 nestest 内で踏むので再現必須
5. **flags の B / U bit** — push 系で立つ / 立たないが命令ごとに違う (PHP / BRK / IRQ で差異あり)。 夜 2 では JSR/RTS のみ実装するため気にしなくて OK
6. **page-cross extraCycle** — absoluteX / absoluteY / indirectY で base + index が page を跨ぐ時 +1 cycle。 STA 系は store 命令なので extraCycle は加算しない (read 命令のみ加算) — 夜 2 で実装するのは LDA/LDX/LDY 系のみなので加算する側

## 夜 1 後追いレビューからの申し送り (PR #1 sub-agent レビュー、 low×3)

1. **`tests/cpu_nestest.test.ts` のテスト名と実態の不一致** → 夜 2 G4 で `cpuStep` を実装し nestest.log trace diff を回せば「実際に命令を実行して状態を検証する」 形になり名実一致する。 **本夜で自然解消する想定**
2. **`src/core/cart.ts` の NES2.0 判定未考慮** — mapper 算出式自体は仕様どおり正しい。 NES2.0 ヘッダ判定 (`flags7 & 0x0C === 0x08`) と dirty header ヒューリスティックは未実装だが NROM/nestest only の現状は非発火。 **将来夜送り (本夜では対応しない)**
3. **`src/core/cart.ts` の CHR RAM 未確保** — CHR バンク数 0 (CHR RAM) 時に RAM 領域を確保していない。 PPU 実装夜で 8KB 確保分岐が必要。 **PPU 夜送り (本夜では対応しない)**
