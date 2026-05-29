# 夜 014: (indirect),Y アドレッシング — LDA/ORA/AND/EOR/ADC/CMP/SBC/STA

## ゴール (/goal)

```
/goal night/014-indirect-indexed-y ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/014-indirect-indexed-y.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 014 merged`

## 前提

- 夜 013 done: absolute RMW (LSR/ASL/ROR/ROL/INC/DEC abs) 実装済み。nestest trace 3040 行到達
- 夜 009 done: (indexed,X) アドレッシングモード (`indexedIndirect`) 実装済み。`src/core/cpu/addressing.ts` に `indexedIndirect()` 関数あり。(indirect),Y は兄弟モードだが動作が異なる
- 起点 = nestest.log 3041 行目 `D922 B1 89 LDA ($89),Y` ((indirect),Y ブロックの入口)
- 仕様: nesdev wiki の 6502 命令仕様 — (indirect),Y read 命令は cycle 5 (+1 page cross)、STA は cycle 6 (常に固定)
- ADC/SBC は夜 004/009 で (indexed,X) / immediate / zeroPage 版を実装済み。(indirect),Y は同じ演算ロジックを新アドレッシングで呼ぶだけ
- ORA/AND/EOR は夜 009/010/012 で (indexed,X) / zeroPage / absolute 版を実装済み
- CMP は夜 012 で absolute 版を実装済み

## ブランチ運用

`night/014-indirect-indexed-y` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## サブゴール

1. **G1: indirectIndexed アドレッシング関数** — `src/core/cpu/addressing.ts` に `indirectIndexed()` を追加。zeroPage のオペランドバイトが指すアドレスから 16bit ポインタを読み (lo/hi ともゼロページラップ)、Y を加算して実効アドレスを算出。page cross 判定あり。
2. **G2: LDA (ind),Y** — opcode `B1`、cycle 5 (+1 page cross)。`indexedIndirect` (夜 009) と同様のパターンで命令ハンドラを登録
3. **G3: ORA/AND/EOR (ind),Y** — opcode `11`/`31`/`51`、cycle 5 (+1 page cross)。既存の論理演算ロジックを (indirect),Y アドレッシングで呼ぶ
4. **G4: ADC/SBC (ind),Y** — opcode `71`/`F1`、cycle 5 (+1 page cross)。既存の ADC/SBC ロジックを (indirect),Y アドレッシングで呼ぶ
5. **G5: CMP (ind),Y** — opcode `D1`、cycle 5 (+1 page cross)。既存の CMP ロジックを (indirect),Y アドレッシングで呼ぶ
6. **G6: STA (ind),Y** — opcode `91`、cycle 6 (固定、page cross 加算なし)。write 系なので bus.write を使用
7. **G7: nestest trace 延伸** — `TRACE_LINES` を 3040 → 3323 に引き上げ (line 3324 = JMP indirect ブロックの入口)
8. **G8: 単体テスト追加** — 8 命令の (indirect),Y 挙動 (ゼロページラップ、page cross、フラグ、write back) を `tests/cpu_indirect_indexed_y.test.ts` に追加

各サブゴールは独立 commit 単位 (Conventional Commits)。

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/014-indirect-indexed-y`
3. G1: `indirectIndexed()` 関数追加 → `bunx tsc --noEmit`
4. G1 commit (`feat(core/cpu): add indirectIndexed (ind),Y addressing mode`)
5. G2: LDA (ind),Y → `bun test` + `bunx tsc --noEmit`
6. G2 commit (`feat(core/cpu): add LDA (ind),Y`)
7. G3: ORA/AND/EOR (ind),Y → commit (`feat(core/cpu): add ORA/AND/EOR (ind),Y`)
8. G4: ADC/SBC (ind),Y → commit (`feat(core/cpu): add ADC/SBC (ind),Y`)
9. G5: CMP (ind),Y → commit (`feat(core/cpu): add CMP (ind),Y`)
10. G6: STA (ind),Y → commit (`feat(core/cpu): add STA (ind),Y`)
11. G7: `TRACE_LINES` 引き上げ → commit (`test(core/cpu): extend nestest trace to 3323 lines`)
12. G8: 単体テスト追加 → commit (`test(core/cpu): add (indirect),Y tests`)
13. `bun test` 全 pass / `bunx tsc --noEmit` 警告ゼロ / `bunx eslint 'src/**/*.ts' 'tests/**/*.ts'` 警告ゼロ
14. `git mv nights/pending/014-...md nights/done/014-...md` を commit (`chore(nights): move 014 to done`)
15. `git push -u origin night/014-indirect-indexed-y`
16. `gh pr create`
17. メインが `code-review --fix` を直呼びでレビュー → `bot-review-post.sh` で投稿 → triage → 全 PASS なら merge

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: <test_name>`
- テスト fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 014 merged`

## 対象 opcode と nestest 出現行

| opcode | 命令 | mode | cycle | 初出行 |
|---|---|---|---|---|
| `B1` | LDA | (ind),Y | 5 (+1 pgx) | 3041 (`D922`) |
| `11` | ORA | (ind),Y | 5 (+1 pgx) | 3083 (`D980`) |
| `31` | AND | (ind),Y | 5 (+1 pgx) | 3102 (`D9A5`) |
| `51` | EOR | (ind),Y | 5 (+1 pgx) | 3125 (`D9D4`) |
| `71` | ADC | (ind),Y | 5 (+1 pgx) | 3147 (`DA01`) |
| `D1` | CMP | (ind),Y | 5 (+1 pgx) | 3201 (`DA70`) |
| `F1` | SBC | (ind),Y | 5 (+1 pgx) | 3265 (`DAF4`) |
| `91` | STA | (ind),Y | 6 (固定) | 3319 (`DB65`) |

延伸上限 = 3323 行 (3324 行 `DB71 LDA #$7E` = JMP indirect セットアップが次夜の入口)。

