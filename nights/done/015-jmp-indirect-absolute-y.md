# 夜 015: JMP indirect + absolute,Y アドレッシング

## ゴール (/goal)

```
/goal night/015-jmp-indirect-absolute-y ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/015-jmp-indirect-absolute-y.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 015 merged`

## 前提

- 夜 014 done: (indirect),Y アドレッシング全命令実装済み。nestest trace 3323 行到達
- 起点 = nestest.log 3324 行目 `DB71 LDA #$7E` (JMP indirect テストブロックのセットアップ入口)
- JMP absolute (`4C`) は夜 002 で実装済み。indirect (`6C`) は兄弟だが間接ジャンプ + page boundary バグがある
- absolute アドレッシングは実装済み。absolute,Y は新規追加が必要
- 仕様: nesdev wiki — JMP indirect は cycle 5、6502 の page boundary バグ (hi byte wrap) あり
- absolute,Y read 系は cycle 4 (+1 page cross)、STA abs,Y は cycle 5 固定

## ブランチ運用

`night/015-jmp-indirect-absolute-y` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## サブゴール

1. **G1: JMP indirect (`6C`)** — cycle 5。operand の 16bit アドレスから lo/hi を読んで実効アドレスを得る。6502 page boundary バグ: operand の lo byte が 0xFF の場合、hi byte は次ページでなく同ページの先頭 (addr & 0xFF00) から読む。addressing.ts に `absoluteIndirect()` を追加
2. **G2: absoluteY アドレッシング関数** — `src/core/cpu/addressing.ts` に `absoluteY()` を追加。absolute の実効アドレスに Y を加算、page cross 判定あり
3. **G3: LDA/ORA/AND/EOR abs,Y** — opcode `B9`/`19`/`39`/`59`、cycle 4 (+1 page cross)。既存の演算ロジックを absoluteY で呼ぶ
4. **G4: ADC/SBC/CMP abs,Y** — opcode `79`/`F9`/`D9`、cycle 4 (+1 page cross)。既存の演算ロジックを absoluteY で呼ぶ
5. **G5: STA abs,Y** — opcode `99`、cycle 5 (固定、page cross 加算なし)。write 系
6. **G6: nestest trace 延伸** — `TRACE_LINES` を 3323 → 3638 に引き上げ (line 3639 = LDY zpX ブロックの入口)
7. **G7: 単体テスト追加** — JMP indirect (page boundary バグ含む) と abs,Y 命令群のテスト

