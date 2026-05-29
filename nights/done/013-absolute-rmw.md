# 夜 013: absolute RMW (LSR/ASL/ROR/ROL/INC/DEC absolute)

## ゴール (/goal)

```
/goal night/013-absolute-rmw ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/013-absolute-rmw.md が nights/done/ に移動済み、 or stop after 50 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 013 merged`

## 前提

- 夜 012 done: absolute 論理/算術/比較 + BIT absolute 実装済み。nestest trace 2848 行到達
- 夜 011 done: zeroPage RMW (ASL/LSR/ROL/ROR/INC/DEC zp、 cycle 5) 実装済み。値演算ヘルパー `aslValue`/`lsrValue`/`rolValue`/`rorValue` と `rmwZeroPage(cpu, bus, op, transform)` パターンが確立済み
- absolute addressing (`src/core/cpu/addressing.ts`) は夜 7 で実装済み。cycle 4 の read 用途だが、 RMW は read → modify → write back で cycle 6
- 起点 = nestest.log 2849 行目 `D80C 4E 78 06 LSR $0678` (absolute RMW ブロックの入口)
- 仕様: nesdev wiki の 6502 命令仕様 (absolute RMW = cycle 6)

## ブランチ運用

`night/013-absolute-rmw` ブランチで実装、 完了時に PR を立てる。 main 直 push は hook で deny。

## サブゴール

1. **G1: rmwAbsolute ヘルパー + LSR/ASL absolute** — `rmwZeroPage` の兄弟として `rmwAbsolute(cpu, bus, op, transform)` を作成 (absolute アドレスから read → transform → write back → setZeroNeg、 cycle 6)。 LSR absolute (`4E`) と ASL absolute (`0E`) を実装
2. **G2: ROR/ROL absolute** — `rolValue`/`rorValue` ヘルパーを `rmwAbsolute` 越しに使用。 ROR absolute (`6E`)、 ROL absolute (`2E`) 実装
3. **G3: INC/DEC absolute** — INC absolute (`EE`)、 DEC absolute (`CE`) 実装。 C フラグは触らない
4. **G4: nestest trace 延伸** — `TRACE_LINES` を 2848 → 3040 に引き上げ (line 3041 = `B1 LDA (ind),Y` = 次ブロックの入口)
5. **G5: 単体テスト追加** — 6 命令の absolute RMW 挙動 (Z/N/C フラグ、 ラップ、 write back 値) を `tests/cpu_absolute_rmw.test.ts` に追加

各サブゴールは独立 commit 単位 (Conventional Commits)。

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/013-absolute-rmw`
3. G1: `rmwAbsolute` + LSR/ASL absolute → `bun test` + `bunx tsc --noEmit`
4. G1 commit (`feat(core/cpu): add absolute RMW helper + LSR/ASL absolute`)
5. G2: ROR/ROL absolute → commit (`feat(core/cpu): add ROR/ROL absolute`)
6. G3: INC/DEC absolute → commit (`feat(core/cpu): add INC/DEC absolute`)
7. G4: `TRACE_LINES` 引き上げ → commit (`test(core/cpu): extend nestest trace to 3040 lines`)
8. G5: 単体テスト追加 → commit (`test(core/cpu): add absolute RMW tests`)
9. `bun test` 全 pass / `bunx tsc --noEmit` 警告ゼロ / `bunx eslint 'src/**/*.ts' 'tests/**/*.ts'` 警告ゼロ
10. `git mv nights/pending/013-...md nights/done/013-...md` を commit (`chore(nights): move 013 to done`)
11. `git push -u origin night/013-absolute-rmw`
12. `gh pr create`
13. メインが `code-review --fix` を直呼びでレビュー → `bot-review-post.sh` で投稿 → triage → 全 PASS なら merge

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: <test_name>`
- テスト fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 013 merged`

## 対象 opcode と nestest 出現行

| opcode | 命令 | mode | cycle | 初出行 |
|---|---|---|---|---|
| `4E` | LSR | absolute | 6 | 2849 (`D80C`) |
| `0E` | ASL | absolute | 6 | 2880 (`D829`) |
| `6E` | ROR | absolute | 6 | 2912 (`D846`) |
| `2E` | ROL | absolute | 6 | 2944 (`D863`) |
| `EE` | INC | absolute | 6 | 2974 (`D883`) |
| `CE` | DEC | absolute | 6 | 2998 (`D8BE`) |

延伸上限 = 3040 行 (3041 行 `B1 LDA (ind),Y` = (ind),Y ブロックが次夜の入口)。

## 詰まったら (nesdev wiki のみ参照)

- https://www.nesdev.org/obelisk-6502-guide/reference.html (LSR/ASL/ROR/ROL/INC/DEC 仕様)
- https://www.nesdev.org/obelisk-6502-guide/addressing.html (absolute モード)
- https://www.nesdev.org/wiki/6502_cycle_times

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。

## コミット粒度 (Conventional Commits)

- G1 / G2 / G3 / G4 / G5 + nights/done 移動 = 最低 6 commit (md seed commit を含めると 7)

## DoD (完了条件)

- [ ] `night/013-absolute-rmw` ブランチで作業
- [ ] G1: `rmwAbsolute` ヘルパー実装。 LSR absolute (`4E`)、 ASL absolute (`0E`) 実装、 cycle 6
- [ ] G2: ROR absolute (`6E`)、 ROL absolute (`2E`) 実装、 cycle 6。 oldC を C 更新前に退避する順序が正しい
- [ ] G3: INC absolute (`EE`)、 DEC absolute (`CE`) 実装、 cycle 6。 C フラグは触らない
- [ ] G4: `TRACE_LINES` を 3040 に引き上げ、 nestest trace test pass
- [ ] G5: `tests/cpu_absolute_rmw.test.ts` 追加 (6 命令 + フラグ境界)
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 6 commit
- [ ] `nights/pending/013-...md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 詰みパターン参考

- absolute RMW は固定 cycle 6 (zeroPage RMW は cycle 5)。 absolute read は cycle 4 だが RMW は read + modify + write back で +2
- `rmwAbsolute` は `rmwZeroPage` と完全同形。 違いは「アドレスが zeroPage (1 byte) か absolute (2 byte) か」と cycle 数のみ
- ROL/ROR は oldC を C 更新前に退避する順序が肝 (夜 11 で確立済み)
- INC/DEC は `(v±1) & 0xFF` を write back、 C フラグは触らない (INX/DEX と同根)
- 値演算ヘルパー (`aslValue` 等) は夜 11 で抽出済み。 accumulator 版 (cycle 2) / zeroPage RMW 版 (cycle 5) / absolute RMW 版 (cycle 6) で共有
