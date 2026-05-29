# 夜 017: absolute,X 全命令 + LDX absolute,Y

## ゴール (/goal)

```
/goal night/017-absolute-x-ldx-abs-y ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/017-absolute-x-and-ldx-absolute-y.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 017 merged`

## 前提

- 夜 016 done: zeroPage,X/Y 全命令実装済み。nestest trace 4352 行到達
- 起点 = nestest.log 4353 行目 `E1C1 LDY $0633,X` (absolute,X テストブロックの入口)
- absoluteY アドレッシングと 8 命令 (LDA/ORA/AND/EOR/ADC/SBC/CMP/STA) は夜 015 で実装済み
- absoluteX アドレッシングは未実装
- 演算ロジック (ADC/SBC/CMP/ORA/AND/EOR/LDA/STA 等) と RMW ロジック (ASL/LSR/ROL/ROR/INC/DEC) は既存のアドレッシングバリアントで実装済み。addressing mode を差し替えるだけ
- LDX absoluteY (`BE`) は未実装 (absoluteY アドレッシング自体は実装済み)

## ブランチ運用

`night/017-absolute-x-ldx-abs-y` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## サブゴール

1. **G1: absoluteX アドレッシング関数** — `src/core/cpu/addressing.ts` に `absoluteX()` を追加。absolute の実効アドレスに X を加算し `& 0xFFFF`。page cross 判定: base と base+X が別ページなら pageCrossed=true
2. **G2: LDY/LDA absX (read 系 load)** — opcode `BC`/`BD`、cycle 4 (+1 page cross)
3. **G3: ORA/AND/EOR absX (read 系 論理)** — opcode `1D`/`3D`/`5D`、cycle 4 (+1 page cross)
4. **G4: ADC/SBC/CMP absX (read 系 算術/比較)** — opcode `7D`/`FD`/`DD`、cycle 4 (+1 page cross)
5. **G5: STA absX (write 系)** — opcode `9D`、cycle 5 (write 系は page cross ペナルティなし・常に 5 cycle)
6. **G6: ASL/LSR/ROL/ROR absX (RMW 系)** — opcode `1E`/`5E`/`3E`/`7E`、cycle 7 (RMW 系は page cross ペナルティなし・常に 7 cycle)
7. **G7: INC/DEC absX (RMW 系)** — opcode `FE`/`DE`、cycle 7
8. **G8: LDX absY** — opcode `BE`、cycle 4 (+1 page cross)。absoluteY は実装済み
9. **G9: nestest trace 延伸** — `TRACE_LINES` を 4352 → 4994 に引き上げ (line 4995 = illegal NOP テストブロック入口)
10. **G10: 単体テスト追加** — absX 命令テスト (page cross あり/なし、フラグ)、LDX absY テスト

