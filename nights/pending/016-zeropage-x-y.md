# 夜 016: zeroPage,X / zeroPage,Y アドレッシングと全命令

## ゴール (/goal)

```
/goal night/016-zeropage-x-y ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/016-zeropage-x-y.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 016 merged`

## 前提

- 夜 015 done: JMP indirect + absolute,Y 全命令実装済み。nestest trace 3638 行到達
- 起点 = nestest.log 3639 行目 `DBCD LDY $33,X` (zeroPage,X テストブロックの入口)
- zeroPage アドレッシング (`zeroPage()`) は夜 010 で実装済み。X/Y インデックス付きは新規追加
- 仕様: zeroPage,X/Y は zeroPage のオペランドバイトに X/Y を加算し、結果を 0xFF でマスク (ゼロページ内ラップ)
- 演算ロジック (ADC/SBC/CMP/ORA/AND/EOR/LDA/STA 等) と RMW ロジック (ASL/LSR/ROL/ROR/INC/DEC) は既存の zeroPage / absolute バリアントで実装済み。addressing mode を差し替えるだけ

## ブランチ運用

`night/016-zeropage-x-y` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## サブゴール

1. **G1: zeroPageX アドレッシング関数** — `src/core/cpu/addressing.ts` に `zeroPageX()` を追加。zeroPage のオペランドバイトに X を加算し `& 0xFF` でゼロページ内ラップ。page cross は発生しない (常に zeroPage 内)
2. **G2: zeroPageY アドレッシング関数** — 同じく `zeroPageY()` を追加。Y を加算して `& 0xFF`
3. **G3: LDY/STY zpX + LDA/STA zpX** — opcode `B4`/`94`/`B5`/`95`、cycle 4。load/store 系
4. **G4: ORA/AND/EOR zpX** — opcode `15`/`35`/`55`、cycle 4。論理演算 read 系
5. **G5: ADC/SBC/CMP zpX** — opcode `75`/`F5`/`D5`、cycle 4。算術/比較 read 系
6. **G6: ASL/LSR/ROL/ROR/INC/DEC zpX** — opcode `16`/`56`/`36`/`76`/`F6`/`D6`、cycle 6。RMW 系
7. **G7: LDX/STX zpY** — opcode `B6`/`96`、cycle 4。zpY を使う唯一の 2 命令
8. **G8: nestest trace 延伸** — `TRACE_LINES` を 3638 → 4352 に引き上げ (line 4353 = LDY absX ブロックの入口)
9. **G9: 単体テスト追加** — zpX/zpY 命令のテスト (ゼロページラップ含む)

