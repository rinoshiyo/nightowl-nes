# 夜 019: illegal LAX + SAX (10 opcode)

## ゴール (/goal)

```
/goal night/019-lax-sax ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/019-lax-sax.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 019 merged`

## 前提

- 夜 018 done: illegal NOP 全 23 opcode 実装済み。nestest trace 5259 行到達
- 起点 = nestest.log 5260 行目 `E545  A3 40  *LAX ($40,X)` (LAX テストブロックのセットアップ直後)
- 全アドレッシングモード (indexedIndirect/indirectIndexed/zeroPage/zeroPageY/absolute/absoluteX/absoluteY) は実装済み
- LDA/LDX の exec 実装パターンは既存 (setZeroNeg 呼ぶ)
- STA/STX の exec 実装パターンは既存 (bus.write → 追加 cycle 0)

## ブランチ運用

`night/019-lax-sax` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 対象 opcode と仕様

### LAX (LDA + LDX を同時実行)

メモリから値を読み、A と X の両方にロードする。Z/N フラグを結果値で更新。
実質 `LDA addr; LDX addr` を 1 命令で行う illegal opcode。

| opcode | アドレッシング | byte | cycle | nestest 初出行 |
|--------|---------------|------|-------|---------------|
| `A3` | (indirect,X) | 2 | 6 | 5260 |
| `A7` | zeroPage | 2 | 3 | 5303 |
| `AF` | absolute | 3 | 4 | 5345 |
| `B3` | (indirect),Y | 2 | 5 (+1 page cross) | 5396 |
| `B7` | zeroPage,Y | 2 | 4 | 5439 |
| `BF` | absolute,Y | 3 | 4 (+1 page cross) | 5481 |

exec ロジック:
```
value = bus.read(op.addr)
cpu.a = value
cpu.x = value
setZeroNeg(cpu, value)
return pageCrossed ? 1 : 0  // B3, BF のみ
```

### SAX (A AND X → memory)

A と X の AND 結果をメモリに書き込む。**フラグは変更しない**。

| opcode | アドレッシング | byte | cycle | nestest 初出行 |
|--------|---------------|------|-------|---------------|
| `83` | (indirect,X) | 2 | 6 | 5530 |
| `87` | zeroPage | 2 | 3 | 5578 |
| `8F` | absolute | 3 | 4 | 5628 |
| `97` | zeroPage,Y | 2 | 4 | 5678 |

exec ロジック:
```
bus.write(op.addr, (cpu.a & cpu.x) & 0xff)
return 0  // フラグ変更なし・追加 cycle なし
```

## サブゴール

1. **G1: LAX exec ヘルパー関数** — A と X に同時ロード + Z/N 更新の共通関数
2. **G2: LAX × 6 opcode 登録** — `A3/A7/AF/B3/B7/BF` を OPCODES テーブルに追加
3. **G3: SAX exec ヘルパー関数** — `A & X` をメモリに書き込む共通関数
4. **G4: SAX × 4 opcode 登録** — `83/87/8F/97` を OPCODES テーブルに追加
5. **G5: nestest trace 延伸** — `TRACE_LINES` を 5259 → 5722 に引き上げ (SAX テストブロック完了)
6. **G6: LAX 単体テスト** — 各アドレッシングモードで A,X 同時ロード / Z/N フラグ / page cross +1 cycle
7. **G7: SAX 単体テスト** — 各アドレッシングモードで A&X が正しくストア / フラグ不変

各サブゴールは独立 commit 単位 (Conventional Commits)。

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/019-lax-sax`
3. G1-G2: `opcodes.ts` に LAX exec + 6 opcode 追加
4. G3-G4: `opcodes.ts` に SAX exec + 4 opcode 追加
5. G5: `TRACE_LINES` を 5722 に引き上げ → `bun test`
6. G6-G7: LAX/SAX 単体テスト追加
7. `bun test` 全 pass / `bunx tsc --noEmit` 警告ゼロ / `bunx eslint` 警告ゼロ
8. `git mv nights/pending/019-lax-sax.md nights/done/019-lax-sax.md`
9. `git push -u origin night/019-lax-sax`
10. `gh pr create`
11. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: <test_name>`
- テスト fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 019 merged`

## 実装上の注意

- LAX は `name: "*LAX"` (nestest.log の表記)
- SAX は `name: "*SAX"` (nestest.log の表記)
- LAX の indirectIndexed(B3) / absoluteY(BF) は page cross ペナルティ (+1 cycle) がある
- SAX はフラグを一切変更しない (STA/STX と同じ)
- SAX には page cross ペナルティはない (write 系なので)

## コミット粒度 (Conventional Commits)

- LAX 実装 + SAX 実装 + TRACE_LINES + テスト + nights/done 移動 = 最低 4 commit

## DoD (完了条件)

- [ ] `night/019-lax-sax` ブランチで作業
- [ ] LAX 6 opcode (`A3/A7/AF/B3/B7/BF`) が OPCODES テーブルに登録済み
- [ ] LAX exec: メモリ値を A と X に同時ロード、Z/N フラグ更新
- [ ] SAX 4 opcode (`83/87/8F/97`) が OPCODES テーブルに登録済み
- [ ] SAX exec: A & X の結果をメモリに書き込み、フラグ不変
- [ ] LAX indirectIndexed(B3) / absoluteY(BF) は page cross +1 cycle
- [ ] `TRACE_LINES` を 5722 に引き上げ、nestest trace test pass
- [ ] LAX 単体テスト (各モード × 値/フラグ/page cross)
- [ ] SAX 単体テスト (各モード × A&X ストア/フラグ不変)
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 4 commit
- [ ] `nights/pending/019-lax-sax.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 詰まったら (nesdev wiki のみ参照)

- https://www.nesdev.org/wiki/CPU_unofficial_opcodes (LAX/SAX の仕様)
- https://www.nesdev.org/obelisk-6502-guide/reference.html

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