各サブゴールは独立 commit 単位 (Conventional Commits)。

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/017-absolute-x-ldx-abs-y`
3. G1: `absoluteX()` 追加 → `bunx tsc --noEmit`
4. G2-G5: read/write 系命令追加 → commit
5. G6-G7: RMW 系命令追加 → commit
6. G8: LDX absY 追加 → commit
7. G9: `TRACE_LINES` 引き上げ → commit
8. G10: 単体テスト追加 → commit
9. `bun test` 全 pass / `bunx tsc --noEmit` 警告ゼロ / `bunx eslint 'src/**/*.ts' 'tests/**/*.ts'` 警告ゼロ
10. `git mv nights/pending/017-...md nights/done/017-...md` を commit
11. `git push -u origin night/017-absolute-x-ldx-abs-y`
12. `gh pr create`
13. メインが `code-review --fix` を直呼びでレビュー → triage → 全 PASS なら merge

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: <test_name>`
- テスト fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 017 merged`

## 対象 opcode と nestest 出現行

| opcode | 命令 | mode | cycle | 初出行 |
|---|---|---|---|---|
| `BC` | LDY | absX | 4(+1) | 4353 (`E1C1`) |
| `1D` | ORA | absX | 4(+1) | 4391 (`E20B`) |
| `3D` | AND | absX | 4(+1) | 4422 (`E229`) |
| `5D` | EOR | absX | 4(+1) | 4447 (`E247`) |
| `7D` | ADC | absX | 4(+1) | 4465 (`E265`) |
| `DD` | CMP | absX | 4(+1) | 4543 (`E2A2`) |
| `FD` | SBC | absX | 4(+1) | 4631 (`E2FD`) |
| `BD` | LDA | absX | 4(+1) | 4712 (`E347`) |
| `9D` | STA | absX | 5 | 4743 (`E38A`) |
| `1E` | ASL | absX | 7 | 4771 (`E3B5`) |
| `5E` | LSR | absX | 7 | 4802 (`E3CC`) |
| `3E` | ROL | absX | 7 | 4833 (`E3E3`) |
| `7E` | ROR | absX | 7 | 4865 (`E3FA`) |
| `FE` | INC | absX | 7 | 4909 (`E450`) |
| `DE` | DEC | absX | 7 | 4933 (`E48B`) |
| `BE` | LDX | absY | 4(+1) | 4964 (`E4DA`) |

延伸上限 = 4994 行 (4995 行 = illegal NOP テストブロック入口)。

## absoluteX アドレッシングの仕様メモ

- operand: 2 byte (16bit absolute アドレス)
- 動作: addr = (operand + X) & 0xFFFF
- page cross: operand と addr が別ページならば read 系は +1 cycle
- cycle: read 系 = 4 (+1 page cross)、RMW 系 = 7 (page cross 無関係)、write 系 = 5 (page cross 無関係)
- absoluteY (実装済み) と同じ構造で、加算するレジスタが X に変わるだけ

## LDX absoluteY の仕様メモ

- absoluteY は実装済み。LDX の演算ロジック (Z/N フラグ設定) も実装済み
- opcodes.ts に `BE` LDX absoluteY を追加するだけ

## コミット粒度 (Conventional Commits)

- G1 + G2〜G8 + G9 + G10 + nights/done 移動 = 最低 5 commit

## DoD (完了条件)

- [ ] `night/017-absolute-x-ldx-abs-y` ブランチで作業
- [ ] G1: `absoluteX()` アドレッシング関数を `addressing.ts` に追加
- [ ] G1: page cross 判定 (base と base+X が別ページ)
- [ ] G2: LDY absX (`BC`) 実装、cycle 4(+1)、Z/N フラグ設定
- [ ] G2: LDA absX (`BD`) 実装、cycle 4(+1)、Z/N フラグ設定
- [ ] G3: ORA absX (`1D`) 実装、cycle 4(+1)、Z/N フラグ設定
- [ ] G3: AND absX (`3D`) 実装、cycle 4(+1)、Z/N フラグ設定
- [ ] G3: EOR absX (`5D`) 実装、cycle 4(+1)、Z/N フラグ設定
- [ ] G4: ADC absX (`7D`) 実装、cycle 4(+1)、C/V/Z/N フラグ設定
- [ ] G4: SBC absX (`FD`) 実装、cycle 4(+1)、C/V/Z/N フラグ設定
- [ ] G4: CMP absX (`DD`) 実装、cycle 4(+1)、C/Z/N フラグ設定 (V は触らない)
- [ ] G5: STA absX (`9D`) 実装、cycle 5、フラグ変更なし
- [ ] G6: ASL absX (`1E`) 実装、cycle 7、C/Z/N フラグ設定
- [ ] G6: LSR absX (`5E`) 実装、cycle 7、C/Z/N フラグ設定
- [ ] G6: ROL absX (`3E`) 実装、cycle 7、C/Z/N フラグ設定
- [ ] G6: ROR absX (`7E`) 実装、cycle 7、C/Z/N フラグ設定
- [ ] G7: INC absX (`FE`) 実装、cycle 7、Z/N フラグ設定
- [ ] G7: DEC absX (`DE`) 実装、cycle 7、Z/N フラグ設定
- [ ] G8: LDX absY (`BE`) 実装、cycle 4(+1)、Z/N フラグ設定
- [ ] G9: `TRACE_LINES` を 4994 に引き上げ、nestest trace test pass
- [ ] G10: absX 命令テスト (page cross あり/なし、フラグ)
- [ ] G10: LDX absY テスト
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 5 commit
- [ ] `nights/pending/017-absolute-x-and-ldx-absolute-y.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 詰みパターン参考

- absoluteX の page cross ペナルティ: read 系のみ +1 cycle。write 系 (STA) と RMW 系は常に固定 cycle (write/RMW は page cross を吸収するダミーリード分が base cycle に含まれている)
- absoluteX と absoluteY の構造は同じ: 加算するレジスタが X/Y で異なるだけ
- LDX absY の cycle は 4(+1 page cross)。LDY absX も同じ

## 詰まったら (nesdev wiki のみ参照)

- https://www.nesdev.org/obelisk-6502-guide/reference.html
- https://www.nesdev.org/obelisk-6502-guide/addressing.html (absolute,X / absolute,Y モード)
- https://www.nesdev.org/wiki/6502_cycle_times

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
