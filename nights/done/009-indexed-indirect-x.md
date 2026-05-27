# 夜 009: zeroPage LDA + (indirect,X) アドレッシングモード

> 直近 done = 008 (RTI + accumulator シフト/ローテート、 nestest 1060 行到達)。
> nestest.log 1061 行目の `LDA $00 ($A5)` が次の未実装命令で、 その直後 (1087 行) から
> `(indirect,X)` アドレッシングモードの集中テストが 1500 行まで続く。 1501 行から
> zeroPage load/store 本体ブロック (LDY/STY/ORA zp 等) が始まるため、 夜 9 は
> **(indirect,X) モード + ゲートの LDA zp** を切れ目にし、 trace を 1060 → 1500 へ伸ばす。

## ゴール (/goal)

```
/goal night/009-indexed-indirect-x ブランチで実装し、 nightly CI 緑、 PR が auto-merge 設定済みで main に merge commit で合流、 nights/pending/009-indexed-indirect-x.md が nights/done/ に移動済み、 or stop after 50 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 009 merged`

## 前提

- 夜 008 done: RTI / accumulator ASL・LSR・ROL・ROR 実装済み、 nestest trace 1060 行一致 (`TRACE_LINES = 1060`)
- zeroPage アドレッシング (`zeroPage`) は実装済み (STA/STX/BIT zp で使用中)
- addToA / compare / setZeroNeg ヘルパーは ADC/SBC/CMP/論理命令で再利用できる
- 仕様: nesdev wiki "6502 instructions" / "Indexed indirect" (既存実装は参照禁止)

## ブランチ運用

`night/009-indexed-indirect-x` ブランチを切って実装、 完了時に PR を auto-merge (merge commit) で立てる。 main 直 push は hook で deny。 本 md の seed は本ブランチ初手 commit (`chore(nights): seed 009 from done 008 insights`)。

## サブゴール (1 夜を 4 段階に分解)

1. **G1: LDA zeroPage (0xA5)** — `zeroPage` モードで `cpu.a = bus.read(addr)` + Z/N 更新、 cycle 3。 nestest 1061 行のゲートを開ける。
2. **G2: (indirect,X) アドレッシングモード追加** — `addressing.ts` に `indexedIndirect` を実装。 `base = operand byte`、 `ptr = (base + X) & 0xFF` (ゼロページラップ)、 実効アドレス = `read(ptr) | (read((ptr+1)&0xFF) << 8)`。 上位バイト fetch も `& 0xFF` でゼロページ内ラップ (6502 古典挙動)。 page-cross 加算は無い。
3. **G3: LDA / STA (indirect,X) (0xA1 / 0x81)** — いずれも cycle 6。 LDA は load + Z/N、 STA は store のみ。
4. **G4: ORA / AND / EOR / ADC / CMP / SBC (indirect,X) (0x01/0x21/0x41/0x61/0xC1/0xE1)** — 全 cycle 6。 既存ヘルパー (論理は `cpu.a`、 ADC/SBC は `addToA`、 CMP は `compare`) を (ind,X) 実効アドレス越しに再利用。

各サブゴールは独立 commit 単位 (Conventional Commits)。

## 実装ステップ

1. `git checkout main && git pull` → `git checkout -b night/009-indexed-indirect-x`
2. 本 md を pending に seed して初手 commit
3. G1: `addressing.ts` は変更不要、 `opcodes.ts` に `def(0xa5, ...)` 追加 → test
4. G2: `addressing.ts` に `indexedIndirect` を export 追加 → test
5. G3 / G4: `opcodes.ts` に (ind,X) 8 命令を追加
6. `tests/cpu_indexed_indirect.test.ts` を新規作成 (LDA zp / (ind,X) のラップ・load/store・論理算術を単体検証)
7. `tests/cpu_nestest_trace.test.ts` の `TRACE_LINES` を 1060 → 1500 に拡張
8. `npx vitest run` 全 pass / `npx tsc --noEmit` 警告ゼロ / `npx eslint ...` 警告ゼロ
9. `git mv nights/pending/009-indexed-indirect-x.md nights/done/` を同じブランチで commit
10. push → `gh pr create` → sub-agent レビュー → triage → STOP ゼロで auto-merge arm

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: <test_name>` / fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- auto-merge 設定: `⏳ AUTO-MERGE ARMED: CI 緑判定待ち`
- main merge 確認: `🎯 GOAL CONDITION MET: night 009 merged`

## PR body テンプレ

```markdown
## ゴール
nights/pending/009-indexed-indirect-x.md の DoD 全項目達成

