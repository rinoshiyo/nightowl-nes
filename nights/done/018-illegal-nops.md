# 夜 018: illegal/undocumented NOP 全 23 opcode

## ゴール (/goal)

```
/goal night/018-illegal-nops ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/018-illegal-nops.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 018 merged`

## 前提

- 夜 017 done: absolute,X 全命令 + LDX absoluteY 実装済み。nestest trace 4994 行到達
- 起点 = nestest.log 4995 行目 `C6A3  A0 4E  LDY #$4E` (illegal NOP テストブロックのセットアップ)
- nestest.log 5004 行 `C6BD  04 A9  *NOP $A9` が最初の illegal NOP
- 全ての正規アドレッシングモード (immediate/implied/zeroPage/zeroPageX/absolute/absoluteX) は実装済み
- NOP の exec は何もしない (`() => 0`)。アドレッシングで PC を進めてサイクルを消費するだけ

## ブランチ運用

`night/018-illegal-nops` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 対象 opcode と仕様

nestest が検証する illegal NOP は 6 グループ・23 opcode:

### G1: implied NOP (1 byte、2 cycle)
| opcode | nestest 初出行 |
|--------|---------------|
| `1A` | 5039 |
| `3A` | 5040 |
| `5A` | 5041 |
| `7A` | 5042 |
| `DA` | 5043 |
| `FA` | 5044 |

正規 NOP (`EA`) と同一挙動。1 byte、2 cycle、何もしない。

### G2: immediate NOP (2 byte、2 cycle)
| opcode | nestest 初出行 |
|--------|---------------|
| `80` | 5045 |

即値オペランドを読み飛ばすだけ。2 byte、2 cycle。

### G3: zeroPage NOP (2 byte、3 cycle)
| opcode | nestest 初出行 |
|--------|---------------|
| `04` | 5004 |
| `44` | 5005 |
| `64` | 5006 |

zeroPage アドレスを解決するが値は捨てる。2 byte、3 cycle。

### G4: absolute NOP (3 byte、4 cycle)
| opcode | nestest 初出行 |
|--------|---------------|
| `0C` | 5016 |

absolute アドレスを解決するが値は捨てる。3 byte、4 cycle。

### G5: zeroPage,X NOP (2 byte、4 cycle)
| opcode | nestest 初出行 |
|--------|---------------|
| `14` | 5027 |
| `34` | 5028 |
| `54` | 5029 |
| `74` | 5030 |
| `D4` | 5031 |
| `F4` | 5032 |

zeroPage,X を解決するが値は捨てる。2 byte、4 cycle。

### G6: absolute,X NOP (3 byte、4 cycle + 1 page cross)
| opcode | nestest 初出行 |
|--------|---------------|
| `1C` | 5047 |
| `3C` | 5048 |
| `5C` | 5049 |
| `7C` | 5050 |
| `DC` | 5051 |
| `FC` | 5052 |

absolute,X を解決するが値は捨てる。page cross 時は +1 cycle。

## サブゴール

1. **G1: implied NOP × 6** — opcode `1A/3A/5A/7A/DA/FA`。`implied` mode、cycle 2、exec は `() => 0`
2. **G2: immediate NOP × 1** — opcode `80`。`immediate` mode、cycle 2、exec は `() => 0`
3. **G3: zeroPage NOP × 3** — opcode `04/44/64`。`zeroPage` mode、cycle 3、exec は `() => 0`
4. **G4: absolute NOP × 1** — opcode `0C`。`absolute` mode、cycle 4、exec は `() => 0`
5. **G5: zeroPage,X NOP × 6** — opcode `14/34/54/74/D4/F4`。`zeroPageX` mode、cycle 4、exec は `() => 0`
6. **G6: absolute,X NOP × 6** — opcode `1C/3C/5C/7C/DC/FC`。`absoluteX` mode、cycle 4、exec は page cross +1 を返す
7. **G7: nestest trace 延伸** — `TRACE_LINES` を 4994 → 5259 に引き上げ (5260 行 = LAX テストブロック入口)
8. **G8: 単体テスト追加** — illegal NOP の各グループのテスト (正しい byte 数消費・cycle 消費・状態不変)

各サブゴールは独立 commit 単位 (Conventional Commits)。

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/018-illegal-nops`
3. G1-G6: `opcodes.ts` に 23 個の illegal NOP を `def()` で追加。name は `"*NOP"` (illegal opcode の慣習)
4. G7: `TRACE_LINES` を 5259 に引き上げ → `bun test`
5. G8: 単体テスト追加
6. `bun test` 全 pass / `bunx tsc --noEmit` 警告ゼロ / `bunx eslint` 警告ゼロ
7. `git mv nights/pending/018-illegal-nops.md nights/done/018-illegal-nops.md`
8. `git push -u origin night/018-illegal-nops`
9. `gh pr create`
10. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: <test_name>`
- テスト fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 018 merged`

## 実装上の注意

- illegal NOP は `name: "*NOP"` にする (nestest.log の表記に合わせる必要はないが、デバッグ時にわかりやすい)
- exec は全て `() => 0` (フラグ・レジスタ一切変更なし)
- absolute,X NOP のみ page cross ペナルティ (+1 cycle) がある。exec で `op.pageCrossed ? 1 : 0` を返す
- 他の NOP はアドレッシングモードが PC を正しい分だけ進めるので exec 追加サイクルは 0

## コミット粒度 (Conventional Commits)

- G1-G6 (opcode 追加) + G7 (TRACE_LINES) + G8 (テスト) + nights/done 移動 = 最低 4 commit

## DoD (完了条件)

- [ ] `night/018-illegal-nops` ブランチで作業
- [ ] G1: implied NOP 6 opcode (`1A/3A/5A/7A/DA/FA`) 実装、各 cycle 2
- [ ] G2: immediate NOP 1 opcode (`80`) 実装、cycle 2
- [ ] G3: zeroPage NOP 3 opcode (`04/44/64`) 実装、各 cycle 3
- [ ] G4: absolute NOP 1 opcode (`0C`) 実装、cycle 4
- [ ] G5: zeroPage,X NOP 6 opcode (`14/34/54/74/D4/F4`) 実装、各 cycle 4
- [ ] G6: absolute,X NOP 6 opcode (`1C/3C/5C/7C/DC/FC`) 実装、各 cycle 4 (+1 page cross)
- [ ] 全 23 opcode が OPCODES テーブルに登録済み
- [ ] G7: `TRACE_LINES` を 5259 に引き上げ、nestest trace test pass
- [ ] G8: 各グループの単体テスト (byte 消費・cycle 消費・状態不変)
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 4 commit
- [ ] `nights/pending/018-illegal-nops.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 詰まったら (nesdev wiki のみ参照)

- https://www.nesdev.org/wiki/CPU_unofficial_opcodes (NOP 系の一覧)
- https://www.nesdev.org/obelisk-6502-guide/reference.html

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