各サブゴールは独立 commit 単位 (Conventional Commits)。

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/015-jmp-indirect-absolute-y`
3. G1: `absoluteIndirect()` + JMP indirect 命令登録 → `bun test` + `bunx tsc --noEmit`
4. G1 commit (`feat(core/cpu): add JMP indirect with page boundary bug`)
5. G2: `absoluteY()` 追加 → `bunx tsc --noEmit`
6. G2 commit (`feat(core/cpu): add absoluteY addressing mode`)
7. G3: LDA/ORA/AND/EOR abs,Y → commit
8. G4: ADC/SBC/CMP abs,Y → commit
9. G5: STA abs,Y → commit
10. G6: `TRACE_LINES` 引き上げ → commit
11. G7: 単体テスト追加 → commit
12. `bun test` 全 pass / `bunx tsc --noEmit` 警告ゼロ / `bunx eslint 'src/**/*.ts' 'tests/**/*.ts'` 警告ゼロ
13. `git mv nights/pending/015-...md nights/done/015-...md` を commit
14. `git push -u origin night/015-jmp-indirect-absolute-y`
15. `gh pr create`
16. メインが `code-review --fix` を直呼びでレビュー → triage → 全 PASS なら merge

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: <test_name>`
- テスト fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 015 merged`

## 対象 opcode と nestest 出現行

| opcode | 命令 | mode | cycle | 初出行 |
|---|---|---|---|---|
| `6C` | JMP | indirect | 5 | 3328 (`DB7B`) |
| `B9` | LDA | abs,Y | 4 (+1 pgx) | 3348 (`DF60`) |
| `19` | ORA | abs,Y | 4 (+1 pgx) | 3395 (`DFAD`) |
| `39` | AND | abs,Y | 4 (+1 pgx) | 3408 (`DFD4`) |
| `59` | EOR | abs,Y | 4 (+1 pgx) | 3425 (`E005`) |
| `79` | ADC | abs,Y | 4 (+1 pgx) | 3441 (`E034`) |
| `D9` | CMP | abs,Y | 4 (+1 pgx) | 3489 (`E0A8`) |
| `F9` | SBC | abs,Y | 4 (+1 pgx) | 3545 (`E127`) |
| `99` | STA | abs,Y | 5 (固定) | 3622 (`E19D`) |

延伸上限 = 3638 行 (3639 行 `DBCD LDY $33,X` = zeroPage,X ブロックの入口)。

## 詰まったら (nesdev wiki のみ参照)

- https://www.nesdev.org/obelisk-6502-guide/reference.html (JMP/LDA/ORA/AND/EOR/ADC/CMP/SBC/STA 仕様)
- https://www.nesdev.org/obelisk-6502-guide/addressing.html (indirect / absolute,Y モード)
- https://www.nesdev.org/wiki/Errata (JMP indirect page boundary bug)
- https://www.nesdev.org/wiki/6502_cycle_times

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。

## JMP indirect の仕様メモ (nesdev wiki より)

- opcode `6C`, cycle 5
- operand: 2 bytes (16bit アドレス)
- 動作: addr から lo byte を読み、addr+1 から hi byte を読み、(hi<<8)|lo にジャンプ
- **6502 page boundary バグ**: addr の lo byte が 0xFF の場合、hi byte を addr+1 (次ページの先頭) から読むのではなく、同ページの先頭 `(addr & 0xFF00)` から読む。例: JMP ($02FF) → lo=mem[$02FF], hi=mem[$0200] (mem[$0300] ではない)
- nestest は JMP ($02FF) でこのバグをテストする (line 3352)

## absolute,Y アドレッシングの仕様メモ

- operand: 2 bytes (16bit base アドレス)
- 動作: base = absolute 16bit → addr = (base + Y) & 0xFFFF
- page cross: `(base & 0xFF00) !== (addr & 0xFF00)` → read 系 +1 cycle
- read 系: cycle 4 (+1 page cross)
- write 系 (STA): cycle 5 固定 (page cross 加算なし)

## コミット粒度 (Conventional Commits)

- G1〜G7 + nights/done 移動 = 最低 8 commit

## DoD (完了条件)

- [ ] `night/015-jmp-indirect-absolute-y` ブランチで作業
- [ ] G1: `absoluteIndirect()` アドレッシング関数を `addressing.ts` に追加
- [ ] G1: JMP indirect (`6C`) 実装、cycle 5
- [ ] G1: page boundary バグ再現 (lo=0xFF 時に hi を同ページ先頭から読む)
- [ ] G2: `absoluteY()` アドレッシング関数を `addressing.ts` に追加
- [ ] G2: page cross 判定 (`base & 0xFF00 !== (base+Y) & 0xFF00`)
- [ ] G3: LDA abs,Y (`B9`) 実装、cycle 4 (+1 pgx)
- [ ] G3: LDA が Z/N フラグを正しく設定
- [ ] G3: ORA abs,Y (`19`) 実装、cycle 4 (+1 pgx)
- [ ] G3: AND abs,Y (`39`) 実装、cycle 4 (+1 pgx)
- [ ] G3: EOR abs,Y (`59`) 実装、cycle 4 (+1 pgx)
- [ ] G3: 各論理演算が Z/N フラグを正しく設定
- [ ] G4: ADC abs,Y (`79`) 実装、cycle 4 (+1 pgx)
- [ ] G4: ADC が C/V/Z/N フラグを正しく設定
- [ ] G4: SBC abs,Y (`F9`) 実装、cycle 4 (+1 pgx)
- [ ] G4: SBC が C/V/Z/N フラグを正しく設定
- [ ] G4: CMP abs,Y (`D9`) 実装、cycle 4 (+1 pgx)
- [ ] G4: CMP が C/Z/N フラグを正しく設定 (V フラグは触らない)
- [ ] G5: STA abs,Y (`99`) 実装、cycle 5 (固定)
- [ ] G5: STA は bus.write で値を書き込み、フラグ変更なし
- [ ] G6: `TRACE_LINES` を 3638 に引き上げ、nestest trace test pass
- [ ] G7: JMP indirect テスト (通常 + page boundary バグケース)
- [ ] G7: abs,Y 命令テスト (page cross あり/なし、フラグ、write)
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 8 commit
- [ ] `nights/pending/015-jmp-indirect-absolute-y.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 詰みパターン参考

- JMP indirect の page boundary バグ: operand lo=0xFF の場合、hi を (addr+1) でなく (addr & 0xFF00) から読む。忘れると nestest JMP ($02FF) テストで値がズレる
- absolute,Y の page cross: base と base+Y のページが違えば cross。STA は固定 5 cycle で page cross 加算なし
- absolute,Y と (indirect),Y を混同しない: abs,Y は absolute + Y オフセット (直接)、(ind),Y は zeroPage ポインタ経由 + Y オフセット