## DoD チェック
- [x] <DoD 項目を全部チェック付きで列挙>

## サブゴール達成状況
- [x] G1〜G4

## 困った点・設計判断
(あれば箇条書きで)

## 次の夜の前提条件 (連鎖時の引き継ぎメモ)
- nestest trace 1500 行到達。 1501 行 `LDY $78 ($A4)` が次の壁 (夜 10 = zeroPage load/store/logic 本体ブロック)
```

## 詰まったら (nesdev wiki のみ参照)

- https://www.nesdev.org/wiki/CPU_addressing_modes (Indexed indirect)
- https://www.nesdev.org/obelisk-6502-guide/reference.html (命令別 cycle/flag 早見)
- https://www.nesdev.org/obelisk-6502-guide/addressing.html#IDX

30 分以上同じエラーで詰んだら:
1. 本 md を `nights/stuck/009-indexed-indirect-x-stuck.md` に rename (詰み report 追記)
2. PR を draft に戻す (`gh pr ready --undo`) か ask 経由 close
3. 連鎖中断 + セッション終了 (次の夜に進まない)

## コミット粒度 (Conventional Commits)

- `chore(nights): seed 009 from done 008 insights` (本 md seed)
- `feat(core/cpu): add LDA zeroPage`
- `feat(core/cpu): add indexed indirect (ind,X) addressing mode`
- `feat(core/cpu): add LDA/STA/ORA/AND/EOR/ADC/CMP/SBC (ind,X)`
- `test(core/cpu): add (ind,X) unit tests and extend trace to 1500`
- `chore(nights): move 009 to done`

## DoD (完了条件、 /goal 条件と同期)

- [ ] `night/009-indexed-indirect-x` ブランチで作業
- [ ] G1: LDA zeroPage (0xA5) 実装、 cycle 3
- [ ] G2: `indexedIndirect` アドレッシングモード実装 (ゼロページラップ + 上位バイトラップ)
- [ ] G3: LDA / STA (ind,X) 実装、 cycle 6
- [ ] G4: ORA / AND / EOR / ADC / CMP / SBC (ind,X) 実装、 全 cycle 6
- [ ] `tests/cpu_indexed_indirect.test.ts` で zp wrap / load / store / 論理算術を単体検証
- [ ] `tests/cpu_nestest_trace.test.ts` の `TRACE_LINES` を 1500 に拡張し pass
- [ ] `npx vitest run` exit 0
- [ ] `npx tsc --noEmit` 警告ゼロ
- [ ] `npx eslint 'src/**/*.ts' 'tests/**/*.ts'` 警告ゼロ
- [ ] git log に最低 5 コミット
- [ ] `nights/pending/009-*.md` を `nights/done/` に `git mv`
- [ ] PR が立っており auto-merge (merge commit) 設定済み
- [ ] nightly CI 緑後 main に merge 反映済み

## 詰みパターン参考

- **ゼロページラップ忘れ**: `(base + X)` を `& 0xFF` しないと $FF + $81 が $180 になり別ページを読む。 nestest `A1 FF` X:81 → @ 80 で検証される
- **ポインタ上位バイトのラップ忘れ**: `read((ptr+1) & 0xFF)` としないと `$FF` の次を `$100` から読んでしまう。 nestest `A1 FF` X:00 → @ FF = 0400 で検証される
- **(ind,X) は page-cross 加算なし**: absolute,X / (ind),Y と混同して +1 しないこと。 全命令固定 6 cycle
- **CYC ずれ**: cycle 数を間違えると trace が CYC 列で落ちる。 LDA zp=3、 (ind,X) 系=6