## 詰まったら (nesdev wiki のみ参照)

- https://www.nesdev.org/obelisk-6502-guide/reference.html (LDA/ORA/AND/EOR/ADC/CMP/SBC/STA 仕様)
- https://www.nesdev.org/obelisk-6502-guide/addressing.html (indirect indexed Y モード)
- https://www.nesdev.org/wiki/6502_cycle_times

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。

## (indirect),Y アドレッシングの仕様メモ (nesdev wiki より)

- オペランド: 1 byte (zeroPage アドレス)
- 動作: zeroPage[operand] から lo、zeroPage[(operand+1) & 0xFF] から hi を読む → base = (hi << 8) | lo → addr = (base + Y) & 0xFFFF
- ゼロページラップ: ポインタの hi バイト読みは `(operand + 1) & 0xFF` (ゼロページ内にラップ)。operand=0xFF の場合、lo=mem[0xFF]、hi=mem[0x00]
- page cross: `(base & 0xFF00) !== (addr & 0xFF00)` の時 page cross → read 系は +1 cycle
- read 系 (LDA/ORA/AND/EOR/ADC/CMP/SBC): cycle 5、page cross で +1
- write 系 (STA): cycle 6、page cross でも固定 (追加なし)
- `(indexed,X)` との違い: (indexed,X) は X でオペランドをオフセット → ポインタ読み (page cross なし、固定 6 cycle)。(indirect),Y はポインタ読み → Y でオフセット (page cross あり、5/6 cycle)

## コミット粒度 (Conventional Commits)

- G1〜G8 + nights/done 移動 = 最低 9 commit (md seed commit を含めると 10)

## DoD (完了条件)

- [ ] `night/014-indirect-indexed-y` ブランチで作業
- [ ] G1: `indirectIndexed()` アドレッシング関数を `src/core/cpu/addressing.ts` に追加
- [ ] G1: ゼロページラップ (operand=0xFF → lo=mem[0xFF], hi=mem[0x00])
- [ ] G1: page cross 判定 (`base & 0xFF00 !== (base+Y) & 0xFF00`)
- [ ] G2: LDA (ind),Y (`B1`) 実装、cycle 5 (+1 pgx)
- [ ] G2: LDA が Z/N フラグを正しく設定
- [ ] G3: ORA (ind),Y (`11`) 実装、cycle 5 (+1 pgx)
- [ ] G3: AND (ind),Y (`31`) 実装、cycle 5 (+1 pgx)
- [ ] G3: EOR (ind),Y (`51`) 実装、cycle 5 (+1 pgx)
- [ ] G3: 各論理演算が Z/N フラグを正しく設定
- [ ] G4: ADC (ind),Y (`71`) 実装、cycle 5 (+1 pgx)
- [ ] G4: ADC が C/V/Z/N フラグを正しく設定
- [ ] G4: SBC (ind),Y (`F1`) 実装、cycle 5 (+1 pgx)
- [ ] G4: SBC が C/V/Z/N フラグを正しく設定
- [ ] G5: CMP (ind),Y (`D1`) 実装、cycle 5 (+1 pgx)
- [ ] G5: CMP が C/Z/N フラグを正しく設定 (V フラグは触らない)
- [ ] G6: STA (ind),Y (`91`) 実装、cycle 6 (固定)
- [ ] G6: STA は bus.write で値を書き込み、フラグ変更なし
- [ ] G7: `TRACE_LINES` を 3323 に引き上げ、nestest trace test pass
- [ ] G8: `tests/cpu_indirect_indexed_y.test.ts` 追加
- [ ] G8: ゼロページラップのテスト (operand=0xFF)
- [ ] G8: page cross のテスト (base + Y がページ境界をまたぐケース)
- [ ] G8: page cross なしのテスト
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 9 commit
- [ ] `nights/pending/014-indirect-indexed-y.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 詰みパターン参考

- (indirect),Y のゼロページラップ: operand=0xFF の場合、hi = mem[0x00]。`(operand + 1) & 0xFF` を忘れると 0x100 を読みに行って壊れる。(indexed,X) で同じパターンを実装済み (夜 009)
- page cross の判定: `base` と `base + Y` のページが違えば cross。STA は固定 6 cycle で page cross 加算なし (read-modify-write 的な扱い)
- (indexed,X) と混同しない: X はオペランド側オフセット (ポインタ読み前)、Y はアドレス側オフセット (ポインタ読み後)
- ADC/SBC のフラグ: 既存ヘルパーをそのまま使う。新しいフラグロジックは不要
- STA の cycle: write 系は page cross でも 6 cycle 固定。read 系 (5 cycle) と間違えない
