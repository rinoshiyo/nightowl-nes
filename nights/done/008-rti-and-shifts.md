# 夜 8: RTI + シフト/ローテート命令 + nestest trace 拡張

## ゴール (/goal)

```
/goal night/008-rti-and-shifts ブランチで実装し、 nightly CI 緑、 PR が auto-merge 設定済みで main に merge commit で合流完了、 nights/pending/008-rti-and-shifts.md が nights/done/ に移動済み、 or stop after 50 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 008 merged`

## 前提

- 夜 7 (#? merged) 済み: absolute load/store 実装、 nestest trace 933 行到達 (`tests/cpu_nestest_trace.test.ts` の `TRACE_LINES = 933`)
- **933 行で止まる真因は 934 行目の `RTI` (0x40) 未実装** (`tests/cpu_nestest_trace.test.ts` のコメント参照)。 935〜975 行で出る分岐 (BMI/BVC/BEQ/BCC/BNE/BPL/BVS)・比較 (CMP/CPY/CPX)・TXS・RTS・BIT は実装済みのため、 RTI を実装すれば 976 行目まで一気に解放される
- **976 行目で次の壁 = `LSR A` (0x4A) シフト命令初出**。 ここからシフト/ローテート命令を実装して trace を伸ばす
- 参照は nesdev wiki のみ (既存 NES 実装の参照禁止)

## ブランチ運用

`night/008-rti-and-shifts` ブランチを切って実装。 最初の commit で本 md を seed (`chore(nights): seed 008`)、 以降実装。 PR → sub-agent レビュー → triage STOP ゼロで `gh pr merge --auto --merge --delete-branch`。 main 直 push は hook で deny。

## サブゴール (1 夜を 3-5 段階に分解)

1. **G1: RTI (0x40)** — implied mode。 スタックから P を pull (PLP と同じく B(bit4) を捨て U(bit5) を常に 1)、 続けて PC を pull16 (RTS と違い +1 しない)。 cycle 6。 これで 934〜975 行が解放され trace が 976 行手前まで伸びる
2. **G2: シフト/ローテート accumulator (implied) mode** — `ASL A` (0x0A) / `LSR A` (0x4A) / `ROL A` (0x2A) / `ROR A` (0x6A)。 cycle 2。 C フラグの in/out を正しく扱い Z/N 更新:
   - ASL: C ← bit7、 A ← (A<<1)&0xFF
   - LSR: C ← bit0、 A ← A>>1 (N は常に 0)
   - ROL: newC ← bit7、 A ← ((A<<1)|oldC)&0xFF
   - ROR: newC ← bit0、 A ← (A>>1)|(oldC<<7)
3. **G3: シフト/ローテート memory (zeroPage) mode** — `ASL` (0x06) / `LSR` (0x46) / `ROL` (0x26) / `ROR` (0x66)。 read-modify-write、 cycle 5。 nestest で accumulator の次に出現する範囲を実装 (到達状況により zeroPageX/absolute は夜 9 へ送る判断もあり)
4. **G4: nestest trace 行数拡張** — `TRACE_LINES` を 933 → 実装で到達できる最大行 (次の未実装命令の手前) に更新。 実装後に `npx vitest run` で詰まる行を確認し確定する。 最低でも 976 行超を目標

各サブゴールは独立 commit 単位 (Conventional Commits)。

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/008-rti-and-shifts`
3. `chore(nights): seed 008` で本 md を commit
4. G1 RTI → `feat(core/cpu): add RTI (return from interrupt)` → vitest で 976 行手前まで伸びるか確認
5. G2 accumulator シフト → `feat(core/cpu): add accumulator shift/rotate ASL/LSR/ROL/ROR`
6. G3 zeroPage シフト → `feat(core/cpu): add zeroPage shift/rotate ASL/LSR/ROL/ROR` (到達状況次第)
7. G4 → `test(core/cpu): extend nestest trace diff to N lines`
8. `npx vitest run` / `npx tsc --noEmit` / `npx eslint 'src/**/*.ts' 'tests/**/*.ts'` 全緑
9. `git mv nights/pending/008-rti-and-shifts.md nights/done/008-rti-and-shifts.md` → `chore(nights): move 008 to done`
10. `git push -u origin night/008-rti-and-shifts`
11. `gh pr create --base main --title "夜 8: RTI + シフト/ローテート命令" --body-file tmp/pr-body.md`
12. sub-agent レビュー → triage → STOP ゼロで `gh pr merge --auto --merge --delete-branch`

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: cpu_nestest_trace first N lines match`
- テスト fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- auto-merge 設定: `⏳ AUTO-MERGE ARMED: CI 緑判定待ち`
- main merge 確認: `🎯 GOAL CONDITION MET: night 008 merged`

## PR body テンプレ

```markdown
## ゴール
nights/pending/008-rti-and-shifts.md の DoD 全項目達成

## DoD チェック
- [x] <DoD 項目を全部チェック付きで列挙>

## サブゴール達成状況
- [x] G1: RTI (0x40)
- [x] G2: accumulator シフト/ローテート
- [x] G3: zeroPage シフト/ローテート
- [x] G4: nestest trace N 行に拡張

## 困った点・設計判断
(あれば箇条書きで)

## 次の夜の前提条件 (連鎖時の引き継ぎメモ)
- nestest 到達行 N
- 次に詰まる命令 (= 夜 9 の起点候補)
```

## 詰まったら (nesdev wiki のみ参照)

- RTI 仕様: https://www.nesdev.org/wiki/Status_flags (break flag の push/pull 扱い)
- 命令一覧 / opcode マトリクス: https://www.nesdev.org/wiki/CPU_unofficial_opcodes (公式命令は 6502 reference)
- 6502 シフト/ローテートのフラグ挙動 (C in/out、 N/Z): nesdev wiki 6502 instruction reference

30 分以上同じエラーで詰んだら:
1. このファイルを `nights/stuck/008-rti-and-shifts-stuck.md` に rename (md 内に詰み report 追記)
2. PR を draft に戻す (`gh pr ready --undo`) か、 ask 経由で close
3. 連鎖中はセッション終了 (次の夜には進まない)

## コミット粒度 (Conventional Commits)

- 各サブゴール 1 commit + test commit + seed commit + nights/done 移動 commit
- 最低 5 commit を構造的に分ける

## DoD (完了条件、 /goal 条件と同期)

- [ ] `night/008-rti-and-shifts` ブランチで作業
- [ ] G1: RTI (0x40) 実装、 trace が 976 行手前まで伸びる
- [ ] G2: accumulator ASL/LSR/ROL/ROR (0x0A/0x4A/0x2A/0x6A) 実装、 C/Z/N 正しく更新
- [~] G3: zeroPage シフトは nestest 1061 行目以降に出現するため**夜 9 へ繰り越し** (本夜の trace 範囲 1060 行では未到達。 1061 行目 LDA zeroPage $A5 が先に来る)
- [x] G4: `TRACE_LINES` を 933 → 1060 に更新
- [ ] `npx vitest run` exit 0
- [ ] `npx tsc --noEmit` 警告ゼロ
- [ ] `npx eslint 'src/**/*.ts' 'tests/**/*.ts'` 警告ゼロ
- [ ] git log に最低 5 コミット
- [ ] `nights/pending/008-rti-and-shifts.md` を `nights/done/` に `git mv`
- [ ] PR が立っており `gh pr merge --auto --merge --delete-branch` で auto-merge 設定済み
- [ ] nightly CI 緑判定後 main に merge commit で合流済み

## 詰みパターン参考

- RTI で P 復元時に B(bit4)/U(bit5) の mask を誤ると P カラムが nestest とズレる (PLP と同じ `(pull & ~0x10) | 0x20`)
- RTI は RTS と違い pull した PC に +1 **しない** (RTS は JSR が push. した return-1 を補正するため +1 する)
- accumulator シフトは `implied` mode で `op.addr` を使わず `cpu.a` を直接操作する (addressing に accumulator モードは無い)
- ROL/ROR は oldC を A 更新前に退避してから C を更新する (順序を誤ると桁が壊れる)