各サブゴールは独立 commit 単位 (Conventional Commits)。

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/016-zeropage-x-y`
3. G1: `zeroPageX()` 追加 → `bunx tsc --noEmit`
4. G2: `zeroPageY()` 追加 → `bunx tsc --noEmit`
5. G1+G2 commit (`feat(core/cpu): add zeroPageX/zeroPageY addressing modes`)
6. G3: LDY/STY/LDA/STA zpX → commit
7. G4: ORA/AND/EOR zpX → commit
8. G5: ADC/SBC/CMP zpX → commit
9. G6: ASL/LSR/ROL/ROR/INC/DEC zpX → commit
10. G7: LDX/STX zpY → commit
11. G8: `TRACE_LINES` 引き上げ → commit
12. G9: 単体テスト追加 → commit
13. `bun test` 全 pass / `bunx tsc --noEmit` 警告ゼロ / `bunx eslint 'src/**/*.ts' 'tests/**/*.ts'` 警告ゼロ
14. `git mv nights/pending/016-...md nights/done/016-...md` を commit
15. `git push -u origin night/016-zeropage-x-y`
16. `gh pr create`
17. メインが `code-review --fix` を直呼びでレビュー → triage → 全 PASS なら merge

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: <test_name>`
- テスト fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 016 merged`

## 対象 opcode と nestest 出現行

| opcode | 命令 | mode | cycle | 初出行 |
|---|---|---|---|---|
| `B4` | LDY | zpX | 4 | 3639 (`DBCD`) |
| `94` | STY | zpX | 4 | 3670 (`DC10`) |
| `15` | ORA | zpX | 4 | 3697 (`DC3D`) |
| `35` | AND | zpX | 4 | 3728 (`DC57`) |
| `55` | EOR | zpX | 4 | 3759 (`DC71`) |
| `75` | ADC | zpX | 4 | 3790 (`DC8B`) |
| `D5` | CMP | zpX | 4 | 3864 (`DCC4`) |
| `F5` | SBC | zpX | 4 | 3952 (`DD1F`) |
| `B5` | LDA | zpX | 4 | 4031 (`DD69`) |
| `95` | STA | zpX | 4 | 4062 (`DDAC`) |
| `56` | LSR | zpX | 6 | 4090 (`DDD7`) |
| `16` | ASL | zpX | 6 | 4121 (`DDEE`) |
| `36` | ROL | zpX | 6 | 4153 (`DE05`) |
| `76` | ROR | zpX | 6 | 4185 (`DE1C`) |
| `F6` | INC | zpX | 6 | 4215 (`DE36`) |
| `D6` | DEC | zpX | 6 | 4239 (`DE6B`) |
| `B6` | LDX | zpY | 4 | 4270 (`DEB2`) |
| `96` | STX | zpY | 4 | 4306 (`DEFE`) |

延伸上限 = 4352 行 (4353 行 `E1C1 LDY $0633,X` = absolute,X ブロックの入口)。

## zeroPage,X アドレッシングの仕様メモ

- operand: 1 byte (zeroPage アドレス)
- 動作: addr = (operand + X) & 0xFF (ゼロページ内ラップ)
- ゼロページ外にはみ出さない (0xFF → 0x00 にラップ)
- cycle: read 系 = 4、RMW 系 = 6、write 系 = 4
- page cross は発生しない (常に zeroPage 内)

## zeroPage,Y アドレッシングの仕様メモ

- operand: 1 byte (zeroPage アドレス)
- 動作: addr = (operand + Y) & 0xFF (ゼロページ内ラップ)
- 6502 で zpY を使う命令は LDX (`B6`) と STX (`96`) の 2 つだけ

## コミット粒度 (Conventional Commits)

- G1+G2 + G3〜G9 + nights/done 移動 = 最低 9 commit

## DoD (完了条件)

- [ ] `night/016-zeropage-x-y` ブランチで作業
- [ ] G1: `zeroPageX()` アドレッシング関数を `addressing.ts` に追加
- [ ] G1: ゼロページ内ラップ (operand + X を & 0xFF)
- [ ] G2: `zeroPageY()` アドレッシング関数を `addressing.ts` に追加
- [ ] G2: ゼロページ内ラップ (operand + Y を & 0xFF)
- [ ] G3: LDY zpX (`B4`) 実装、cycle 4、Z/N フラグ設定
- [ ] G3: STY zpX (`94`) 実装、cycle 4、フラグ変更なし
- [ ] G3: LDA zpX (`B5`) 実装、cycle 4、Z/N フラグ設定
- [ ] G3: STA zpX (`95`) 実装、cycle 4、フラグ変更なし
- [ ] G4: ORA zpX (`15`) 実装、cycle 4、Z/N フラグ設定
- [ ] G4: AND zpX (`35`) 実装、cycle 4、Z/N フラグ設定
- [ ] G4: EOR zpX (`55`) 実装、cycle 4、Z/N フラグ設定
- [ ] G5: ADC zpX (`75`) 実装、cycle 4、C/V/Z/N フラグ設定
- [ ] G5: SBC zpX (`F5`) 実装、cycle 4、C/V/Z/N フラグ設定
- [ ] G5: CMP zpX (`D5`) 実装、cycle 4、C/Z/N フラグ設定 (V は触らない)
- [ ] G6: ASL zpX (`16`) 実装、cycle 6、C/Z/N フラグ設定
- [ ] G6: LSR zpX (`56`) 実装、cycle 6、C/Z/N フラグ設定
- [ ] G6: ROL zpX (`36`) 実装、cycle 6、C/Z/N フラグ設定
- [ ] G6: ROR zpX (`76`) 実装、cycle 6、C/Z/N フラグ設定
- [ ] G6: INC zpX (`F6`) 実装、cycle 6、Z/N フラグ設定
- [ ] G6: DEC zpX (`D6`) 実装、cycle 6、Z/N フラグ設定
- [ ] G7: LDX zpY (`B6`) 実装、cycle 4、Z/N フラグ設定
- [ ] G7: STX zpY (`96`) 実装、cycle 4、フラグ変更なし
- [ ] G8: `TRACE_LINES` を 4352 に引き上げ、nestest trace test pass
- [ ] G9: zpX 命令テスト (ゼロページラップあり、フラグ)
- [ ] G9: zpY 命令テスト (ゼロページラップあり)
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 9 commit
- [ ] `nights/pending/016-zeropage-x-y.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 詰みパターン参考

- zeroPage,X のラップ: operand + X が 0xFF を超えると 0x00 にラップする。`& 0xFF` を忘れると絶対アドレス空間に飛んで nestest で値がズレる
- zpY と (indirect),Y を混同しない: zpY は `(operand + Y) & 0xFF` (ゼロページ内), (indirect),Y は zeroPage ポインタ経由 + Y (16bit 空間)
- RMW zpX のサイクル数: read 系は 4 だが、RMW (ASL/LSR/ROL/ROR/INC/DEC) は 6 cycle。既存の zeroPage RMW と同じ

## 詰まったら (nesdev wiki のみ参照)

- https://www.nesdev.org/obelisk-6502-guide/reference.html
- https://www.nesdev.org/obelisk-6502-guide/addressing.html (zeroPage,X / zeroPage,Y モード)
- https://www.nesdev.org/wiki/6502_cycle_times

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
